import { ASSIGNED_STATUSES } from "@/lib/constants";
import { db } from "@/lib/db";
import type { Tx } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { config } from "@/lib/env";
import { coarseArea } from "@/lib/geo";
import type { Actor } from "@/lib/permissions";
import { assertCan, assertRole } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { transition } from "./lifecycle";
import type { MatchCandidate, MatchRequest } from "./matching";
import { matchProviders } from "./matching";
import { kickNotificationQueue, notify, notifyAdmins } from "./notifications";

/**
 * Dispatch: sends job offers to matched providers in rounds, handles accept/decline,
 * offer timeouts, provider release / reassignment, manual dispatcher assignment and
 * the no-provider-available path. The customer is only told a provider is coming once
 * a provider has actually accepted (or a dispatcher assigned one).
 */

const candidateInclude = {
  user: { select: { status: true } },
  services: { select: { serviceCategoryId: true, authorized: true } },
  assignments: {
    where: { active: true, request: { status: { in: ASSIGNED_STATUSES } } },
    select: { id: true },
  },
} as const;

type CandidateRow = Awaited<ReturnType<typeof loadCandidateRows>>[number];
const loadCandidateRows = (tx: Tx, where = {}) => tx.providerProfile.findMany({ where, include: candidateInclude });

export function toCandidate(p: CandidateRow): MatchCandidate {
  return {
    id: p.id,
    businessName: p.businessName,
    verificationStatus: p.verificationStatus,
    userStatus: p.user.status,
    isOnline: p.isOnline,
    truckType: p.truckType,
    canWinch: p.canWinch,
    services: p.services,
    baseLat: p.baseLat,
    baseLng: p.baseLng,
    serviceRadiusMiles: p.serviceRadiusMiles,
    serviceZips: p.serviceZips,
    operatingHours: p.operatingHours,
    lastLat: p.lastLat,
    lastLng: p.lastLng,
    lastLocationAt: p.lastLocationAt,
    offersReceived: p.offersReceived,
    offersAccepted: p.offersAccepted,
    hasActiveJob: p.assignments.length > 0,
  };
}

async function matchRequestFor(tx: Tx, requestId: string) {
  const r = await tx.serviceRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: { serviceCategory: true },
  });
  const mr: MatchRequest = {
    serviceCategoryId: r.serviceCategoryId,
    requiredTruckTypes: r.serviceCategory.requiredTruckTypes.split(",").filter(Boolean),
    requiresWinch: r.serviceCategory.requiresWinch,
    pickupLat: r.pickupLat,
    pickupLng: r.pickupLng,
    pickupZip: r.pickupZip,
  };
  return { request: r, mr };
}

/** For the dispatch console: every provider with eligibility reasons. */
export async function previewMatches(admin: Actor, requestId: string) {
  assertCan(admin, "requests.view");
  const settings = await getSettings();
  const { mr } = await matchRequestFor(db, requestId);
  const rows = await loadCandidateRows(db);
  const online = matchProviders(rows.map(toCandidate), mr, settings.dispatch, {
    now: new Date(),
    timeZone: config.timeZone(),
  });
  // Manual assignment may override availability/coverage, never verification or authorization.
  const manual = matchProviders(
    rows.map(toCandidate),
    mr,
    { ...settings.dispatch, maxRadiusMiles: 10_000 },
    { now: new Date(), timeZone: config.timeZone(), requireOnline: false },
  );
  return { online, manual };
}

async function excludedProviderIds(tx: Tx, requestId: string, searchBase: number) {
  const offered = await tx.jobOffer.findMany({
    where: { requestId, round: { gte: searchBase } },
    select: { providerId: true },
  });
  const released = await tx.providerAssignment.findMany({
    where: { requestId, active: false },
    select: { providerId: true },
  });
  return [...new Set([...offered.map((o) => o.providerId), ...released.map((a) => a.providerId)])];
}

type RoundResult = { offers: number; manual?: boolean; noProvider?: boolean };

