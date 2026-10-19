import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { generateReference } from "@/lib/auth/crypto";
import type { Actor } from "@/lib/permissions";
import { assertCan } from "@/lib/permissions";
import { rateLimit } from "@/lib/rate-limit";
import { DEFAULT_SETTINGS, getSettings, saveSettingsSection, type Settings, type SettingsSection } from "@/lib/settings";
import { parse, pricingRuleSchema, ticketSchema } from "@/lib/validation";
import { TICKET_STATUSES } from "@/lib/constants";

// ---- Service catalog -------------------------------------------------------------------

const categorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().min(5).max(200),
  requiresDestination: z.boolean(),
  requiredTruckTypes: z.array(z.string()).default([]),
  requiresWinch: z.boolean(),
  active: z.boolean(),
  sortOrder: z.number().int().min(0).max(999),
});

export async function upsertServiceCategory(admin: Actor, id: string | null, input: unknown) {
  assertCan(admin, "catalog.manage");
  const d = parse(categorySchema, input);
  const data = { ...d, requiredTruckTypes: d.requiredTruckTypes.join(",") };
  const slug = d.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const row = id
    ? await db.serviceCategory.update({ where: { id }, data })
    : await db.serviceCategory.create({
        data: { ...data, slug: `${slug}-${Date.now().toString(36)}` },
      });
  await audit({
    actorId: admin.id,
    action: id ? "catalog.update" : "catalog.create",
    entityType: "ServiceCategory",
    entityId: row.id,
    details: data,
  });
  return row;
}

// ---- Pricing rules -------------------------------------------------------------------------

export async function upsertPricingRule(admin: Actor, id: string | null, input: unknown) {
  assertCan(admin, "pricing.manage");
  const d = parse(pricingRuleSchema, input);
  const codes = d.surcharges.map((s) => s.code);
  if (new Set(codes).size !== codes.length) throw new AppError("VALIDATION", "Surcharge codes must be unique.");
  const data = {
    ...d,
    serviceAreaId: d.serviceAreaId || null,
    surcharges: JSON.stringify(d.surcharges),
    updatedById: admin.id,
    isDemo: false,
  };
  const before = id ? await db.pricingRule.findUnique({ where: { id } }) : null;
  const row = id ? await db.pricingRule.update({ where: { id }, data }) : await db.pricingRule.create({ data });
  await audit({
    actorId: admin.id,
    action: id ? "pricing.update" : "pricing.create",
    entityType: "PricingRule",
    entityId: row.id,
    details: { before, after: data },
  });
  return row;
}

// ---- Service areas -------------------------------------------------------------------------

const areaSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional().nullable(),
  centerLat: z.number().min(-90).max(90).nullable(),
  centerLng: z.number().min(-180).max(180).nullable(),
  radiusMiles: z.number().min(1).max(500).nullable(),
  zips: z
    .string()
    .trim()
    .max(5000)
    .refine(
      (s) =>
        s === "" ||
        s
          .split(/[\s,]+/)
          .filter(Boolean)
          .every((z) => /^\d{5}$/.test(z)),
      "ZIP codes must be 5 digits",
    ),
  active: z.boolean(),
});

export async function upsertServiceArea(admin: Actor, id: string | null, input: unknown) {
  assertCan(admin, "areas.manage");
  const d = parse(areaSchema, input);
  if (!d.zips && !(d.centerLat != null && d.centerLng != null && d.radiusMiles)) throw new AppError("VALIDATION", "Add ZIP codes or a center point with a radius.");
  const data = {
    ...d,
    zips: d.zips
      .split(/[\s,]+/)
      .filter(Boolean)
      .join(","),
    isDemo: false,
  };
  const row = id ? await db.serviceArea.update({ where: { id }, data }) : await db.serviceArea.create({ data });
  await audit({
    actorId: admin.id,
    action: id ? "area.update" : "area.create",
    entityType: "ServiceArea",
    entityId: row.id,
    details: data,
  });
  return row;
}

// ---- Settings ------------------------------------------------------------------------------

