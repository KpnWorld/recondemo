import { config } from "@/lib/env";
import { AppError } from "@/lib/errors";

/**
 * Mapping integration point. Mapbox and Google are supported behind env keys.
 * With neither configured, every call throws NOT_CONFIGURED and the app falls back to
 * manual address entry, ZIP-based coverage and dispatcher-confirmed quotes.
 */

export type GeocodeResult = {
  label: string;
  line1: string;
  city: string;
  state: string;
  zip: string;
  lat: number;
  lng: number;
};

export type RouteResult = { miles: number; minutes: number; source: string };

export interface MapProvider {
  name: string;
  geocode(query: string): Promise<GeocodeResult[]>;
  reverseGeocode(lat: number, lng: number): Promise<GeocodeResult | null>;
  route(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<RouteResult>;
}

const METERS_PER_MILE = 1609.344;

async function getJson(url: string) {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new AppError("INTEGRATION_ERROR", `The mapping service returned an error (${res.status}). Please enter the address manually.`);
  return res.json();
}

function mapbox(token: string): MapProvider {
  const toResult = (f: {
    properties: {
      full_address?: string;
      name?: string;
      context?: Record<string, { name?: string; region_code?: string }>;
      coordinates: { latitude: number; longitude: number };
    };
  }): GeocodeResult => {
    const ctx = f.properties.context ?? {};
    return {
      label: f.properties.full_address ?? f.properties.name ?? "",
      line1: ctx.address?.name ?? f.properties.name ?? "",
      city: ctx.place?.name ?? "",
      state: ctx.region?.region_code ?? ctx.region?.name ?? "",
      zip: ctx.postcode?.name ?? "",
      lat: f.properties.coordinates.latitude,
      lng: f.properties.coordinates.longitude,
    };
  };
  return {
    name: "Mapbox",
    async geocode(query) {
      const url = `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(query)}&country=us&limit=5&types=address,street,poi,postcode&access_token=${token}`;
      const json = await getJson(url);
      return (json.features ?? []).map(toResult);
    },
    async reverseGeocode(lat, lng) {
      const url = `https://api.mapbox.com/search/geocode/v6/reverse?longitude=${lng}&latitude=${lat}&limit=1&access_token=${token}`;
      const json = await getJson(url);
      return json.features?.[0] ? toResult(json.features[0]) : null;
    },
    async route(from, to) {
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false&access_token=${token}`;
      const json = await getJson(url);
      const r = json.routes?.[0];
      if (!r) throw new AppError("INTEGRATION_ERROR", "No driving route was found between these points.");
      return {
        miles: r.distance / METERS_PER_MILE,
        minutes: r.duration / 60,
        source: "Mapbox driving route",
      };
    },
  };
}

function google(key: string): MapProvider {
  type Comp = { long_name: string; short_name: string; types: string[] };
  const toResult = (r: { formatted_address: string; address_components: Comp[]; geometry: { location: { lat: number; lng: number } } }): GeocodeResult => {
    const get = (t: string, short = false) => {
      const c = r.address_components.find((x) => x.types.includes(t));
      return c ? (short ? c.short_name : c.long_name) : "";
    };
    return {
      label: r.formatted_address,
      line1: [get("street_number"), get("route")].filter(Boolean).join(" "),
      city: get("locality") || get("sublocality") || get("administrative_area_level_2"),
      state: get("administrative_area_level_1", true),
      zip: get("postal_code"),
      lat: r.geometry.location.lat,
      lng: r.geometry.location.lng,
    };
  };
  return {
    name: "Google Maps",
    async geocode(query) {
      const json = await getJson(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&components=country:US&key=${key}`);
      if (json.status !== "OK" && json.status !== "ZERO_RESULTS")
        throw new AppError("INTEGRATION_ERROR", "Address lookup is unavailable right now. Please enter the address manually.");
      return (json.results ?? []).slice(0, 5).map(toResult);
    },
    async reverseGeocode(lat, lng) {
      const json = await getJson(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}`);
      return json.results?.[0] ? toResult(json.results[0]) : null;
    },
    async route(from, to) {
      const json = await getJson(
        `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${from.lat},${from.lng}&destinations=${to.lat},${to.lng}&units=imperial&key=${key}`,
      );
      const el = json.rows?.[0]?.elements?.[0];
      if (!el || el.status !== "OK") throw new AppError("INTEGRATION_ERROR", "No driving route was found between these points.");
      return {
        miles: el.distance.value / METERS_PER_MILE,
        minutes: el.duration.value / 60,
        source: "Google driving distance",
      };
    },
  };
}

let override: MapProvider | null | undefined;
/** Tests can inject a provider; never used to fake responses in the running app. */
export function setMapProviderForTests(p: MapProvider | null | undefined) {
  override = p;
}

export function getMapProvider(): MapProvider | null {
  if (override !== undefined) return override;
  const p = config.maps.provider();
  if (p === "mapbox" && config.maps.mapboxToken()) return mapbox(config.maps.mapboxToken()!);
  if (p === "google" && config.maps.googleKey()) return google(config.maps.googleKey()!);
  return null;
}

export function requireMapProvider(): MapProvider {
  const p = getMapProvider();
  if (!p) throw new AppError("NOT_CONFIGURED", "Address lookup isn't set up yet. Please type the address, city, state and ZIP.");
  return p;
}

/** Try to get a driving route; returns null (never a guess) when unavailable. */
export async function tryRoute(from: { lat: number; lng: number } | null, to: { lat: number; lng: number } | null): Promise<RouteResult | null> {
  const p = getMapProvider();
  if (!p || !from || !to) return null;
  try {
    return await p.route(from, to);
  } catch (e) {
    console.warn("[maps] route failed", (e as Error).message);
    return null;
  }
}
