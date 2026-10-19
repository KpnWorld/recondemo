export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_MILES = 3958.8;

/** Great-circle distance in miles. Used for coverage checks and ranking, not for billing. */
export function haversineMiles(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h));
}

export const hasCoords = (p: { lat?: number | null; lng?: number | null }): p is LatLng =>
  typeof p.lat === "number" && typeof p.lng === "number" && Number.isFinite(p.lat) && Number.isFinite(p.lng);

export const parseZipList = (s: string | null | undefined) =>
  (s ?? "")
    .split(/[\s,]+/)
    .map((z) => z.trim())
    .filter(Boolean);

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/**
 * Operating hours are stored as JSON { mon: ["07:00","19:00"], ... } in the provider's
 * local time. An empty object means no restriction. A day missing from a non-empty
 * object means closed that day. Overnight ranges ("20:00"-"06:00") are supported.
 */
export function isWithinOperatingHours(hoursJson: string | null | undefined, now: Date, timeZone = "America/New_York"): boolean {
  let hours: Record<string, [string, string]>;
  try {
    hours = JSON.parse(hoursJson || "{}");
  } catch {
    return false;
  }
  if (!hours || Object.keys(hours).length === 0) return true;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const weekday = parts
    .find((p) => p.type === "weekday")!
    .value.toLowerCase()
    .slice(0, 3);
  const hh = Number(parts.find((p) => p.type === "hour")!.value) % 24;
  const mm = Number(parts.find((p) => p.type === "minute")!.value);
  const minutes = hh * 60 + mm;
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + (m || 0);
  };
  const today = hours[weekday];
  if (today) {
    const [open, close] = today.map(toMin);
    if (open <= close ? minutes >= open && minutes < close : minutes >= open) return true;
  }
  // Overnight range that started yesterday.
  const yesterday = hours[DAYS[(DAYS.indexOf(weekday as (typeof DAYS)[number]) + 6) % 7]];
  if (yesterday) {
    const [open, close] = yesterday.map(toMin);
    if (open > close && minutes < close) return true;
  }
  return false;
}

/** Coarse area description shown to providers before they accept (no street address). */
export function coarseArea(r: { pickupCity?: string | null; pickupState?: string | null; pickupZip?: string | null }) {
  return [r.pickupCity, r.pickupState, r.pickupZip].filter(Boolean).join(", ") || "Area withheld until accepted";
}
