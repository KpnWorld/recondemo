import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { Card, PageHeader, Table, Td, buttonClass } from "@/components/ui";

export const metadata: Metadata = { title: "Reports & exports" };

const EXPORTS = [
  ["requests", "Requests", "Every request with status, service, area, provider and totals."],
  ["payments", "Payments", "Processor references, authorized, captured and refunded amounts."],
  ["payouts", "Provider payouts", "Gross, platform fee and net per completed job."],
  ["tickets", "Support tickets", "Complaints, disputes and questions with status."],
] as const;

export default async function AdminReports() {
  await requirePagePermission("reports.export");
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [byService, byStatus] = await Promise.all([
    db.serviceRequest.groupBy({
      by: ["serviceCategoryId"],
      where: { createdAt: { gte: since }, isDemo: false },
      _count: true,
      _sum: { finalTotalCents: true },
    }),
    db.serviceRequest.groupBy({
      by: ["status"],
      where: { createdAt: { gte: since }, isDemo: false },
      _count: true,
    }),
  ]);
  const cats = await db.serviceCategory.findMany({
    where: { id: { in: byService.map((b) => b.serviceCategoryId) } },
  });
  const total = byStatus.reduce((s, b) => s + b._count, 0);
  const completed = byStatus.find((b) => b.status === "COMPLETED")?._count ?? 0;
  const cancelled = byStatus.find((b) => b.status === "CANCELLED")?._count ?? 0;
  const noProvider = byStatus.find((b) => b.status === "NO_PROVIDER_AVAILABLE")?._count ?? 0;
  return (
    <>
      <PageHeader title="Reports & exports" description="Last 30 days, excluding demo data. Exports include everything and are recorded in the audit log." />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Requests", total],
          ["Completed", completed],
          ["Cancelled", cancelled],
          ["No provider found", noProvider],
        ].map(([k, v]) => (
          <Card key={k as string}>
            <p className="text-3xl font-bold tabular-nums text-deep">{v}</p>
            <p className="text-sm text-ink-muted">{k}</p>
          </Card>
        ))}
      </div>
      <Card className="mb-5">
        <h2 className="mb-2 text-lg font-semibold">By service</h2>
        {byService.length ? (
          <Table head={["Service", "Requests", "Completed revenue"]} caption="Requests by service">
            {byService.map((b) => (
              <tr key={b.serviceCategoryId}>
                <Td>{cats.find((c) => c.id === b.serviceCategoryId)?.name}</Td>
                <Td>{b._count}</Td>
                <Td className="tabular-nums">{formatCents(b._sum.finalTotalCents ?? 0)}</Td>
              </tr>
            ))}
          </Table>
        ) : (
          <p className="text-sm text-ink-muted">No non-demo requests in the last 30 days.</p>
        )}
      </Card>
      <Card>
        <h2 className="mb-3 text-lg font-semibold">CSV exports</h2>
        <ul className="divide-y divide-line">
          {EXPORTS.map(([kind, label, desc]) => (
            <li key={kind} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <span>
                <span className="block font-semibold text-deep">{label}</span>
                <span className="text-sm text-ink-muted">{desc}</span>
              </span>
              <a href={`/api/reports/${kind}`} className={buttonClass("secondary", "sm")} download>
                Download CSV
              </a>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
