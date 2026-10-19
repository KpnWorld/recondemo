import { describe, expect, it } from "vitest";
import { calculatePrice, isMaterialIncrease, type PricingRuleInput } from "@/lib/services/pricing";

const rule: PricingRuleInput = {
  baseFeeCents: 9500,
  includedMiles: 5,
  perMileCents: 450,
  serviceFeeCents: 500,
  minimumChargeCents: 0,
  taxRateBps: 750,
  quoteValidityMinutes: 30,
  surcharges: [
    { code: "AFTER_HOURS", label: "After-hours", amountCents: 2500, condition: "AFTER_HOURS" },
    { code: "WEEKEND", label: "Weekend", amountCents: 1000, condition: "WEEKEND" },
    { code: "HEAVY", label: "Heavy", amountCents: 1500, condition: "HEAVY_VEHICLE" },
  ],
};
const at = new Date("2026-10-14T15:00:00Z");
const daytime = { localHour: 11, localWeekday: 3 };

describe("pricing engine", () => {
  it("itemizes base, mileage beyond included miles, service fee and tax", () => {
    const r = calculatePrice(rule, { miles: 12.3, requiresMileage: true, at, ...daytime });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const b = r.breakdown;
    expect(b.billableMiles).toBe(7.3);
    expect(b.lines.find((l) => l.code === "MILEAGE")!.amountCents).toBe(3285); // 7.3 * 450
    expect(b.subtotalCents).toBe(9500 + 3285 + 500);
    expect(b.taxCents).toBe(Math.round(13285 * 0.075));
    expect(b.totalCents).toBe(b.subtotalCents + b.taxCents);
    expect(r.expiresAt.getTime() - at.getTime()).toBe(30 * 60_000);
  });

  it("charges no mileage within the included miles", () => {
    const r = calculatePrice(rule, { miles: 3, requiresMileage: true, at, ...daytime });
    expect(r.ok && r.breakdown.lines.find((l) => l.code === "MILEAGE")!.amountCents).toBe(0);
  });

  it("refuses to estimate a tow without a known distance instead of guessing", () => {
    const r = calculatePrice(rule, { miles: null, requiresMileage: true, at, ...daytime });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("MILEAGE_UNKNOWN");
  });

  it("refuses to estimate when no pricing rule is configured", () => {
    const r = calculatePrice(null, { miles: 10, requiresMileage: true, at });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("NO_RULE");
  });

  it("ignores mileage for non-towing services", () => {
    const r = calculatePrice({ ...rule, perMileCents: 0 }, { miles: null, requiresMileage: false, at, ...daytime });
    expect(r.ok && r.breakdown.lines.map((l) => l.code)).toEqual(["BASE", "SERVICE_FEE", "TAX"]);
  });

  it("applies only the surcharges whose conditions hold", () => {
    const night = calculatePrice(rule, { miles: 5, requiresMileage: true, at, localHour: 22, localWeekday: 6, vehicleType: "PICKUP" });
    expect(night.ok && night.breakdown.lines.filter((l) => l.kind === "surcharge").map((l) => l.code)).toEqual(["AFTER_HOURS", "WEEKEND", "HEAVY"]);
    const day = calculatePrice(rule, { miles: 5, requiresMileage: true, at, ...daytime, vehicleType: "SEDAN" });
    expect(day.ok && day.breakdown.lines.filter((l) => l.kind === "surcharge")).toHaveLength(0);
  });

  it("raises the subtotal to the minimum charge with a visible adjustment line", () => {
    const r = calculatePrice({ ...rule, baseFeeCents: 1000, serviceFeeCents: 0, minimumChargeCents: 5000, taxRateBps: 0 }, { miles: 0, requiresMileage: true, at, ...daytime });
    expect(r.ok && r.breakdown.lines.find((l) => l.code === "MINIMUM")!.amountCents).toBe(4000);
    expect(r.ok && r.breakdown.totalCents).toBe(5000);
  });

  it("applies promo discounts before tax and never below zero", () => {
    const r = calculatePrice(rule, { miles: 0, requiresMileage: true, at, ...daytime, promo: { code: "TEN", percentOff: 10 } });
    expect(r.ok && r.breakdown.lines.find((l) => l.kind === "discount")!.amountCents).toBe(-1000);
    expect(r.ok && r.breakdown.taxCents).toBe(Math.round(9000 * 0.075));
    const big = calculatePrice(rule, { miles: 0, requiresMileage: true, at, ...daytime, promo: { code: "ALL", amountOffCents: 999_999 } });
    expect(big.ok && big.breakdown.totalCents).toBe(0);
  });

  it("treats any increase above the threshold as material", () => {
    expect(isMaterialIncrease(10000, 10001, 0)).toBe(true);
    expect(isMaterialIncrease(10000, 10500, 1000)).toBe(false);
    expect(isMaterialIncrease(10000, 9000, 0)).toBe(false);
  });
});
