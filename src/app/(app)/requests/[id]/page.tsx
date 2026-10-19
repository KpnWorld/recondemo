import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { config } from "@/lib/env";
import { isAppError } from "@/lib/errors";
import { formatCents } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { SITUATIONS, ACTIVE_STATUSES, type RequestStatus } from "@/lib/constants";
import { getRequestDetail, cancellationTerms } from "@/lib/services/requests";
import { sweepDispatch } from "@/lib/services/dispatch";
import { arrivalInfo } from "@/lib/services/eta";
import { parseBreakdown } from "@/lib/services/pricing";
import { paymentAuthorizationRequired } from "@/lib/services/payments";
import { stripeConfigured } from "@/lib/integrations/stripe";
import { cancelRequestAction, respondQuoteAction, retrySearchAction, reviewAction, shareAction } from "@/app/actions/customer";
import { Alert, Badge, Card, DescriptionList, Field, Flash, LinkButton, Placeholder, Select, StatusBadge, Textarea, buttonClass } from "@/components/ui";
import { AutoRefresh, ConfirmSubmit, CopyButton, LocalTime, SubmitButton } from "@/components/client";
import { StatusTimeline } from "@/components/timeline";
import { PriceTable } from "@/components/price";
import { MessagesPanel } from "@/components/messages";
import { PaymentAuthorize } from "@/components/payment-authorize";
import { MapPicker } from "@/components/map-picker";
import { ClockIcon, PhoneIcon, ShieldIcon, TruckIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Track your request" };

type SP = { ok?: string; error?: string; new?: string; share?: string };

export default async function TrackRequestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePageUser(["CUSTOMER"], `/requests/${id}`);
  await sweepDispatch().catch(() => {});

  let detail;
  try {
    detail = await getRequestDetail(user, id);
  } catch (e) {
    if (isAppError(e) && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const r = detail.request;
  const status = r.status as RequestStatus;
  const active = ACTIVE_STATUSES.includes(status);
  const settings = await getSettings();
  const assignment = r.assignments.find((a) => a.active);
  const provider = assignment?.provider ?? null;
  const approved = [...r.quotes].reverse().find((q) => q.status === "APPROVED");
  const pendingQuote = r.quotes.find((q) => q.status === "PENDING_APPROVAL");
  const needsQuote = status === "SUBMITTED" && !approved && !pendingQuote;
  const paymentAuthorized = r.payments.some((p) => p.status === "AUTHORIZED");
  const awaitingPayment = status === "SUBMITTED" && approved && !paymentAuthorized && (await paymentAuthorizationRequired(r.isDemo));
  const terms = await cancellationTerms(r.id);
  const eta = provider ? await arrivalInfo(r, provider) : null;
  const vehicle = JSON.parse(r.vehicleSnapshot) as {
    make: string;
    model: string;
    year: number;
    color?: string;
  };
  const breakdown = parseBreakdown(approved?.breakdown);
  const back = `/requests/${r.id}`;

  return (
    <div className="mx-auto max-w-5xl">
      {active ? <AutoRefresh seconds={12} /> : null}
      <Flash ok={sp.ok} error={sp.error} />
      {sp.new ? (
        <Alert tone="success" title={`Request ${r.number} received`} className="mb-5">
          We&apos;ll keep this page updated. You can leave it and come back anytime from your dashboard.
        </Alert>
      ) : null}

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-ink-muted">
            Request <span className="font-mono font-semibold text-deep">{r.number}</span> · <LocalTime iso={r.createdAt.toISOString()} />
          </p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{r.serviceCategory.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          {r.isDemo ? <Badge tone="gold">Demo request</Badge> : null}
          <StatusBadge status={r.status} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem] [&>*]:min-w-0">
        <div className="space-y-5">
          {/* What happens now */}
          {needsQuote ? (
            <Alert tone="info" title="A dispatcher is preparing your confirmed quote">
              {r.quotes[0]?.reason ?? "We couldn't calculate an instant estimate."} You&apos;ll get a notification to review and approve it. No one is dispatched until you do.
            </Alert>
          ) : null}

          {pendingQuote ? (
            <Card className="ring-2 ring-gold">
              <h2 className="text-lg font-semibold">{pendingQuote.kind === "REVISION" ? "Please review a price change" : "Your confirmed quote"}</h2>
              {pendingQuote.reason ? <p className="mt-1 text-sm text-ink-muted">Reason: {pendingQuote.reason}</p> : null}
              {parseBreakdown(pendingQuote.breakdown) ? (
                <div className="mt-4 rounded-2xl bg-soft p-4">
                  <PriceTable breakdown={parseBreakdown(pendingQuote.breakdown)!} label={pendingQuote.kind === "REVISION" ? "New total" : "Quoted total"} />
                </div>
              ) : null}
              {pendingQuote.kind === "REVISION" && approved?.totalCents != null ? (
                <p className="mt-2 text-sm text-ink-muted">Previously approved: {formatCents(approved.totalCents)}</p>
              ) : null}
              <form action={respondQuoteAction} className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input type="hidden" name="requestId" value={r.id} />
                <input type="hidden" name="quoteId" value={pendingQuote.id} />
                <SubmitButton name="decision" value="approve" size="lg" className="flex-1" pendingText="Saving…">
                  Approve {pendingQuote.totalCents != null ? formatCents(pendingQuote.totalCents) : ""}
                </SubmitButton>
                <ConfirmSubmit
                  name="decision"
                  value="decline"
                  variant="secondary"
                  size="lg"
                  message={
                    pendingQuote.kind === "REVISION"
                      ? "Decline the price change? The extra work won't be done."
                      : "Decline this quote? Your request will be cancelled at no charge."
                  }
                >
                  Decline
                </ConfirmSubmit>
              </form>
              {pendingQuote.expiresAt ? (
                <p className="mt-2 text-xs text-ink-muted">
                  Quote valid until <LocalTime iso={pendingQuote.expiresAt.toISOString()} mode="time" />.
                </p>
              ) : null}
            </Card>
          ) : null}

          {awaitingPayment ? (
            <Card className="ring-2 ring-sea/40">
              <h2 className="text-lg font-semibold">Add a payment method</h2>
              <p className="mt-1 mb-4 text-sm text-ink-muted">We&apos;ll start contacting providers once your card is authorized.</p>
              {config.stripe.publishableKey() ? (
                <PaymentAuthorize requestId={r.id} publishableKey={config.stripe.publishableKey()!} />
              ) : (
                <Alert tone="warning">Payments are not configured.</Alert>
              )}
            </Card>
          ) : null}

          {status === "SEARCHING" ? (
            <Card>
              <div className="flex items-start gap-4">
                <span className="pulse-dot mt-1 flex size-10 shrink-0 items-center justify-center rounded-full bg-mint-50 text-sea">
                  <TruckIcon />
                </span>
                <div>
                  <h2 className="text-lg font-semibold">Finding a provider</h2>
                  <p className="mt-1 text-ink-muted">We&apos;re contacting verified providers near you. We&apos;ll show who&apos;s coming as soon as one accepts.</p>
                </div>
              </div>
            </Card>
          ) : null}

          {status === "NO_PROVIDER_AVAILABLE" ? (
            <Card className="ring-2 ring-gold">
              <h2 className="text-lg font-semibold">No provider is available right now</h2>
              <p className="mt-1 text-ink-muted">We&apos;re sorry. No verified provider accepted your request yet. Here&apos;s what you can do:</p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <form action={retrySearchAction}>
                  <input type="hidden" name="requestId" value={r.id} />
                  <SubmitButton size="lg" className="w-full" pendingText="Searching…">
                    Search again
                  </SubmitButton>
                </form>
                <LinkButton href={`/help?request=${r.number}#contact`} variant="secondary" size="lg">
                  Contact support
                </LinkButton>
              </div>
              <p className="mt-3 text-sm text-ink-muted">Cancelling now is free. If you feel unsafe, call 911.</p>
            </Card>
          ) : null}

          {status === "CANCELLED" ? (
            <Alert tone="info" title="This request was cancelled">
              {r.cancelReason ? `Reason: ${r.cancelReason}. ` : ""}
              {r.cancellationFeeCents ? `A cancellation fee of ${formatCents(r.cancellationFeeCents)} applied.` : "No cancellation fee applied."}
            </Alert>
          ) : null}

          {/* Provider */}
          {provider && ["ASSIGNED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS", "COMPLETED"].includes(status) ? (
            <Card>
              <h2 className="text-lg font-semibold">Your provider</h2>
              <div className="mt-4 flex items-start gap-4">
                <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-deep text-xl font-bold text-white" aria-hidden>
                  {provider.user.name.charAt(0)}
                </span>
                <div className="min-w-0">
                  <p className="text-lg font-semibold text-deep">{provider.user.name.split(" ")[0]}</p>
                  <p className="text-ink-muted">{provider.businessName}</p>
                  {provider.verificationStatus === "APPROVED" ? (
                    <Badge tone="ok" className="mt-1">
                      <ShieldIcon className="size-3.5" /> Verified provider
                    </Badge>
                  ) : null}
                </div>
              </div>
              <DescriptionList
                items={[
                  ["Truck", [provider.truckColor, provider.truckYear, provider.truckMake, provider.truckModel].filter(Boolean).join(" ") || "Not provided"],
                  ["Plate", provider.truckPlate ?? "Not provided"],
                  ["Jobs completed on Call Recon", String(provider.jobsCompleted)],
                ]}
              />
              {eta ? (
                <div className="mt-4 flex items-start gap-3 rounded-2xl bg-mint-50 p-4">
                  <ClockIcon className="mt-0.5 shrink-0 text-sea" />
                  {eta.kind === "live" ? (
                    <p>
                      <span className="font-semibold">About {eta.minutes} min away</span>
                      <span className="block text-sm text-ink-muted">
                        Live estimate from your driver&apos;s shared location at <LocalTime iso={eta.locationAt.toISOString()} mode="time" />.
                      </span>
                    </p>
                  ) : eta.kind === "driver" ? (
                    <p>
                      <span className="font-semibold">Driver&apos;s estimate: about {eta.minutes} min</span>
                      <span className="block text-sm text-ink-muted">
                        Provided by your driver at <LocalTime iso={eta.setAt.toISOString()} mode="time" />. Not live tracking.
                      </span>
                    </p>
                  ) : (
                    <p className="text-sm text-ink-muted">{eta.reason}</p>
                  )}
                </div>
              ) : null}
              {eta?.kind === "live" && config.maps.mapboxPublicToken() && r.pickupLat != null && r.pickupLng != null ? (
                <div className="mt-4">
                  <MapPicker
                    token={config.maps.mapboxPublicToken()}
                    readOnly
                    value={{ lat: r.pickupLat, lng: r.pickupLng }}
                    secondary={{
                      ...eta.driver,
                      label: "Driver (last shared location)",
                    }}
                    label="Map showing your location and your driver's last shared location"
                  />
                </div>
              ) : null}
            </Card>
          ) : null}

          {provider && ["ASSIGNED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"].includes(status) ? (
            <Card>
              <h2 className="text-lg font-semibold">Message your driver</h2>
              <p className="mt-1 mb-3 text-sm text-ink-muted">Messages go through Call Recon so your phone number stays private. In-app calling is not available yet.</p>
              <MessagesPanel requestId={r.id} messages={r.messages} viewerId={user.id} canSend back={back} />
            </Card>
          ) : null}

          {status === "COMPLETED" ? (
            <Card>
              <h2 className="text-lg font-semibold">Service completed</h2>
              {r.completionNotes ? <p className="mt-1 text-ink-muted">Driver notes: {r.completionNotes}</p> : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {r.receipt ? (
                  <LinkButton href={`/requests/${r.id}/receipt`} variant="secondary">
                    View receipt
                  </LinkButton>
                ) : null}
                <LinkButton href={`/help?request=${r.number}#contact`} variant="ghost">
                  Report a problem
                </LinkButton>
              </div>
              {r.review ? (
                <p className="mt-4 text-sm text-ink-muted">You rated this service {r.review.rating} out of 5. Thank you.</p>
              ) : (
                <form action={reviewAction} className="mt-5 space-y-3 border-t border-line pt-5">
                  <input type="hidden" name="requestId" value={r.id} />
                  <fieldset>
                    <legend className="font-semibold text-deep">How was your service?</legend>
                    <div className="mt-2 flex gap-2">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <label
                          key={n}
                          className="flex size-12 cursor-pointer items-center justify-center rounded-xl bg-soft font-semibold ring-1 ring-line has-[:checked]:bg-deep has-[:checked]:text-white has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-sea"
                        >
                          <input type="radio" name="rating" value={n} required className="sr-only" />
                          {n}
                          <span className="sr-only"> out of 5</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <Field label="Comments" htmlFor="comment">
                    <Textarea id="comment" name="comment" maxLength={1000} />
                  </Field>
                  <SubmitButton variant="secondary">Submit review</SubmitButton>
                </form>
              )}
            </Card>
          ) : null}

          {/* Details */}
          <Card>
            <h2 className="text-lg font-semibold">Request details</h2>
            <DescriptionList
              items={[
                [
                  "Pickup",
                  r.locationPurgedAt
                    ? "Removed under data retention policy"
                    : [r.pickupLine1, r.pickupCity, `${r.pickupState ?? ""} ${r.pickupZip ?? ""}`].filter(Boolean).join(", "),
                ],
                ...(r.pickupLandmarks ? ([["Landmarks", r.pickupLandmarks]] as [string, string][]) : []),
                ...(r.destLine1 ? ([["Destination", [r.destLine1, r.destCity, `${r.destState} ${r.destZip}`].join(", ")]] as [string, string][]) : []),
                ["Vehicle", `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.color ? ` · ${vehicle.color}` : ""}`],
                ["Situation", SITUATIONS.find((s) => s.value === r.situation)?.label ?? r.situation],
                ["Safe location", r.isSafeLocation ? "Yes" : "No"],
              ]}
            />
            {r.files.filter((f) => f.purpose === "REQUEST_PHOTO").length ? (
              <div className="mt-4">
                <p className="text-sm text-ink-muted">Your photos</p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {r.files
                    .filter((f) => f.purpose === "REQUEST_PHOTO")
                    .map((f, i) => (
                      <li key={f.id}>
                        <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/api/files/${f.id}`} alt={`Photo ${i + 1} of the vehicle`} className="size-20 rounded-xl object-cover ring-1 ring-line" />
                        </a>
                      </li>
                    ))}
                </ul>
              </div>
            ) : null}
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <Card>
            <h2 className="mb-4 text-lg font-semibold">Status</h2>
            <StatusTimeline status={r.status} history={r.statusHistory} />
          </Card>

          <Card>
            <h2 className="text-lg font-semibold">{status === "COMPLETED" ? "Final price" : "Price"}</h2>
            {breakdown ? (
              <div className="mt-3">
                <PriceTable breakdown={breakdown} compact label={status === "COMPLETED" ? "Final total" : approved?.kind === "ESTIMATE" ? "Estimated total" : "Approved total"} />
              </div>
            ) : (
              <p className="mt-2 text-sm text-ink-muted">Waiting for a confirmed quote.</p>
            )}
            {r.payments.map((p) => (
              <p key={p.id} className="mt-3 text-xs text-ink-muted">
                Payment: {p.status === "DEMO_NOT_CHARGED" ? "Demo, nothing charged" : p.status.replace(/_/g, " ").toLowerCase()} ({formatCents(p.amountCents)})
              </p>
            ))}
            {!stripeConfigured() && !r.isDemo && status === "COMPLETED" ? <p className="mt-3 text-xs text-ink-muted">Payment was not collected through Call Recon.</p> : null}
          </Card>

          {active && status !== "NO_PROVIDER_AVAILABLE" ? (
            <Card id="share" className="scroll-mt-24">
              <h2 className="text-lg font-semibold">Share status</h2>
              <p className="mt-1 text-sm text-ink-muted">
                Send a family member a link showing your status and provider. It doesn&apos;t include your address and expires in 24 hours.
              </p>
              {sp.share ? (
                <div className="mt-3 space-y-2">
                  <p className="break-all rounded-xl bg-soft p-3 font-mono text-xs">{sp.share}</p>
                  <CopyButton text={sp.share} label="Copy or share link" />
                </div>
              ) : null}
              <form action={shareAction} className="mt-3 flex flex-wrap gap-2">
                <input type="hidden" name="requestId" value={r.id} />
                <SubmitButton variant="secondary" size="sm" name="op" value="create">
                  Create link
                </SubmitButton>
                {r.shareLinks && r.shareLinks.length ? (
                  <SubmitButton variant="ghost" size="sm" name="op" value="revoke">
                    Turn off links
                  </SubmitButton>
                ) : null}
              </form>
            </Card>
          ) : null}

          <Card>
            <h2 className="text-lg font-semibold">Need help?</h2>
            <div className="mt-3 space-y-2 text-sm">
              <p className="flex items-center gap-2">
                <PhoneIcon className="size-4 text-sea" />
                {settings.business.supportPhone ? <a href={`tel:${settings.business.supportPhone}`}>{settings.business.supportPhone}</a> : <Placeholder>Support phone</Placeholder>}
              </p>
              <Link href={`/help?request=${r.number}#contact`}>Contact support about this request</Link>
              <p className="pt-1 text-ink-muted">In an emergency, call 911.</p>
            </div>
          </Card>

          {terms.customerCanCancel ? (
            <Card>
              <h2 className="text-lg font-semibold">Cancel request</h2>
              <p className="mt-1 text-sm text-ink-muted">
                {terms.feeCents > 0
                  ? `A ${formatCents(terms.feeCents)} cancellation fee applies because a provider is already assigned.`
                  : status === "ASSIGNED" || status === "EN_ROUTE"
                    ? terms.feeConfigured
                      ? `No fee if you cancel now. A fee may apply after ${terms.freeCancellationMinutes} minutes from assignment.`
                      : "No cancellation fee applies."
                    : "Cancelling now is free."}
              </p>
              <form action={cancelRequestAction} className="mt-3 space-y-3">
                <input type="hidden" name="requestId" value={r.id} />
                <Field label="Reason" htmlFor="cancel-reason" required>
                  <Select id="cancel-reason" name="reason" required defaultValue="">
                    <option value="" disabled>
                      Choose a reason
                    </option>
                    <option>Vehicle started / problem solved</option>
                    <option>Found other help</option>
                    <option>Wait time too long</option>
                    <option>Price too high</option>
                    <option>Requested by mistake</option>
                    <option>Other</option>
                  </Select>
                </Field>
                <ConfirmSubmit
                  variant="danger"
                  className="w-full"
                  message={terms.feeCents > 0 ? `Cancel and pay the ${formatCents(terms.feeCents)} cancellation fee?` : "Cancel this request?"}
                  pendingText="Cancelling…"
                >
                  Cancel request
                </ConfirmSubmit>
              </form>
            </Card>
          ) : status === "ARRIVED" || status === "IN_PROGRESS" ? (
            <p className="px-2 text-sm text-ink-muted">Your driver has arrived, so changes go through support.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
