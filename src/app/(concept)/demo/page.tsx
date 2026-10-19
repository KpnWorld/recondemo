import type { Metadata } from "next";
import { Card, LinkButton } from "@/components/ui";
import { SectionHeading } from "@/components/concept/shell";
import { SettingsIcon, TruckIcon, UserIcon, LocateIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Demo" };

const DEMOS = [
  [UserIcon, "Customer", "Request help, see the estimate layout, watch a scripted dispatch and follow the job.", "/demo/customer"],
  [TruckIcon, "Driver", "Go online, receive a sample offer, accept it and move the job through each step.", "/demo/driver"],
  [SettingsIcon, "Operations", "A dispatch board with manual assignment, provider approvals and pricing rules.", "/demo/admin"],
  [LocateIcon, "Dispatch engine", "Change the service, vehicle and area and see which drivers would be offered the job.", "/demo/engine"],
] as const;

export default function DemoHub() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <SectionHeading eyebrow="Demo" title="See how Call Recon will work" />
      <p className="mx-auto mt-4 max-w-2xl text-center text-ink-muted">
        These walkthroughs use made-up sample data that exists only in your browser tab. No requests are created, no drivers are contacted and no cards are charged.
      </p>
      <ul className="mt-10 grid gap-5 sm:grid-cols-2">
        {DEMOS.map(([Icon, t, d, href]) => (
          <li key={t}>
            <Card as="div" className="flex h-full flex-col">
              <Icon className="text-sea" />
              <h2 className="mt-4 text-lg font-semibold">{t}</h2>
              <p className="mt-2 flex-1 text-ink-muted">{d}</p>
              <LinkButton href={href} variant="secondary" size="sm" className="mt-5 self-start">
                Open {t.toLowerCase()} demo
              </LinkButton>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
