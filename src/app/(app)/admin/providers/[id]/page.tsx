import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePagePermission } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { DOCUMENT_TYPES, REQUIRED_DOCUMENT_TYPES, TRUCK_TYPES, VERIFICATION_TONE } from "@/lib/constants";
import { documentReviewAction, userStatusAction, verificationAction } from "@/app/actions/admin";
import { Alert, Badge, Card, Checkbox, DescriptionList, Field, Flash, Input, PageHeader, Select, StatusBadge, Table, Td, Textarea } from "@/components/ui";
import { ConfirmSubmit, LocalTime, SubmitButton } from "@/components/client";

export const metadata: Metadata = { title: "Provider" };

const DAY_NAMES: Record<string, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

export default async function AdminProvider({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePagePermission("providers.view");
  const p = await db.providerProfile.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          phoneVerified: true,
          status: true,
          createdAt: true,
          locationConsentAt: true,
        },
      },
      documents: {
        orderBy: { createdAt: "desc" },
        include: { file: { select: { originalName: true } } },
      },
      services: { include: { serviceCategory: true } },
      assignments: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          request: { select: { id: true, number: true, status: true } },
        },
      },
    },
  });
  if (!p) notFound();
  const canVerify = can(user, "providers.verify");
  const hours = JSON.parse(p.operatingHours || "{}") as Record<string, [string, string]>;
  const docLabel = (t: string) => DOCUMENT_TYPES.find((d) => d.value === t)?.label ?? t;
  const acceptance = p.offersReceived ? Math.round((p.offersAccepted / p.offersReceived) * 100) : null;

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/providers">← All providers</Link>
      </p>
      <PageHeader
        title={p.businessName}
        description={`${p.user.name} · ${p.user.email}`}
        actions={<Badge tone={VERIFICATION_TONE[p.verificationStatus as keyof typeof VERIFICATION_TONE] ?? "neutral"}>{p.verificationStatus.toLowerCase()}</Badge>}
      />
      <Flash {...sp} />
      {p.verificationNotes ? (
        <Alert tone="info" className="mb-5">
          Verification note: {p.verificationNotes}
        </Alert>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr] [&>*]:min-w-0">
        <div className="space-y-5">
          <Card>
            <h2 className="mb-2 text-lg font-semibold">Business & equipment</h2>
            <DescriptionList
              items={[
                ["Phone", `${p.user.phone ?? "—"}${p.user.phoneVerified ? " (verified)" : ""}${p.businessPhone ? ` · business ${p.businessPhone}` : ""}`],
                ["License / permit", p.licenseNumber ?? "—"],
                [
                  "Truck",
                  p.truckType
                    ? `${TRUCK_TYPES.find((t) => t.value === p.truckType)?.label} · ${p.truckYear ?? ""} ${p.truckMake ?? ""} ${p.truckModel ?? ""}${p.truckColor ? `, ${p.truckColor}` : ""}`
                    : "Not provided",
                ],
                ["Plate", p.truckPlate ?? "—"],
                ["Winch", p.canWinch ? "Yes" : "No"],
                [
                  "Coverage",
                  [
                    p.serviceZips ? `ZIPs ${p.serviceZips.split(",").join(", ")}` : null,
                    p.serviceRadiusMiles && p.baseLat != null ? `${p.serviceRadiusMiles} mi around ${p.baseAddress ?? `${p.baseLat.toFixed(3)}, ${p.baseLng?.toFixed(3)}`}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Not set",
                ],
                [
                  "Hours",
                  Object.keys(hours).length
                    ? Object.entries(hours)
                        .map(([d, [o, c]]) => `${DAY_NAMES[d]} ${o}–${c}`)
                        .join(", ")
                    : "Any time while online",
                ],
                [
                  "Availability",
                  `${p.isOnline ? "Online" : "Offline"}${p.lastLocationAt ? ` · last location ${p.lastLocationAt.toLocaleString("en-US", { timeZone: "America/New_York" })} ET` : ""}`,
                ],
                ["Reliability", `${p.jobsCompleted} completed · ${acceptance != null ? `${acceptance}% of ${p.offersReceived} offers accepted` : "no offers yet"}`],
                ["Joined", <LocalTime key="j" iso={p.user.createdAt.toISOString()} mode="date" />],
              ]}
            />
          </Card>

          <Card>
            <h2 className="mb-1 text-lg font-semibold">Documents</h2>
            <p className="mb-3 text-sm text-ink-muted">
              Required for approval: {REQUIRED_DOCUMENT_TYPES.map(docLabel).join(", ")}. Check names, dates and coverage against the business details.
            </p>
            {p.documents.length ? (
              <ul className="space-y-3">
                {p.documents.map((d) => (
                  <li key={d.id} className="rounded-2xl bg-soft p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        <span className="font-semibold">{docLabel(d.type)}</span>{" "}
                        <a href={`/api/files/${d.fileId}`} target="_blank" rel="noreferrer" className="text-sm">
                          View file
                        </a>
                        <span className="block text-xs text-ink-muted">
                          Uploaded <LocalTime iso={d.createdAt.toISOString()} mode="date" />
                          {d.expiresOn ? (
                            <>
                              {" "}
                              · expires <LocalTime iso={d.expiresOn.toISOString()} mode="date" />
                            </>
                          ) : null}
                          {d.expiresOn && d.expiresOn < new Date() ? <strong className="text-danger"> · EXPIRED</strong> : null}
                        </span>
                      </span>
                      <Badge tone={d.status === "APPROVED" ? "ok" : d.status === "REJECTED" ? "danger" : "gold"}>{d.status.toLowerCase()}</Badge>
                    </div>
                    {d.reviewNotes ? <p className="mt-1 text-xs">{d.reviewNotes}</p> : null}
                    {canVerify ? (
                      <form action={documentReviewAction} className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                        <input type="hidden" name="documentId" value={d.id} />
                        <input type="hidden" name="providerId" value={p.id} />
                        <Field label="Note (required to reject)" htmlFor={`dn-${d.id}`} className="flex-1">
                          <Input id={`dn-${d.id}`} name="notes" />
                        </Field>
                        <div className="flex gap-2">
                          {d.status !== "APPROVED" ? (
                            <SubmitButton name="decision" value="approve" size="sm">
                              Approve
                            </SubmitButton>
                          ) : null}
                          <SubmitButton name="decision" value="reject" size="sm" variant="danger">
                            Reject
                          </SubmitButton>
                        </div>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-muted">No documents uploaded yet.</p>
            )}
          </Card>

          <Card>
            <h2 className="mb-2 text-lg font-semibold">Recent jobs</h2>
            {p.assignments.length ? (
              <Table head={["Job", "Assigned", "Status"]} caption="Recent jobs">
                {p.assignments.map((a) => (
                  <tr key={a.id}>
                    <Td>
                      <Link href={`/admin/requests/${a.request.id}`} className="font-mono">
                        {a.request.number}
                      </Link>
                    </Td>
                    <Td>
                      <LocalTime iso={a.createdAt.toISOString()} mode="date" />
                    </Td>
                    <Td>{a.releasedAt ? `Released: ${a.releaseReason ?? ""}` : <StatusBadge status={a.request.status} />}</Td>
                  </tr>
                ))}
              </Table>
            ) : (
              <p className="text-sm text-ink-muted">No jobs yet.</p>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          {canVerify ? (
            <Card className={p.verificationStatus === "PENDING" ? "ring-2 ring-gold" : undefined}>
              <h2 className="text-lg font-semibold">Verification decision</h2>
              <form action={verificationAction} className="mt-3 space-y-3">
                <input type="hidden" name="providerId" value={p.id} />
                <fieldset>
                  <legend className="mb-1 text-sm font-semibold text-deep">Authorized services (for approval)</legend>
                  {p.services.length ? (
                    p.services.map((s) => (
                      <Checkbox key={s.id} name="authorized" value={s.serviceCategoryId} defaultChecked={s.authorized} label={s.serviceCategory.name} className="min-h-10 py-1" />
                    ))
                  ) : (
                    <p className="text-sm text-ink-muted">The provider hasn&apos;t selected any services.</p>
                  )}
                </fieldset>
                <Field label="Decision" htmlFor="v-status" required>
                  <Select id="v-status" name="status" defaultValue="APPROVED">
                    <option value="APPROVED">Approve</option>
                    <option value="PENDING">Request more information</option>
                    <option value="REJECTED">Reject</option>
                    <option value="SUSPENDED">Suspend</option>
                  </Select>
                </Field>
                <Field label="Note to provider" htmlFor="v-notes" hint="Required unless approving.">
                  <Textarea id="v-notes" name="notes" maxLength={1000} />
                </Field>
                <ConfirmSubmit message="Save this verification decision? The provider will be notified.">Save decision</ConfirmSubmit>
              </form>
            </Card>
          ) : null}
          {can(user, "users.manage") ? (
            <Card>
              <h2 className="text-lg font-semibold">Account access</h2>
              <p className="mt-1 text-sm text-ink-muted">Account is {p.user.status.toLowerCase()}. Suspending signs them out everywhere and takes them offline.</p>
              <form action={userStatusAction} className="mt-3 space-y-3">
                <input type="hidden" name="userId" value={p.user.id} />
                <input type="hidden" name="back" value={`/admin/providers/${p.id}`} />
                <input type="hidden" name="status" value={p.user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"} />
                <Field label="Reason" htmlFor="u-reason" required>
                  <Input id="u-reason" name="reason" required />
                </Field>
                <ConfirmSubmit variant={p.user.status === "ACTIVE" ? "danger" : "secondary"} message="Change this account's access?">
                  {p.user.status === "ACTIVE" ? "Suspend account" : "Reactivate account"}
                </ConfirmSubmit>
              </form>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
