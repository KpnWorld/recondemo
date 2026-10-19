"use client";

import { useMemo, useState } from "react";
import { Badge, Card, Select, cx } from "../ui";
import { CheckIcon, XIcon } from "../icons";
import { SampleTag } from "./shell";

type Equipment = "flatbed" | "wheel-lift" | "heavy" | "service-truck";
type Service = "towing" | "jump" | "tire" | "lockout" | "fuel";
type Vehicle = "car" | "low" | "heavy";

const SERVICES: [Service, string][] = [
  ["towing", "Towing"],
  ["jump", "Jump-start"],
  ["tire", "Flat tire"],
  ["lockout", "Lockout"],
  ["fuel", "Fuel delivery"],
];
const VEHICLES: [Vehicle, string][] = [
  ["car", "Standard car or SUV"],
  ["low", "Low clearance or all-wheel drive"],
  ["heavy", "Heavy truck or van"],
];
// Which tow equipment can carry each vehicle class.
const CAN_CARRY: Record<Vehicle, Equipment[]> = { car: ["flatbed", "wheel-lift", "heavy"], low: ["flatbed", "heavy"], heavy: ["heavy"] };

const DRIVERS: { id: string; name: string; equipment: Equipment; services: Service[]; zone: number; nearest: number }[] = [
  { id: "a", name: "Sample Driver A", equipment: "flatbed", services: ["towing", "jump", "lockout", "tire"], zone: 1, nearest: 2 },
  { id: "b", name: "Sample Driver B", equipment: "wheel-lift", services: ["towing", "jump"], zone: 1, nearest: 1 },
  { id: "c", name: "Sample Driver C", equipment: "service-truck", services: ["jump", "tire", "lockout", "fuel"], zone: 1, nearest: 3 },
  { id: "d", name: "Sample Driver D", equipment: "heavy", services: ["towing"], zone: 2, nearest: 4 },
];

function check(d: (typeof DRIVERS)[number], online: boolean, service: Service, vehicle: Vehicle, zone: number): string | null {
  if (!online) return "Offline: offline drivers are never offered jobs";
  if (d.zone !== zone) return "Does not cover this service area";
  if (!d.services.includes(service)) return "Not approved for this service";
  if (service === "towing" && !CAN_CARRY[vehicle].includes(d.equipment)) return "Equipment cannot carry this vehicle";
  return null;
}

export function EngineDemo() {
  const [service, setService] = useState<Service>("towing");
  const [vehicle, setVehicle] = useState<Vehicle>("car");
  const [zone, setZone] = useState(1);
  const [online, setOnline] = useState<Record<string, boolean>>({ a: true, b: true, c: true, d: true });

  const rows = useMemo(() => {
    const all = DRIVERS.map((d) => ({ d, why: check(d, online[d.id], service, vehicle, zone) }));
    const eligible = all.filter((r) => !r.why).sort((x, y) => x.d.nearest - y.d.nearest);
    return { eligible, out: all.filter((r) => r.why) };
  }, [service, vehicle, zone, online]);

  return (
    <div className="space-y-6">
      <Card className="grid gap-4 sm:grid-cols-3">
        <label className="space-y-1.5 text-sm font-semibold text-deep">
          Service
          <Select value={service} onChange={(e) => setService(e.target.value as Service)}>
            {SERVICES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </label>
        <label className="space-y-1.5 text-sm font-semibold text-deep">
          Vehicle
          <Select value={vehicle} onChange={(e) => setVehicle(e.target.value as Vehicle)} disabled={service !== "towing"}>
            {VEHICLES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </label>
        <label className="space-y-1.5 text-sm font-semibold text-deep">
          Where the job is
          <Select value={zone} onChange={(e) => setZone(Number(e.target.value))}>
            <option value={1}>Sample zone 1</option>
            <option value={2}>Sample zone 2</option>
          </Select>
        </label>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">Sample drivers</h2>
        <p className="mt-1 text-sm text-ink-muted">Switch drivers online or offline to see how the offer list changes.</p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {DRIVERS.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 rounded-2xl bg-soft p-4">
              <span>
                <span className="block font-semibold text-deep">{d.name}</span>
                <span className="block text-xs text-ink-muted">
                  {d.equipment} · zone {d.zone}
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={online[d.id]}
                aria-label={`${d.name} online`}
                onClick={() => setOnline({ ...online, [d.id]: !online[d.id] })}
                className={cx(
                  "min-h-10 rounded-full px-4 text-sm font-semibold ring-1 ring-inset",
                  online[d.id] ? "bg-ok-50 text-ok ring-ok/40" : "bg-white text-ink-muted ring-line",
                )}
              >
                {online[d.id] ? "Online" : "Offline"}
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card aria-live="polite">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          Offer order <SampleTag>Sample proximity</SampleTag>
        </h2>
        {rows.eligible.length ? (
          <ol className="mt-4 space-y-2">
            {rows.eligible.map(({ d }, i) => (
              <li key={d.id} className="flex items-center gap-3 rounded-2xl bg-mint-50 p-3">
                <CheckIcon className="shrink-0 text-ok" />
                <span className="font-semibold text-deep">{d.name}</span>
                <Badge tone="mint">{i === 0 ? "Offered first" : `Offered ${i + 1}${i === 1 ? "nd" : i === 2 ? "rd" : "th"} if needed`}</Badge>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-4 rounded-2xl bg-gold-50 p-4 text-sm">
            No eligible driver. The job goes to a human dispatcher, and if none can help the customer is told plainly that no provider is available.
          </p>
        )}
        {rows.out.length ? (
          <>
            <h3 className="mt-6 font-semibold">Not offered</h3>
            <ul className="mt-2 space-y-2">
              {rows.out.map(({ d, why }) => (
                <li key={d.id} className="flex items-start gap-3 rounded-2xl bg-soft p-3 text-sm">
                  <XIcon className="mt-0.5 shrink-0 text-danger" />
                  <span>
                    <span className="font-semibold text-deep">{d.name}</span>: {why}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <p className="mt-6 text-sm text-ink-muted">
          In the live product, &quot;nearest&quot; comes from each driver&apos;s real shared location and a mapping service, never from a fixed order like this. Offers go one at a
          time, each with a response window.
        </p>
      </Card>
    </div>
  );
}
