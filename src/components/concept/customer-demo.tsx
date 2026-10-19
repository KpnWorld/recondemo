"use client";

import { useEffect, useState } from "react";
import { STATUS_LABELS, type RequestStatus } from "@/lib/constants";
import { Alert, Badge, Button, Card, Field, Input, Select, cx } from "../ui";
import { BatteryIcon, CheckIcon, FuelIcon, KeyIcon, PinIcon, TireIcon, TruckIcon } from "../icons";
import { SampleTag } from "./shell";

const STEPS = ["Where", "Vehicle", "Service", "Estimate", "Matching", "Tracking"];

const SERVICES = [
  { id: "towing", label: "Towing", Icon: TruckIcon },
  { id: "jump", label: "Jump-start", Icon: BatteryIcon },
  { id: "tire", label: "Flat tire", Icon: TireIcon },
  { id: "lockout", label: "Lockout", Icon: KeyIcon },
  { id: "fuel", label: "Fuel delivery", Icon: FuelIcon },
];

const MATCH_LOG = [
  "Request received. Looking for drivers who are online, approved for this service and covering this area.",
  "Offer sent to Sample Driver A.",
  "Sample Driver A did not respond in time. The offer moved on automatically.",
  "Offer sent to Sample Driver B.",
  "Sample Driver B accepted. You are told who is coming.",
];

const TRACK: RequestStatus[] = ["ASSIGNED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS", "COMPLETED"];

