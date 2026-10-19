"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Sends the provider's real device location to the server about every 30 seconds
 * while this page is open. Nothing is simulated: if the browser can't provide a
 * location, nothing is sent and the customer sees no live estimate.
 */
export function LocationSharer({ enabled }: { enabled: boolean }) {
  const [state, setState] = useState<"off" | "on" | "denied" | "error" | "unsupported">("off");
  const [last, setLast] = useState<Date | null>(null);
  const lastSent = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    if (!("geolocation" in navigator)) {
      setState("unsupported");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      async (pos) => {
        setState("on");
        if (Date.now() - lastSent.current < 30_000) return;
        lastSent.current = Date.now();
        const res = await fetch("/api/provider/location", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          }),
        }).catch(() => null);
        if (res?.ok) setLast(new Date());
        else setState("error");
      },
      (err) => setState(err.code === err.PERMISSION_DENIED ? "denied" : "error"),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);

  if (!enabled) return null;
  const text =
    state === "on"
      ? `Sharing your location${last ? ` · last sent ${last.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}`
      : state === "denied"
        ? "Location permission is blocked in your browser. Customers will only see your typed arrival estimate."
        : state === "unsupported"
          ? "This browser can't share location."
          : state === "error"
            ? "Couldn't send your location. We'll keep trying."
            : "Waiting for your device location…";
  return (
    <p className="flex items-center gap-2 text-sm text-ink-muted" role="status">
      <span className={`size-2.5 rounded-full ${state === "on" ? "pulse-dot bg-ok" : "bg-line"}`} aria-hidden />
      {text}
    </p>
  );
}
