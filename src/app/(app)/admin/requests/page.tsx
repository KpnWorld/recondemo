import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requirePagePermission } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { ASSIGNED_STATUSES, REQUEST_STATUSES, STATUS_LABELS } from "@/lib/constants";
import { formatCents } from "@/lib/money";
import { Card, EmptyState, Input, LinkButton, PageHeader, Select, StatusBadge, Table, Td, Badge } from "@/components/ui";
import { AutoRefresh, LocalTime } from "@/components/client";
import { ListIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Requests & dispatch" };

export default async function AdminRequests({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  await requirePagePermission("requests.view");
  const sp = await searchParams;
  const where: Prisma.ServiceRequestWhereInput = {};
  if (sp.status === "ACTIVE") where.status = { in: ASSIGNED_STATUSES };
  else if (sp.status && (REQUEST_STATUSES as readonly string[]).includes(sp.status)) where.status = sp.status;
  const q = sp.q?.trim();
  if (q) where.OR = [{ number: { contains: q.toUpperCase() } }, { customer: { email: { contains: q.toLowerCase() } } }, { pickupZip: q }];
  const rows = await db.serviceRequest.findMany({
    where,
    include: {
      serviceCategory: true,
      customer: { select: { name: true } },
      assignments: {
        where: { active: true },
        include: { provider: { select: { businessName: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return (
    <>
      <AutoRefresh seconds={30} />
      <PageHeader title="Requests & dispatch" description="Most recent 100 matching requests." />
      <Card className="mb-5">
        <form className="grid gap-3 sm:grid-cols-[1fr_14rem_auto]" role="search">
          <label className="sr-only" htmlFor="q">
            Search
          </label>
          <Input id="q" name="q" defaultValue={q} placeholder="Request number, customer email or ZIP" />
          <label className="sr-only" htmlFor="status">
            Status
          </label>
          <Select id="status" name="status" defaultValue={sp.status ?? ""}>
            <option value="">All statuses</option>
            <option value="ACTIVE">Jobs underway</option>
            {REQUEST_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
          <button type="submit" className="min-h-12 rounded-xl bg-deep px-5 font-semibold text-white">
            Filter
          </button>
        </form>
      </Card>
      <Card>
        {rows.length ? (
          <Table head={["Request", "Service", "Customer", "Area", "Provider", "Status", "Total"]} caption="Requests">
            {rows.map((r) => (
              <tr key={r.id}>
                <Td>
                  <Link href={`/admin/requests/${r.id}`} className="font-mono font-semibold">
                    {r.number}
                  </Link>
                  <span className="block text-xs text-ink-muted">
                    <LocalTime iso={r.createdAt.toISOString()} />
                  </span>
                  {r.isDemo ? <Badge>Demo</Badge> : null}
                </Td>
                <Td>{r.serviceCategory.name}</Td>
                <Td>{r.customer.name}</Td>
                <Td>{[r.pickupCity, r.pickupZip].filter(Boolean).join(" ") || "—"}</Td>
                <Td>{r.assignments[0]?.provider.businessName ?? "—"}</Td>
                <Td>
                  <StatusBadge status={r.status} />
                </Td>
                <Td className="tabular-nums">{r.finalTotalCents != null ? formatCents(r.finalTotalCents) : "—"}</Td>
              </tr>
            ))}
          </Table>
        ) : (
          <EmptyState
            icon={<ListIcon />}
            title="No requests match"
            action={
              <LinkButton href="/admin/requests" variant="secondary" size="sm">
                Clear filters
              </LinkButton>
            }
          />
        )}
      </Card>
    </>
  );
}
