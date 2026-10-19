import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePagePermission } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { TICKET_CATEGORIES, TICKET_STATUSES } from "@/lib/constants";
import { ticketAction } from "@/app/actions/admin";
import { Card, Checkbox, DescriptionList, Field, Flash, PageHeader, Select, Textarea } from "@/components/ui";
import { LocalTime, SubmitButton } from "@/components/client";

export const metadata: Metadata = { title: "Support ticket" };

export default async function AdminTicket({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePagePermission("support.manage");
  const t = await db.supportTicket.findUnique({
    where: { id },
    include: {
      assignee: { select: { id: true, name: true } },
      request: { select: { id: true, number: true } },
      author: { select: { role: true } },
    },
  });
  if (!t) notFound();
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/support">← All tickets</Link>
      </p>
      <PageHeader eyebrow={t.number} title={t.subject} />
      <Flash {...sp} />
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr] [&>*]:min-w-0">
        <Card>
          <DescriptionList
            items={[
              ["From", `${t.contactName} · ${t.contactEmail}${t.author ? ` (${t.author.role.toLowerCase()} account)` : " (not signed in)"}`],
              ["Category", TICKET_CATEGORIES.find((c) => c.value === t.category)?.label ?? t.category],
              [
                "Request",
                t.request ? (
                  <Link key="r" href={`/admin/requests/${t.request.id}`}>
                    {t.request.number}
                  </Link>
                ) : (
                  "—"
                ),
              ],
              ["Received", <LocalTime key="d" iso={t.createdAt.toISOString()} />],
              ["Assignee", t.assignee?.name ?? "Unassigned"],
            ]}
          />
          <h2 className="mb-2 mt-5 font-semibold">Message</h2>
          <p className="whitespace-pre-wrap rounded-2xl bg-soft p-4 text-sm">{t.body}</p>
          {t.resolution ? (
            <>
              <h2 className="mb-2 mt-5 font-semibold">Resolution</h2>
              <p className="whitespace-pre-wrap text-sm">{t.resolution}</p>
            </>
          ) : null}
          <p className="mt-5 text-sm text-ink-muted">Reply to the customer from your support mailbox at {t.contactEmail}. Record the outcome here.</p>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold">Update ticket</h2>
          <form action={ticketAction} className="mt-3 space-y-3">
            <input type="hidden" name="ticketId" value={t.id} />
            <Field label="Status" htmlFor="t-status" required>
              <Select id="t-status" name="status" defaultValue={t.status}>
                {TICKET_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace("_", " ").toLowerCase()}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Resolution note" htmlFor="t-res" hint="Required to resolve or close.">
              <Textarea id="t-res" name="resolution" defaultValue={t.resolution ?? ""} maxLength={2000} />
            </Field>
            {t.assignee?.id !== user.id ? <Checkbox name="assignToMe" value="true" label="Assign to me" /> : null}
            <SubmitButton>Save</SubmitButton>
          </form>
          {t.request && (t.category === "REFUND" || t.category === "DISPUTE") ? (
            <p className="mt-4 text-sm">
              Refunds are issued from the <Link href={`/admin/requests/${t.request.id}`}>request page</Link> by finance staff.
            </p>
          ) : null}
        </Card>
      </div>
    </>
  );
}
