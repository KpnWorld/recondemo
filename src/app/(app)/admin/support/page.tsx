import type { Metadata } from "next";
import Link from "next/link";
import { requirePagePermission } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { TICKET_CATEGORIES, TICKET_STATUSES } from "@/lib/constants";
import { Badge, Card, EmptyState, PageHeader, Table, Td, cx } from "@/components/ui";
import { LocalTime } from "@/components/client";
import { HelpIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Support & disputes" };

export const dynamic = "force-dynamic";

export default async function AdminSupport({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requirePagePermission("support.manage");
  const sp = await searchParams;
  const status = (TICKET_STATUSES as readonly string[]).includes(sp.status ?? "") ? sp.status! : "OPEN_ALL";
  const rows = await db.supportTicket.findMany({
    where: status === "OPEN_ALL" ? { status: { in: ["OPEN", "IN_PROGRESS"] } } : { status },
    include: {
      assignee: { select: { name: true } },
      request: { select: { number: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  const tabs = [["OPEN_ALL", "Open"], ...TICKET_STATUSES.map((s) => [s, s.replace("_", " ").toLowerCase()])];
  return (
    <>
      <PageHeader title="Support & disputes" description="Complaints, disputes, refund requests and general questions. Oldest first." />
      <nav aria-label="Ticket status" className="mb-5 flex flex-wrap gap-2">
        {tabs.map(([v, label]) => (
          <Link
            key={v}
            href={v === "OPEN_ALL" ? "/admin/support" : `/admin/support?status=${v}`}
            aria-current={status === v ? "page" : undefined}
            className={cx("rounded-xl px-4 py-2 font-semibold capitalize no-underline", status === v ? "bg-deep text-white" : "bg-white text-deep ring-1 ring-line")}
          >
            {label}
          </Link>
        ))}
      </nav>
      <Card>
        {rows.length ? (
          <Table head={["Ticket", "Category", "From", "Request", "Assignee", "Status"]} caption="Support tickets">
            {rows.map((t) => (
              <tr key={t.id}>
                <Td>
                  <Link href={`/admin/support/${t.id}`} className="font-semibold">
                    {t.subject}
                  </Link>
                  <span className="block text-xs text-ink-muted">
                    {t.number} · <LocalTime iso={t.createdAt.toISOString()} />
                  </span>
                </Td>
                <Td>
                  <Badge tone={t.category === "DISPUTE" || t.category === "COMPLAINT" ? "danger" : "neutral"}>
                    {TICKET_CATEGORIES.find((c) => c.value === t.category)?.label ?? t.category}
                  </Badge>
                </Td>
                <Td>{t.contactName}</Td>
                <Td>{t.request?.number ?? "—"}</Td>
                <Td>{t.assignee?.name ?? "—"}</Td>
                <Td className="capitalize">{t.status.replace("_", " ").toLowerCase()}</Td>
              </tr>
            ))}
          </Table>
        ) : (
          <EmptyState icon={<HelpIcon />} title="No tickets here" />
        )}
      </Card>
    </>
  );
}
