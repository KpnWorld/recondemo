import type { Metadata } from "next";
import Link from "next/link";
import { requirePageUser } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { Card, EmptyState, PageHeader, StatusBadge, Table, Td } from "@/components/ui";
import { LocalTime } from "@/components/client";
import { ReceiptIcon } from "@/components/icons";

export const metadata: Metadata = { title: "History & receipts" };

export default async function HistoryPage() {
  const user = await requirePageUser(["CUSTOMER"]);
  const rows = await db.serviceRequest.findMany({
    where: { customerId: user.id },
    include: { serviceCategory: true, receipt: true },
    orderBy: { createdAt: "desc" },
  });
  return (
    <>
      <PageHeader title="History & receipts" description="Every request you've made, with receipts for completed services." />
      <Card>
        {rows.length ? (
          <Table head={["Request", "Service", "Date", "Status", "Total", "Receipt"]} caption="Your requests">
            {rows.map((r) => (
              <tr key={r.id}>
                <Td>
                  <Link href={`/requests/${r.id}`} className="font-mono font-semibold">
                    {r.number}
                  </Link>
                </Td>
                <Td>{r.serviceCategory.name}</Td>
                <Td>
                  <LocalTime iso={r.createdAt.toISOString()} mode="date" />
                </Td>
                <Td>
                  <StatusBadge status={r.status} />
                </Td>
                <Td>{r.finalTotalCents != null ? formatCents(r.finalTotalCents) : r.cancellationFeeCents ? `${formatCents(r.cancellationFeeCents)} fee` : "—"}</Td>
                <Td>{r.receipt ? <Link href={`/requests/${r.id}/receipt`}>{r.receipt.number}</Link> : "—"}</Td>
              </tr>
            ))}
          </Table>
        ) : (
          <EmptyState icon={<ReceiptIcon />} title="No requests yet" />
        )}
      </Card>
    </>
  );
}
