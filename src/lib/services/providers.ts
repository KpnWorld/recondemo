import { ASSIGNED_STATUSES, REQUIRED_DOCUMENT_TYPES } from "@/lib/constants";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import type { Actor } from "@/lib/permissions";
import { assertCan, assertRole } from "@/lib/permissions";
import { rateLimit } from "@/lib/rate-limit";
import { documentTypeSchema, parse, providerOnboardingSchema } from "@/lib/validation";
import { putFile } from "@/lib/integrations/storage";
import { kickNotificationQueue, notify } from "./notifications";

async function ownProfile(actor: Actor) {
  assertRole(actor, "PROVIDER");
  const p = await db.providerProfile.findUnique({
    where: { userId: actor.id },
    include: { services: true },
  });
  if (!p) throw new AppError("NOT_FOUND", "Provider profile not found.");
  return p;
}

export async function saveOnboarding(actor: Actor, input: unknown) {
  const p = await ownProfile(actor);
  const data = parse(providerOnboardingSchema, input);
  if (!data.serviceZips && !(data.baseLat != null && data.baseLng != null && data.serviceRadiusMiles)) {
    throw new AppError("VALIDATION", "Add the ZIP codes you cover, or a base location with a service radius.", { serviceZips: ["Add at least one ZIP code"] });
  }
  const categories = await db.serviceCategory.findMany({
    where: { id: { in: data.serviceCategoryIds }, active: true },
  });
  if (categories.length !== data.serviceCategoryIds.length) throw new AppError("VALIDATION", "One of the selected services is unavailable.");

  // Changing equipment after approval sends the profile back for review.
  const equipmentChanged = p.verificationStatus === "APPROVED" && (p.truckType !== data.truckType || p.truckPlate !== data.truckPlate);

  await db.$transaction(async (tx) => {
    await tx.providerProfile.update({
      where: { id: p.id },
      data: {
        businessName: data.businessName,
        businessPhone: data.businessPhone ?? null,
        licenseNumber: data.licenseNumber,
        truckType: data.truckType,
        truckMake: data.truckMake,
        truckModel: data.truckModel,
        truckYear: data.truckYear,
        truckPlate: data.truckPlate.toUpperCase(),
        truckColor: data.truckColor,
        canWinch: data.canWinch,
        baseAddress: data.baseAddress,
        baseLat: data.baseLat ?? null,
        baseLng: data.baseLng ?? null,
        serviceRadiusMiles: data.serviceRadiusMiles ?? null,
        serviceZips: data.serviceZips
          .split(/[\s,]+/)
          .filter(Boolean)
          .join(","),
        operatingHours: JSON.stringify(data.operatingHours),
        ...(equipmentChanged
          ? {
              verificationStatus: "PENDING",
              isOnline: false,
              verificationNotes: "Equipment changed; re-verification required.",
            }
          : {}),
      },
    });
    // New services start unauthorized until an administrator approves them.
    await tx.providerService.deleteMany({
      where: {
        providerId: p.id,
        serviceCategoryId: { notIn: data.serviceCategoryIds },
      },
    });
    for (const id of data.serviceCategoryIds) {
      await tx.providerService.upsert({
        where: {
          providerId_serviceCategoryId: {
            providerId: p.id,
            serviceCategoryId: id,
          },
        },
        create: { providerId: p.id, serviceCategoryId: id, authorized: false },
        update: {},
      });
    }
  });
  return { equipmentChanged };
}

export async function uploadProviderDocument(actor: Actor, type: string, buf: Buffer, originalName: string, expiresOn?: string | null) {
  rateLimit(`doc:${actor.id}`, 20, 60 * 60 * 1000);
  const p = await ownProfile(actor);
  const docType = parse(documentTypeSchema, type);
  const stored = await putFile(buf, { allowPdf: true });
  const exp = expiresOn ? new Date(expiresOn) : null;
  if (exp && (Number.isNaN(exp.getTime()) || exp < new Date())) throw new AppError("VALIDATION", "This document appears to be expired.");
  await db.$transaction(async (tx) => {
    const file = await tx.storedFile.create({
      data: {
        ownerId: actor.id,
        ...stored,
        originalName: originalName.slice(0, 120),
        purpose: "PROVIDER_DOCUMENT",
      },
    });
    await tx.providerDocument.create({
      data: {
        providerId: p.id,
        type: docType,
        fileId: file.id,
        expiresOn: exp,
      },
    });
  });
}

export async function setAvailability(actor: Actor, online: boolean) {
  const p = await ownProfile(actor);
  if (online && p.verificationStatus !== "APPROVED") throw new AppError("FORBIDDEN", "You can go online once your account is verified.");
  if (online && !p.services.some((s) => s.authorized)) throw new AppError("FORBIDDEN", "No services have been authorized for your account yet.");
  await db.providerProfile.update({
    where: { id: p.id },
    data: { isOnline: online, onlineSince: online ? new Date() : null },
  });
}

/** Real device location from the provider's browser, accepted only during an active job and with consent. */
export async function updateProviderLocation(actor: Actor, lat: number, lng: number) {
  const p = await ownProfile(actor);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new AppError("VALIDATION", "Invalid coordinates.");
  rateLimit(`loc:${actor.id}`, 20, 60_000);
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
  if (!user.locationConsentAt) throw new AppError("FORBIDDEN", "Turn on location sharing first.");
  const active = await db.providerAssignment.count({
    where: {
      providerId: p.id,
      active: true,
      request: { status: { in: ASSIGNED_STATUSES } },
    },
  });
  if (!active && !p.isOnline) throw new AppError("CONFLICT", "Location is only shared while you're online or on a job.");
  await db.providerProfile.update({
    where: { id: p.id },
    data: { lastLat: lat, lastLng: lng, lastLocationAt: new Date() },
  });
}

