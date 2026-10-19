import { z } from "zod";
import { ASSIGNED_STATUSES, ACTIVE_STATUSES, type RequestStatus } from "@/lib/constants";
import { db } from "@/lib/db";
import type { Tx } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { config } from "@/lib/env";
import { generateReference, generateToken, sha256 } from "@/lib/auth/crypto";
import { haversineMiles, hasCoords, parseZipList } from "@/lib/geo";
import type { Actor } from "@/lib/permissions";
import { assertCan, assertRole, can } from "@/lib/permissions";
import { rateLimit } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import { createRequestSchema, messageSchema, parse, reviewSchema } from "@/lib/validation";
import { tryRoute } from "@/lib/integrations/maps";
import { putFile } from "@/lib/integrations/storage";
import { transition } from "./lifecycle";
import { calculatePrice, isMaterialIncrease, localTimeParts, parseBreakdown, type PriceBreakdown, type PriceLine, type PriceResult } from "./pricing";
import { kickNotificationQueue, notify, notifyAdmins } from "./notifications";
import { startDispatch } from "./dispatch";
import { captureFinal, paymentAuthorizationRequired, recordCompletionFinancials, settleCancellation } from "./payments";

// ---- Pricing lookups --------------------------------------------------------------------

type Point = { lat?: number | null; lng?: number | null; zip?: string | null };

export async function findPricingRule(tx: Tx, serviceCategoryId: string, pickup: Point) {
  const rules = await tx.pricingRule.findMany({
    where: { serviceCategoryId, active: true },
    include: { serviceArea: true },
    orderBy: { updatedAt: "desc" },
  });
  const areaMatch = rules.find((r) => {
    const a = r.serviceArea;
    if (!a || !a.active) return false;
    if (pickup.zip && parseZipList(a.zips).includes(pickup.zip)) return true;
    if (hasCoords({ lat: pickup.lat, lng: pickup.lng }) && a.centerLat != null && a.centerLng != null && a.radiusMiles) {
      return haversineMiles({ lat: a.centerLat, lng: a.centerLng }, { lat: pickup.lat!, lng: pickup.lng! }) <= a.radiusMiles;
    }
    return false;
  });
  return areaMatch ?? rules.find((r) => !r.serviceAreaId) ?? null;
}

const estimateInputSchema = z.object({
  serviceCategoryId: z.string(),
  pickup: z.object({
    lat: z.number().nullable().optional(),
    lng: z.number().nullable().optional(),
    zip: z.string().optional().nullable(),
  }),
  destination: z
    .object({
      lat: z.number().nullable().optional(),
      lng: z.number().nullable().optional(),
    })
    .nullable()
    .optional(),
  vehicleType: z.string().optional().nullable(),
  promoCode: z.string().optional().nullable(),
});

async function validatePromo(tx: Tx, code: string | null | undefined, now: Date) {
  if (!code) return null;
  const promo = await tx.promoCode.findUnique({
    where: { code: code.trim().toUpperCase() },
  });
  if (!promo || !promo.active || (promo.expiresAt && promo.expiresAt < now) || (promo.maxRedemptions != null && promo.redemptions >= promo.maxRedemptions)) {
    throw new AppError("VALIDATION", "That promo code isn't valid.", {
      promoCode: ["That promo code isn't valid."],
    });
  }
  return promo;
}

/** Itemized estimate for the request flow. Never returns a made-up number. */
export async function estimatePrice(input: unknown, now = new Date()) {
  const data = parse(estimateInputSchema, input);
  const category = await db.serviceCategory.findUnique({
    where: { id: data.serviceCategoryId },
  });
  if (!category || !category.active) throw new AppError("VALIDATION", "Choose an available service.");
  const rule = await findPricingRule(db, category.id, data.pickup);
  const promo = await validatePromo(db, data.promoCode, now);
  let miles: number | null = null;
  let mileageSource: string | null = null;
  if (category.requiresDestination) {
    const route = await tryRoute(
      hasCoords(data.pickup) ? { lat: data.pickup.lat!, lng: data.pickup.lng! } : null,
      data.destination && hasCoords(data.destination) ? { lat: data.destination.lat!, lng: data.destination.lng! } : null,
    );
    if (route) {
      miles = Math.round(route.miles * 10) / 10;
      mileageSource = route.source;
    }
  }
  const result: PriceResult = calculatePrice(rule && { ...rule, surcharges: rule.surcharges }, {
    miles,
    mileageSource,
    requiresMileage: category.requiresDestination,
    at: now,
    vehicleType: data.vehicleType,
    ...localTimeParts(now, config.timeZone()),
    promo,
  });
  return {
    result,
    rule,
    category,
    miles,
    mileageSource,
    promo,
    isDemoRule: rule?.isDemo ?? false,
  };
}

