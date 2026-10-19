import type { Metadata } from "next";
import Link from "next/link";
import { requirePageUser } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { Card, EmptyState, PageHeader, StatusBadge, Table, Td } from "@/components/ui";
import { LocalTime } from "@/components/client";
import { TruckIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Job history" };

export default async function ProviderHistoryPage() {
  const user = await requirePageUser(["PROVIDER"], "/provider/history");
  const p = await db.providerProfile.findUniqueOrThrow({
    where: { userId: user.id },
  });
  const rows = await db.providerAssignment.findMany({
    where: { providerId: p.id },
    include: { request: { include: { serviceCategory: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return (
    <>
      <PageHeader title="Job history" description="Jobs you've accepted or been assigned, including released ones." />
      <Card>
        {rows.length ? (
          <Table head={["Job", "Service", "Assigned", "Area", "Status"]} caption="Your jobs">
            {rows.map((a) => (
              <tr key={a.id}>
                <Td>
                  <Link href={`/provider/jobs/${a.requestId}`} className="font-mono font-semibold">
                    {a.request.number}
                  </Link>
                </Td>
                <Td>{a.request.serviceCategory.name}</Td>
                <Td>
                  <LocalTime iso={a.createdAt.toISOString()} mode="date" />
                </Td>
                <Td>{[a.request.pickupCity, a.request.pickupZip].filter(Boolean).join(" ") || "—"}</Td>
                <Td>{a.releasedAt ? <span className="text-sm text-ink-muted">Released</span> : <StatusBadge status={a.request.status} />}</Td>
              </tr>
            ))}
          </Table>
        ) : (
          <EmptyState icon={<TruckIcon />} title="No jobs yet" />
        )}
      </Card>
    </>
  );
}
