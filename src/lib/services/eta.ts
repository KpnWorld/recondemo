import { tryRoute } from "@/lib/integrations/maps";

const FRESH_MS = 3 * 60 * 1000;

export type ArrivalInfo =
  | {
      kind: "live";
      minutes: number;
      locationAt: Date;
      driver: { lat: number; lng: number };
    }
  | { kind: "driver"; minutes: number; setAt: Date }
  | { kind: "none"; reason: string };

/**
 * Arrival estimate shown to customers. "live" only when the driver's real device
 * location is recent AND a routing service computed the drive time. Otherwise we fall
 * back to the driver's own estimate (labeled as such) or say none is available.
 */
export async function arrivalInfo(
  r: {
    status: string;
    pickupLat: number | null;
    pickupLng: number | null;
    driverEtaMinutes: number | null;
    driverEtaSetAt: Date | null;
  },
  p: {
    lastLat: number | null;
    lastLng: number | null;
    lastLocationAt: Date | null;
  } | null,
  now = new Date(),
): Promise<ArrivalInfo> {
  if (r.status !== "EN_ROUTE" && r.status !== "ASSIGNED") return { kind: "none", reason: "" };
  if (p?.lastLat != null && p.lastLng != null && p.lastLocationAt && now.getTime() - p.lastLocationAt.getTime() < FRESH_MS && r.pickupLat != null && r.pickupLng != null) {
    const route = await tryRoute({ lat: p.lastLat, lng: p.lastLng }, { lat: r.pickupLat, lng: r.pickupLng });
    if (route)
      return {
        kind: "live",
        minutes: Math.max(1, Math.round(route.minutes)),
        locationAt: p.lastLocationAt,
        driver: { lat: p.lastLat, lng: p.lastLng },
      };
  }
  if (r.driverEtaMinutes && r.driverEtaSetAt) {
    const remaining = r.driverEtaMinutes - Math.floor((now.getTime() - r.driverEtaSetAt.getTime()) / 60000);
    if (remaining > -15)
      return {
        kind: "driver",
        minutes: Math.max(1, remaining),
        setAt: r.driverEtaSetAt,
      };
  }
  return {
    kind: "none",
    reason: r.status === "ASSIGNED" ? "Your driver will share an estimate when they head your way." : "Arrival estimate not available yet.",
  };
}
