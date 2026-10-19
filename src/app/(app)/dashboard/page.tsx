import type { Metadata } from "next";
import Link from "next/link";
import { requirePageUser } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { ACTIVE_STATUSES, STATUS_LABELS, type RequestStatus } from "@/lib/constants";
import { Alert, Card, EmptyState, LinkButton, PageHeader, StatusBadge } from "@/components/ui";
import { RequestRow } from "@/components/request-card";
import { AutoRefresh } from "@/components/client";
import { ReceiptIcon, ServiceIcon, TruckIcon, ChevronRightIcon, CardIcon, PinIcon, HelpIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Dashboard" };

export default async function CustomerDashboard({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await requirePageUser(["CUSTOMER"], "/dashboard");
  const sp = await searchParams;
  const [active, recent, vehicles, places] = await Promise.all([
    db.serviceRequest.findMany({
      where: { customerId: user.id, status: { in: ACTIVE_STATUSES } },
      include: {
        serviceCategory: true,
        assignments: { where: { active: true }, include: { provider: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.serviceRequest.findMany({
      where: { customerId: user.id, status: { notIn: ACTIVE_STATUSES } },
      include: { serviceCategory: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    db.vehicle.count({ where: { userId: user.id } }),
    db.savedLocation.count({ where: { userId: user.id } }),
  ]);

  return (
    <>
      {active.length ? <AutoRefresh seconds={20} /> : null}
      <PageHeader title={`Hi, ${user.name?.split(" ")[0]}`} description="Request help or check on a current service." />
      {sp.welcome ? (
        <Alert tone="success" className="mb-6" title="Your account is ready">
          Add your vehicle and home address to make future requests faster.
        </Alert>
      ) : null}

      <Card className="on-dark mb-6 bg-deep text-white">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Need help right now?</h2>
            <p className="mt-1 text-white/75">Tow, jump-start, flat tire, lockout or fuel.</p>
          </div>
          <LinkButton href="/request" variant="gold" size="lg">
            Request a Tow
          </LinkButton>
        </div>
      </Card>

      <section aria-labelledby="active-h" className="mb-8">
        <h2 id="active-h" className="mb-3 text-lg font-semibold">
          Current service
        </h2>
        {active.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {active.map((r) => {
              const p = r.assignments[0]?.provider;
              return (
                <Link
                  key={r.id}
                  href={`/requests/${r.id}`}
                  className="block rounded-[var(--radius-card)] bg-white p-5 no-underline shadow-[var(--shadow-card)] ring-2 ring-mint transition hover:ring-sea"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex size-11 items-center justify-center rounded-xl bg-mint-50 text-sea">
                      <ServiceIcon slug={r.serviceCategory.slug} />
                    </span>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="mt-3 font-semibold text-deep">{r.serviceCategory.name}</p>
                  <p className="text-sm text-ink-muted">{r.number}</p>
                  <p className="mt-3 text-sm text-ink">{p ? `${p.businessName} is handling your request.` : STATUS_LABELS[r.status as RequestStatus]}</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-sea">
                    Track request <ChevronRightIcon className="size-4" />
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={<TruckIcon />} title="No active requests">
            When you request help, you&apos;ll be able to follow it here.
          </EmptyState>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent history</h2>
            <Link href="/dashboard/history" className="text-sm font-semibold">
              See all
            </Link>
          </div>
          {recent.length ? (
            <div className="-mx-3">
              {recent.map((r) => (
                <RequestRow key={r.id} r={r} href={`/requests/${r.id}`} />
              ))}
            </div>
          ) : (
            <p className="py-4 text-sm text-ink-muted">Completed and cancelled requests will appear here with their receipts.</p>
          )}
        </Card>
        <Card>
          <h2 className="text-lg font-semibold">Quick links</h2>
          <ul className="mt-3 space-y-1">
            {[
              ["/dashboard/vehicles", `Saved vehicles (${vehicles})`, TruckIcon],
              ["/dashboard/locations", `Saved places (${places})`, PinIcon],
              ["/dashboard/history", "Receipts & invoices", ReceiptIcon],
              ["/dashboard/payments", "Payment methods", CardIcon],
              ["/help", "Help & support", HelpIcon],
            ].map(([href, label, Icon]) => {
              const I = Icon as typeof TruckIcon;
              return (
                <li key={href as string}>
                  <Link href={href as string} className="flex min-h-11 items-center gap-3 rounded-xl px-2 text-sm font-medium text-ink no-underline hover:bg-soft">
                    <I className="size-5 text-sea" /> {label as string}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </>
  );
}