/** Which services verified providers offer at this pickup location (not a claim anyone is online). */
export async function serviceAvailability(pickup: Point) {
  const settings = await getSettings();
  const categories = await db.serviceCategory.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });
  const providers = await db.providerProfile.findMany({
    where: { verificationStatus: "APPROVED", user: { status: "ACTIVE" } },
    include: { services: { where: { authorized: true } } },
  });
  const covering = providers.filter((p) => {
    if (pickup.zip && parseZipList(p.serviceZips).includes(pickup.zip)) return true;
    if (hasCoords({ lat: pickup.lat, lng: pickup.lng }) && p.baseLat != null && p.baseLng != null && p.serviceRadiusMiles) {
      return haversineMiles({ lat: p.baseLat, lng: p.baseLng }, { lat: pickup.lat!, lng: pickup.lng! }) <= Math.min(p.serviceRadiusMiles, settings.dispatch.maxRadiusMiles);
    }
    return false;
  });
  return categories.map((c) => {
    const trucks = c.requiredTruckTypes.split(",").filter(Boolean);
    const offered = covering.some(
      (p) => p.services.some((s) => s.serviceCategoryId === c.id) && (trucks.length === 0 || (p.truckType && trucks.includes(p.truckType))) && (!c.requiresWinch || p.canWinch),
    );
    return {
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.description,
      requiresDestination: c.requiresDestination,
      offeredNearby: offered,
    };
  });
}

// ---- Create -----------------------------------------------------------------------------

export async function createServiceRequest(
  actor: Actor,
  input: unknown,
  opts: {
    expectedTotalCents?: number | null;
    photos?: Buffer[];
    now?: Date;
  } = {},
) {
  assertRole(actor, "CUSTOMER");
  rateLimit(`request:${actor.id}`, 10, 60 * 60 * 1000);
  const data = parse(createRequestSchema, input);
  const now = opts.now ?? new Date();

  const category = await db.serviceCategory.findUnique({
    where: { id: data.serviceCategoryId },
  });
  if (!category || !category.active) throw new AppError("VALIDATION", "Choose an available service.");
  if (category.requiresDestination && !data.destination) {
    throw new AppError("VALIDATION", "Enter where the vehicle should be towed.", { destination: ["Enter a destination address"] });
  }
  const activeCount = await db.serviceRequest.count({
    where: { customerId: actor.id, status: { in: ACTIVE_STATUSES } },
  });
  if (activeCount >= 3) throw new AppError("CONFLICT", "You already have 3 active requests. Please finish or cancel one first.");
  if (data.vehicleId) {
    const v = await db.vehicle.findFirst({
      where: { id: data.vehicleId, userId: actor.id },
    });
    if (!v) throw new AppError("VALIDATION", "Saved vehicle not found.");
  }

  const est = await estimatePrice(
    {
      serviceCategoryId: category.id,
      pickup: {
        lat: data.pickup.lat ?? null,
        lng: data.pickup.lng ?? null,
        zip: data.pickup.zip,
      },
      destination:
        category.requiresDestination && data.destination
          ? {
              lat: data.destination.lat ?? null,
              lng: data.destination.lng ?? null,
            }
          : null,
      vehicleType: data.vehicle.vehicleType,
      promoCode: data.promoCode,
    },
    now,
  );
  // The customer confirms a specific price; if it moved since they saw it, ask again.
  if (est.result.ok && opts.expectedTotalCents != null && opts.expectedTotalCents !== est.result.breakdown.totalCents) {
    throw new AppError("CONFLICT", "The estimate changed since you reviewed it. Please review the updated price.");
  }

  const photos: Awaited<ReturnType<typeof putFile>>[] = [];
  for (const buf of (opts.photos ?? []).slice(0, 4)) photos.push(await putFile(buf, { allowPdf: false }));

  const isDemo = config.demoMode();
  const created = await db.$transaction(async (tx) => {
    let vehicleId = data.vehicleId ?? null;
    if (!vehicleId && data.saveVehicle) {
      const v = await tx.vehicle.create({
        data: { userId: actor.id, ...data.vehicle },
      });
      vehicleId = v.id;
    }
    if (est.promo) {
      const updated = await tx.promoCode.updateMany({
        where: {
          id: est.promo.id,
          ...(est.promo.maxRedemptions != null ? { redemptions: { lt: est.promo.maxRedemptions } } : {}),
        },
        data: { redemptions: { increment: 1 } },
      });
      if (updated.count !== 1) throw new AppError("VALIDATION", "That promo code has reached its limit.");
    }

    let number = generateReference("CR");
    while (await tx.serviceRequest.findUnique({ where: { number } })) number = generateReference("CR");

    const dest = category.requiresDestination ? data.destination : null;
    const request = await tx.serviceRequest.create({
      data: {
        number,
        customerId: actor.id,
        serviceCategoryId: category.id,
        vehicleId,
        isDemo,
        vehicleSnapshot: JSON.stringify(data.vehicle),
        situation: data.situation,
        situationNotes: data.situationNotes,
        isSafeLocation: data.isSafeLocation,
        vehicleAccessible: data.vehicleCondition,
        pickupLine1: data.pickup.line1,
        pickupCity: data.pickup.city,
        pickupState: data.pickup.state,
        pickupZip: data.pickup.zip,
        pickupLat: data.pickup.lat ?? null,
        pickupLng: data.pickup.lng ?? null,
        pickupLandmarks: data.pickup.landmarks,
        pickupSource: data.pickup.source,
        destLine1: dest?.line1 ?? null,
        destCity: dest?.city ?? null,
        destState: dest?.state ?? null,
        destZip: dest?.zip ?? null,
        destLat: dest?.lat ?? null,
        destLng: dest?.lng ?? null,
        estimatedMiles: est.miles,
        mileageSource: est.mileageSource,
        promoCodeId: est.promo?.id ?? null,
      },
    });
    await tx.requestStatusHistory.create({
      data: {
        requestId: request.id,
        toStatus: "SUBMITTED",
        actorId: actor.id,
        actorRole: "CUSTOMER",
        reason: "Request submitted",
      },
    });
    await tx.user.update({
      where: { id: actor.id },
      data: { locationConsentAt: now },
    });

    if (est.result.ok) {
      await tx.quote.create({
        data: {
          requestId: request.id,
          kind: "ESTIMATE",
          status: "APPROVED",
          approvedAt: now,
          pricingRuleId: est.rule?.id,
          breakdown: JSON.stringify(est.result.breakdown),
          totalCents: est.result.breakdown.totalCents,
          expiresAt: est.result.expiresAt,
        },
      });
    } else {
      await tx.quote.create({
        data: {
          requestId: request.id,
          kind: "ESTIMATE",
          status: "NEEDS_CONFIRMATION",
          breakdown: JSON.stringify({ reason: est.result.reason }),
          reason: est.result.message,
        },
      });
      await notifyAdmins(tx, {
        type: "DISPATCH_ATTENTION",
        title: `Quote needed for ${number}`,
        body: est.result.message,
        requestId: request.id,
        link: `/admin/requests/${request.id}`,
      });
    }

    for (const p of photos) {
      await tx.storedFile.create({
        data: {
          ownerId: actor.id,
          ...p,
          originalName: "photo",
          purpose: "REQUEST_PHOTO",
          requestId: request.id,
        },
      });
    }

    await notify(tx, {
      userId: actor.id,
      type: "REQUEST_CONFIRMED",
      title: `Request ${number} received`,
      body: est.result.ok ? "We're getting your request to verified providers now." : "A dispatcher will send you a confirmed quote to approve before anyone is dispatched.",
      requestId: request.id,
      link: `/requests/${request.id}`,
    });
    return request;
  });

  const next = est.result.ok ? await proceedAfterPriceApproval(created.id) : "AWAITING_QUOTE";
  kickNotificationQueue();
  return { request: created, next };
}

