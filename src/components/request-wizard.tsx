"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { availabilityAction, createRequestAction, estimateAction, geocodeAction, reverseGeocodeAction, type EstimateView } from "@/app/actions/request";
import { DRIVETRAINS, SITUATIONS, VEHICLE_TYPES } from "@/lib/constants";
import { formatCents } from "@/lib/money";
import type { GeocodeResult } from "@/lib/integrations/maps";
import { MapPicker } from "./map-picker";
import { PriceTable } from "./price";
import { Alert, Badge, Button, Checkbox, Field, Input, Select, Textarea, buttonClass, cx } from "./ui";
import { AlertIcon, CheckIcon, ChevronLeftIcon, LocateIcon, PhoneIcon, ServiceIcon } from "./icons";

type Address = {
  line1: string;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
};
type Service = {
  id: string;
  slug: string;
  name: string;
  description: string;
  requiresDestination: boolean;
  offeredNearby: boolean;
};
type SavedVehicle = {
  id: string;
  nickname: string | null;
  make: string;
  model: string;
  year: number;
  vehicleType: string;
  drivetrain: string | null;
  color: string | null;
  licensePlate: string | null;
  specialHandling: string | null;
};
type SavedPlace = {
  id: string;
  label: string;
  line1: string;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
};
type Sample = { label: string } & Address;

export type WizardProps = {
  mapToken: string | null;
  geocodingEnabled: boolean;
  initialServiceId?: string;
  vehicles: SavedVehicle[];
  places: SavedPlace[];
  demoSamples: Sample[] | null;
  cancellation: {
    feeAfterAssignmentCents: number | null;
    freeCancellationMinutes: number;
  };
  paymentsEnabled: boolean;
  supportPhone: string;
};

const STEPS = ["Location", "Service", "Vehicle", "Situation", "Price", "Confirm"] as const;
const emptyAddress: Address = {
  line1: "",
  city: "",
  state: "",
  zip: "",
  lat: null,
  lng: null,
};
const emptyVehicle = {
  make: "",
  model: "",
  year: "",
  vehicleType: "SEDAN",
  drivetrain: "",
  color: "",
  licensePlate: "",
  specialHandling: "",
  nickname: "",
};