const settingsSchemas: { [K in SettingsSection]: z.ZodType<Settings[K]> } = {
  business: z.object({
    legalName: z.string().trim().max(120),
    address: z.string().trim().max(300),
    supportPhone: z.string().trim().max(30),
    supportEmail: z
      .string()
      .trim()
      .max(120)
      .refine((v) => v === "" || /^\S+@\S+\.\S+$/.test(v), "Enter a valid email"),
    supportHours: z.string().trim().max(120),
    serviceAreaSummary: z.string().trim().max(500),
  }),
  legal: z.object({
    privacyPolicy: z.string().max(50_000),
    terms: z.string().max(50_000),
    cancellationPolicy: z.string().max(20_000),
    refundPolicy: z.string().max(20_000),
    providerRequirements: z.string().max(20_000),
    paymentDisclosures: z.string().max(20_000),
  }),
  dispatch: z.object({
    autoDispatch: z.boolean(),
    offerBatchSize: z.number().int().min(1).max(10),
    offerTimeoutSeconds: z.number().int().min(30).max(900),
    maxRounds: z.number().int().min(1).max(10),
    maxRadiusMiles: z.number().min(1).max(200),
    useReliability: z.boolean(),
  }),
  cancellation: z.object({
    feeAfterAssignmentCents: z.number().int().min(0).max(100_000).nullable(),
    freeCancellationMinutes: z.number().int().min(0).max(120),
  }),
  payments: z.object({
    platformFeeBps: z.number().int().min(0).max(5000).nullable(),
    requireAuthorizationBeforeDispatch: z.boolean(),
    currency: z.literal("usd"),
  }),
  pricing: z.object({
    revisionApprovalThresholdCents: z.number().int().min(0).max(100_000),
  }),
  retention: z.object({ locationDataDays: z.number().int().min(7).max(3650) }),
  referral: z.object({
    enabled: z.boolean(),
    rewardDescription: z.string().trim().max(300),
  }),
};

const SETTINGS_PERMISSION: Record<SettingsSection, Parameters<typeof assertCan>[1]> = {
  business: "settings.manage",
  legal: "settings.manage",
  dispatch: "dispatch.configure",
  cancellation: "pricing.manage",
  payments: "payments.manage",
  pricing: "pricing.manage",
  retention: "data.retention",
  referral: "promotions.manage",
};

export async function updateSettings<K extends SettingsSection>(admin: Actor, section: K, input: unknown) {
  if (!(section in DEFAULT_SETTINGS)) throw new AppError("VALIDATION", "Unknown settings section.");
  assertCan(admin, SETTINGS_PERMISSION[section]);
  const value = parse(settingsSchemas[section], input) as Settings[K];
  if (section === "payments") assertCan(admin, "settings.manage");
  const before = (await getSettings())[section];
  await saveSettingsSection(section, value, admin.id);
  await audit({
    actorId: admin.id,
    action: `settings.${section}`,
    entityType: "Setting",
    entityId: section,
    details: { before, after: value },
  });
}

// ---- Promotions --------------------------------------------------------------------------

const promoSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{3,20}$/, "Use 3–20 letters, numbers or dashes"),
    description: z.string().trim().max(200).optional().nullable(),
    percentOff: z.number().int().min(1).max(100).nullable(),
    amountOffCents: z.number().int().min(1).max(100_000).nullable(),
    maxRedemptions: z.number().int().min(1).nullable(),
    expiresAt: z
      .string()
      .nullable()
      .transform((v) => (v ? new Date(v) : null)),
    active: z.boolean(),
  })
  .refine((p) => (p.percentOff == null) !== (p.amountOffCents == null), "Choose either a percent or a fixed amount off");

export async function upsertPromo(admin: Actor, id: string | null, input: unknown) {
  assertCan(admin, "promotions.manage");
  const d = parse(promoSchema, input);
  if (!id && (await db.promoCode.findUnique({ where: { code: d.code } }))) throw new AppError("CONFLICT", "That code already exists.");
  const row = id ? await db.promoCode.update({ where: { id }, data: d }) : await db.promoCode.create({ data: d });
  await audit({
    actorId: admin.id,
    action: id ? "promo.update" : "promo.create",
    entityType: "PromoCode",
    entityId: row.id,
    details: d,
  });
  return row;
}

// ---- Support tickets ------------------------------------------------------------------------