export type NextStep = "AWAITING_QUOTE" | "AWAITING_PAYMENT" | "DISPATCHING";

/** Once a price is approved: ask for card authorization if required, otherwise dispatch. */
export async function proceedAfterPriceApproval(requestId: string): Promise<NextStep> {
  const r = await db.serviceRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: { payments: true },
  });
  if (await paymentAuthorizationRequired(r.isDemo)) {
    if (!r.payments.some((p) => p.status === "AUTHORIZED")) return "AWAITING_PAYMENT";
  }
  await startDispatch(requestId);
  return "DISPATCHING";
}

// ---- Quotes -----------------------------------------------------------------------------

const confirmedQuoteSchema = z.object({
  miles: z.number().min(0).max(1000).nullable().optional(),
  extraLines: z
    .array(
      z.object({
        label: z.string().trim().min(2).max(80),
        amountCents: z.number().int().min(-100_000).max(1_000_000),
      }),
    )
    .max(10)
    .default([]),
  taxRateBps: z.number().int().min(0).max(3000).optional(),
  note: z.string().trim().max(500).optional().nullable(),
});

/** Dispatcher sends a confirmed quote when an instant estimate wasn't possible. */
export async function sendConfirmedQuote(admin: Actor, requestId: string, input: unknown, now = new Date()) {
  assertCan(admin, "quotes.manage");
  const data = parse(confirmedQuoteSchema, input);
  await db.$transaction(async (tx) => {
    const r = await tx.serviceRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: { serviceCategory: true },
    });
    if (r.status !== "SUBMITTED") throw new AppError("CONFLICT", "Quotes can only be sent before dispatch starts.");
    if (await tx.quote.findFirst({ where: { requestId, status: "APPROVED" } })) throw new AppError("CONFLICT", "The customer already approved a price.");
    const rule = await findPricingRule(tx, r.serviceCategoryId, {
      lat: r.pickupLat,
      lng: r.pickupLng,
      zip: r.pickupZip,
    });
    let breakdown: PriceBreakdown;
    if (rule) {
      const res = calculatePrice(rule, {
        miles: data.miles ?? null,
        mileageSource: "Confirmed by dispatcher",
        requiresMileage: r.serviceCategory.requiresDestination,
        at: now,
        vehicleType: JSON.parse(r.vehicleSnapshot).vehicleType,
        ...localTimeParts(now, config.timeZone()),
        extraLines: data.extraLines,
      });
      if (!res.ok) throw new AppError("VALIDATION", "Enter the confirmed towing miles to calculate the quote.");
      breakdown = res.breakdown;
    } else {
      if (data.extraLines.length === 0) throw new AppError("VALIDATION", "No pricing rule exists for this service. Add itemized charges for the quote.");
      breakdown = manualBreakdown(data.extraLines, data.taxRateBps ?? 0);
    }
    await tx.quote.updateMany({
      where: {
        requestId,
        status: { in: ["PENDING_APPROVAL", "NEEDS_CONFIRMATION"] },
      },
      data: { status: "SUPERSEDED" },
    });
    await tx.quote.create({
      data: {
        requestId,
        kind: "CONFIRMED",
        status: "PENDING_APPROVAL",
        pricingRuleId: rule?.id,
        breakdown: JSON.stringify(breakdown),
        totalCents: breakdown.totalCents,
        reason: data.note ?? null,
        createdById: admin.id,
        expiresAt: new Date(now.getTime() + 60 * 60_000),
      },
    });
    if (data.miles != null)
      await tx.serviceRequest.update({
        where: { id: requestId },
        data: {
          estimatedMiles: data.miles,
          mileageSource: "Confirmed by dispatcher",
        },
      });
    await notify(tx, {
      userId: r.customerId,
      type: "QUOTE_READY",
      title: "Your confirmed quote is ready",
      body: `Review and approve $${(breakdown.totalCents / 100).toFixed(2)} so we can dispatch a provider.`,
      requestId,
      link: `/requests/${requestId}`,
      dedupeSuffix: String(now.getTime()),
    });
    await audit(
      {
        actorId: admin.id,
        action: "quote.confirmed_sent",
        entityType: "ServiceRequest",
        entityId: requestId,
        details: { totalCents: breakdown.totalCents },
      },
      tx,
    );
  });
  kickNotificationQueue();
}

