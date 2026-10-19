"use server";

import { getCurrentUser } from "@/lib/auth/current";
import { AppError, toActionError, type ActionResult } from "@/lib/errors";
import { requireMapProvider, type GeocodeResult } from "@/lib/integrations/maps";
import { rateLimit } from "@/lib/rate-limit";
import { createServiceRequest, estimatePrice, serviceAvailability } from "@/lib/services/requests";
import type { PriceBreakdown } from "@/lib/services/pricing";

async function requireCustomer() {
  const u = await getCurrentUser();
  if (!u) throw new AppError("UNAUTHENTICATED", "Your session ended. Please sign in again.");
  if (u.role !== "CUSTOMER") throw new AppError("FORBIDDEN", "Only customer accounts can request service.");
  return u;
}

export async function availabilityAction(pickup: {
  lat?: number | null;
  lng?: number | null;
  zip?: string | null;
}): Promise<ActionResult<Awaited<ReturnType<typeof serviceAvailability>>>> {
  try {
    await requireCustomer();
    return { ok: true, data: await serviceAvailability(pickup) };
  } catch (e) {
    return toActionError(e);
  }
}

export type EstimateView =
  | {
      ok: true;
      breakdown: PriceBreakdown;
      expiresAt: string;
      isDemoRule: boolean;
    }
  | { ok: false; reason: string; message: string };

export async function estimateAction(input: unknown): Promise<ActionResult<EstimateView>> {
  try {
    await requireCustomer();
    const { result, isDemoRule } = await estimatePrice(input);
    return {
      ok: true,
      data: result.ok
        ? {
            ok: true,
            breakdown: result.breakdown,
            expiresAt: result.expiresAt.toISOString(),
            isDemoRule,
          }
        : { ok: false, reason: result.reason, message: result.message },
    };
  } catch (e) {
    return toActionError(e);
  }
}

export async function geocodeAction(query: string): Promise<ActionResult<GeocodeResult[]>> {
  try {
    const u = await requireCustomer();
    rateLimit(`geo:${u.id}`, 30, 60_000);
    if (!query || query.trim().length < 3) return { ok: true, data: [] };
    return {
      ok: true,
      data: await requireMapProvider().geocode(query.trim().slice(0, 200)),
    };
  } catch (e) {
    return toActionError(e);
  }
}

export async function reverseGeocodeAction(lat: number, lng: number): Promise<ActionResult<GeocodeResult | null>> {
  try {
    const u = await requireCustomer();
    rateLimit(`geo:${u.id}`, 30, 60_000);
    return {
      ok: true,
      data: await requireMapProvider().reverseGeocode(lat, lng),
    };
  } catch (e) {
    return toActionError(e);
  }
}

export async function createRequestAction(fd: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireCustomer();
    const payload = JSON.parse(String(fd.get("payload") ?? "{}"));
    const expected = fd.get("expectedTotalCents");
    const photos: Buffer[] = [];
    for (const f of fd.getAll("photos")) {
      if (f instanceof File && f.size > 0) photos.push(Buffer.from(await f.arrayBuffer()));
    }
    const { request } = await createServiceRequest(user, payload, {
      expectedTotalCents: expected ? Number(expected) : null,
      photos,
    });
    return { ok: true, data: { id: request.id } };
  } catch (e) {
    return toActionError(e);
  }
}