export function CustomerDemo() {
  const [step, setStep] = useState(0);
  const [where, setWhere] = useState("");
  const [vehicle, setVehicle] = useState({ year: "", make: "", model: "", drivable: "no" });
  const [service, setService] = useState("");
  const [logIdx, setLogIdx] = useState(-1);
  const [track, setTrack] = useState(0);

  // Matching is a scripted replay of the steps the real engine goes through; no network calls happen.
  useEffect(() => {
    if (step !== 4 || logIdx < 0 || logIdx >= MATCH_LOG.length - 1) return;
    const t = setTimeout(() => setLogIdx((i) => i + 1), 1300);
    return () => clearTimeout(t);
  }, [step, logIdx]);

  const serviceLabel = SERVICES.find((s) => s.id === service)?.label;
  const canNext = [!!where, !!(vehicle.make.trim() && vehicle.model.trim()), !!service, true, logIdx >= MATCH_LOG.length - 1, false][step];

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap gap-2" aria-label="Request steps">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined}>
            <Badge tone={i === step ? "deep" : i < step ? "mint" : "neutral"}>
              {i + 1}. {s}
            </Badge>
          </li>
        ))}
      </ol>

      <Card>
        {step === 0 ? (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Where are you?</h2>
            <p className="text-ink-muted">
              In the live app we ask permission to use your phone&apos;s location, or you type an address. You always confirm it on a map. Nothing is guessed.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {["Use sample location (demo only)", "Type an address"].map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setWhere(o)}
                  aria-pressed={where === o}
                  className={cx(
                    "flex min-h-16 items-center gap-3 rounded-2xl p-4 text-left ring-1 ring-inset",
                    where === o ? "bg-mint-50 ring-sea" : "bg-soft ring-line hover:bg-mint-50",
                  )}
                >
                  <PinIcon className="shrink-0 text-sea" />
                  {o}
                </button>
              ))}
            </div>
            {where === "Type an address" ? (
              <Field label="Address or landmark" htmlFor="d-addr" required hint="Demo only: this text is not stored or looked up.">
                <Input id="d-addr" placeholder="Example: northbound shoulder near an exit sign" />
              </Field>
            ) : null}
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Tell us about the vehicle</h2>
            <p className="text-ink-muted">Make, model and whether it can be driven decide which kind of truck is needed, so they decide which drivers are eligible.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Year" htmlFor="d-year">
                <Input id="d-year" inputMode="numeric" value={vehicle.year} onChange={(e) => setVehicle({ ...vehicle, year: e.target.value })} />
              </Field>
              <Field label="Make" htmlFor="d-make" required>
                <Input id="d-make" value={vehicle.make} onChange={(e) => setVehicle({ ...vehicle, make: e.target.value })} />
              </Field>
              <Field label="Model" htmlFor="d-model" required>
                <Input id="d-model" value={vehicle.model} onChange={(e) => setVehicle({ ...vehicle, model: e.target.value })} />
              </Field>
              <Field label="Can it be driven?" htmlFor="d-drive" required>
                <Select id="d-drive" value={vehicle.drivable} onChange={(e) => setVehicle({ ...vehicle, drivable: e.target.value })}>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                  <option value="unsure">Not sure</option>
                </Select>
              </Field>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">What do you need?</h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {SERVICES.map(({ id, label, Icon }) => (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => setService(id)}
                    aria-pressed={service === id}
                    className={cx(
                      "flex min-h-24 w-full flex-col items-start gap-2 rounded-2xl p-4 text-left ring-1 ring-inset",
                      service === id ? "bg-mint-50 ring-sea" : "bg-soft ring-line hover:bg-mint-50",
                    )}
                  >
                    <Icon className="text-sea" />
                    <span className="font-semibold text-deep">{label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              Your estimate <SampleTag>Layout only</SampleTag>
            </h2>
            <p className="text-ink-muted">
              {serviceLabel} for {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")}. Amounts come from rates an administrator sets, so this demo shows the
              structure and leaves the dollar figures blank rather than inventing prices.
            </p>
            <dl className="divide-y divide-line rounded-2xl bg-soft px-4">
              {["Base fee", "Distance beyond included miles", "Disclosed surcharges (if any)", "Tax"].map((l) => (
                <div key={l} className="flex justify-between gap-4 py-3">
                  <dt>{l}</dt>
                  <dd className="font-medium text-ink-muted">$ set by pricing rules</dd>
                </div>
              ))}
              <div className="flex justify-between gap-4 py-3 font-semibold">
                <dt>Total</dt>
                <dd>Shown before you confirm</dd>
              </div>
            </dl>
            <Alert tone="info">
              If the engine cannot price a job automatically, a dispatcher sends a confirmed quote for you to approve. Any later increase needs your approval too.
            </Alert>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              Finding a provider <SampleTag>Scripted replay</SampleTag>
            </h2>
            {logIdx < 0 ? (
              <Button onClick={() => setLogIdx(0)}>Start the simulated dispatch</Button>
            ) : (
              <ol className="space-y-2" aria-live="polite">
                {MATCH_LOG.slice(0, logIdx + 1).map((m) => (
                  <li key={m} className="flex gap-3 rounded-2xl bg-soft p-3 text-sm">
                    <CheckIcon className="mt-0.5 shrink-0 text-ok" />
                    {m}
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : null}

        {step === 5 ? (
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              Follow your job <SampleTag>Sample driver</SampleTag>
            </h2>
            <p className="text-lg font-semibold text-deep" aria-live="polite">
              {STATUS_LABELS[TRACK[track]]}
            </p>
            <ol className="grid gap-2 sm:grid-cols-5">
              {TRACK.map((t, i) => (
                <li
                  key={t}
                  className={cx(
                    "rounded-xl px-3 py-2 text-center text-xs font-medium ring-1 ring-inset",
                    i <= track ? "bg-mint-50 text-sea-700 ring-mint" : "bg-soft text-ink-muted ring-line",
                  )}
                >
                  {STATUS_LABELS[t]}
                </li>
              ))}
            </ol>
            <div className="rounded-2xl bg-soft p-4 text-sm text-ink-muted">
              <p className="font-semibold text-deep">About arrival times</p>
              <p className="mt-1">
                A live arrival estimate appears only when the driver is sharing real location and a mapping service computed the route. Otherwise you see the driver&apos;s own
                estimate, labeled as theirs. This demo has no driver, so it shows no time.
              </p>
            </div>
            <Button variant="secondary" disabled={track >= TRACK.length - 1} onClick={() => setTrack((t) => t + 1)}>
              Advance status (demo control)
            </Button>
          </div>
        ) : null}
      </Card>

      <div className="flex justify-between gap-3">
        <Button variant="ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          Back
        </Button>
        {step < 5 ? (
          <Button disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
            Continue
          </Button>
        ) : (
          <Button
            variant="ghost"
            onClick={() => {
              setStep(0);
              setTrack(0);
              setLogIdx(-1);
            }}
          >
            Start over
          </Button>
        )}
      </div>
    </div>
  );
}
