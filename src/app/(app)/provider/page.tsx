import type { Metadata } from "next";
import Link from "next/link";
import { requirePageUser } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { ASSIGNED_STATUSES } from "@/lib/constants";
import { coarseArea } from "@/lib/geo";
import { formatCents } from "@/lib/money";
import { sweepDispatch } from "@/lib/services/dispatch";
import { availabilityAction, locationConsentAction, offerAction } from "@/app/actions/provider";
import { Alert, Badge, Card, EmptyState, Flash, LinkButton, PageHeader, StatusBadge } from "@/components/ui";
import { AutoRefresh, ConfirmSubmit, SubmitButton } from "@/components/client";
import { Countdown } from "@/components/countdown";
import { LocationSharer } from "@/components/location-sharer";
import { ServiceIcon, TruckIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Provider dashboard" };

export default async function ProviderDashboard({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requirePageUser(["PROVIDER"], "/provider");
  const sp = await searchParams;
  await sweepDispatch().catch(() => {});
  const p = await db.providerProfile.findUniqueOrThrow({
    where: { userId: user.id },
    include: {
      documents: true,
      services: { include: { serviceCategory: true } },
      user: { select: { locationConsentAt: true } },
    },
  });
  const [offers, active, completedCount] = await Promise.all([
    db.jobOffer.findMany({
      where: {
        providerId: p.id,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
      include: {
        request: {
          include: {
            serviceCategory: true,
            quotes: { where: { status: "APPROVED" } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.providerAssignment.findFirst({
      where: {
        providerId: p.id,
        active: true,
        request: { status: { in: ASSIGNED_STATUSES } },
      },
      include: { request: { include: { serviceCategory: true } } },
    }),
    db.providerAssignment.count({
      where: { providerId: p.id, request: { status: "COMPLETED" } },
    }),
  ]);
  const approved = p.verificationStatus === "APPROVED";
  const onboardingDone = Boolean(p.truckType && p.truckPlate && p.services.length && (p.serviceZips || p.serviceRadiusMiles));
  const sharing = Boolean(p.user.locationConsentAt) && (p.isOnline || Boolean(active));

  return (
    <>
      <AutoRefresh seconds={10} />
      <PageHeader title={p.businessName} description={`${completedCount} completed job${completedCount === 1 ? "" : "s"} on Call Recon`} />
      <Flash {...sp} />

      {!approved ? (
        <Alert
          tone={p.verificationStatus === "PENDING" ? "info" : "warning"}
          className="mb-5"
          title={p.verificationStatus === "PENDING" ? "Your account is awaiting verification" : `Account ${p.verificationStatus.toLowerCase()}`}
        >
          {p.verificationStatus === "PENDING" ? (
            <>
              {onboardingDone
                ? "Thanks! An administrator is reviewing your business details and documents."
                : "Finish your business details and upload your license, insurance and truck registration."}{" "}
              You can&apos;t receive jobs until you&apos;re approved. <Link href="/provider/onboarding">Go to business &amp; documents</Link>
            </>
          ) : (
            <>{p.verificationNotes ?? "Please contact Call Recon support."}</>
          )}
        </Alert>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Availability</h2>
              <p className="mt-1 text-sm text-ink-muted">{p.isOnline ? "You're online. New offers appear below." : "You're offline and won't receive offers."}</p>
            </div>
            <Badge tone={p.isOnline ? "ok" : "neutral"}>{p.isOnline ? "Online" : "Offline"}</Badge>
          </div>
          <form action={availabilityAction} className="mt-4">
            <input type="hidden" name="online" value={p.isOnline ? "false" : "true"} />
            <SubmitButton size="lg" variant={p.isOnline ? "secondary" : "primary"} className="w-full" disabled={!approved && !p.isOnline}>
              {p.isOnline ? "Go offline" : "Go online"}
            </SubmitButton>
          </form>
          <div className="mt-4 border-t border-line pt-4">
            {p.user.locationConsentAt ? (
              <div className="space-y-2">
                <LocationSharer enabled={sharing} />
                {!sharing ? <p className="text-sm text-ink-muted">Location is shared only while you&apos;re online or on a job.</p> : null}
                <form action={locationConsentAction}>
                  <input type="hidden" name="granted" value="false" />
                  <SubmitButton variant="ghost" size="sm">
                    Stop sharing location
                  </SubmitButton>
                </form>
              </div>
            ) : (
              <form action={locationConsentAction} className="space-y-2">
                <p className="text-sm text-ink-muted">Share your device location while online so we can offer you nearby jobs and give customers a live arrival estimate.</p>
                <input type="hidden" name="granted" value="true" />
                <SubmitButton variant="secondary" size="sm">
                  Share my location
                </SubmitButton>
              </form>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold">Current job</h2>
          {active ? (
            <Link href={`/provider/jobs/${active.requestId}`} className="mt-3 flex items-center gap-4 rounded-2xl bg-mint-50 p-4 no-underline ring-1 ring-mint hover:ring-sea">
              <span className="flex size-11 items-center justify-center rounded-xl bg-white text-sea">
                <ServiceIcon slug={active.request.serviceCategory.slug} />
              </span>
              <span className="flex-1">
                <span className="block font-semibold text-deep">{active.request.serviceCategory.name}</span>
                <span className="text-sm text-ink-muted">{active.request.number}</span>
              </span>
              <StatusBadge status={active.request.status} />
            </Link>
          ) : (
            <p className="mt-2 text-sm text-ink-muted">No job in progress.</p>
          )}
        </Card>
      </div>

      <section className="mt-6" aria-labelledby="offers-h">
        <h2 id="offers-h" className="mb-3 text-lg font-semibold">
          Incoming job offers
        </h2>
        {offers.length ? (
          <ul className="grid gap-4 md:grid-cols-2">
            {offers.map((o) => {
              const r = o.request;
              const v = JSON.parse(r.vehicleSnapshot) as {
                year: number;
                make: string;
                model: string;
                vehicleType: string;
                drivetrain?: string;
              };
              const total = r.quotes[0]?.totalCents;
              return (
                <li key={o.id}>
                  <Card className="ring-2 ring-gold">
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex items-center gap-3">
                        <span className="flex size-11 items-center justify-center rounded-xl bg-mint-50 text-sea">
                          <ServiceIcon slug={r.serviceCategory.slug} />
                        </span>
                        <span>
                          <span className="block font-semibold text-deep">{r.serviceCategory.name}</span>
                          <span className="text-sm text-ink-muted">{coarseArea(r)}</span>
                        </span>
                      </span>
                      <Badge tone="gold">
                        <Countdown until={o.expiresAt.toISOString()} />
                      </Badge>
                    </div>
                    <ul className="mt-4 space-y-1 text-sm">
                      <li>Distance: {o.distanceMiles != null ? `about ${o.distanceMiles} mi (straight line)` : "within your service ZIPs"}</li>
                      <li>
                        Vehicle: {v.year} {v.make} {v.model}
                        {v.drivetrain ? ` · ${v.drivetrain}` : ""}
                      </li>
                      {r.serviceCategory.requiresDestination ? <li>Tow destination: {r.destCity ?? "provided after accepting"}</li> : null}
                      <li>Approved job total: {total != null ? formatCents(total) : "—"}</li>
                      {!r.isSafeLocation ? <li className="font-semibold text-danger">Customer reports an unsafe location</li> : null}
                    </ul>
                    <p className="mt-2 text-xs text-ink-muted">Exact address and customer details are shared after you accept.</p>
                    <form action={offerAction} className="mt-4 flex gap-2">
                      <input type="hidden" name="offerId" value={o.id} />
                      <SubmitButton name="decision" value="accept" className="flex-1" disabled={!approved} pendingText="Accepting…">
                        Accept
                      </SubmitButton>
                      <ConfirmSubmit name="decision" value="decline" variant="secondary" message="Decline this job?">
                        Decline
                      </ConfirmSubmit>
                    </form>
                  </Card>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={<TruckIcon />} title={p.isOnline ? "No offers right now" : "Go online to receive offers"}>
            {p.isOnline ? "This page refreshes automatically. Offers show the general area first; you'll see full details after accepting." : null}
          </EmptyState>
        )}
      </section>
      <p className="mt-8 text-sm text-ink-muted">
        Need to update your truck, services or coverage?{" "}
        <LinkButton href="/provider/onboarding" variant="ghost" size="sm">
          Business &amp; documents
        </LinkButton>
      </p>
    </>
  );
}
