"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { PinIcon } from "./icons";

type LatLng = { lat: number; lng: number };

/**
 * Interactive map with a draggable pin. Renders only when a public Mapbox token is
 * configured; otherwise shows a setup notice (the request flow still works with typed
 * addresses and device location).
 */
export function MapPicker({
  token,
  value,
  onChange,
  secondary,
  label = "Pickup location map",
  readOnly = false,
  height = 260,
}: {
  token?: string | null;
  value: LatLng | null;
  onChange?: (p: LatLng) => void;
  secondary?: (LatLng & { label: string }) | null;
  label?: string;
  readOnly?: boolean;
  height?: number;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markerRef = useRef<import("leaflet").Marker | null>(null);
  const secondaryRef = useRef<import("leaflet").CircleMarker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!token || !el.current || mapRef.current) return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current) return;
      const start = value ?? { lat: 39.5, lng: -98.35 };
      const map = L.map(el.current, {
        zoomControl: true,
        attributionControl: true,
      }).setView([start.lat, start.lng], value ? 16 : 4);
      L.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}@2x?access_token=${token}`, {
        attribution: '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);
      const icon = L.divIcon({
        className: "",
        html: '<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:#123B45;transform:rotate(-45deg);border:3px solid #8EDBD0;box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>',
        iconSize: [28, 28],
        iconAnchor: [14, 28],
      });
      if (value) {
        markerRef.current = L.marker([value.lat, value.lng], {
          draggable: !readOnly,
          icon,
          keyboard: true,
          title: "Pickup pin",
        }).addTo(map);
        markerRef.current.on("dragend", () => {
          const p = markerRef.current!.getLatLng();
          onChangeRef.current?.({ lat: p.lat, lng: p.lng });
        });
      }
      if (!readOnly) {
        map.on("click", (e: import("leaflet").LeafletMouseEvent) => {
          if (!markerRef.current) {
            markerRef.current = L.marker(e.latlng, {
              draggable: true,
              icon,
              title: "Pickup pin",
            }).addTo(map);
            markerRef.current.on("dragend", () => {
              const p = markerRef.current!.getLatLng();
              onChangeRef.current?.({ lat: p.lat, lng: p.lng });
            });
          } else markerRef.current.setLatLng(e.latlng);
          onChangeRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng });
        });
      }
      mapRef.current = map;
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Follow external changes (device location, typed address lookup).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !value) return;
    (async () => {
      const L = (await import("leaflet")).default;
      if (markerRef.current) markerRef.current.setLatLng([value.lat, value.lng]);
      else {
        markerRef.current = L.marker([value.lat, value.lng], {
          draggable: !readOnly,
        }).addTo(map);
      }
      map.setView([value.lat, value.lng], Math.max(map.getZoom(), 15));
    })();
  }, [value?.lat, value?.lng, readOnly, value]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    (async () => {
      const L = (await import("leaflet")).default;
      secondaryRef.current?.remove();
      secondaryRef.current = null;
      if (secondary) {
        secondaryRef.current = L.circleMarker([secondary.lat, secondary.lng], {
          radius: 9,
          color: "#2F7778",
          fillColor: "#E7B96C",
          fillOpacity: 1,
          weight: 3,
        })
          .bindTooltip(secondary.label)
          .addTo(map);
        if (value) map.fitBounds(L.latLngBounds([value.lat, value.lng], [secondary.lat, secondary.lng]).pad(0.3));
      }
    })();
  }, [secondary?.lat, secondary?.lng, secondary, value]);

  if (!token) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border-2 border-dashed border-line bg-white/70 p-4 text-sm text-ink-muted" role="note">
        <PinIcon className="mt-0.5 shrink-0 text-sea" />
        <p>
          <span className="font-semibold text-deep">Map not available yet.</span> An interactive map with an adjustable pin appears once a mapping service is configured. For now,
          your device location (if shared) and the address you enter are used.
        </p>
      </div>
    );
  }
  return (
    <div>
      <div ref={el} role="application" aria-label={label} style={{ height }} className="z-0 overflow-hidden rounded-2xl ring-1 ring-line" />
      {!readOnly ? <p className="mt-2 text-sm text-ink-muted">Tap the map or drag the pin to your exact spot.</p> : null}
    </div>
  );
}