export function RequestWizard(props: WizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pickup, setPickup] = useState<Address>(emptyAddress);
  const [pickupSource, setPickupSource] = useState<"DEVICE" | "MANUAL" | "SAVED" | "MAP_PIN" | "DEMO_SAMPLE">("MANUAL");
  const [landmarks, setLandmarks] = useState("");
  const [services, setServices] = useState<Service[] | null>(null);
  const [serviceId, setServiceId] = useState<string>(props.initialServiceId ?? "");
  const [dest, setDest] = useState<Address>(emptyAddress);
  const [vehicleId, setVehicleId] = useState<string>(props.vehicles[0]?.id ?? "");
  const [vehicle, setVehicle] = useState(emptyVehicle);
  const [saveVehicle, setSaveVehicle] = useState(true);
  const [vehicleCondition, setVehicleCondition] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [situation, setSituation] = useState("");
  const [situationNotes, setSituationNotes] = useState("");
  const [safe, setSafe] = useState<"" | "yes" | "no">("");
  const [promo, setPromo] = useState("");
  const [estimate, setEstimate] = useState<EstimateView | null>(null);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [locationConsent, setLocationConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [locating, setLocating] = useState(false);
  const [pending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const service = services?.find((s) => s.id === serviceId) ?? null;
  const savedVehicle = props.vehicles.find((v) => v.id === vehicleId) ?? null;
  const vehicleData = savedVehicle
    ? {
        make: savedVehicle.make,
        model: savedVehicle.model,
        year: savedVehicle.year,
        vehicleType: savedVehicle.vehicleType,
        drivetrain: savedVehicle.drivetrain ?? "",
        color: savedVehicle.color ?? "",
        licensePlate: savedVehicle.licensePlate ?? "",
        specialHandling: savedVehicle.specialHandling ?? "",
        nickname: savedVehicle.nickname ?? "",
      }
    : { ...vehicle, year: Number(vehicle.year) };

  // Move focus to the step heading on step change, for keyboard and screen-reader users.
  useEffect(() => {
    headingRef.current?.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  // ---- Step 1 helpers ---------------------------------------------------------------
  function useDeviceLocation() {
    setError(null);
    if (!("geolocation" in navigator)) {
      setError("Your browser can't share location. Please type the address instead.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setPickup((p) => ({ ...p, lat, lng }));
        setPickupSource("DEVICE");
        if (props.geocodingEnabled) {
          const r = await reverseGeocodeAction(lat, lng);
          if (r.ok && r.data)
            setPickup({
              line1: r.data.line1,
              city: r.data.city,
              state: r.data.state,
              zip: r.data.zip,
              lat,
              lng,
            });
        }
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission was declined. You can type the address instead."
            : "We couldn't get your location. Please type the address instead.",
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }

  function validate(s: number): boolean {
    const fe: Record<string, string> = {};
    const addr = (a: Address, prefix: string) => {
      if (a.line1.trim().length < 3) fe[`${prefix}line1`] = "Enter a street address or nearest cross street";
      if (a.city.trim().length < 2) fe[`${prefix}city`] = "Enter a city";
      if (!/^[A-Za-z]{2}$/.test(a.state.trim())) fe[`${prefix}state`] = "Use the 2-letter state code";
      if (!/^\d{5}$/.test(a.zip.trim())) fe[`${prefix}zip`] = "Enter a 5-digit ZIP";
    };
    if (s === 0) addr(pickup, "pickup.");
    if (s === 1) {
      if (!service) fe.service = "Choose a service";
      if (service?.requiresDestination) addr(dest, "dest.");
    }
    if (s === 2 && !savedVehicle) {
      if (!vehicle.make.trim()) fe.make = "Enter the make";
      if (!vehicle.model.trim()) fe.model = "Enter the model";
      const y = Number(vehicle.year);
      if (!y || y < 1950 || y > new Date().getFullYear() + 1) fe.year = "Enter a valid year";
    }
    if (s === 3) {
      if (!situation) fe.situation = "Choose what's happening";
      if (!safe) fe.safe = "Let us know if you're in a safe place";
    }
    if (s === 5) {
      if (!acceptTerms) fe.acceptTerms = "Please accept the pricing and cancellation terms";
      if (!locationConsent) fe.locationConsent = "We need your permission to share your location with the assigned provider";
    }
    setFieldErrors(fe);
    if (Object.keys(fe).length) {
      setError("Please fix the highlighted fields.");
      return false;
    }
    setError(null);
    return true;
  }

  function next() {
    if (!validate(step)) return;
    if (step === 0) {
      startTransition(async () => {
        const r = await availabilityAction({
          lat: pickup.lat,
          lng: pickup.lng,
          zip: pickup.zip.trim(),
        });
        if (!r.ok) return setError(r.error);
        setServices(r.data!);
        if (serviceId && !r.data!.some((s) => s.id === serviceId && s.offeredNearby)) setServiceId("");
        setStep(1);
      });
      return;
    }
    if (step === 3) {
      loadEstimate();
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function estimateInput() {
    return {
      serviceCategoryId: serviceId,
      pickup: { lat: pickup.lat, lng: pickup.lng, zip: pickup.zip.trim() },
      destination: service?.requiresDestination ? { lat: dest.lat, lng: dest.lng } : null,
      vehicleType: vehicleData.vehicleType,
      promoCode: promo.trim() || null,
    };
  }

  function loadEstimate(goToPrice = true) {
    startTransition(async () => {
      const r = await estimateAction(estimateInput());
      if (!r.ok) {
        setError(r.error);
        if (r.fieldErrors?.promoCode)
          setFieldErrors({
            promo: r.fieldErrors.promoCode[0] ?? "Invalid code",
          });
        return;
      }
      setError(null);
      setFieldErrors({});
      setEstimate(r.data!);
      if (goToPrice) setStep(4);
    });
  }

  function submit() {
    if (!validate(5)) return;
    const payload = {
      serviceCategoryId: serviceId,
      pickup: {
        ...trimAddr(pickup),
        landmarks: landmarks.trim() || null,
        source: pickupSource,
      },
      destination: service?.requiresDestination ? trimAddr(dest) : null,
      vehicleId: savedVehicle?.id ?? null,
      vehicle: {
        ...vehicleData,
        drivetrain: vehicleData.drivetrain || null,
        color: vehicleData.color || null,
        licensePlate: vehicleData.licensePlate || null,
        specialHandling: vehicleData.specialHandling || null,
        nickname: vehicleData.nickname || null,
      },
      saveVehicle: !savedVehicle && saveVehicle,
      vehicleCondition: vehicleCondition.trim() || null,
      situation,
      situationNotes: situationNotes.trim() || null,
      isSafeLocation: safe === "yes",
      promoCode: promo.trim() || null,
      acceptTerms,
      locationConsent,
    };
    const fd = new FormData();
    fd.set("payload", JSON.stringify(payload));
    if (estimate?.ok) fd.set("expectedTotalCents", String(estimate.breakdown.totalCents));
    photos.forEach((p) => fd.append("photos", p));
    startTransition(async () => {
      const r = await createRequestAction(fd);
      if (!r.ok) {
        setError(r.error);
        if (r.code === "CONFLICT" && /estimate changed/.test(r.error)) loadEstimate();
        return;
      }
      router.push(`/requests/${r.data!.id}?new=1`);
    });
  }

  const offered = services?.filter((s) => s.offeredNearby) ?? [];
  const notOffered = services?.filter((s) => !s.offeredNearby) ?? [];
  const fe = fieldErrors;

  return (
    <div className="mx-auto max-w-2xl">
      <Progress step={step} />

      <div className="mt-6 rounded-[var(--radius-card)] bg-white p-5 shadow-[var(--shadow-card)] sm:p-8">
        {error ? (
          <Alert tone="error" className="mb-5">
            {error}
          </Alert>
        ) : null}

        {step === 0 ? (
          <section aria-labelledby="step-title">
            <StepTitle ref={headingRef} title="Where are you?" sub="Confirm your pickup location so your driver can find you." />
            <div className="space-y-5">
              <Button type="button" variant="secondary" size="lg" className="w-full" onClick={useDeviceLocation} disabled={locating}>
                <LocateIcon className="text-sea" /> {locating ? "Finding your location…" : "Use my current location"}
              </Button>
              {pickup.lat != null && pickupSource !== "MANUAL" ? (
                <p className="flex items-center gap-2 text-sm text-ok">
                  <CheckIcon className="size-4" /> {pickupSource === "DEVICE" ? "Device location captured." : pickupSource === "MAP_PIN" ? "Pin placed." : "Location selected."}
                  {!props.geocodingEnabled && pickupSource === "DEVICE" ? " Please add the nearest address or cross street below." : null}
                </p>
              ) : null}

              <MapPicker
                token={props.mapToken}
                value={pickup.lat != null && pickup.lng != null ? { lat: pickup.lat, lng: pickup.lng } : null}
                onChange={async (p) => {
                  setPickup((a) => ({ ...a, ...p }));
                  setPickupSource("MAP_PIN");
                  if (props.geocodingEnabled) {
                    const r = await reverseGeocodeAction(p.lat, p.lng);
                    if (r.ok && r.data)
                      setPickup({
                        line1: r.data.line1,
                        city: r.data.city,
                        state: r.data.state,
                        zip: r.data.zip,
                        ...p,
                      });
                  }
                }}
              />

              {props.places.length || props.demoSamples ? (
                <Field label="Or choose a saved place" htmlFor="saved-place">
                  <Select
                    id="saved-place"
                    defaultValue=""
                    onChange={(e) => {
                      const all: (SavedPlace | (Sample & { id: string }))[] = [
                        ...props.places,
                        ...(props.demoSamples ?? []).map((s, i) => ({
                          ...s,
                          id: `demo-${i}`,
                        })),
                      ];
                      const p = all.find((x) => x.id === e.target.value);
                      if (!p) return;
                      setPickup({
                        line1: p.line1,
                        city: p.city,
                        state: p.state,
                        zip: p.zip,
                        lat: p.lat,
                        lng: p.lng,
                      });
                      setPickupSource(p.id.startsWith("demo-") ? "DEMO_SAMPLE" : "SAVED");
                    }}
                  >
                    <option value="">Select…</option>
                    {props.places.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}: {p.line1}, {p.city}
                      </option>
                    ))}
                    {props.demoSamples?.map((s, i) => (
                      <option key={i} value={`demo-${i}`}>
                        Demo sample: {s.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}

              <AddressFields
                prefix="pickup."
                value={pickup}
                errors={fe}
                geocodingEnabled={props.geocodingEnabled}
                onChange={(a) => {
                  setPickup(a);
                  setPickupSource((s) => (s === "DEVICE" || s === "MAP_PIN" ? s : "MANUAL"));
                }}
              />

              <Field label="Landmarks or details" htmlFor="landmarks" hint="e.g. Northbound shoulder past exit 12, near the blue gas station.">
                <Textarea id="landmarks" value={landmarks} onChange={(e) => setLandmarks(e.target.value)} maxLength={500} />
              </Field>
            </div>
          </section>
        ) : null}

        {step === 1 ? (
          <section aria-labelledby="step-title">
            <StepTitle ref={headingRef} title="What do you need?" sub="These services are offered by verified providers at your location." />
            {offered.length === 0 ? (
              <Alert tone="warning" title="No verified providers offer service here yet">
                We can&apos;t send a request to this location right now. Please check the address, or contact support
                {props.supportPhone ? ` at ${props.supportPhone}` : ""}. If you&apos;re in danger, call 911.
              </Alert>
            ) : (
              <fieldset>
                <legend className="sr-only">Service type</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {offered.map((s) => (
                    <label
                      key={s.id}
                      className={cx(
                        "flex min-h-20 cursor-pointer items-start gap-3 rounded-2xl p-4 ring-1 ring-inset transition has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-sea",
                        serviceId === s.id ? "bg-mint-50 ring-2 ring-sea" : "bg-white ring-line hover:bg-soft",
                      )}
                    >
                      <input type="radio" name="service" value={s.id} checked={serviceId === s.id} onChange={() => setServiceId(s.id)} className="sr-only" />
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-sea shadow-sm ring-1 ring-line">
                        <ServiceIcon slug={s.slug} />
                      </span>
                      <span>
                        <span className="block font-semibold text-deep">{s.name}</span>
                        <span className="block text-sm text-ink-muted">{s.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {fe.service ? <p className="mt-2 text-sm font-medium text-danger">{fe.service}</p> : null}
              </fieldset>
            )}
            {notOffered.length ? (
              <p className="mt-4 text-sm text-ink-muted">Not currently offered at this location: {notOffered.map((s) => s.name.toLowerCase()).join(", ")}.</p>
            ) : null}

            {service?.requiresDestination ? (
              <div className="mt-6 space-y-4 rounded-2xl bg-soft p-4 sm:p-5">
                <h3 className="font-semibold">Where should we take your vehicle?</h3>
                {props.demoSamples ? (
                  <Field label="Demo sample destination" htmlFor="dest-sample">
                    <Select
                      id="dest-sample"
                      defaultValue=""
                      onChange={(e) => {
                        const s = props.demoSamples![Number(e.target.value)];
                        if (s)
                          setDest({
                            line1: s.line1,
                            city: s.city,
                            state: s.state,
                            zip: s.zip,
                            lat: s.lat,
                            lng: s.lng,
                          });
                      }}
                    >
                      <option value="">Select…</option>
                      {props.demoSamples.map((s, i) => (
                        <option key={i} value={i}>
                          {s.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : null}
                <AddressFields prefix="dest." value={dest} errors={fe} geocodingEnabled={props.geocodingEnabled} onChange={(a) => setDest(a)} />
              </div>
            ) : null}
          </section>
        ) : null}

        {step === 2 ? (
          <section aria-labelledby="step-title">
            <StepTitle ref={headingRef} title="Tell us about your vehicle" sub="This helps the provider bring the right equipment." />
            {props.vehicles.length ? (
              <fieldset className="mb-5">
                <legend className="mb-2 text-sm font-semibold text-deep">Your vehicles</legend>
                <div className="space-y-2">
                  {props.vehicles.map((v) => (
                    <RadioCard
                      key={v.id}
                      name="vehicle"
                      checked={vehicleId === v.id}
                      onChange={() => setVehicleId(v.id)}
                      title={`${v.year} ${v.make} ${v.model}`}
                      sub={[v.nickname, v.color, v.drivetrain].filter(Boolean).join(" · ")}
                    />
                  ))}
                  <RadioCard name="vehicle" checked={!vehicleId} onChange={() => setVehicleId("")} title="A different vehicle" />
                </div>
              </fieldset>
            ) : null}
            {!savedVehicle ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Make" htmlFor="make" required error={fe.make}>
                  <Input id="make" value={vehicle.make} onChange={(e) => setVehicle({ ...vehicle, make: e.target.value })} autoComplete="off" aria-invalid={!!fe.make} />
                </Field>
                <Field label="Model" htmlFor="model" required error={fe.model}>
                  <Input id="model" value={vehicle.model} onChange={(e) => setVehicle({ ...vehicle, model: e.target.value })} autoComplete="off" aria-invalid={!!fe.model} />
                </Field>
                <Field label="Year" htmlFor="year" required error={fe.year}>
                  <Input
                    id="year"
                    inputMode="numeric"
                    value={vehicle.year}
                    onChange={(e) =>
                      setVehicle({
                        ...vehicle,
                        year: e.target.value.replace(/\D/g, "").slice(0, 4),
                      })
                    }
                    aria-invalid={!!fe.year}
                  />
                </Field>
                <Field label="Vehicle type" htmlFor="vtype" required>
                  <Select id="vtype" value={vehicle.vehicleType} onChange={(e) => setVehicle({ ...vehicle, vehicleType: e.target.value })}>
                    {VEHICLE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Drivetrain" htmlFor="drivetrain" hint="AWD and 4WD vehicles usually need a flatbed.">
                  <Select id="drivetrain" value={vehicle.drivetrain} onChange={(e) => setVehicle({ ...vehicle, drivetrain: e.target.value })}>
                    <option value="">Not sure</option>
                    {DRIVETRAINS.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Color" htmlFor="color">
                  <Input id="color" value={vehicle.color} onChange={(e) => setVehicle({ ...vehicle, color: e.target.value })} />
                </Field>
                <Field label="License plate" htmlFor="plate">
                  <Input
                    id="plate"
                    value={vehicle.licensePlate}
                    onChange={(e) =>
                      setVehicle({
                        ...vehicle,
                        licensePlate: e.target.value.toUpperCase(),
                      })
                    }
                    maxLength={12}
                  />
                </Field>
                <Field label="Special handling" htmlFor="handling" hint="Lowered, modified, oversized, EV tow mode…">
                  <Input
                    id="handling"
                    value={vehicle.specialHandling}
                    onChange={(e) =>
                      setVehicle({
                        ...vehicle,
                        specialHandling: e.target.value,
                      })
                    }
                  />
                </Field>
                <Checkbox className="sm:col-span-2" label="Save this vehicle to my account" checked={saveVehicle} onChange={(e) => setSaveVehicle(e.target.checked)} />
              </div>
            ) : null}
            <div className="mt-5 space-y-4">
              <Field label="Vehicle condition and access" htmlFor="condition" hint="e.g. Won't go into neutral, parked in a garage with 6'8&quot; clearance, keys available.">
                <Textarea id="condition" value={vehicleCondition} onChange={(e) => setVehicleCondition(e.target.value)} maxLength={300} />
              </Field>
              <Field label="Photos of the vehicle or situation" htmlFor="photos" hint="Up to 4 photos (JPG, PNG or WebP, 10 MB each).">
                <Input
                  id="photos"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  capture="environment"
                  className="py-2.5 file:mr-3 file:rounded-lg file:border-0 file:bg-mint-50 file:px-3 file:py-1.5 file:font-semibold file:text-deep"
                  onChange={(e) => setPhotos(Array.from(e.target.files ?? []).slice(0, 4))}
                />
              </Field>
              {photos.length ? (
                <p className="text-sm text-ink-muted">
                  {photos.length} photo{photos.length > 1 ? "s" : ""} selected.
                </p>
              ) : null}
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section aria-labelledby="step-title">
            <StepTitle ref={headingRef} title="What's happening?" sub="A quick description helps your provider prepare." />
            <fieldset>
              <legend className="sr-only">Situation</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {SITUATIONS.map((s) => (
                  <RadioCard key={s.value} name="situation" checked={situation === s.value} onChange={() => setSituation(s.value)} title={s.label} />
                ))}
              </div>
              {fe.situation ? <p className="mt-2 text-sm font-medium text-danger">{fe.situation}</p> : null}
            </fieldset>
            <Field label="Anything else we should know?" htmlFor="notes" className="mt-5">
              <Textarea id="notes" value={situationNotes} onChange={(e) => setSituationNotes(e.target.value)} maxLength={1000} />
            </Field>
            <fieldset className="mt-6">
              <legend className="mb-2 font-semibold text-deep">Are you and your vehicle in a safe location?</legend>
              <div className="grid grid-cols-2 gap-2">
                <RadioCard name="safe" checked={safe === "yes"} onChange={() => setSafe("yes")} title="Yes, I'm safe" />
                <RadioCard name="safe" checked={safe === "no"} onChange={() => setSafe("no")} title="No, I'm not sure" />
              </div>
              {fe.safe ? <p className="mt-2 text-sm font-medium text-danger">{fe.safe}</p> : null}
            </fieldset>
            {safe === "no" ? (
              <div role="alert" className="mt-4 rounded-2xl bg-gold-50 p-5 ring-1 ring-inset ring-gold">
                <p className="flex items-center gap-2 font-semibold text-deep">
                  <AlertIcon className="text-gold-800" /> Your safety comes first
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  <li>If you can, move yourself and passengers away from traffic, behind a barrier or well off the road.</li>
                  <li>Turn on your hazard lights. Don&apos;t stand between your vehicle and traffic.</li>
                  <li>If anyone is hurt, you&apos;re in immediate danger, or your vehicle is blocking a travel lane, call 911 now.</li>
                </ul>
                <a href="tel:911" className={buttonClass("primary", "md", "mt-4")}>
                  <PhoneIcon className="size-5" /> Call 911
                </a>
                <p className="mt-3 text-xs text-ink-muted">Call Recon is not an emergency service and can&apos;t send police, fire or medical help.</p>
              </div>
            ) : null}
          </section>
        ) : null}

        {step === 4 ? (
          <section aria-labelledby="step-title">
            <StepTitle ref={headingRef} title="Your price" sub={service?.name} />
            {estimate?.ok ? (
              <>
                <div className="rounded-2xl bg-soft p-4 sm:p-5">
                  <PriceTable breakdown={estimate.breakdown} />
                </div>
                <p className="mt-3 text-sm text-ink-muted">
                  This is an estimate based on configured rates. It&apos;s valid until{" "}
                  <strong>
                    {new Date(estimate.expiresAt).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </strong>
                  . Your final charge matches this unless the job needs more than described, and any increase requires your approval first.
                </p>
                {estimate.isDemoRule ? (
                  <Alert tone="warning" className="mt-3">
                    Demo pricing. These sample rates are for testing and are not real Call Recon prices.
                  </Alert>
                ) : null}
              </>
            ) : estimate ? (
              <Alert tone="info" title="A confirmed quote is needed before dispatch">
                {estimate.message} You won&apos;t be charged or committed to anything until you approve the quote.
              </Alert>
            ) : null}
            <div className="mt-5 flex items-end gap-2">
              <Field label="Promo code" htmlFor="promo" error={fe.promo} className="flex-1">
                <Input id="promo" value={promo} onChange={(e) => setPromo(e.target.value.toUpperCase())} autoComplete="off" />
              </Field>
              <Button type="button" variant="secondary" onClick={() => loadEstimate(false)} disabled={pending || !promo.trim()}>
                Apply
              </Button>
            </div>
          </section>
        ) : null}

        {step === 5 ? (
          <section aria-labelledby="step-title">
            <StepTitle ref={headingRef} title="Review and confirm" sub="Check the details below before we contact providers." />
            <dl className="divide-y divide-line rounded-2xl bg-soft px-4">
              <Summary k="Service" v={service?.name} onEdit={() => setStep(1)} />
              <Summary
                k="Pickup"
                v={`${pickup.line1}, ${pickup.city}, ${pickup.state.toUpperCase()} ${pickup.zip}${landmarks ? ` · ${landmarks}` : ""}`}
                onEdit={() => setStep(0)}
              />
              {service?.requiresDestination ? (
                <Summary k="Destination" v={`${dest.line1}, ${dest.city}, ${dest.state.toUpperCase()} ${dest.zip}`} onEdit={() => setStep(1)} />
              ) : null}
              <Summary
                k="Vehicle"
                v={`${vehicleData.year} ${vehicleData.make} ${vehicleData.model}${vehicleData.color ? ` · ${vehicleData.color}` : ""}`}
                onEdit={() => setStep(2)}
              />
              <Summary k="Situation" v={`${SITUATIONS.find((s) => s.value === situation)?.label}${safe === "no" ? " · Not in a safe location" : ""}`} onEdit={() => setStep(3)} />
              <Summary
                k="Price"
                v={estimate?.ok ? `${formatCents(estimate.breakdown.totalCents)} estimated` : "Confirmed quote needed before dispatch"}
                onEdit={() => setStep(4)}
              />
            </dl>

            <div className="mt-5 rounded-2xl bg-mint-50 p-4 text-sm ring-1 ring-inset ring-mint">
              <p className="font-semibold text-deep">Cancellation terms</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                <li>Free to cancel before a provider is assigned.</li>
                {props.cancellation.feeAfterAssignmentCents == null ? (
                  <li>A cancellation fee after assignment has not been set yet; none will be charged.</li>
                ) : props.cancellation.feeAfterAssignmentCents === 0 ? (
                  <li>No fee after assignment.</li>
                ) : (
                  <li>
                    After a provider is assigned
                    {props.cancellation.freeCancellationMinutes ? ` and ${props.cancellation.freeCancellationMinutes} minutes have passed` : ""}, a{" "}
                    {formatCents(props.cancellation.feeAfterAssignmentCents)} cancellation fee applies.
                  </li>
                )}
                <li>Once your driver arrives, cancellations go through support.</li>
              </ul>
              <p className="mt-2">
                <Link href="/legal/cancellation" target="_blank">
                  Full cancellation policy
                </Link>
              </p>
            </div>

            {props.paymentsEnabled && estimate?.ok ? (
              <p className="mt-4 text-sm text-ink-muted">
                Next, you&apos;ll add a card through our secure payment processor. Your card is authorized for the approved amount and charged after service.
              </p>
            ) : null}

            <div className="mt-4 space-y-1">
              <Checkbox
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                label={
                  estimate?.ok
                    ? "I approve this estimate and agree to the cancellation terms."
                    : "I agree to the cancellation terms and understand I'll approve a quote before dispatch."
                }
              />
              {fe.acceptTerms ? <p className="text-sm font-medium text-danger">{fe.acceptTerms}</p> : null}
              <Checkbox
                checked={locationConsent}
                onChange={(e) => setLocationConsent(e.target.checked)}
                label="Share my pickup location and vehicle details with the assigned provider."
                description="Providers only see your exact location after they accept your job."
              />
              {fe.locationConsent ? <p className="text-sm font-medium text-danger">{fe.locationConsent}</p> : null}
            </div>
          </section>
        ) : null}

        <div className="mt-8 flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:justify-between">
          {step > 0 ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setError(null);
                setFieldErrors({});
                setStep(step - 1);
              }}
              disabled={pending}
            >
              <ChevronLeftIcon className="size-5" /> Back
            </Button>
          ) : (
            <span />
          )}
          {step < 5 ? (
            <Button type="button" size="lg" onClick={next} disabled={pending || (step === 1 && offered.length === 0)} aria-busy={pending}>
              {pending ? "Loading…" : step === 3 ? "See price" : "Continue"}
            </Button>
          ) : (
            <Button type="button" size="lg" onClick={submit} disabled={pending} aria-busy={pending}>
              {pending ? "Sending request…" : "Confirm request"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

const trimAddr = (a: Address) => ({
  line1: a.line1.trim(),
  city: a.city.trim(),
  state: a.state.trim().toUpperCase(),
  zip: a.zip.trim(),
  lat: a.lat,
  lng: a.lng,
});

function Progress({ step }: { step: number }) {
  return (
    <nav aria-label="Request progress">
      <p className="text-sm font-medium text-ink-muted">
        Step {step + 1} of {STEPS.length}: <span className="text-deep">{STEPS[step]}</span>
      </p>
      <ol className="mt-2 flex gap-1.5" aria-hidden>
        {STEPS.map((s, i) => (
          <li key={s} className={cx("h-1.5 flex-1 rounded-full transition-colors", i <= step ? "bg-sea" : "bg-line")} />
        ))}
      </ol>
    </nav>
  );
}

function StepTitle({ title, sub, ref }: { title: string; sub?: string; ref: React.Ref<HTMLHeadingElement> }) {
  return (
    <div className="mb-6">
      <h1 id="step-title" ref={ref} tabIndex={-1} className="text-2xl font-bold focus:outline-none sm:text-3xl">
        {title}
      </h1>
      {sub ? <p className="mt-1 text-ink-muted">{sub}</p> : null}
    </div>
  );
}

function RadioCard({ name, checked, onChange, title, sub }: { name: string; checked: boolean; onChange: () => void; title: string; sub?: string }) {
  return (
    <label
      className={cx(
        "flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 ring-1 ring-inset transition has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-sea",
        checked ? "bg-mint-50 ring-2 ring-sea" : "bg-white ring-line hover:bg-soft",
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="size-5 shrink-0 accent-[var(--color-sea)]" />
      <span>
        <span className="block font-medium text-deep">{title}</span>
        {sub ? <span className="block text-sm text-ink-muted">{sub}</span> : null}
      </span>
    </label>
  );
}

function Summary({ k, v, onEdit }: { k: string; v?: string | null; onEdit: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <dt className="text-sm text-ink-muted">{k}</dt>
        <dd className="break-words font-medium text-ink">{v}</dd>
      </div>
      <button type="button" onClick={onEdit} className="min-h-11 shrink-0 rounded-lg px-2 text-sm font-semibold text-sea hover:underline">
        Edit<span className="sr-only"> {k}</span>
      </button>
    </div>
  );
}

function AddressFields({
  prefix,
  value,
  errors,
  onChange,
  geocodingEnabled,
}: {
  prefix: string;
  value: Address;
  errors: Record<string, string>;
  onChange: (a: Address, src?: "MANUAL") => void;
  geocodingEnabled: boolean;
}) {
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [looking, startLookup] = useTransition();
  const id = (k: string) => `${prefix}${k}`.replace(".", "-");
  const set = (k: keyof Address, v: string) => onChange({ ...value, [k]: v }, "MANUAL");
  const query = useMemo(() => [value.line1, value.city, value.state, value.zip].filter(Boolean).join(", "), [value]);
  return (
    <div className="grid gap-4 sm:grid-cols-6">
      <Field label="Street address or cross street" htmlFor={id("line1")} required error={errors[`${prefix}line1`]} className="sm:col-span-6">
        <Input id={id("line1")} value={value.line1} onChange={(e) => set("line1", e.target.value)} autoComplete="street-address" aria-invalid={!!errors[`${prefix}line1`]} />
      </Field>
      <Field label="City" htmlFor={id("city")} required error={errors[`${prefix}city`]} className="sm:col-span-3">
        <Input id={id("city")} value={value.city} onChange={(e) => set("city", e.target.value)} autoComplete="address-level2" aria-invalid={!!errors[`${prefix}city`]} />
      </Field>
      <Field label="State" htmlFor={id("state")} required error={errors[`${prefix}state`]} className="sm:col-span-1">
        <Input
          id={id("state")}
          value={value.state}
          onChange={(e) => set("state", e.target.value.toUpperCase().slice(0, 2))}
          autoComplete="address-level1"
          placeholder="FL"
          aria-invalid={!!errors[`${prefix}state`]}
        />
      </Field>
      <Field label="ZIP" htmlFor={id("zip")} required error={errors[`${prefix}zip`]} className="sm:col-span-2">
        <Input
          id={id("zip")}
          value={value.zip}
          inputMode="numeric"
          onChange={(e) => set("zip", e.target.value.replace(/\D/g, "").slice(0, 5))}
          autoComplete="postal-code"
          aria-invalid={!!errors[`${prefix}zip`]}
        />
      </Field>
      {geocodingEnabled ? (
        <div className="sm:col-span-6">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={looking || query.length < 5}
            onClick={() =>
              startLookup(async () => {
                const r = await geocodeAction(query);
                setResults(r.ok ? (r.data ?? []) : []);
              })
            }
          >
            {looking ? "Looking up…" : "Look up this address"}
          </Button>
          {results.length ? (
            <ul className="mt-2 divide-y divide-line rounded-xl ring-1 ring-line">
              {results.map((r, i) => (
                <li key={i}>
                  <button
                    type="button"
                    className="block min-h-11 w-full px-3 py-2 text-left text-sm hover:bg-mint-50"
                    onClick={() => {
                      onChange({
                        line1: r.line1 || value.line1,
                        city: r.city,
                        state: r.state,
                        zip: r.zip,
                        lat: r.lat,
                        lng: r.lng,
                      });
                      setResults([]);
                    }}
                  >
                    {r.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : value.lat == null ? (
        <p className="text-sm text-ink-muted sm:col-span-6">
          <Badge>No map service</Badge> Address lookup isn&apos;t configured yet, so towing distance is confirmed by a dispatcher.
        </p>
      ) : null}
    </div>
  );
}
