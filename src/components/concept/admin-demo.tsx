"use client";

import { useState } from "react";
import { Alert, Badge, Button, Card, cx } from "../ui";
import { CheckIcon } from "../icons";
import { SampleTag } from "./shell";

type Job = { id: string; service: string; vehicle: string; status: "SEARCHING" | "ASSIGNED" | "IN_PROGRESS"; driver?: string };

const COLUMNS: { key: Job["status"]; title: string }[] = [
  { key: "SEARCHING", title: "Finding a provider" },
  { key: "ASSIGNED", title: "Provider assigned" },
  { key: "IN_PROGRESS", title: "In progress" },
];

const START: Job[] = [
  { id: "SAMPLE-1", service: "Towing", vehicle: "Sample SUV", status: "SEARCHING" },
  { id: "SAMPLE-2", service: "Jump-start", vehicle: "Sample sedan", status: "ASSIGNED", driver: "Sample Driver B" },
  { id: "SAMPLE-3", service: "Flat tire", vehicle: "Sample van", status: "IN_PROGRESS", driver: "Sample Driver C" },
];

const APPLICANTS = ["Sample Towing Co. (applicant 1)", "Sample Roadside LLC (applicant 2)"];
const CHECKS = ["Driver's license uploaded", "Insurance uploaded and unexpired", "Truck registration uploaded"];

export function AdminDemo() {
  const [jobs, setJobs] = useState(START);
  const [approved, setApproved] = useState<string[]>([]);
  const [log, setLog] = useState<string[]>([]);

  function assign(id: string) {
    setJobs((js) => js.map((j) => (j.id === id ? { ...j, status: "ASSIGNED", driver: "Sample Driver A" } : j)));
    setLog((l) => [`${id}: dispatcher assigned Sample Driver A manually. The customer is notified.`, ...l]);
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="board">
        <h2 id="board" className="flex items-center gap-2 text-xl font-semibold">
          Dispatch board <SampleTag>Sample requests</SampleTag>
        </h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {COLUMNS.map((c) => (
            <div key={c.key} className="rounded-[var(--radius-card)] bg-white/60 p-3 ring-1 ring-line">
              <h3 className="px-1 pb-2 text-sm font-semibold uppercase tracking-wide text-sea">{c.title}</h3>
              <ul className="space-y-3">
                {jobs
                  .filter((j) => j.status === c.key)
                  .map((j) => (
                    <li key={j.id}>
                      <Card as="div" className="space-y-1 p-4 sm:p-4">
                        <p className="font-semibold text-deep">
                          {j.id} · {j.service}
                        </p>
                        <p className="text-sm text-ink-muted">{j.vehicle}</p>
                        {j.driver ? <p className="text-sm">Driver: {j.driver}</p> : null}
                        {j.status === "SEARCHING" ? (
                          <Button size="sm" variant="gold" className="mt-2" onClick={() => assign(j.id)}>
                            Assign manually
                          </Button>
                        ) : null}
                      </Card>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
        {log.length ? (
          <ul className="mt-4 space-y-2" aria-live="polite">
            {log.map((l) => (
              <li key={l}>
                <Alert tone="success">{l}</Alert>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-ink-muted">If no driver accepts an offer, the job stays here for a dispatcher. Every manual action is written to an audit log.</p>
        )}
      </section>

      <section aria-labelledby="approvals">
        <h2 id="approvals" className="flex items-center gap-2 text-xl font-semibold">
          Provider approvals <SampleTag>Sample applicants</SampleTag>
        </h2>
        <p className="mt-1 text-sm text-ink-muted">A provider cannot take jobs until an administrator has reviewed their documents.</p>
        <ul className="mt-4 grid gap-4 md:grid-cols-2">
          {APPLICANTS.map((a) => {
            const ok = approved.includes(a);
            return (
              <li key={a}>
                <Card as="div" className="h-full space-y-3">
                  <p className="flex items-center justify-between gap-2 font-semibold text-deep">
                    {a} <Badge tone={ok ? "ok" : "gold"}>{ok ? "Approved" : "Pending review"}</Badge>
                  </p>
                  <ul className="space-y-1.5 text-sm">
                    {CHECKS.map((c) => (
                      <li key={c} className="flex gap-2">
                        <CheckIcon className={cx("mt-0.5 size-4 shrink-0", ok ? "text-ok" : "text-ink-muted")} /> {c}
                      </li>
                    ))}
                  </ul>
                  <Button size="sm" disabled={ok} onClick={() => setApproved((x) => [...x, a])}>
                    Approve provider
                  </Button>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="pricing">
        <h2 id="pricing" className="text-xl font-semibold">
          Pricing rules
        </h2>
        <p className="mt-1 text-sm text-ink-muted">Administrators set these per service. The demo leaves the values empty because no real rates exist yet.</p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {["Base fee", "Included miles", "Per extra mile", "Platform fee"].map((k) => (
            <div key={k} className="rounded-2xl bg-white p-4 shadow-[var(--shadow-card)]">
              <dt className="text-sm font-semibold text-deep">{k}</dt>
              <dd className="mt-1 text-ink-muted">Not set yet</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
