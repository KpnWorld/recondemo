import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePagePermission } from "@/lib/auth/current";
import { can } from "@/lib/permissions";
import { isAppError } from "@/lib/errors";
import { formatCents } from "@/lib/money";
import { SITUATIONS, type RequestStatus } from "@/lib/constants";
import { getRequestDetail, cancellationTerms } from "@/lib/services/requests";
import { previewMatches, sweepDispatch } from "@/lib/services/dispatch";
import { MATCH_REASON_LABELS } from "@/lib/services/matching";
import { parseBreakdown } from "@/lib/services/pricing";
import { adminCancelAction, adminReleaseAction, adminRevisionAction, adminStatusAction, assignAction, quoteAction, refundAction, retryDispatchAction } from "@/app/actions/admin";
import { Alert, Badge, Card, Checkbox, DescriptionList, Field, Flash, Input, PageHeader, Select, StatusBadge, Table, Td, Textarea } from "@/components/ui";
import { AutoRefresh, ConfirmSubmit, LocalTime, SubmitButton } from "@/components/client";
import { StatusTimeline } from "@/components/timeline";
import { PriceTable } from "@/components/price";
import { MessagesPanel } from "@/components/messages";

export const metadata: Metadata = { title: "Request detail" };

const NEXT: Partial<Record<RequestStatus, RequestStatus>> = {
  ASSIGNED: "EN_ROUTE",
  EN_ROUTE: "ARRIVED",
  ARRIVED: "IN_PROGRESS",
  IN_PROGRESS: "COMPLETED",
};
const QUOTE_LABEL: Record<string, string> = {
  ESTIMATE: "Instant estimate",
  CONFIRMED: "Confirmed quote",
  REVISION: "Price change",
};

