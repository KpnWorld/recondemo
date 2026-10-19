"use server";

import { requirePageUser } from "@/lib/auth/current";
import { redirect } from "next/navigation";
import { bool, cents, num, optStr, run, str, withParam } from "@/lib/actions";
import { AppError, isAppError } from "@/lib/errors";
import { acceptOffer, declineOffer, releaseJob } from "@/lib/services/dispatch";
import { addJobDocumentation, proposePriceRevision, updateJobStatus } from "@/lib/services/requests";
import { saveOnboarding, setAvailability, uploadProviderDocument } from "@/lib/services/providers";
import { recordLocationConsent } from "@/lib/services/accounts";
import type { RequestStatus } from "@/lib/constants";
import { getMapProvider } from "@/lib/integrations/maps";

export async function availabilityAction(fd: FormData) {
  const user = await requirePageUser(["PROVIDER"]);
  const online = str(fd, "online") === "true";
  await run(() => setAvailability(user, online), {
    back: "/provider",
    ok: online ? "You're online and can receive job offers." : "You're offline.",
  });
}

export async function locationConsentAction(fd: FormData) {
  const user = await requirePageUser(["PROVIDER"]);
  await run(() => recordLocationConsent(user, bool(fd, "granted")), {
    back: str(fd, "back") || "/provider",
  });
}

export async function offerAction(fd: FormData) {
  const user = await requirePageUser(["PROVIDER"]);
  const offerId = str(fd, "offerId");
  if (str(fd, "decision") !== "accept")
    await run(() => declineOffer(user, offerId), {
      back: "/provider",
      ok: "Offer declined.",
    });
  let requestId = "";
  try {
    requestId = (await acceptOffer(user, offerId)).requestId;
  } catch (e) {
    redirect(withParam("/provider", "error", isAppError(e) ? e.message : "Couldn't accept the offer."));
  }
  redirect(withParam(`/provider/jobs/${requestId}`, "ok", "Job accepted. The customer has been notified."));
}

export async function jobStatusAction(fd: FormData) {
  const user = await requirePageUser(["PROVIDER"]);
  const id = str(fd, "requestId");
  const to = str(fd, "to") as RequestStatus;
  await run(
    () =>
      updateJobStatus(user, id, to, {
        etaMinutes: num(fd, "eta"),
        notes: optStr(fd, "notes"),
      }),
    {
      back: `/provider/jobs/${id}`,
      ok: "Status updated. The customer has been notified.",
    },
  );
}

export async function releaseJobAction(fd: FormData) {
  const user = await requirePageUser(["PROVIDER"]);
  const id = str(fd, "requestId");
  await run(() => releaseJob(user, id, str(fd, "reason")), {
    back: `/provider/jobs/${id}`,
    to: "/provider",
    ok: "Job released. We're finding another provider.",
  });
}

export async function revisionAction(fd: FormData) {
  const user = await requirePageUser(["PROVIDER"]);
  const id = str(fd, "requestId");
  const amount = cents(fd, "amount");
  await run(
    async () => {
      if (amount == null || Number.isNaN(amount)) throw new AppError("VALIDATION", "Enter the amount of the change.");
      const r = await proposePriceRevision(user, id, {
        lines: [{ label: str(fd, "label"), amountCents: amount }],
        reason: str(fd, "reason"),
      });
      return r;
    },
    {
      back: `/provider/jobs/${id}`,
      ok: "Price change sent to the customer for approval.",
    },
  );
}

export async function jobDocAction(fd: FormData) {
  const user = await requirePageUser(["PROVIDER"]);
  const id = str(fd, "requestId");
  const file = fd.get("file");
  await run(
    async () => {
      if (!(file instanceof File) || file.size === 0) throw new AppError("VALIDATION", "Choose a file to upload.");
      await addJobDocumentation(user, id, Buffer.from(await file.arrayBuffer()));
    },
    { back: `/provider/jobs/${id}`, ok: "Documentation uploaded." },
  );
}

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export async function onboardingAction(fd: FormData) {
  const user = await requirePageUser(["PROVIDER"]);
  const hours: Record<string, [string, string]> = {};
  if (!bool(fd, "always")) {
    for (const d of DAYS) if (bool(fd, `${d}_on`)) hours[d] = [str(fd, `${d}_open`) || "08:00", str(fd, `${d}_close`) || "18:00"];
  }
  let baseLat = num(fd, "baseLat");
  let baseLng = num(fd, "baseLng");
  const baseAddress = optStr(fd, "baseAddress");
  // Look up coordinates for a typed base address when a mapping service is configured.
  if ((baseLat == null || baseLng == null) && baseAddress) {
    const hit = await getMapProvider()
      ?.geocode(baseAddress)
      .catch(() => []);
    if (hit?.[0]) ({ lat: baseLat, lng: baseLng } = hit[0]);
  }
  await run(
    () =>
      saveOnboarding(user, {
        businessName: str(fd, "businessName"),
        businessPhone: str(fd, "businessPhone"),
        licenseNumber: optStr(fd, "licenseNumber"),
        truckType: str(fd, "truckType"),
        truckMake: str(fd, "truckMake"),
        truckModel: str(fd, "truckModel"),
        truckYear: str(fd, "truckYear"),
        truckPlate: str(fd, "truckPlate"),
        truckColor: optStr(fd, "truckColor"),
        canWinch: bool(fd, "canWinch"),
        baseAddress,
        baseLat,
        baseLng,
        serviceRadiusMiles: num(fd, "serviceRadiusMiles"),
        serviceZips: str(fd, "serviceZips"),
        serviceCategoryIds: fd.getAll("services").map(String),
        operatingHours: hours,
      }),
    { back: "/provider/onboarding", ok: "Business details saved." },
  );
}

export async function documentAction(fd: FormData) {
  const user = await requirePageUser(["PROVIDER"]);
  const file = fd.get("file");
  await run(
    async () => {
      if (!(file instanceof File) || file.size === 0) throw new AppError("VALIDATION", "Choose a file to upload.");
      await uploadProviderDocument(user, str(fd, "type"), Buffer.from(await file.arrayBuffer()), file.name, optStr(fd, "expiresOn"));
    },
    {
      back: "/provider/onboarding#documents",
      ok: "Document uploaded for review.",
    },
  );
}