/** Send the next round of offers, or move to NO_PROVIDER_AVAILABLE when exhausted. */
export async function sendNextRound(tx: Tx, requestId: string, now = new Date()): Promise<RoundResult> {
  const settings = await getSettings(tx);
  const { request, mr } = await matchRequestFor(tx, requestId);
  if (request.status !== "SEARCHING") return { offers: 0 };

  if (!settings.dispatch.autoDispatch) {
    await notifyAdmins(tx, {
      type: "DISPATCH_ATTENTION",
      title: `Assign a provider to ${request.number}`,
      body: `Automatic dispatch is off. ${request.serviceCategory.name} near ${coarseArea(request)} needs a provider.`,
      requestId,
      link: `/admin/requests/${requestId}`,
      dedupeSuffix: `manual-${request.searchRound}`,
    });
    return { offers: 0, manual: true };
  }

  const round = request.searchRound + 1;
  if (round - request.searchBase + 1 > settings.dispatch.maxRounds) {
    await markNoProvider(tx, requestId, "No provider accepted after all dispatch rounds.");
    return { offers: 0, noProvider: true };
  }

  const exclude = await excludedProviderIds(tx, requestId, request.searchBase);
  const rows = await loadCandidateRows(tx, { verificationStatus: "APPROVED" });
  const { eligible } = matchProviders(rows.map(toCandidate), mr, settings.dispatch, { now, timeZone: config.timeZone(), excludeProviderIds: exclude });
  const batch = eligible.slice(0, settings.dispatch.offerBatchSize);

  if (batch.length === 0) {
    await markNoProvider(tx, requestId, "No verified provider is currently online, equipped and covering this location.");
    return { offers: 0, noProvider: true };
  }

  await tx.serviceRequest.update({
    where: { id: requestId },
    data: { searchRound: round },
  });
  const expiresAt = new Date(now.getTime() + settings.dispatch.offerTimeoutSeconds * 1000);
  for (const [i, m] of batch.entries()) {
    const offer = await tx.jobOffer.create({
      data: {
        requestId,
        providerId: m.provider.id,
        rank: i + 1,
        round,
        distanceMiles: m.distanceMiles,
        expiresAt,
      },
    });
    await tx.providerProfile.update({
      where: { id: m.provider.id },
      data: { offersReceived: { increment: 1 } },
    });
    const provider = await tx.providerProfile.findUniqueOrThrow({
      where: { id: m.provider.id },
      select: { userId: true },
    });
    await notify(tx, {
      userId: provider.userId,
      type: "NEW_JOB_OFFER",
      title: `New job offer: ${request.serviceCategory.name}`,
      body: `${coarseArea(request)}${m.distanceMiles != null ? ` · about ${m.distanceMiles} mi away` : ""}. Respond within ${Math.round(settings.dispatch.offerTimeoutSeconds / 60)} min.`,
      requestId,
      link: "/provider",
      dedupeSuffix: offer.id,
    });
  }
  return { offers: batch.length };
}

async function markNoProvider(tx: Tx, requestId: string, reason: string) {
  const r = await tx.serviceRequest.findUniqueOrThrow({
    where: { id: requestId },
  });
  await transition(tx, {
    requestId,
    to: "NO_PROVIDER_AVAILABLE",
    actor: "SYSTEM",
    reason,
  });
  await notify(tx, {
    userId: r.customerId,
    type: "NO_PROVIDER_AVAILABLE",
    title: "We couldn't find an available provider yet",
    body: "No verified provider accepted your request. You can search again, contact support, or cancel at no charge. If you're unsafe, call 911.",
    requestId,
    link: `/requests/${requestId}`,
    dedupeSuffix: String(r.searchRound),
  });
  await notifyAdmins(tx, {
    type: "DISPATCH_ATTENTION",
    title: `${r.number}: no provider available`,
    body: `${reason} Consider manual assignment.`,
    requestId,
    link: `/admin/requests/${requestId}`,
    dedupeSuffix: `noprov-${r.searchRound}`,
  });
}