function manualBreakdown(lines: { label: string; amountCents: number }[], taxRateBps: number, prior?: PriceBreakdown | null): PriceBreakdown {
  const all: PriceLine[] = lines.map((l) => ({
    code: "ADJUSTMENT",
    label: l.label,
    amountCents: l.amountCents,
    kind: "adjustment",
  }));
  const subtotal = all.reduce((s, l) => s + l.amountCents, 0);
  if (subtotal < 0) throw new AppError("VALIDATION", "The total can't be negative.");
  const tax = Math.round((subtotal * taxRateBps) / 10_000);
  if (taxRateBps > 0)
    all.push({
      code: "TAX",
      label: `Tax (${(taxRateBps / 100).toFixed(2)}%)`,
      amountCents: tax,
      kind: "tax",
    });
  return {
    currency: "usd",
    lines: all,
    subtotalCents: subtotal,
    taxCents: tax,
    taxRateBps,
    totalCents: subtotal + tax,
    estimatedMiles: prior?.estimatedMiles ?? null,
    includedMiles: prior?.includedMiles ?? 0,
    billableMiles: prior?.billableMiles ?? 0,
    mileageSource: prior?.mileageSource ?? null,
    pricingRuleId: prior?.pricingRuleId ?? null,
  };
}

export async function respondToQuote(actor: Actor, quoteId: string, approve: boolean, now = new Date()) {
  assertRole(actor, "CUSTOMER");
  const outcome = await db.$transaction(async (tx) => {
    const q = await tx.quote.findUnique({
      where: { id: quoteId },
      include: { request: true },
    });
    if (!q || q.request.customerId !== actor.id) throw new AppError("NOT_FOUND", "Quote not found.");
    if (q.status !== "PENDING_APPROVAL") throw new AppError("CONFLICT", "This quote is no longer waiting for a response.");
    if (q.expiresAt && q.expiresAt < now && q.kind === "CONFIRMED") {
      await tx.quote.update({
        where: { id: q.id },
        data: { status: "EXPIRED" },
      });
      throw new AppError("CONFLICT", "This quote expired. We've asked a dispatcher to send a fresh one.");
    }
    if (approve) {
      if (q.kind === "REVISION")
        await tx.quote.updateMany({
          where: { requestId: q.requestId, status: "APPROVED" },
          data: { status: "SUPERSEDED" },
        });
      await tx.quote.update({
        where: { id: q.id },
        data: { status: "APPROVED", approvedAt: now },
      });
    } else {
      await tx.quote.update({
        where: { id: q.id },
        data: { status: "DECLINED" },
      });
    }
    if (q.kind === "REVISION") {
      const a = await tx.providerAssignment.findFirst({
        where: { requestId: q.requestId, active: true },
        include: { provider: true },
      });
      if (a) {
        await notify(tx, {
          userId: a.provider.userId,
          type: "PRICE_CHANGE_PENDING",
          title: approve ? "Customer approved the price change" : "Customer declined the price change",
          body: approve ? "You can continue the job." : "Please don't perform the extra work. Contact dispatch if you need help.",
          requestId: q.requestId,
          link: `/provider/jobs/${q.requestId}`,
          dedupeSuffix: q.id,
        });
      }
      if (!approve) {
        await notifyAdmins(tx, {
          type: "DISPATCH_ATTENTION",
          title: `${q.request.number}: price change declined`,
          body: q.reason ?? "",
          requestId: q.requestId,
          link: `/admin/requests/${q.requestId}`,
          dedupeSuffix: q.id,
        });
      }
    }
    return { kind: q.kind, requestId: q.requestId };
  });

  if (outcome.kind === "CONFIRMED") {
    if (approve) await proceedAfterPriceApproval(outcome.requestId);
    else await cancelRequest(actor, outcome.requestId, "Customer declined the confirmed quote");
  }
  kickNotificationQueue();
  return outcome;
}

const revisionSchema = z.object({
  lines: z
    .array(
      z.object({
        label: z.string().trim().min(2).max(80),
        amountCents: z.number().int().min(-100_000).max(1_000_000),
      }),
    )
    .min(1)
    .max(5),
  reason: z.string().trim().min(5, "Explain why the price is changing").max(500),
});

