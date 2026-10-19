"use client";

import { useState } from "react";
import { Button } from "./ui";
import { LocateIcon } from "./icons";

/** Fills the base latitude/longitude inputs from the device, only when the provider taps the button. */
export function BaseLocator({ latId, lngId }: { latId: string; lngId: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => {
          if (!navigator.geolocation) return setMsg("Location isn't available on this device.");
          setMsg("Finding your location…");
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              (document.getElementById(latId) as HTMLInputElement).value = pos.coords.latitude.toFixed(5);
              (document.getElementById(lngId) as HTMLInputElement).value = pos.coords.longitude.toFixed(5);
              setMsg("Base location filled in from this device. Save to keep it.");
            },
            () => setMsg("We couldn't get your location. Enter it manually or add ZIP codes instead."),
            { enableHighAccuracy: true, timeout: 15000 },
          );
        }}
      >
        <LocateIcon className="size-5" /> Use this device&apos;s location
      </Button>
      {msg ? (
        <p className="text-sm text-ink-muted" role="status">
          {msg}
        </p>
      ) : null}
    </div>
  );
}