/** Called once a request is SUBMITTED with an approved price (and payment authorized, when required). */
export async function startDispatch(requestId: string, actor: Actor | "SYSTEM" = "SYSTEM") {
  const result = await db.$transaction(async (tx) => {
    const r = await tx.serviceRequest.findUniqueOrThrow({
      where: { id: requestId },
    });
    if (r.status === "SUBMITTED") {
      await transition(tx, {
        requestId,
        to: "SEARCHING",
        actor,
        reason: "Price approved; dispatch started",
      });
    } else if (r.status === "NO_PROVIDER_AVAILABLE") {
      await transition(tx, {
        requestId,
        to: "SEARCHING",
        actor,
        reason: "Search restarted",
      });
      await tx.serviceRequest.update({
        where: { id: requestId },
        data: { searchBase: r.searchRound + 1 },
      });
    } else if (r.status !== "SEARCHING") {
      throw new AppError("INVALID_TRANSITION", "This request is not waiting for a provider.");
    }
    return sendNextRound(tx, requestId);
  });
  kickNotificationQueue();
  return result;
}

export async function retrySearch(actor: Actor, requestId: string) {
  if (actor.role === "CUSTOMER") {
    const r = await db.serviceRequest.findFirst({
      where: { id: requestId, customerId: actor.id },
    });
    if (!r) throw new AppError("NOT_FOUND", "Request not found.");
  } else assertCan(actor, "dispatch.assign");
  return startDispatch(requestId, actor);
}

async function providerForUser(tx: Tx, actor: Actor) {
  assertRole(actor, "PROVIDER");
  const p = await tx.providerProfile.findUnique({
    where: { userId: actor.id },
    include: { user: { select: { status: true } } },
  });
  if (!p) throw new AppError("FORBIDDEN", "Provider profile not found.");
  return p;
}

export async function acceptOffer(actor: Actor, offerId: string, now = new Date()) {
  const res = await db.$transaction(async (tx) => {
    const provider = await providerForUser(tx, actor);
    if (provider.verificationStatus !== "APPROVED" || provider.user.status !== "ACTIVE") {
      throw new AppError("FORBIDDEN", "Only verified providers can accept jobs.");
    }
    const offer = await tx.jobOffer.findUnique({
      where: { id: offerId },
      include: { request: { include: { serviceCategory: true } } },
    });
    if (!offer || offer.providerId !== provider.id) throw new AppError("NOT_FOUND", "Offer not found.");
    if (offer.status !== "PENDING") throw new AppError("CONFLICT", "This offer is no longer available.");
    if (offer.expiresAt < now) {
      await tx.jobOffer.update({
        where: { id: offer.id },
        data: { status: "EXPIRED" },
      });
      throw new AppError("CONFLICT", "This offer expired before it was accepted.");
    }
    const svc = await tx.providerService.findUnique({
      where: {
        providerId_serviceCategoryId: {
          providerId: provider.id,
          serviceCategoryId: offer.request.serviceCategoryId,
        },
      },
    });
    if (!svc?.authorized) throw new AppError("FORBIDDEN", "You're not authorized for this service type.");
    const busy = await tx.providerAssignment.count({
      where: {
        providerId: provider.id,
        active: true,
        request: { status: { in: ASSIGNED_STATUSES } },
      },
    });
    if (busy) throw new AppError("CONFLICT", "Finish your current job before accepting another.");

    // Compare-and-set on the request status inside transition() makes concurrent accepts safe:
    // only the first provider wins; the others get CONFLICT and their transaction rolls back.
    await tx.providerAssignment.create({
      data: {
        requestId: offer.requestId,
        providerId: provider.id,
        method: "ACCEPTED_OFFER",
      },
    });
    await transition(tx, {
      requestId: offer.requestId,
      to: "ASSIGNED",
      actor,
      reason: `Offer accepted by ${provider.businessName}`,
    });
    await tx.jobOffer.update({
      where: { id: offer.id },
      data: { status: "ACCEPTED", respondedAt: now },
    });
    await tx.jobOffer.updateMany({
      where: { requestId: offer.requestId, status: "PENDING" },
      data: { status: "WITHDRAWN" },
    });
    await tx.providerProfile.update({
      where: { id: provider.id },
      data: { offersAccepted: { increment: 1 } },
    });
    await notifyAssigned(tx, offer.requestId, provider.id);
    return { requestId: offer.requestId };
  });
  kickNotificationQueue();
  return res;
}

