import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser, homeFor } from "@/lib/auth/current";
import { config } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { getMapProvider } from "@/lib/integrations/maps";
import { stripeConfigured } from "@/lib/integrations/stripe";
import { RequestWizard } from "@/components/request-wizard";

export const metadata: Metadata = { title: "Request a Tow" };

// Sample locations for the demo environment only (fictional street names).
const DEMO_SAMPLES = [
  {
    label: "Downtown (sample)",
    line1: "200 Sample Ave",
    city: "Tampa",
    state: "FL",
    zip: "33602",
    lat: 27.9478,
    lng: -82.4584,
  },
  {
    label: "Westshore (sample)",
    line1: "4100 Example Blvd",
    city: "Tampa",
    state: "FL",
    zip: "33607",
    lat: 27.9592,
    lng: -82.5262,
  },
  {
    label: "Sample Auto Repair shop",
    line1: "1500 Demo Pkwy",
    city: "Tampa",
    state: "FL",
    zip: "33610",
    lat: 27.9935,
    lng: -82.4105,
  },
];

export default async function RequestPage({ searchParams }: { searchParams: Promise<{ service?: string }> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect(`/signup?next=${encodeURIComponent(`/request${sp.service ? `?service=${sp.service}` : ""}`)}`);
  if (user.role !== "CUSTOMER") redirect(homeFor(user));

  const [vehicles, places, settings] = await Promise.all([
    db.vehicle.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    }),
    db.savedLocation.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    }),
    getSettings(),
  ]);

  return (
    <>
      <RequestWizard
        mapToken={config.maps.mapboxPublicToken() ?? null}
        geocodingEnabled={Boolean(getMapProvider())}
        initialServiceId={sp.service}
        vehicles={vehicles}
        places={places}
        demoSamples={config.demoMode() ? DEMO_SAMPLES : null}
        cancellation={settings.cancellation}
        paymentsEnabled={stripeConfigured()}
        supportPhone={settings.business.supportPhone}
      />
    </>
  );
}
