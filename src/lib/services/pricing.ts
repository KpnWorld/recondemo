import { z } from "zod";

/**
 * Pricing engine. Pure functions only: given a configured PricingRule and trip facts,
 * produce an itemized breakdown or an explicit reason why no estimate can be given.
 * Nothing here invents a rate; every amount comes from the rule or the inputs.
 */

export const SURCHARGE_CONDITIONS = ["ALWAYS", "AFTER_HOURS", "WEEKEND", "HEAVY_VEHICLE"] as const;
export type SurchargeCondition = (typeof SURCHARGE_CONDITIONS)[number];

export const surchargeSchema = z.object({
  code: z.string().min(1).max(40),
  label: z.string().min(1).max(80),
  amountCents: z.number().int().min(0).max(1_000_00),
  condition: z.enum(SURCHARGE_CONDITIONS),
});
export type Surcharge = z.infer<typeof surchargeSchema>;

export type PricingRuleInput = {
  id?: string;
  baseFeeCents: number;
  includedMiles: number;
  perMileCents: number;
  serviceFeeCents: number;
  minimumChargeCents: number;
  taxRateBps: number;
  surcharges: Surcharge[] | string;
  quoteValidityMinutes: number;
};

export type LineKind = "base" | "mileage" | "service_fee" | "surcharge" | "adjustment" | "minimum" | "discount" | "tax";
export type PriceLine = {
  code: string;
  label: string;
  amountCents: number;
  kind: LineKind;
  detail?: string;
};

export type PriceBreakdown = {
  currency: "usd";
  lines: PriceLine[];
  subtotalCents: number;
  taxCents: number;
  taxRateBps: number;
  totalCents: number;
  estimatedMiles: number | null;
  includedMiles: number;
  billableMiles: number;
  mileageSource: string | null;
  pricingRuleId: string | null;
};

export type PriceContext = {
  /** Road miles from pickup to destination. null = unknown. */
  miles: number | null;
  mileageSource?: string | null;
  requiresMileage: boolean;
  at: Date;
  vehicleType?: string | null;
  /** Local-time hour/day computed by caller for after-hours/weekend checks. */
  localHour?: number;
  localWeekday?: number; // 0 = Sunday
  extraLines?: { label: string; amountCents: number; detail?: string }[];
  promo?: {
    code: string;
    percentOff?: number | null;
    amountOffCents?: number | null;
  } | null;
};

export type PriceResult = { ok: true; breakdown: PriceBreakdown; expiresAt: Date } | { ok: false; reason: "NO_RULE" | "MILEAGE_UNKNOWN"; message: string };