async function notifyAssigned(tx: Tx, requestId: string, providerId: string) {
  const r = await tx.serviceRequest.findUniqueOrThrow({
    where: { id: requestId },
  });
  const p = await tx.providerProfile.findUniqueOrThrow({
    where: { id: providerId },
    include: { user: { select: { name: true } } },
  });
  const assignment = await tx.providerAssignment.findFirstOrThrow({
    where: { requestId, providerId, active: true },
  });
  await notify(tx, {
    userId: r.customerId,
    type: "PROVIDER_ASSIGNED",
    title: "A provider has been assigned",
    body: `${p.user.name.split(" ")[0]} from ${p.businessName} accepted your request.`,
    requestId,
    link: `/requests/${requestId}`,
    dedupeSuffix: assignment.id,
  });
  await notify(tx, {
    userId: p.userId,
    type: "JOB_ASSIGNED",
    title: `Job ${r.number} assigned to you`,
    body: "Open the job for pickup details and update your status as you go.",
    requestId,
    link: `/provider/jobs/${requestId}`,
    dedupeSuffix: assignment.id,
  });
}

export async function declineOffer(actor: Actor, offerId: string, now = new Date()) {
  await db.$transaction(async (tx) => {
    const provider = await providerForUser(tx, actor);
    const offer = await tx.jobOffer.findUnique({ where: { id: offerId } });
    if (!offer || offer.providerId !== provider.id) throw new AppError("NOT_FOUND", "Offer not found.");
    if (offer.status !== "PENDING") return;
    await tx.jobOffer.update({
      where: { id: offer.id },
      data: { status: "DECLINED", respondedAt: now },
    });
    await advanceIfExhausted(tx, offer.requestId, now);
  });
  kickNotificationQueue();
}

async function advanceIfExhausted(tx: Tx, requestId: string, now: Date) {
  const r = await tx.serviceRequest.findUnique({ where: { id: requestId } });
  if (!r || r.status !== "SEARCHING") return;
  const pending = await tx.jobOffer.count({
    where: { requestId, status: "PENDING", expiresAt: { gt: now } },
  });
  if (pending === 0) await sendNextRound(tx, requestId, now);
}

/**
 * Expire overdue offers and move their requests along. Run from the cron endpoint;
 * also called opportunistically when dashboards load so a single-server deployment
 * keeps moving without a scheduler.
 */
export async function sweepDispatch(now = new Date()) {
  const overdue = await db.jobOffer.findMany({
    where: { status: "PENDING", expiresAt: { lte: now } },
    select: { id: true, requestId: true },
  });
  if (overdue.length)
    await db.jobOffer.updateMany({
      where: { id: { in: overdue.map((o) => o.id) } },
      data: { status: "EXPIRED" },
    });
  const requestIds = [...new Set(overdue.map((o) => o.requestId))];
  // Requests left SEARCHING with no offers at all (e.g. after a release) also need a push.
  const stalled = await db.serviceRequest.findMany({
    where: { status: "SEARCHING", offers: { none: { status: "PENDING" } } },
    select: { id: true },
  });
  for (const id of new Set([...requestIds, ...stalled.map((s) => s.id)])) {
    try {
      await db.$transaction((tx) => advanceIfExhausted(tx, id, now));
    } catch (e) {
      console.error("[dispatch] sweep failed for", id, e);
    }
  }
  if (requestIds.length) kickNotificationQueue();
  return { expired: overdue.length, advanced: requestIds.length };
}