/** Provider or dispatcher proposes a price change after assignment. */
export async function proposePriceRevision(actor: Actor, requestId: string, input: unknown, now = new Date()) {
  const data = parse(revisionSchema, input);
  const res = await db.$transaction(async (tx) => {
    const r = await tx.serviceRequest.findUniqueOrThrow({
      where: { id: requestId },
    });
    if (!ASSIGNED_STATUSES.includes(r.status as RequestStatus)) throw new AppError("CONFLICT", "Price changes can only be proposed while a job is underway.");
    if (actor.role === "PROVIDER") {
      const a = await tx.providerAssignment.findFirst({
        where: { requestId, active: true, provider: { userId: actor.id } },
      });
      if (!a) throw new AppError("FORBIDDEN", "This job isn't assigned to you.");
    } else assertCan(actor, "quotes.manage");
    if (
      await tx.quote.findFirst({
        where: { requestId, kind: "REVISION", status: "PENDING_APPROVAL" },
      })
    ) {
      throw new AppError("CONFLICT", "A price change is already waiting for the customer's approval.");
    }
    const current = await tx.quote.findFirst({
      where: { requestId, status: "APPROVED" },
      orderBy: { createdAt: "desc" },
    });
    const prior = parseBreakdown(current?.breakdown);
    if (!current || !prior || current.totalCents == null) throw new AppError("CONFLICT", "There's no approved price to revise.");
    const base = prior.lines.filter((l) => l.kind !== "tax").map((l) => ({ label: l.label, amountCents: l.amountCents }));
    const breakdown = manualBreakdown(
      [
        ...base,
        ...data.lines.map((l) => ({
          label: `${l.label}`,
          amountCents: l.amountCents,
        })),
      ],
      prior.taxRateBps,
      prior,
    );
    // Keep original line kinds for the unchanged lines.
    breakdown.lines = [...prior.lines.filter((l) => l.kind !== "tax"), ...breakdown.lines.slice(base.length)];
    const settings = await getSettings(tx);
    const material = isMaterialIncrease(current.totalCents, breakdown.totalCents, settings.pricing.revisionApprovalThresholdCents);
    if (!material)
      await tx.quote.update({
        where: { id: current.id },
        data: { status: "SUPERSEDED" },
      });
    const q = await tx.quote.create({
      data: {
        requestId,
        kind: "REVISION",
        status: material ? "PENDING_APPROVAL" : "APPROVED",
        approvedAt: material ? null : now,
        breakdown: JSON.stringify(breakdown),
        totalCents: breakdown.totalCents,
        reason: data.reason,
        createdById: actor.id,
      },
    });
    if (material) {
      await notify(tx, {
        userId: r.customerId,
        type: "PRICE_CHANGE_PENDING",
        title: "Please review a price change",
        body: `New total $${(breakdown.totalCents / 100).toFixed(2)} (was $${(current.totalCents / 100).toFixed(2)}). Reason: ${data.reason}`,
        requestId,
        link: `/requests/${requestId}`,
        dedupeSuffix: q.id,
      });
    }
    if (actor.role === "ADMIN")
      await audit(
        {
          actorId: actor.id,
          action: "quote.revision",
          entityType: "ServiceRequest",
          entityId: requestId,
          details: { totalCents: breakdown.totalCents, reason: data.reason },
        },
        tx,
      );
    return { material, quoteId: q.id };
  });
  kickNotificationQueue();
  return res;
}

// ---- Cancellation -----------------------------------------------------------------------

export async function cancellationTerms(requestId: string, now = new Date(), tx: Tx = db) {
  const r = await tx.serviceRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: { assignments: { where: { active: true } } },
  });
  const settings = await getSettings(tx);
  const status = r.status as RequestStatus;
  const customerCanCancel = ["SUBMITTED", "SEARCHING", "NO_PROVIDER_AVAILABLE", "ASSIGNED", "EN_ROUTE"].includes(status);
  let feeCents = 0;
  let feeConfigured = true;
  if (status === "ASSIGNED" || status === "EN_ROUTE") {
    const fee = settings.cancellation.feeAfterAssignmentCents;
    const assignedAt = r.assignments[0]?.createdAt;
    const minutes = assignedAt ? (now.getTime() - assignedAt.getTime()) / 60_000 : 0;
    if (fee == null) feeConfigured = false;
    else if (minutes >= settings.cancellation.freeCancellationMinutes) feeCents = fee;
  }
  return {
    customerCanCancel,
    feeCents,
    feeConfigured,
    freeCancellationMinutes: settings.cancellation.freeCancellationMinutes,
  };
}

