import { haversineMiles, hasCoords, isWithinOperatingHours, parseZipList } from "@/lib/geo";

/**
 * Provider matching. Pure: takes candidate providers and a request, returns who is
 * eligible (ranked) and why everyone else was excluded, so dispatchers can see the
 * reasoning. "Available" here only means the provider marked themselves online; an
 * offer still has to be accepted before the customer is told anyone is coming.
 */

export type MatchCandidate = {
  id: string;
  businessName: string;
  verificationStatus: string;
  userStatus: string;
  isOnline: boolean;
  truckType: string | null;
  canWinch: boolean;
  services: { serviceCategoryId: string; authorized: boolean }[];
  baseLat: number | null;
  baseLng: number | null;
  serviceRadiusMiles: number | null;
  serviceZips: string;
  operatingHours: string;
  lastLat: number | null;
  lastLng: number | null;
  lastLocationAt: Date | null;
  offersReceived: number;
  offersAccepted: number;
  hasActiveJob: boolean;
};

export type MatchRequest = {
  serviceCategoryId: string;
  requiredTruckTypes: string[];
  requiresWinch: boolean;
  pickupLat: number | null;
  pickupLng: number | null;
  pickupZip: string | null;
};

export type DispatchRules = { maxRadiusMiles: number; useReliability: boolean };

export type MatchReason =
  | "NOT_APPROVED"
  | "ACCOUNT_INACTIVE"
  | "OFFLINE"
  | "OUTSIDE_HOURS"
  | "SERVICE_NOT_OFFERED"
  | "SERVICE_NOT_AUTHORIZED"
  | "EQUIPMENT_MISMATCH"
  | "NO_WINCH"
  | "OUTSIDE_COVERAGE"
  | "BUSY"
  | "PREVIOUSLY_OFFERED";

export const MATCH_REASON_LABELS: Record<MatchReason, string> = {
  NOT_APPROVED: "Not verified",
  ACCOUNT_INACTIVE: "Account inactive",
  OFFLINE: "Offline",
  OUTSIDE_HOURS: "Outside operating hours",
  SERVICE_NOT_OFFERED: "Doesn't offer this service",
  SERVICE_NOT_AUTHORIZED: "Not authorized for this service",
  EQUIPMENT_MISMATCH: "Truck type not suitable",
  NO_WINCH: "No winch equipment",
  OUTSIDE_COVERAGE: "Outside service area",
  BUSY: "On another job",
  PREVIOUSLY_OFFERED: "Already offered this job",
};

export type RankedProvider = {
  provider: MatchCandidate;
  distanceMiles: number | null;
  acceptanceRate: number | null;
  score: number;
};
export type MatchResult = {
  eligible: RankedProvider[];
  excluded: { provider: MatchCandidate; reasons: MatchReason[] }[];
};

const FRESH_LOCATION_MS = 10 * 60 * 1000;

export function providerPosition(p: MatchCandidate, now: Date) {
  if (p.lastLat != null && p.lastLng != null && p.lastLocationAt && now.getTime() - p.lastLocationAt.getTime() < FRESH_LOCATION_MS) {
    return { lat: p.lastLat, lng: p.lastLng };
  }
  if (p.baseLat != null && p.baseLng != null) return { lat: p.baseLat, lng: p.baseLng };
  return null;
}

export function coverageCheck(p: MatchCandidate, req: MatchRequest, rules: DispatchRules) {
  const pickup = { lat: req.pickupLat, lng: req.pickupLng };
  const base = { lat: p.baseLat, lng: p.baseLng };
  let distanceFromBase: number | null = null;
  if (hasCoords(pickup) && hasCoords(base) && p.serviceRadiusMiles) {
    distanceFromBase = haversineMiles(base, pickup);
    if (distanceFromBase <= Math.min(p.serviceRadiusMiles, rules.maxRadiusMiles)) return { covered: true, distanceFromBase };
  }
  if (req.pickupZip && parseZipList(p.serviceZips).includes(req.pickupZip)) return { covered: true, distanceFromBase };
  return { covered: false, distanceFromBase };
}

export function matchProviders(
  candidates: MatchCandidate[],
  req: MatchRequest,
  rules: DispatchRules,
  opts: {
    now: Date;
    timeZone: string;
    excludeProviderIds?: string[];
    requireOnline?: boolean;
  },
): MatchResult {
  const eligible: RankedProvider[] = [];
  const excluded: MatchResult["excluded"] = [];
  const requireOnline = opts.requireOnline ?? true;

  for (const p of candidates) {
    const reasons: MatchReason[] = [];
    if (p.verificationStatus !== "APPROVED") reasons.push("NOT_APPROVED");
    if (p.userStatus !== "ACTIVE") reasons.push("ACCOUNT_INACTIVE");
    if (requireOnline && !p.isOnline) reasons.push("OFFLINE");
    if (requireOnline && !isWithinOperatingHours(p.operatingHours, opts.now, opts.timeZone)) reasons.push("OUTSIDE_HOURS");
    const svc = p.services.find((s) => s.serviceCategoryId === req.serviceCategoryId);
    if (!svc) reasons.push("SERVICE_NOT_OFFERED");
    else if (!svc.authorized) reasons.push("SERVICE_NOT_AUTHORIZED");
    if (req.requiredTruckTypes.length > 0 && (!p.truckType || !req.requiredTruckTypes.includes(p.truckType))) reasons.push("EQUIPMENT_MISMATCH");
    if (req.requiresWinch && !p.canWinch) reasons.push("NO_WINCH");
    const { covered } = coverageCheck(p, req, rules);
    if (!covered) reasons.push("OUTSIDE_COVERAGE");
    if (p.hasActiveJob) reasons.push("BUSY");
    if (opts.excludeProviderIds?.includes(p.id)) reasons.push("PREVIOUSLY_OFFERED");

    if (reasons.length) {
      excluded.push({ provider: p, reasons });
      continue;
    }

    const pos = providerPosition(p, opts.now);
    const pickup = { lat: req.pickupLat, lng: req.pickupLng };
    const distanceMiles = pos && hasCoords(pickup) ? Math.round(haversineMiles(pos, pickup) * 10) / 10 : null;
    // Acceptance rate only counts once a provider has enough history to be meaningful.
    const acceptanceRate = p.offersReceived >= 5 ? p.offersAccepted / p.offersReceived : null;
    const reliabilityFactor = rules.useReliability && acceptanceRate != null ? 0.5 + 0.5 * acceptanceRate : 1;
    // Unknown distance (ZIP-only coverage) ranks after known distances.
    const score = (distanceMiles ?? rules.maxRadiusMiles) / reliabilityFactor;
    eligible.push({ provider: p, distanceMiles, acceptanceRate, score });
  }

  eligible.sort((a, b) => a.score - b.score || a.provider.id.localeCompare(b.provider.id));
  return { eligible, excluded };
}
