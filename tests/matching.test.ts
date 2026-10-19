import { describe, expect, it } from "vitest";
import { matchProviders, type MatchCandidate, type MatchRequest } from "@/lib/services/matching";

const now = new Date("2026-10-14T16:00:00Z"); // noon Eastern
const base: MatchCandidate = {
  id: "p1",
  businessName: "A",
  verificationStatus: "APPROVED",
  userStatus: "ACTIVE",
  isOnline: true,
  truckType: "FLATBED",
  canWinch: true,
  services: [{ serviceCategoryId: "tow", authorized: true }],
  baseLat: 27.96,
  baseLng: -82.46,
  serviceRadiusMiles: 20,
  serviceZips: "",
  operatingHours: "{}",
  lastLat: null,
  lastLng: null,
  lastLocationAt: null,
  offersReceived: 0,
  offersAccepted: 0,
  hasActiveJob: false,
};
const req: MatchRequest = { serviceCategoryId: "tow", requiredTruckTypes: ["FLATBED"], requiresWinch: false, pickupLat: 27.95, pickupLng: -82.46, pickupZip: "33602" };
const rules = { maxRadiusMiles: 40, useReliability: true };
const run = (cands: MatchCandidate[], r = req, extra = {}) => matchProviders(cands, r, rules, { now, timeZone: "America/New_York", ...extra });

describe("provider matching", () => {
  it("matches an approved, online, equipped, covering provider", () => {
    const res = run([base]);
    expect(res.eligible.map((e) => e.provider.id)).toEqual(["p1"]);
    expect(res.eligible[0].distanceMiles).toBeCloseTo(0.7, 0);
  });

  it.each([
    [{ verificationStatus: "PENDING" }, "NOT_APPROVED"],
    [{ userStatus: "SUSPENDED" }, "ACCOUNT_INACTIVE"],
    [{ isOnline: false }, "OFFLINE"],
    [{ services: [{ serviceCategoryId: "tow", authorized: false }] }, "SERVICE_NOT_AUTHORIZED"],
    [{ services: [] }, "SERVICE_NOT_OFFERED"],
    [{ truckType: "SERVICE_VAN" }, "EQUIPMENT_MISMATCH"],
    [{ baseLat: 28.6, baseLng: -81.3 }, "OUTSIDE_COVERAGE"],
    [{ hasActiveJob: true }, "BUSY"],
    [{ operatingHours: JSON.stringify({ sat: ["08:00", "17:00"] }) }, "OUTSIDE_HOURS"],
  ] as [Partial<MatchCandidate>, string][])("excludes %o with reason %s", (patch, reason) => {
    const res = run([{ ...base, ...patch }]);
    expect(res.eligible).toHaveLength(0);
    expect(res.excluded[0].reasons).toContain(reason);
  });

  it("requires a winch when the service needs one", () => {
    expect(run([{ ...base, canWinch: false }], { ...req, requiresWinch: true }).excluded[0].reasons).toContain("NO_WINCH");
  });

  it("covers by ZIP when coordinates are not available", () => {
    const res = run([{ ...base, baseLat: null, baseLng: null, serviceZips: "33602,33606" }], { ...req, pickupLat: null, pickupLng: null });
    expect(res.eligible).toHaveLength(1);
    expect(res.eligible[0].distanceMiles).toBeNull();
  });

  it("ranks by distance, using fresh live location over base", () => {
    const far = { ...base, id: "far", baseLat: 28.1, baseLng: -82.46 };
    const nearLive = { ...base, id: "live", baseLat: 28.1, baseLng: -82.46, lastLat: 27.951, lastLng: -82.46, lastLocationAt: new Date(now.getTime() - 60_000) };
    const staleLive = { ...base, id: "stale", baseLat: 28.1, baseLng: -82.46, lastLat: 27.951, lastLng: -82.46, lastLocationAt: new Date(now.getTime() - 60 * 60_000) };
    expect(run([far, staleLive, nearLive]).eligible[0].provider.id).toBe("live");
  });

  it("uses acceptance rate to rank providers with enough history", () => {
    const reliable = { ...base, id: "reliable", baseLat: 27.97, offersReceived: 10, offersAccepted: 10 };
    const flaky = { ...base, id: "flaky", baseLat: 27.965, offersReceived: 10, offersAccepted: 1 };
    expect(run([flaky, reliable]).eligible[0].provider.id).toBe("reliable");
  });

  it("skips providers already offered this job", () => {
    expect(run([base], req, { excludeProviderIds: ["p1"] }).excluded[0].reasons).toContain("PREVIOUSLY_OFFERED");
  });

  it("manual-assign preview can ignore availability but never verification", () => {
    const res = matchProviders(
      [
        { ...base, isOnline: false },
        { ...base, id: "pending", verificationStatus: "PENDING" },
      ],
      req,
      rules,
      { now, timeZone: "America/New_York", requireOnline: false },
    );
    expect(res.eligible.map((e) => e.provider.id)).toEqual(["p1"]);
  });
});