export async function cancelRequest(actor: Actor, requestId: string, reason: string, opts: { waiveFee?: boolean; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  if (!reason?.trim()) throw new AppError("VALIDATION", "Please tell us why you're cancelling.");
  const fee = await db.$transaction(async (tx) => {
    const r = await tx.serviceRequest.findUnique({ where: { id: requestId } });
    if (!r) throw new AppError("NOT_FOUND", "Request not found.");
    if (actor.role === "CUSTOMER" && r.customerId !== actor.id) throw new AppError("NOT_FOUND", "Request not found.");
    if (actor.role === "PROVIDER") throw new AppError("FORBIDDEN", "Providers can release a job but not cancel the customer's request.");
    const terms = await cancellationTerms(requestId, now, tx);
    if (actor.role === "CUSTOMER" && !terms.customerCanCancel) {
      throw new AppError("INVALID_TRANSITION", "Your provider has already arrived, so this request can't be cancelled in the app. Please contact support.");
    }
    const feeCents = actor.role === "ADMIN" && opts.waiveFee !== false ? 0 : terms.feeCents;

    const active = await tx.providerAssignment.findFirst({
      where: { requestId, active: true },
      include: { provider: true },
    });
    await transition(tx, {
      requestId,
      to: "CANCELLED",
      actor,
      reason: reason.trim(),
      data: {
        cancelReason: reason.trim(),
        cancellationFeeCents: feeCents || null,
      },
    });
    await tx.jobOffer.updateMany({
      where: { requestId, status: "PENDING" },
      data: { status: "WITHDRAWN" },
    });
    await tx.quote.updateMany({
      where: {
        requestId,
        status: { in: ["PENDING_APPROVAL", "NEEDS_CONFIRMATION"] },
      },
      data: { status: "SUPERSEDED" },
    });
    if (active) {
      await tx.providerAssignment.update({
        where: { id: active.id },
        data: {
          active: false,
          releasedAt: now,
          releaseReason: "Request cancelled",
        },
      });
      await notify(tx, {
        userId: active.provider.userId,
        type: "JOB_CANCELLED",
        title: `Job ${r.number} was cancelled`,
        body: "You don't need to continue to this job.",
        requestId,
        link: "/provider",
      });
    }
    await notify(tx, {
      userId: r.customerId,
      type: "REQUEST_CANCELLED",
      title: `Request ${r.number} cancelled`,
      body: feeCents > 0 ? `A cancellation fee of $${(feeCents / 100).toFixed(2)} applies, as shown before you cancelled.` : "No cancellation fee applies.",
      requestId,
      link: `/requests/${requestId}`,
    });
    if (actor.role === "ADMIN")
      await audit(
        {
          actorId: actor.id,
          action: "request.cancel",
          entityType: "ServiceRequest",
          entityId: requestId,
          details: { reason, feeCents },
        },
        tx,
      );
    return feeCents;
  });
  await settleCancellation(requestId, fee);
  kickNotificationQueue();
  return { feeCents: fee };
}

// ---- Job progress (provider / dispatcher) -------------------------------------------

const PROGRESS_NOTICE: Partial<
  Record<
    RequestStatus,
    {
      type: "DRIVER_EN_ROUTE" | "DRIVER_ARRIVED" | "SERVICE_STARTED" | "SERVICE_COMPLETED";
      title: string;
      body: string;
    }
  >
> = {
  EN_ROUTE: {
    type: "DRIVER_EN_ROUTE",
    title: "Your driver is on the way",
    body: "Your driver has started heading to your location.",
  },
  ARRIVED: {
    type: "DRIVER_ARRIVED",
    title: "Your driver has arrived",
    body: "Your driver reports they've arrived. Please confirm it's them before handing over keys.",
  },
  IN_PROGRESS: {
    type: "SERVICE_STARTED",
    title: "Service in progress",
    body: "Your driver has started the service.",
  },
  COMPLETED: {
    type: "SERVICE_COMPLETED",
    title: "Service completed",
    body: "Your service is complete. Thank you for using Call Recon.",
  },
};

export async function updateJobStatus(actor: Actor, requestId: string, to: RequestStatus, opts: { etaMinutes?: number | null; notes?: string | null } = {}) {
  if (!["EN_ROUTE", "ARRIVED", "IN_PROGRESS", "COMPLETED"].includes(to)) throw new AppError("VALIDATION", "Unsupported status update.");
  if (actor.role === "CUSTOMER") throw new AppError("FORBIDDEN", "Only the assigned provider or dispatch can update job status.");
  if (opts.etaMinutes != null && (!Number.isInteger(opts.etaMinutes) || opts.etaMinutes < 1 || opts.etaMinutes > 240)) {
    throw new AppError("VALIDATION", "Enter an arrival estimate between 1 and 240 minutes.");
  }
  let capture: { paymentId: string | null; total: number } | null = null;
  await db.$transaction(async (tx) => {
    const r = await tx.serviceRequest.findUniqueOrThrow({
      where: { id: requestId },
    });
    const data: Record<string, unknown> = {};
    if (to === "EN_ROUTE" && opts.etaMinutes)
      Object.assign(data, {
        driverEtaMinutes: opts.etaMinutes,
        driverEtaSetAt: new Date(),
      });
    if (to === "COMPLETED") {
      if (
        await tx.quote.findFirst({
          where: { requestId, status: "PENDING_APPROVAL" },
        })
      ) {
        throw new AppError("CONFLICT", "The customer hasn't responded to the price change yet.");
      }
      if (opts.notes) data.completionNotes = opts.notes.slice(0, 2000);
    }
    await transition(tx, {
      requestId,
      to,
      actor,
      reason: actor.role === "ADMIN" ? "Updated by dispatch" : null,
      data,
    });
    const notice = PROGRESS_NOTICE[to];
    if (notice) {
      const assignment = await tx.providerAssignment.findFirst({
        where: { requestId, active: true },
      });
      await notify(tx, {
        userId: r.customerId,
        ...notice,
        requestId,
        link: `/requests/${requestId}`,
        dedupeSuffix: assignment?.id,
      });
    }
    if (to === "COMPLETED") {
      const fin = await recordCompletionFinancials(tx, requestId);
      const a = await tx.providerAssignment.findFirstOrThrow({
        where: { requestId, active: true },
      });
      await tx.providerProfile.update({
        where: { id: a.providerId },
        data: { jobsCompleted: { increment: 1 } },
      });
      capture = { paymentId: fin.capturePaymentId, total: fin.totalCents };
    }
    if (actor.role === "ADMIN")
      await audit(
        {
          actorId: actor.id,
          action: "request.status_override",
          entityType: "ServiceRequest",
          entityId: requestId,
          details: { to },
        },
        tx,
      );
  });
  const c = capture as { paymentId: string | null; total: number } | null;
  if (c?.paymentId) await captureFinal(c.paymentId, c.total);
  kickNotificationQueue();
}

// ---- Access control & views ----------------------------------------------------------------

export type ViewerRelation = "CUSTOMER" | "ASSIGNED_PROVIDER" | "OFFERED_PROVIDER" | "PAST_PROVIDER" | "ADMIN";

/** Decide what the viewer may see of a request. Throws NOT_FOUND rather than leaking existence. */
export async function relationTo(actor: Actor, requestId: string): Promise<ViewerRelation> {
  const r = await db.serviceRequest.findUnique({
    where: { id: requestId },
    select: { customerId: true, status: true },
  });
  if (!r) throw new AppError("NOT_FOUND", "Request not found.");
  if (actor.role === "CUSTOMER") {
    if (r.customerId === actor.id) return "CUSTOMER";
    throw new AppError("NOT_FOUND", "Request not found.");
  }
  if (actor.role === "ADMIN") {
    if (can(actor, "requests.view")) return "ADMIN";
    throw new AppError("NOT_FOUND", "Request not found.");
  }
  const provider = await db.providerProfile.findUnique({
    where: { userId: actor.id },
  });
  if (!provider) throw new AppError("NOT_FOUND", "Request not found.");
  const active = await db.providerAssignment.findFirst({
    where: { requestId, providerId: provider.id, active: true },
  });
  if (active && ASSIGNED_STATUSES.includes(r.status as RequestStatus)) return "ASSIGNED_PROVIDER";
  const completed = await db.providerAssignment.findFirst({
    where: { requestId, providerId: provider.id },
  });
  if (completed) return "PAST_PROVIDER";
  const offer = await db.jobOffer.findFirst({
    where: { requestId, providerId: provider.id, status: "PENDING" },
  });
  if (offer) return "OFFERED_PROVIDER";
  throw new AppError("NOT_FOUND", "Request not found.");
}

export async function getRequestDetail(actor: Actor, requestId: string) {
  const relation = await relationTo(actor, requestId);
  const r = await db.serviceRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: {
      serviceCategory: true,
      customer: { select: { id: true, name: true, phone: true } },
      statusHistory: {
        orderBy: { createdAt: "asc" },
        include: { actor: { select: { name: true } } },
      },
      quotes: { orderBy: { createdAt: "asc" } },
      assignments: {
        orderBy: { createdAt: "desc" },
        include: {
          provider: {
            include: { user: { select: { name: true, phoneVerified: true } } },
          },
        },
      },
      payments: { include: { refunds: true } },
      receipt: true,
      review: true,
      files: {
        select: { id: true, mimeType: true, purpose: true, createdAt: true },
      },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { sender: { select: { id: true, name: true, role: true } } },
      },
      offers:
        relation === "ADMIN"
          ? {
              include: { provider: { select: { businessName: true } } },
              orderBy: { createdAt: "desc" },
            }
          : false,
      shareLinks: relation === "CUSTOMER" ? { where: { revokedAt: null } } : false,
    },
  });

  // Providers see only what they need: exact location and contact only while assigned.
  if (relation === "OFFERED_PROVIDER" || relation === "PAST_PROVIDER") {
    return {
      relation,
      request: {
        ...r,
        pickupLine1: null,
        pickupLat: null,
        pickupLng: null,
        pickupLandmarks: null,
        destLine1: null,
        destLat: null,
        destLng: null,
        customer: { id: "", name: r.customer.name.split(" ")[0], phone: null },
        messages: [],
        payments: [],
        files: relation === "PAST_PROVIDER" ? r.files.filter((f) => f.purpose === "JOB_DOCUMENTATION") : [],
        statusHistory: r.statusHistory.map((h) => ({ ...h, actor: null })),
      },
    };
  }
  if (relation === "ASSIGNED_PROVIDER") {
    // Customer phone stays private: communication goes through in-app messages.
    return {
      relation,
      request: { ...r, customer: { ...r.customer, phone: null }, payments: [] },
    };
  }
  return { relation, request: r };
}

