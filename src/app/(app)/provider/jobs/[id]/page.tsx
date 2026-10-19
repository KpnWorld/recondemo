import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/auth/current";
import { isAppError } from "@/lib/errors";
import { SITUATIONS, ASSIGNED_STATUSES, type RequestStatus } from "@/lib/constants";
import { getRequestDetail } from "@/lib/services/requests";
import { parseBreakdown } from "@/lib/services/pricing";
import { formatCents } from "@/lib/money";
import { hasCoords } from "@/lib/geo";
import { jobDocAction, jobStatusAction, releaseJobAction, revisionAction } from "@/app/actions/provider";
import { Alert, Card, DescriptionList, Field, Flash, Input, LinkButton, PageHeader, StatusBadge, Textarea, buttonClass } from "@/components/ui";
import { AutoRefresh, ConfirmSubmit, LocalTime, SubmitButton } from "@/components/client";
import { StatusTimeline } from "@/components/timeline";
import { PriceTable } from "@/components/price";
import { MessagesPanel } from "@/components/messages";
import { NavigationIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Job details" };

const NEXT_STEP: Partial<Record<RequestStatus, { to: RequestStatus; label: string }>> = {
  ASSIGNED: { to: "EN_ROUTE", label: "I'm on my way" },
  EN_ROUTE: { to: "ARRIVED", label: "I've arrived" },
  ARRIVED: { to: "IN_PROGRESS", label: "Start service" },
  IN_PROGRESS: { to: "COMPLETED", label: "Mark job complete" },
};

function directionsUrl(lat: number | null, lng: number | null, address: string | null) {
  if (lat != null && lng != null) return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  if (address) return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
  return null;
}

export default async function ProviderJobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePageUser(["PROVIDER"], `/provider/jobs/${id}`);
  let detail;
  try {
    detail = await getRequestDetail(user, id);
  } catch (e) {
    if (isAppError(e) && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const { relation, request: r } = detail;
  const status = r.status as RequestStatus;
  const assigned = relation === "ASSIGNED_PROVIDER" && ASSIGNED_STATUSES.includes(status);
  const vehicle = JSON.parse(r.vehicleSnapshot) as {
    year: number;
    make: string;
    model: string;
    color?: string;
    vehicleType?: string;
    drivetrain?: string;
    plate?: string;
  };
  const approved = [...r.quotes].reverse().find((q) => q.status === "APPROVED");
  const pending = r.quotes.find((q) => q.status === "PENDING_APPROVAL");
  const breakdown = parseBreakdown(approved?.breakdown);
  const pickupAddress = [r.pickupLine1, r.pickupCity, r.pickupState, r.pickupZip].filter(Boolean).join(", ");
  const destAddress = [r.destLine1, r.destCity, r.destState, r.destZip].filter(Boolean).join(", ");
  const toPickup = ["ASSIGNED", "EN_ROUTE", "ARRIVED"].includes(status);
  const nav = toPickup
    ? directionsUrl(r.pickupLat, r.pickupLng, r.pickupLine1 ? pickupAddress : null)
    : r.serviceCategory.requiresDestination
      ? directionsUrl(r.destLat, r.destLng, r.destLine1 ? destAddress : null)
      : null;
  const next = NEXT_STEP[status];
  const situation = SITUATIONS.find((s) => s.value === r.situation)?.label ?? r.situation;
  const back = `/provider/jobs/${r.id}`;
  const jobDocs = r.files.filter((f) => f.purpose === "JOB_DOCUMENTATION");
  const photos = r.files.filter((f) => f.purpose === "REQUEST_PHOTO");

  return (
    <>
      {assigned ? <AutoRefresh seconds={20} /> : null}
      <p className="mb-2 text-sm">
        <Link href="/provider">← Back to dashboard</Link>
      </p>
      <PageHeader eyebrow={r.number} title={r.serviceCategory.name} actions={<StatusBadge status={status} />} />
      <Flash {...sp} />
      {r.isDemo ? (
        <Alert tone="warning" className="mb-5" title="Demo job">
          This is sample data. No real customer is waiting and no money moves.
        </Alert>
      ) : null}
      {!assigned ? (
        <Alert tone="info" className="mb-5">
          {relation === "OFFERED_PROVIDER"
            ? "Accept this offer from your dashboard to see the exact location and customer details."
            : "This job is no longer active for you. Location and contact details are hidden."}
        </Alert>
      ) : null}
      {!r.isSafeLocation && assigned ? (
        <Alert tone="error" className="mb-5" title="Customer reported an unsafe location">
          Approach with care. If anyone is in danger, call 911.
        </Alert>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr] [&>*]:min-w-0">
        <div className="space-y-5">
          {assigned ? (
            <Card>
              <h2 className="text-lg font-semibold">Next step</h2>
              {nav ? (
                <a href={nav} target="_blank" rel="noreferrer" className={buttonClass("secondary", "lg", "mt-3 w-full")}>
                  <NavigationIcon /> Navigate to {toPickup ? "pickup" : "destination"}
                </a>
              ) : null}
              {next ? (
                <form action={jobStatusAction} className="mt-4 space-y-3">
                  <input type="hidden" name="requestId" value={r.id} />
                  <input type="hidden" name="to" value={next.to} />
                  {next.to === "EN_ROUTE" ? (
                    <Field label="Your arrival estimate (minutes)" htmlFor="eta" hint="Shown to the customer as your estimate, not a guarantee.">
                      <Input id="eta" name="eta" type="number" inputMode="numeric" min={1} max={240} />
                    </Field>
                  ) : null}
                  {next.to === "COMPLETED" ? (
                    <Field label="Completion notes" htmlFor="notes" hint="What was done, condition notes, where the vehicle was dropped off.">
                      <Textarea id="notes" name="notes" maxLength={2000} />
                    </Field>
                  ) : null}
                  {pending && next.to === "COMPLETED" ? <Alert tone="warning">Waiting for the customer to respond to your price change before you can complete.</Alert> : null}
                  <SubmitButton size="lg" className="w-full" disabled={Boolean(pending && next.to === "COMPLETED")}>
                    {next.label}
                  </SubmitButton>
                </form>
              ) : null}
            </Card>
          ) : null}

          <Card>
            <h2 className="mb-2 text-lg font-semibold">Job details</h2>
            <DescriptionList
              items={[
                ["Customer", r.customer.name],
                ["Pickup", assigned ? pickupAddress || "Location shared by pin (use Navigate)" : `${r.pickupCity ?? ""} ${r.pickupZip ?? ""}`.trim() || "Hidden"],
                ...(r.pickupLandmarks && assigned ? ([["Landmarks", r.pickupLandmarks]] as [string, string][]) : []),
                ...(r.serviceCategory.requiresDestination ? ([["Destination", assigned ? destAddress || "Not provided" : (r.destCity ?? "Hidden")]] as [string, string][]) : []),
                ["Vehicle", `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.color ? `, ${vehicle.color}` : ""}${vehicle.drivetrain ? ` · ${vehicle.drivetrain}` : ""}`],
                ...(vehicle.plate && assigned ? ([["Plate", vehicle.plate]] as [string, string][]) : []),
                ["Situation", situation],
                ...(r.situationNotes ? ([["Customer notes", r.situationNotes]] as [string, string][]) : []),
                ...(r.vehicleAccessible ? ([["Access notes", r.vehicleAccessible]] as [string, string][]) : []),
                ["Requested", <LocalTime key="t" iso={r.createdAt.toISOString()} />],
                ...(r.completionNotes ? ([["Completion notes", r.completionNotes]] as [string, string][]) : []),
              ]}
            />
            {hasCoords({ lat: r.pickupLat, lng: r.pickupLng }) && assigned ? (
              <p className="mt-2 text-xs text-ink-muted">
                Pin: {r.pickupLat!.toFixed(5)}, {r.pickupLng!.toFixed(5)}
              </p>
            ) : null}
            {photos.length && assigned ? (
              <div className="mt-4">
                <h3 className="mb-2 text-sm font-semibold">Customer photos</h3>
                <div className="flex flex-wrap gap-2">
                  {photos.map((f, i) => (
                    <a key={f.id} href={`/api/files/${f.id}`} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/files/${f.id}`} alt={`Customer photo ${i + 1}`} className="size-20 rounded-xl object-cover ring-1 ring-line" />
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>

          {assigned || relation === "PAST_PROVIDER" ? (
            <Card>
              <h2 className="mb-3 text-lg font-semibold">Messages with the customer</h2>
              <p className="mb-3 text-sm text-ink-muted">Phone numbers stay private. Messages are kept with the job record.</p>
              <MessagesPanel requestId={r.id} messages={r.messages} viewerId={user.id} canSend={assigned} back={back} />
            </Card>
          ) : null}

          {assigned ? (
            <Card>
              <h2 className="mb-1 text-lg font-semibold">Job documentation</h2>
              <p className="mb-3 text-sm text-ink-muted">Photos of the vehicle at pickup and drop-off, or signed paperwork (JPG, PNG, WebP or PDF, up to 10 MB).</p>
              {jobDocs.length ? (
                <ul className="mb-3 flex flex-wrap gap-2 text-sm">
                  {jobDocs.map((f, i) => (
                    <li key={f.id}>
                      <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer">
                        File {i + 1}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
              <form action={jobDocAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <input type="hidden" name="requestId" value={r.id} />
                <Field label="File" htmlFor="jobdoc" required className="flex-1">
                  <Input id="jobdoc" name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required className="py-2.5" />
                </Field>
                <SubmitButton variant="secondary" pendingText="Uploading">
                  Upload
                </SubmitButton>
              </form>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          <Card>
            <h2 className="mb-3 text-lg font-semibold">Price</h2>
            {breakdown ? (
              <PriceTable breakdown={breakdown} compact label={status === "COMPLETED" ? "Final total" : "Approved total"} />
            ) : (
              <p className="text-sm text-ink-muted">No approved price on file.</p>
            )}
            {pending ? (
              <Alert tone="info" className="mt-3">
                Price change of {formatCents(pending.totalCents)} total is waiting for the customer.
              </Alert>
            ) : null}
            {assigned && !pending ? (
              <details className="mt-4 rounded-2xl bg-soft p-4">
                <summary className="cursor-pointer font-semibold text-deep">Request a price change</summary>
                <p className="mt-2 text-sm text-ink-muted">Use only when the job differs from what was described. The customer must approve before the new price applies.</p>
                <form action={revisionAction} className="mt-3 space-y-3">
                  <input type="hidden" name="requestId" value={r.id} />
                  <Field label="Item" htmlFor="rev-label" required>
                    <Input id="rev-label" name="label" required maxLength={80} placeholder="e.g. Extra winching time" />
                  </Field>
                  <Field label="Amount (USD)" htmlFor="rev-amount" required hint="Use a negative amount for a reduction.">
                    <Input id="rev-amount" name="amount" type="number" step="0.01" required />
                  </Field>
                  <Field label="Reason shown to the customer" htmlFor="rev-reason" required>
                    <Textarea id="rev-reason" name="reason" required maxLength={500} />
                  </Field>
                  <SubmitButton variant="secondary">Send for approval</SubmitButton>
                </form>
              </details>
            ) : null}
          </Card>

          <Card>
            <h2 className="mb-3 text-lg font-semibold">Progress</h2>
            <StatusTimeline status={status} history={r.statusHistory} />
          </Card>

          {assigned && ["ASSIGNED", "EN_ROUTE"].includes(status) ? (
            <Card>
              <h2 className="text-lg font-semibold">Can&apos;t complete this job?</h2>
              <p className="mt-1 text-sm text-ink-muted">
                Releasing sends the job back to dispatch so another provider can be found. Frequent releases affect your reliability score.
              </p>
              <form action={releaseJobAction} className="mt-3 space-y-3">
                <input type="hidden" name="requestId" value={r.id} />
                <Field label="Reason" htmlFor="release-reason" required>
                  <Input id="release-reason" name="reason" required maxLength={300} />
                </Field>
                <ConfirmSubmit variant="danger" message="Release this job back to dispatch?">
                  Release job
                </ConfirmSubmit>
              </form>
            </Card>
          ) : null}
          <LinkButton href="/help" variant="ghost">
            Contact Call Recon support
          </LinkButton>
        </div>
      </div>
    </>
  );
}