export function parseSurcharges(value: Surcharge[] | string | null | undefined): Surcharge[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = z.array(surchargeSchema).safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

function surchargeApplies(s: Surcharge, ctx: PriceContext) {
  switch (s.condition) {
    case "ALWAYS":
      return true;
    case "AFTER_HOURS":
      return ctx.localHour != null && (ctx.localHour < 7 || ctx.localHour >= 19);
    case "WEEKEND":
      return ctx.localWeekday === 0 || ctx.localWeekday === 6;
    case "HEAVY_VEHICLE":
      return ctx.vehicleType === "PICKUP" || ctx.vehicleType === "VAN";
  }
}

export const SURCHARGE_CONDITION_LABELS: Record<SurchargeCondition, string> = {
  ALWAYS: "Always applies",
  AFTER_HOURS: "Requests before 7am or after 7pm",
  WEEKEND: "Saturday and Sunday",
  HEAVY_VEHICLE: "Pickup trucks and vans",
};

/** Round half away from zero to whole cents. */
const roundCents = (n: number) => Math.round(n);

export function calculatePrice(rule: PricingRuleInput | null | undefined, ctx: PriceContext): PriceResult {
  if (!rule) {
    return {
      ok: false,
      reason: "NO_RULE",
      message: "Pricing for this service hasn't been configured in your area yet. A dispatcher will send a confirmed quote before anyone is dispatched.",
    };
  }
  const lines: PriceLine[] = [];
  lines.push({
    code: "BASE",
    label: "Base service fee",
    amountCents: rule.baseFeeCents,
    kind: "base",
  });

  let billableMiles = 0;
  const needsMiles = ctx.requiresMileage && rule.perMileCents > 0;
  if (needsMiles) {
    if (ctx.miles == null || !Number.isFinite(ctx.miles) || ctx.miles < 0) {
      return {
        ok: false,
        reason: "MILEAGE_UNKNOWN",
        message: "We couldn't calculate the towing distance automatically. A dispatcher will confirm the mileage and send you a quote to approve before dispatch.",
      };
    }
    billableMiles = Math.max(0, Math.round((ctx.miles - rule.includedMiles) * 10) / 10);
    lines.push({
      code: "MILEAGE",
      label: `Mileage (${billableMiles.toFixed(1)} mi beyond ${rule.includedMiles} included)`,
      amountCents: roundCents(billableMiles * rule.perMileCents),
      kind: "mileage",
      detail: `${ctx.miles.toFixed(1)} estimated miles at ${(rule.perMileCents / 100).toFixed(2)}/mi after ${rule.includedMiles} included`,
    });
  }

  if (rule.serviceFeeCents > 0) {
    lines.push({
      code: "SERVICE_FEE",
      label: "Call Recon service fee",
      amountCents: rule.serviceFeeCents,
      kind: "service_fee",
    });
  }

  for (const s of parseSurcharges(rule.surcharges)) {
    if (surchargeApplies(s, ctx)) {
      lines.push({
        code: s.code,
        label: s.label,
        amountCents: s.amountCents,
        kind: "surcharge",
        detail: SURCHARGE_CONDITION_LABELS[s.condition],
      });
    }
  }
  for (const extra of ctx.extraLines ?? []) {
    lines.push({
      code: "ADJUSTMENT",
      label: extra.label,
      amountCents: roundCents(extra.amountCents),
      kind: "adjustment",
      detail: extra.detail,
    });
  }

  let subtotal = lines.reduce((sum, l) => sum + l.amountCents, 0);
  if (rule.minimumChargeCents > 0 && subtotal < rule.minimumChargeCents) {
    lines.push({
      code: "MINIMUM",
      label: "Minimum charge adjustment",
      amountCents: rule.minimumChargeCents - subtotal,
      kind: "minimum",
    });
    subtotal = rule.minimumChargeCents;
  }

  if (ctx.promo) {
    const pct = ctx.promo.percentOff ? roundCents((subtotal * ctx.promo.percentOff) / 100) : 0;
    const discount = Math.min(subtotal, pct + (ctx.promo.amountOffCents ?? 0));
    if (discount > 0) {
      lines.push({
        code: "PROMO",
        label: `Promo code ${ctx.promo.code}`,
        amountCents: -discount,
        kind: "discount",
      });
      subtotal -= discount;
    }
  }

  const tax = roundCents((subtotal * rule.taxRateBps) / 10_000);
  if (rule.taxRateBps > 0) {
    lines.push({
      code: "TAX",
      label: `Tax (${(rule.taxRateBps / 100).toFixed(2)}%)`,
      amountCents: tax,
      kind: "tax",
    });
  }

  return {
    ok: true,
    expiresAt: new Date(ctx.at.getTime() + rule.quoteValidityMinutes * 60_000),
    breakdown: {
      currency: "usd",
      lines,
      subtotalCents: subtotal,
      taxCents: tax,
      taxRateBps: rule.taxRateBps,
      totalCents: subtotal + tax,
      estimatedMiles: needsMiles ? ctx.miles : null,
      includedMiles: rule.includedMiles,
      billableMiles,
      mileageSource: needsMiles ? (ctx.mileageSource ?? null) : null,
      pricingRuleId: rule.id ?? null,
    },
  };
}

/** A price change is "material" when it raises the total above the approval threshold. */
export function isMaterialIncrease(previousTotalCents: number, newTotalCents: number, thresholdCents: number) {
  return newTotalCents - previousTotalCents > thresholdCents;
}

export function parseBreakdown(json: string | null | undefined): PriceBreakdown | null {
  if (!json) return null;
  try {
    const b = JSON.parse(json) as PriceBreakdown;
    // Quotes awaiting confirmation store a placeholder without line items.
    return b && Array.isArray(b.lines) && typeof b.totalCents === "number" ? b : null;
  } catch {
    return null;
  }
}

/** Local hour and weekday in the business time zone, for surcharge conditions. */
export function localTimeParts(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(at);
  const hour = Number(parts.find((p) => p.type === "hour")!.value) % 24;
  const wd = parts.find((p) => p.type === "weekday")!.value;
  return {
    localHour: hour,
    localWeekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd),
  };
}