export default async function AdminRequestDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePagePermission("requests.view");
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
  const back = `/admin/requests/${r.id}`;
  const vehicle = JSON.parse(r.vehicleSnapshot) as Record<string, string | number | undefined>;
  const assignment = r.assignments.find((a) => a.active);
  const approved = [...r.quotes].reverse().find((q) => q.status === "APPROVED");
  const pendingQuote = r.quotes.find((q) => q.status === "PENDING_APPROVAL");
  const needsQuote = status === "SUBMITTED" && !approved && !pendingQuote;
  const canAssign =
    can(user, "dispatch.assign") && (["SEARCHING", "NO_PROVIDER_AVAILABLE", "ASSIGNED", "EN_ROUTE"].includes(status) || (status === "SUBMITTED" && Boolean(approved)));
  const matches = canAssign ? await previewMatches(user, r.id) : null;
  const terms = await cancellationTerms(r.id);
  const situation = SITUATIONS.find((s) => s.value === r.situation)?.label ?? r.situation;
  const pickup = [r.pickupLine1, r.pickupCity, r.pickupState, r.pickupZip].filter(Boolean).join(", ");
  const dest = [r.destLine1, r.destCity, r.destState, r.destZip].filter(Boolean).join(", ");
  const active = !["COMPLETED", "CANCELLED"].includes(status);
  const offers =
    "offers" in r && Array.isArray(r.offers)
      ? (r.offers as unknown as {
          id: string;
          status: string;
          round: number;
          distanceMiles: number | null;
          createdAt: Date;
          provider: { businessName: string };
        }[])
      : [];

  return (
    <>
      {active ? <AutoRefresh seconds={20} /> : null}
      <p className="mb-2 text-sm">
        <Link href="/admin/requests">← All requests</Link>
      </p>
      <PageHeader
        eyebrow={r.number}
        title={r.serviceCategory.name}
        actions={
          <>
            {r.isDemo ? <Badge>Demo data</Badge> : null}
            <StatusBadge status={status} />
          </>
        }
      />
      <Flash {...sp} />
      {!r.isSafeLocation && active ? (
        <Alert tone="error" className="mb-5" title="Customer reported an unsafe location">
          Prioritize this request and remind the customer to call 911 if anyone is in danger.
        </Alert>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr] [&>*]:min-w-0">
        <div className="space-y-5">
          {needsQuote && can(user, "quotes.manage") ? (
            <Card className="ring-2 ring-gold">
              <h2 className="text-lg font-semibold">Send a confirmed quote</h2>
              <p className="mt-1 text-sm text-ink-muted">
                An instant estimate wasn&apos;t possible (for example, towing distance couldn&apos;t be calculated). Enter the confirmed miles to apply the configured pricing rule,
                and/or itemized charges. The customer must approve before dispatch.
              </p>
              <form action={quoteAction} className="mt-4 space-y-3">
                <input type="hidden" name="requestId" value={r.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Confirmed towing miles" htmlFor="miles">
                    <Input id="miles" name="miles" type="number" step="0.1" min={0} />
                  </Field>
                  <Field label="Tax % (only if no pricing rule)" htmlFor="taxPercent">
                    <Input id="taxPercent" name="taxPercent" type="number" step="0.01" min={0} max={30} />
                  </Field>
                </div>
                <p className="text-sm font-semibold text-deep">Additional itemized charges</p>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="grid grid-cols-[1fr_8rem] gap-2">
                    <label className="sr-only" htmlFor={`label_${i}`}>
                      Charge {i + 1} label
                    </label>
                    <Input id={`label_${i}`} name={`label_${i}`} placeholder="Label, e.g. Dolly fee" />
                    <label className="sr-only" htmlFor={`amount_${i}`}>
                      Charge {i + 1} amount
                    </label>
                    <Input id={`amount_${i}`} name={`amount_${i}`} type="number" step="0.01" placeholder="USD" />
                  </div>
                ))}
                <Field label="Note to customer" htmlFor="note">
                  <Textarea id="note" name="note" maxLength={500} />
                </Field>
                <SubmitButton>Send quote for approval</SubmitButton>
              </form>
            </Card>
          ) : null}

          {canAssign && matches ? (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">{assignment ? "Reassign provider" : "Dispatch"}</h2>
                {["SEARCHING", "NO_PROVIDER_AVAILABLE"].includes(status) || (status === "SUBMITTED" && approved) ? (
                  <form action={retryDispatchAction}>
                    <input type="hidden" name="requestId" value={r.id} />
                    <SubmitButton variant="secondary" size="sm">
                      {status === "SEARCHING" ? "Send next round of offers" : "Start automatic dispatch"}
                    </SubmitButton>
                  </form>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-ink-muted">
                Automatic matches are verified, online providers who cover this location. Manual assignment can include verified providers who are offline or outside their usual
                area. Confirm with them first.
              </p>
              <h3 className="mt-4 text-sm font-semibold">Online matches ({matches.online.eligible.length})</h3>
              {matches.online.eligible.length ? (
                <ul className="mt-2 divide-y divide-line text-sm">
                  {matches.online.eligible.slice(0, 8).map((m) => (
                    <li key={m.provider.id} className="flex justify-between gap-3 py-2">
                      <Link href={`/admin/providers/${m.provider.id}`}>{m.provider.businessName}</Link>
                      <span className="text-ink-muted">
                        {m.distanceMiles != null ? `${m.distanceMiles.toFixed(1)} mi` : "ZIP coverage"}
                        {m.acceptanceRate != null ? ` · ${Math.round(m.acceptanceRate * 100)}% acceptance` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-ink-muted">No verified provider is online and in range.</p>
              )}
              <form action={assignAction} className="mt-4 grid gap-3 rounded-2xl bg-soft p-4 sm:grid-cols-2">
                <input type="hidden" name="requestId" value={r.id} />
                <Field label="Assign provider" htmlFor="providerId" required>
                  <Select id="providerId" name="providerId" required defaultValue="">
                    <option value="" disabled>
                      Choose a verified provider…
                    </option>
                    {matches.manual.eligible.map((m) => (
                      <option key={m.provider.id} value={m.provider.id}>
                        {m.provider.businessName}
                        {m.provider.isOnline ? " (online)" : " (offline)"}
                        {m.distanceMiles != null ? ` · ${m.distanceMiles.toFixed(1)} mi` : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Reason" htmlFor="assign-reason" required>
                  <Input id="assign-reason" name="reason" required placeholder="e.g. Confirmed by phone" />
                </Field>
                <div className="sm:col-span-2">
                  <ConfirmSubmit message="Assign this provider? They and the customer will be notified.">Assign provider</ConfirmSubmit>
                </div>
              </form>
              {matches.manual.excluded.length ? (
                <details className="mt-4 text-sm">
                  <summary className="cursor-pointer font-semibold text-deep">Why other providers aren&apos;t eligible ({matches.manual.excluded.length})</summary>
                  <ul className="mt-2 space-y-1">
                    {matches.manual.excluded.map((x) => (
                      <li key={x.provider.id}>
                        <span className="font-medium">{x.provider.businessName}</span>: {x.reasons.map((reason) => MATCH_REASON_LABELS[reason]).join(", ")}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </Card>
          ) : null}

          <Card>
            <h2 className="mb-2 text-lg font-semibold">Request details</h2>
            <DescriptionList
              items={[
                ["Customer", `${r.customer.name}${r.customer.phone ? ` · ${r.customer.phone}` : ""}`],
                ["Pickup", pickup || (r.locationPurgedAt ? "Removed under data retention policy" : "Pin only")],
                ["Pin", r.pickupLat != null ? `${r.pickupLat.toFixed(5)}, ${r.pickupLng?.toFixed(5)} (${r.pickupSource ?? "unknown source"})` : "—"],
                ...(r.pickupLandmarks ? ([["Landmarks", r.pickupLandmarks]] as [string, string][]) : []),
                ...(r.serviceCategory.requiresDestination ? ([["Destination", dest || "—"]] as [string, string][]) : []),
                [
                  "Vehicle",
                  `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.color ? `, ${vehicle.color}` : ""}${vehicle.vehicleType ? ` · ${vehicle.vehicleType}` : ""}${vehicle.drivetrain ? ` · ${vehicle.drivetrain}` : ""}`,
                ],
                ["Situation", `${situation}${r.isSafeLocation ? "" : " · UNSAFE LOCATION"}`],
                ...(r.situationNotes ? ([["Notes", r.situationNotes]] as [string, string][]) : []),
                ...(r.vehicleAccessible ? ([["Access", r.vehicleAccessible]] as [string, string][]) : []),
                ["Created", <LocalTime key="c" iso={r.createdAt.toISOString()} />],
                ...(r.cancelReason ? ([["Cancel reason", r.cancelReason]] as [string, string][]) : []),
                ...(r.completionNotes ? ([["Completion notes", r.completionNotes]] as [string, string][]) : []),
              ]}
            />
            {r.files.length ? (
              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                {r.files.map((f, i) => (
                  <a key={f.id} href={`/api/files/${f.id}`} target="_blank" rel="noreferrer">
                    {f.purpose === "REQUEST_PHOTO" ? "Customer photo" : "Job documentation"} {i + 1}
                  </a>
                ))}
              </div>
            ) : null}
            {r.review ? (
              <p className="mt-3 text-sm">
                Customer rating: <strong>{r.review.rating}/5</strong>
                {r.review.comment ? ` · “${r.review.comment}”` : ""}
              </p>
            ) : null}
          </Card>

          <Card>
            <h2 className="mb-3 text-lg font-semibold">Messages</h2>
            <MessagesPanel requestId={r.id} messages={r.messages} viewerId={user.id} canSend={can(user, "support.manage") && active} back={back} />
          </Card>

          {offers.length ? (
            <Card>
              <h2 className="mb-2 text-lg font-semibold">Offers sent</h2>
              <Table head={["Provider", "Round", "Distance", "Sent", "Result"]} caption="Job offers">
                {offers.map((o) => (
                  <tr key={o.id}>
                    <Td>{o.provider.businessName}</Td>
                    <Td>{o.round}</Td>
                    <Td>{o.distanceMiles != null ? `${o.distanceMiles} mi` : "—"}</Td>
                    <Td>
                      <LocalTime iso={o.createdAt.toISOString()} mode="time" />
                    </Td>
                    <Td>{o.status.toLowerCase()}</Td>
                  </tr>
                ))}
              </Table>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          <Card>
            <h2 className="mb-2 text-lg font-semibold">Provider</h2>
            {assignment ? (
              <>
                <p className="font-semibold">
                  <Link href={`/admin/providers/${assignment.providerId}`}>{assignment.provider.businessName}</Link>
                </p>
                <p className="text-sm text-ink-muted">
                  {assignment.provider.user.name} · {assignment.method === "MANUAL_ADMIN" ? "assigned by dispatch" : "accepted offer"}
                </p>
                {r.driverEtaMinutes ? (
                  <p className="mt-1 text-sm">
                    Driver&apos;s estimate: {r.driverEtaMinutes} min (set <LocalTime iso={r.driverEtaSetAt!.toISOString()} mode="time" />)
                  </p>
                ) : null}
                {NEXT[status] && can(user, "requests.override_status") ? (
                  <form action={adminStatusAction} className="mt-4 space-y-2">
                    <input type="hidden" name="requestId" value={r.id} />
                    <input type="hidden" name="to" value={NEXT[status]} />
                    {NEXT[status] === "COMPLETED" ? (
                      <Field label="Completion notes" htmlFor="admin-notes">
                        <Textarea id="admin-notes" name="notes" maxLength={2000} />
                      </Field>
                    ) : null}
                    <ConfirmSubmit variant="secondary" size="sm" message="Override the status on the provider's behalf? This is recorded in the audit log.">
                      Mark as {NEXT[status]!.replace("_", " ").toLowerCase()}
                    </ConfirmSubmit>
                  </form>
                ) : null}
                {["ASSIGNED", "EN_ROUTE"].includes(status) && can(user, "dispatch.assign") ? (
                  <form action={adminReleaseAction} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
                    <input type="hidden" name="requestId" value={r.id} />
                    <Field label="Release reason" htmlFor="rel-reason" required className="flex-1">
                      <Input id="rel-reason" name="reason" required />
                    </Field>
                    <ConfirmSubmit variant="danger" size="sm" message="Release this provider and search again?">
                      Release
                    </ConfirmSubmit>
                  </form>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-ink-muted">No provider assigned.</p>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 text-lg font-semibold">Pricing</h2>
            {r.quotes.length ? (
              <ul className="space-y-4">
                {r.quotes.map((q) => {
                  const b = parseBreakdown(q.breakdown);
                  return (
                    <li key={q.id} className="rounded-2xl bg-soft p-3">
                      <p className="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="font-semibold">{QUOTE_LABEL[q.kind] ?? q.kind}</span>
                        <Badge tone={q.status === "APPROVED" ? "ok" : q.status === "PENDING_APPROVAL" || q.status === "NEEDS_CONFIRMATION" ? "gold" : "neutral"}>
                          {q.status.replace(/_/g, " ").toLowerCase()}
                        </Badge>
                      </p>
                      {q.reason ? <p className="mb-1 text-xs text-ink-muted">{q.reason}</p> : null}
                      {b ? <PriceTable breakdown={b} compact label="Total" /> : <p className="text-sm text-ink-muted">Needs dispatcher confirmation.</p>}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-ink-muted">No quotes.</p>
            )}
            {["ASSIGNED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"].includes(status) && can(user, "quotes.manage") && !pendingQuote ? (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-semibold text-deep">Propose a price change</summary>
                <form action={adminRevisionAction} className="mt-3 space-y-3">
                  <input type="hidden" name="requestId" value={r.id} />
                  <Field label="Item" htmlFor="arev-label" required>
                    <Input id="arev-label" name="label" required />
                  </Field>
                  <Field label="Amount (USD, negative for a credit)" htmlFor="arev-amount" required>
                    <Input id="arev-amount" name="amount" type="number" step="0.01" required />
                  </Field>
                  <Field label="Reason" htmlFor="arev-reason" required>
                    <Textarea id="arev-reason" name="reason" required />
                  </Field>
                  <SubmitButton variant="secondary" size="sm">
                    Send to customer
                  </SubmitButton>
                </form>
              </details>
            ) : null}
          </Card>

          <Card>
            <h2 className="mb-3 text-lg font-semibold">Payments</h2>
            {r.payments.length ? (
              <ul className="space-y-3 text-sm">
                {r.payments.map((p) => (
                  <li key={p.id} className="rounded-2xl bg-soft p-3">
                    <p className="flex justify-between gap-2">
                      <span>
                        {p.processor === "DEMO" ? "Demo (not charged)" : "Stripe"} · {p.status.replace(/_/g, " ").toLowerCase()}
                      </span>
                      <span className="font-semibold tabular-nums">{formatCents(p.amountCents)}</span>
                    </p>
                    <p className="text-xs text-ink-muted">
                      Captured {formatCents(p.capturedCents)} · refunded {formatCents(p.refundedCents)}
                      {p.processorRef ? ` · ${p.processorRef}` : ""}
                    </p>
                    {p.failureReason ? <p className="text-xs text-danger">{p.failureReason}</p> : null}
                    {p.refunds.map((rf) => (
                      <p key={rf.id} className="text-xs">
                        Refund {formatCents(rf.amountCents)} · {rf.status.replace(/_/g, " ").toLowerCase()} · {rf.reason}
                      </p>
                    ))}
                    {can(user, "payments.manage") && (p.processor === "DEMO" || ["SUCCEEDED", "PARTIALLY_REFUNDED"].includes(p.status)) ? (
                      <form action={refundAction} className="mt-2 grid gap-2 sm:grid-cols-[7rem_1fr_auto] sm:items-end">
                        <input type="hidden" name="paymentId" value={p.id} />
                        <input type="hidden" name="back" value={back} />
                        <Field label="Amount" htmlFor={`rf-amt-${p.id}`} required>
                          <Input id={`rf-amt-${p.id}`} name="amount" type="number" step="0.01" min={0.01} required />
                        </Field>
                        <Field label="Reason" htmlFor={`rf-r-${p.id}`} required>
                          <Input id={`rf-r-${p.id}`} name="reason" required />
                        </Field>
                        <ConfirmSubmit variant="danger" size="sm" message="Issue this refund?">
                          Refund
                        </ConfirmSubmit>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-muted">No payment records.</p>
            )}
            {r.receipt ? (
              <p className="mt-3 text-sm">
                Receipt <Link href={`/requests/${r.id}/receipt`}>{r.receipt.number}</Link> (customer view)
              </p>
            ) : null}
          </Card>

          <Card>
            <h2 className="mb-3 text-lg font-semibold">Timeline</h2>
            <StatusTimeline status={status} history={r.statusHistory} />
          </Card>

          {active && can(user, "requests.cancel") ? (
            <Card>
              <h2 className="text-lg font-semibold">Cancel request</h2>
              <form action={adminCancelAction} className="mt-3 space-y-3">
                <input type="hidden" name="requestId" value={r.id} />
                <Field label="Reason (shown to the customer)" htmlFor="cancel-reason" required>
                  <Input id="cancel-reason" name="reason" required />
                </Field>
                {terms.feeCents > 0 ? (
                  <Checkbox name="chargeFee" value="true" label={`Charge the ${formatCents(terms.feeCents)} cancellation fee`} description="Leave unchecked to waive it." />
                ) : null}
                <ConfirmSubmit variant="danger" message="Cancel this request? The customer and provider will be notified.">
                  Cancel request
                </ConfirmSubmit>
              </form>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