export async function postMessage(actor: Actor, requestId: string, input: unknown) {
  const { body } = parse(messageSchema, input);
  rateLimit(`msg:${actor.id}`, 30, 60_000);
  const relation = await relationTo(actor, requestId);
  const r = await db.serviceRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: {
      assignments: { where: { active: true }, include: { provider: true } },
    },
  });
  if (relation === "OFFERED_PROVIDER" || relation === "PAST_PROVIDER") throw new AppError("FORBIDDEN", "Messaging is available only on your active job.");
  if (relation === "ADMIN" && !can(actor, "support.manage")) throw new AppError("FORBIDDEN", "Not allowed.");
  if (!ASSIGNED_STATUSES.includes(r.status as RequestStatus) && relation !== "ADMIN") throw new AppError("CONFLICT", "Messaging opens once a provider is assigned.");
  await db.$transaction(async (tx) => {
    const m = await tx.message.create({
      data: { requestId, senderId: actor.id, body },
    });
    const providerUserId = r.assignments[0]?.provider.userId;
    const recipients = [r.customerId, providerUserId].filter((id): id is string => Boolean(id) && id !== actor.id);
    for (const userId of recipients) {
      await notify(tx, {
        userId,
        type: "NEW_MESSAGE",
        title: `New message on ${r.number}`,
        body: body.slice(0, 120),
        requestId,
        link: userId === r.customerId ? `/requests/${requestId}` : `/provider/jobs/${requestId}`,
        dedupeSuffix: m.id,
      });
    }
  });
  kickNotificationQueue();
}

