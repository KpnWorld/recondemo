"use client";

import { useState } from "react";
import { Alert, Badge, Button, Card, cx } from "../ui";
import { NavigationIcon } from "../icons";
import { SampleTag } from "./shell";

const STEPS = [
  ["Accepted", "You tell the customer you are on the way."],
  ["En route", "Share location with the customer while you drive, if you allow it."],
  ["Arrived", "The customer is told you are there."],
  ["Service in progress", "Photos and notes can be added to the job."],
  ["Completed", "The job closes and the payout is recorded for your earnings page."],
];

export function DriverDemo() {
  const [online, setOnline] = useState(false);
  const [offer, setOffer] = useState<"none" | "open" | "declined" | "accepted">("none");
  const [step, setStep] = useState(0);

  function goOnline(next: boolean) {
    setOnline(next);
    if (!next) {
      setOffer("none");
      setStep(0);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            Availability <Badge tone={online ? "ok" : "neutral"}>{online ? "Online" : "Offline"}</Badge>
          </h2>
          <p className="mt-1 max-w-xl text-sm text-ink-muted">
            {online
              ? "In the live app your phone shares its real location while you are online, and only after you allow it. This demo shares nothing."
              : "Offline drivers get no offers and share no location. Going online is always your choice."}
          </p>
        </div>
        <Button variant={online ? "secondary" : "primary"} onClick={() => goOnline(!online)} aria-pressed={online}>
          {online ? "Go offline" : "Go online"}
        </Button>
      </Card>

      {online && offer === "none" ? (
        <Card className="text-center">
          <p className="text-ink-muted">Waiting for an offer. Real offers only come from real requests that match your equipment and area.</p>
          <Button className="mt-4" variant="secondary" onClick={() => setOffer("open")}>
            Show a sample offer
          </Button>
        </Card>
      ) : null}

      {online && offer === "open" ? (
        <Card className="space-y-4 ring-2 ring-gold/70">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            New job offer <SampleTag>Sample job</SampleTag>
          </h2>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {[
              ["Service", "Towing"],
              ["Vehicle", "Sample sedan, can't be driven"],
              ["Pickup", "Sample pickup area (map pin in the live app)"],
              ["Your payout", "$ set by pricing rules, shown before you accept"],
              ["Time to respond", "A live countdown; if it runs out the offer moves to the next driver"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-soft p-3">
                <dt className="font-semibold text-deep">{k}</dt>
                <dd className="text-ink-muted">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="flex gap-3">
            <Button onClick={() => setOffer("accepted")}>Accept job</Button>
            <Button variant="secondary" onClick={() => setOffer("declined")}>
              Decline
            </Button>
          </div>
        </Card>
      ) : null}

      {online && offer === "declined" ? (
        <Alert tone="info">
          Declined. The offer goes to the next eligible driver and nothing happens to your account for declining.{" "}
          <button type="button" className="font-semibold underline" onClick={() => setOffer("none")}>
            Back to waiting
          </button>
        </Alert>
      ) : null}

      {online && offer === "accepted" ? (
        <Card className="space-y-4">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            Active job <SampleTag>Sample job</SampleTag>
          </h2>
          <ol className="space-y-2">
            {STEPS.map(([t, d], i) => (
              <li
                key={t}
                className={cx(
                  "flex gap-3 rounded-2xl p-3 ring-1 ring-inset",
                  i === step ? "bg-mint-50 ring-sea" : i < step ? "bg-soft text-ink-muted ring-line" : "bg-white ring-line",
                )}
              >
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-deep text-xs font-bold text-white">{i + 1}</span>
                <span>
                  <span className="block font-semibold text-deep">{t}</span>
                  <span className="block text-sm text-ink-muted">{d}</span>
                </span>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-3">
            <Button disabled={step >= STEPS.length - 1} onClick={() => setStep((s) => s + 1)}>
              <NavigationIcon className="size-5" /> Move to next step
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setOffer("none");
                setStep(0);
              }}
            >
              {step >= STEPS.length - 1 ? "Finish and wait for offers" : "Reset demo"}
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
