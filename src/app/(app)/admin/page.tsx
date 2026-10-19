import type { Metadata } from "next";
import Link from "next/link";
import { requirePageUser } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { config, integrationStatuses } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { ACTIVE_STATUSES } from "@/lib/constants";
import { sweepDispatch } from "@/lib/services/dispatch";
import { sweepAction } from "@/app/actions/admin";
import { Alert, Badge, Card, Flash, PageHeader } from "@/components/ui";
import { AutoRefresh, SubmitButton } from "@/components/client";
import { RequestRow } from "@/components/request-card";

export const metadata: Metadata = { title: "Admin overview" };

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; denied?: string }> }) {
  const user = await requirePageUser(["ADMIN"], "/admin");
  const sp = await searchParams;
  await sweepDispatch().catch(() => {});
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [byStatus, needsAttention, pendingProviders, onlineProviders, openTickets, pendingPayouts, last24, settings] = await Promise.all([
    db.serviceRequest.groupBy({
      by: ["status"],
      where: { status: { in: ACTIVE_STATUSES } },
      _count: true,
    }),
    db.serviceRequest.findMany({
      where: {
        OR: [
          { status: "NO_PROVIDER_AVAILABLE" },
          {
            status: "SUBMITTED",
            quotes: { some: { status: "NEEDS_CONFIRMATION" } },
          },
          { status: "SEARCHING" },
        ],
      },
      include: { serviceCategory: true },
      orderBy: { createdAt: "asc" },
      take: 10,
    }),
    db.providerProfile.count({ where: { verificationStatus: "PENDING" } }),
    db.providerProfile.count({
      where: { verificationStatus: "APPROVED", isOnline: true },
    }),
    db.supportTicket.count({
      where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
    }),
    db.providerPayout.count({ where: { status: "PENDING" } }),
    db.serviceRequest.count({ where: { createdAt: { gte: since } } }),
    getSettings(),
  ]);
  const count = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;
  const missingConfig = [
    !settings.business.supportEmail && !settings.business.supportPhone ? "support contact details" : null,
    !settings.legal.terms ? "terms of service" : null,
    !settings.legal.privacyPolicy ? "privacy policy" : null,
    settings.cancellation.feeAfterAssignmentCents == null ? "cancellation fee" : null,
    settings.payments.platformFeeBps == null ? "platform fee" : null,
  ].filter(Boolean);
  const integrations = integrationStatuses();

  const stats: [string, number, string | null][] = [
    ["Waiting for a quote or payment", count("SUBMITTED"), "/admin/requests?status=SUBMITTED"],
    ["Searching for a provider", count("SEARCHING"), "/admin/requests?status=SEARCHING"],
    ["No provider available", count("NO_PROVIDER_AVAILABLE"), "/admin/requests?status=NO_PROVIDER_AVAILABLE"],
    ["Jobs underway", count("ASSIGNED") + count("EN_ROUTE") + count("ARRIVED") + count("IN_PROGRESS"), "/admin/requests?status=ACTIVE"],
    ["Requests in last 24h", last24, "/admin/requests"],
    ["Providers online", onlineProviders, can(user, "providers.view") ? "/admin/providers?online=1" : null],
    ["Providers awaiting verification", pendingProviders, can(user, "providers.view") ? "/admin/providers?status=PENDING" : null],
    ["Open support tickets", openTickets, can(user, "support.manage") ? "/admin/support" : null],
    ["Payouts pending", pendingPayouts, can(user, "payments.view") ? "/admin/payments?tab=payouts" : null],
  ];

  return (
    <>
      <AutoRefresh seconds={30} />
      <PageHeader
        title="Dispatch overview"
        description={`Signed in as ${user.adminRole?.replace("_", " ").toLowerCase() ?? "staff"}.`}
        actions={
          can(user, "dispatch.assign") ? (
            <form action={sweepAction}>
              <SubmitButton variant="secondary" size="sm">
                Run dispatch timers now
              </SubmitButton>
            </form>
          ) : null
        }
      />
      <Flash {...sp} />
      {sp.denied ? (
        <Alert tone="error" className="mb-5">
          Your role doesn&apos;t have access to that page.
        </Alert>
      ) : null}
      {config.demoMode() ? (
        <Alert tone="warning" className="mb-5" title="Demo mode is on">
          Sample data is shown, payments are never charged and payouts are never sent. Turn off DEMO_MODE before taking real requests.
        </Alert>
      ) : null}
      {missingConfig.length && can(user, "settings.manage") ? (
        <Alert tone="warning" className="mb-5" title="Launch configuration incomplete">
          Not yet set: {missingConfig.join(", ")}. <Link href="/admin/settings">Open settings</Link>
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {stats.map(([label, n, href]) => {
          const inner = (
            <>
              <p className="text-3xl font-bold tabular-nums text-deep">{n}</p>
              <p className="mt-1 text-sm text-ink-muted">{label}</p>
            </>
          );
          return href ? (
            <Link key={label} href={href} className="rounded-[var(--radius-card)] bg-white p-4 no-underline shadow-[var(--shadow-card)] ring-sea hover:ring-2">
              {inner}
            </Link>
          ) : (
            <div key={label} className="rounded-[var(--radius-card)] bg-white p-4 shadow-[var(--shadow-card)]">
              {inner}
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <h2 className="mb-2 text-lg font-semibold">Needs attention</h2>
          {needsAttention.length ? (
            <div className="-mx-3">
              {needsAttention.map((r) => (
                <RequestRow key={r.id} r={r} href={`/admin/requests/${r.id}`} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-muted">Nothing waiting on dispatch right now.</p>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Integrations</h2>
          <ul className="space-y-3">
            {integrations.map((i) => (
              <li key={i.key} className="flex items-start justify-between gap-3">
                <span>
                  <span className="block text-sm font-semibold text-deep">{i.name}</span>
                  <span className="block text-xs text-ink-muted">{i.configured ? i.detail : `Not configured. Set ${i.envVars.join(", ")}.`}</span>
                </span>
                <Badge tone={i.configured ? "ok" : "neutral"}>{i.configured ? "On" : "Off"}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