// ---- Administrator verification -------------------------------------------------------------

export async function reviewDocument(admin: Actor, documentId: string, status: "APPROVED" | "REJECTED", notes?: string | null) {
  assertCan(admin, "providers.verify");
  if (status === "REJECTED" && !notes?.trim()) throw new AppError("VALIDATION", "Explain why the document was rejected so the provider can fix it.");
  const doc = await db.providerDocument.update({
    where: { id: documentId },
    data: {
      status,
      reviewNotes: notes ?? null,
      reviewedById: admin.id,
      reviewedAt: new Date(),
    },
    include: { provider: true },
  });
  await audit({
    actorId: admin.id,
    action: `provider_document.${status.toLowerCase()}`,
    entityType: "ProviderDocument",
    entityId: documentId,
    details: { providerId: doc.providerId, notes },
  });
}

export async function setProviderVerification(
  admin: Actor,
  providerId: string,
  status: "APPROVED" | "REJECTED" | "SUSPENDED" | "PENDING",
  opts: { notes?: string | null; authorizedServiceIds?: string[] } = {},
) {
  assertCan(admin, "providers.verify");
  const p = await db.providerProfile.findUnique({
    where: { id: providerId },
    include: { documents: true, services: true, user: true },
  });
  if (!p) throw new AppError("NOT_FOUND", "Provider not found.");
  if (status !== "APPROVED" && !opts.notes?.trim()) throw new AppError("VALIDATION", "Add a note explaining this decision.");

  if (status === "APPROVED") {
    const now = new Date();
    const missing = REQUIRED_DOCUMENT_TYPES.filter((t) => !p.documents.some((d) => d.type === t && d.status === "APPROVED" && (!d.expiresOn || d.expiresOn > now)));
    if (missing.length) throw new AppError("CONFLICT", `Approve these documents first: ${missing.join(", ").toLowerCase().replace(/_/g, " ")}.`);
    if (!p.truckType || !p.truckPlate) throw new AppError("CONFLICT", "The provider hasn't completed their truck details.");
    if (!p.serviceZips && !(p.baseLat != null && p.serviceRadiusMiles)) throw new AppError("CONFLICT", "The provider hasn't set a service area.");
    const authorize = opts.authorizedServiceIds ?? [];
    if (authorize.length === 0) throw new AppError("VALIDATION", "Authorize at least one service.");
    if (authorize.some((id) => !p.services.some((s) => s.serviceCategoryId === id))) throw new AppError("VALIDATION", "You can only authorize services the provider offers.");
  }

  await db.$transaction(async (tx) => {
    await tx.providerProfile.update({
      where: { id: providerId },
      data: {
        verificationStatus: status,
        verificationNotes: opts.notes ?? null,
        verifiedAt: status === "APPROVED" ? new Date() : p.verifiedAt,
        verifiedById: status === "APPROVED" ? admin.id : p.verifiedById,
        ...(status !== "APPROVED" ? { isOnline: false } : {}),
      },
    });
    if (status === "APPROVED") {
      for (const s of p.services) {
        await tx.providerService.update({
          where: { id: s.id },
          data: {
            authorized: opts.authorizedServiceIds!.includes(s.serviceCategoryId),
          },
        });
      }
    } else {
      await tx.jobOffer.updateMany({
        where: { providerId, status: "PENDING" },
        data: { status: "WITHDRAWN" },
      });
    }
    await notify(tx, {
      userId: p.userId,
      type: status === "APPROVED" ? "PROVIDER_APPROVED" : "PROVIDER_STATUS_CHANGED",
      title: status === "APPROVED" ? "You're verified on Call Recon" : `Account status: ${status.toLowerCase()}`,
      body: status === "APPROVED" ? "You can now go online and receive job offers." : (opts.notes ?? ""),
      link: "/provider",
      dedupeSuffix: `${status}-${Date.now()}`,
    });
    await audit(
      {
        actorId: admin.id,
        action: `provider.${status.toLowerCase()}`,
        entityType: "ProviderProfile",
        entityId: providerId,
        details: { notes: opts.notes, authorized: opts.authorizedServiceIds },
      },
      tx,
    );
  });
  kickNotificationQueue();
}

/** Provider earnings summary from payout records (not from payments the processor hasn't confirmed). */
export async function providerEarnings(actor: Actor) {
  const p = await ownProfile(actor);
  const payouts = await db.providerPayout.findMany({
    where: { providerId: p.id },
    orderBy: { createdAt: "desc" },
    include: { provider: false },
  });
  const requests = await db.serviceRequest.findMany({
    where: { id: { in: payouts.map((x) => x.requestId) } },
    select: {
      id: true,
      number: true,
      completedAt: true,
      serviceCategory: { select: { name: true } },
    },
  });
  const byId = new Map(requests.map((r) => [r.id, r]));
  const sum = (s: string[]) => payouts.filter((x) => s.includes(x.status)).reduce((a, x) => a + x.netCents, 0);
  return {
    payouts: payouts.map((x) => ({ ...x, request: byId.get(x.requestId) })),
    totals: {
      paid: sum(["PAID"]),
      pending: sum(["PENDING"]),
      onHold: sum(["ON_HOLD"]),
      demo: sum(["DEMO_NOT_PAID"]),
    },
  };
}