export async function createShareLink(actor: Actor, requestId: string) {
  if ((await relationTo(actor, requestId)) !== "CUSTOMER") throw new AppError("FORBIDDEN", "Only the customer can share status.");
  const token = generateToken(18);
  await db.shareLink.create({
    data: {
      requestId,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
  return `${config.appUrl()}/share/${token}`;
}

export async function revokeShareLinks(actor: Actor, requestId: string) {
  if ((await relationTo(actor, requestId)) !== "CUSTOMER") throw new AppError("FORBIDDEN", "Not allowed.");
  await db.shareLink.updateMany({
    where: { requestId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Public status view: no addresses, no contact details, no prices. */
export async function getSharedStatus(token: string) {
  const link = await db.shareLink.findUnique({
    where: { tokenHash: sha256(token) },
  });
  if (!link || link.revokedAt || link.expiresAt < new Date()) return null;
  const r = await db.serviceRequest.findUnique({
    where: { id: link.requestId },
    include: {
      serviceCategory: { select: { name: true } },
      statusHistory: {
        orderBy: { createdAt: "asc" },
        select: { toStatus: true, createdAt: true },
      },
      assignments: {
        where: { active: true },
        include: {
          provider: {
            select: {
              businessName: true,
              truckMake: true,
              truckModel: true,
              truckColor: true,
              verificationStatus: true,
              user: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!r) return null;
  const p = r.assignments[0]?.provider;
  return {
    number: r.number,
    status: r.status as RequestStatus,
    service: r.serviceCategory.name,
    history: r.statusHistory,
    provider: p
      ? {
          firstName: p.user.name.split(" ")[0],
          businessName: p.businessName,
          truck: [p.truckColor, p.truckMake, p.truckModel].filter(Boolean).join(" "),
          verified: p.verificationStatus === "APPROVED",
        }
      : null,
    expiresAt: link.expiresAt,
  };
}

export async function submitReview(actor: Actor, requestId: string, input: unknown) {
  assertRole(actor, "CUSTOMER");
  const data = parse(reviewSchema, input);
  const r = await db.serviceRequest.findFirst({
    where: { id: requestId, customerId: actor.id },
    include: { review: true },
  });
  if (!r) throw new AppError("NOT_FOUND", "Request not found.");
  if (r.status !== "COMPLETED") throw new AppError("CONFLICT", "You can review a service after it's completed.");
  if (r.review) throw new AppError("CONFLICT", "You've already reviewed this service.");
  await db.review.create({
    data: {
      requestId,
      authorId: actor.id,
      rating: data.rating,
      comment: data.comment,
    },
  });
}

export async function addJobDocumentation(actor: Actor, requestId: string, buf: Buffer) {
  const relation = await relationTo(actor, requestId);
  if (relation !== "ASSIGNED_PROVIDER") throw new AppError("FORBIDDEN", "Only the assigned provider can add job documentation.");
  const stored = await putFile(buf, { allowPdf: true });
  await db.storedFile.create({
    data: {
      ownerId: actor.id,
      ...stored,
      originalName: "job-documentation",
      purpose: "JOB_DOCUMENTATION",
      requestId,
    },
  });
}

// ---- Data retention ------------------------------------------------------------------------

/** Remove street-level location data from finished requests older than the retention window. */
export async function purgeOldLocationData(admin: Actor, now = new Date()) {
  assertCan(admin, "data.retention");
  const settings = await getSettings();
  const cutoff = new Date(now.getTime() - settings.retention.locationDataDays * 24 * 60 * 60 * 1000);
  const res = await db.serviceRequest.updateMany({
    where: {
      status: { in: ["COMPLETED", "CANCELLED"] },
      locationPurgedAt: null,
      updatedAt: { lt: cutoff },
    },
    data: {
      pickupLine1: null,
      pickupLat: null,
      pickupLng: null,
      pickupLandmarks: null,
      destLine1: null,
      destLat: null,
      destLng: null,
      locationPurgedAt: now,
    },
  });
  const prov = await db.providerProfile.updateMany({
    where: { lastLocationAt: { lt: cutoff } },
    data: { lastLat: null, lastLng: null, lastLocationAt: null },
  });
  await audit({
    actorId: admin.id,
    action: "data.purge_locations",
    entityType: "ServiceRequest",
    details: { requests: res.count, providers: prov.count, cutoff },
  });
  return { requests: res.count, providers: prov.count };
}