/** Dispatcher override: assign (or reassign) a specific verified provider. */
export async function manualAssign(admin: Actor, requestId: string, providerId: string, reason: string) {
  assertCan(admin, "dispatch.assign");
  if (!reason?.trim()) throw new AppError("VALIDATION", "Add a reason for the manual assignment.");
  await db.$transaction(async (tx) => {
    const r = await tx.serviceRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: { quotes: true },
    });
    const provider = await tx.providerProfile.findUnique({
      where: { id: providerId },
      include: { user: true, services: true },
    });
    if (!provider) throw new AppError("NOT_FOUND", "Provider not found.");
    if (provider.verificationStatus !== "APPROVED" || provider.user.status !== "ACTIVE") throw new AppError("FORBIDDEN", "Only verified, active providers can be assigned.");
    if (!provider.services.some((s) => s.serviceCategoryId === r.serviceCategoryId && s.authorized)) {
      throw new AppError("FORBIDDEN", "This provider isn't authorized for this service type.");
    }
    if (r.status === "SUBMITTED" && !r.quotes.some((q) => q.status === "APPROVED")) {
      throw new AppError("CONFLICT", "The customer hasn't approved a price yet. Send a confirmed quote first.");
    }
    const current = await tx.providerAssignment.findFirst({
      where: { requestId, active: true },
    });
    if (current?.providerId === providerId) throw new AppError("CONFLICT", "This provider is already assigned.");
    if (current) await releaseAssignment(tx, current.id, `Reassigned by dispatcher: ${reason}`);
    await tx.jobOffer.updateMany({
      where: { requestId, status: "PENDING" },
      data: { status: "WITHDRAWN" },
    });
    await tx.providerAssignment.create({
      data: {
        requestId,
        providerId,
        method: "MANUAL_ADMIN",
        assignedById: admin.id,
      },
    });
    await transition(tx, {
      requestId,
      to: "ASSIGNED",
      actor: admin,
      reason: `Manual assignment: ${reason}`,
      data: { driverEtaMinutes: null, driverEtaSetAt: null },
    });
    await notifyAssigned(tx, requestId, providerId);
    await audit(
      {
        actorId: admin.id,
        action: "dispatch.manual_assign",
        entityType: "ServiceRequest",
        entityId: requestId,
        details: { providerId, replaced: current?.providerId ?? null, reason },
      },
      tx,
    );
  });
  kickNotificationQueue();
}

async function releaseAssignment(tx: Tx, assignmentId: string, reason: string) {
  const a = await tx.providerAssignment.update({
    where: { id: assignmentId },
    data: { active: false, releasedAt: new Date(), releaseReason: reason },
    include: { provider: true, request: true },
  });
  await notify(tx, {
    userId: a.provider.userId,
    type: "JOB_CANCELLED",
    title: `Job ${a.request.number} is no longer assigned to you`,
    body: reason,
    requestId: a.requestId,
    link: "/provider",
    dedupeSuffix: a.id,
  });
}

/** Provider can't complete the job (or dispatcher pulls it): go back to searching. */
export async function releaseJob(actor: Actor, requestId: string, reason: string) {
  if (!reason?.trim()) throw new AppError("VALIDATION", "Please give a reason.");
  await db.$transaction(async (tx) => {
    const r = await tx.serviceRequest.findUniqueOrThrow({
      where: { id: requestId },
    });
    if (!["ASSIGNED", "EN_ROUTE"].includes(r.status)) throw new AppError("INVALID_TRANSITION", "Jobs can only be released before the driver arrives.");
    const a = await tx.providerAssignment.findFirst({
      where: { requestId, active: true },
      include: { provider: true },
    });
    if (!a) throw new AppError("CONFLICT", "No provider is assigned.");
    if (actor.role === "PROVIDER" && a.provider.userId !== actor.id) throw new AppError("FORBIDDEN", "This job isn't assigned to you.");
    if (actor.role === "ADMIN") assertCan(actor, "dispatch.assign");
    if (actor.role === "CUSTOMER") throw new AppError("FORBIDDEN", "Not allowed.");
    // transition() checks the provider still holds the active assignment, so run it first.
    await transition(tx, {
      requestId,
      to: "SEARCHING",
      actor,
      reason: `Released: ${reason}`,
      data: {
        driverEtaMinutes: null,
        driverEtaSetAt: null,
        searchBase: r.searchRound + 1,
      },
    });
    await tx.providerAssignment.update({
      where: { id: a.id },
      data: { active: false, releasedAt: new Date(), releaseReason: reason },
    });
    await notify(tx, {
      userId: r.customerId,
      type: "PROVIDER_ASSIGNED",
      title: "We're finding you another provider",
      body: "Your previous provider couldn't complete the job. We're contacting other verified providers now.",
      requestId,
      link: `/requests/${requestId}`,
      dedupeSuffix: `released-${a.id}`,
    });
    if (actor.role === "ADMIN")
      await audit(
        {
          actorId: actor.id,
          action: "dispatch.release",
          entityType: "ServiceRequest",
          entityId: requestId,
          details: { providerId: a.providerId, reason },
        },
        tx,
      );
    await sendNextRound(tx, requestId);
  });
  kickNotificationQueue();
}