export async function createTicket(actor: Actor | null, input: unknown, ip = "local") {
  rateLimit(`ticket:${actor?.id ?? ip}`, 5, 60 * 60 * 1000);
  const d = parse(ticketSchema, input);
  let requestId: string | null = null;
  if (d.requestNumber) {
    const r = await db.serviceRequest.findUnique({
      where: { number: d.requestNumber.toUpperCase() },
    });
    // Only link requests that belong to the signed-in customer.
    if (r && actor && r.customerId === actor.id) requestId = r.id;
  }
  const ticket = await db.supportTicket.create({
    data: {
      number: generateReference("TK"),
      authorId: actor?.id ?? null,
      contactName: d.contactName,
      contactEmail: d.contactEmail,
      category: d.category,
      subject: d.subject,
      body: d.body + (d.requestNumber && !requestId ? `\n\n(Request number given: ${d.requestNumber})` : ""),
      requestId,
    },
  });
  return ticket;
}

export async function updateTicket(admin: Actor, id: string, input: unknown) {
  assertCan(admin, "support.manage");
  const d = parse(
    z.object({
      status: z.enum(TICKET_STATUSES),
      resolution: z.string().trim().max(2000).optional().nullable(),
      assignToMe: z.boolean().default(false),
    }),
    input,
  );
  if ((d.status === "RESOLVED" || d.status === "CLOSED") && !d.resolution) throw new AppError("VALIDATION", "Add a resolution note.");
  await db.supportTicket.update({
    where: { id },
    data: {
      status: d.status,
      resolution: d.resolution ?? undefined,
      ...(d.assignToMe ? { assigneeId: admin.id } : {}),
    },
  });
  await audit({
    actorId: admin.id,
    action: "ticket.update",
    entityType: "SupportTicket",
    entityId: id,
    details: d,
  });
}

// ---- Reports (CSV) ------------------------------------------------------------------------

/** CSV cell escaping, including formula-injection protection for spreadsheet apps. */
export function csvCell(v: unknown): string {
  let s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n");

export async function exportReport(admin: Actor, kind: "requests" | "payments" | "payouts" | "tickets") {
  assertCan(admin, "reports.export");
  await audit({
    actorId: admin.id,
    action: "report.export",
    entityType: "Report",
    entityId: kind,
  });
  if (kind === "requests") {
    const rows = await db.serviceRequest.findMany({
      include: {
        serviceCategory: true,
        assignments: { where: { active: true }, include: { provider: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return toCsv([
      ["number", "created_at", "status", "service", "pickup_city", "pickup_zip", "provider", "final_total_usd", "cancellation_fee_usd", "demo"],
      ...rows.map((r) => [
        r.number,
        r.createdAt,
        r.status,
        r.serviceCategory.name,
        r.pickupCity,
        r.pickupZip,
        r.assignments[0]?.provider.businessName ?? "",
        r.finalTotalCents != null ? (r.finalTotalCents / 100).toFixed(2) : "",
        r.cancellationFeeCents ? (r.cancellationFeeCents / 100).toFixed(2) : "",
        r.isDemo,
      ]),
    ]);
  }
  if (kind === "payments") {
    const rows = await db.payment.findMany({
      include: { request: true },
      orderBy: { createdAt: "desc" },
    });
    return toCsv([
      ["request", "created_at", "processor", "processor_ref", "status", "amount_usd", "captured_usd", "refunded_usd"],
      ...rows.map((p) => [
        p.request.number,
        p.createdAt,
        p.processor,
        p.processorRef ?? "",
        p.status,
        (p.amountCents / 100).toFixed(2),
        (p.capturedCents / 100).toFixed(2),
        (p.refundedCents / 100).toFixed(2),
      ]),
    ]);
  }
  if (kind === "payouts") {
    const rows = await db.providerPayout.findMany({
      include: { provider: true },
      orderBy: { createdAt: "desc" },
    });
    return toCsv([
      ["provider", "request_id", "created_at", "status", "gross_usd", "platform_fee_usd", "net_usd", "reference"],
      ...rows.map((p) => [
        p.provider.businessName,
        p.requestId,
        p.createdAt,
        p.status,
        (p.grossCents / 100).toFixed(2),
        (p.platformFeeCents / 100).toFixed(2),
        (p.netCents / 100).toFixed(2),
        p.processorRef ?? "",
      ]),
    ]);
  }
  const rows = await db.supportTicket.findMany({
    orderBy: { createdAt: "desc" },
  });
  return toCsv([
    ["number", "created_at", "category", "status", "subject", "contact_email"],
    ...rows.map((t) => [t.number, t.createdAt, t.category, t.status, t.subject, t.contactEmail]),
  ]);
}
