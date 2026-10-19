import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requirePagePermission } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { TRUCK_TYPES, VERIFICATION_TONE } from "@/lib/constants";
import { Badge, Card, EmptyState, Input, PageHeader, Select, Table, Td } from "@/components/ui";
import { TruckIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Providers" };

export default async function AdminProviders({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; online?: string }> }) {
  await requirePagePermission("providers.view");
  const sp = await searchParams;
  const where: Prisma.ProviderProfileWhereInput = {};
  if (sp.status && sp.status in VERIFICATION_TONE) where.verificationStatus = sp.status;
  if (sp.online) where.isOnline = true;
  const q = sp.q?.trim();
  if (q) where.OR = [{ businessName: { contains: q } }, { user: { email: { contains: q.toLowerCase() } } }, { serviceZips: { contains: q } }];
  const rows = await db.providerProfile.findMany({
    where,
    include: {
      user: { select: { name: true, email: true, status: true } },
      documents: { select: { status: true } },
      services: { select: { authorized: true } },
    },
    orderBy: [{ verificationStatus: "asc" }, { createdAt: "desc" }],
    take: 200,
  });
  return (
    <>
      <PageHeader title="Providers" description="Verification, documents, equipment and availability." />
      <Card className="mb-5">
        <form className="grid gap-3 sm:grid-cols-[1fr_12rem_auto]" role="search">
          <label className="sr-only" htmlFor="q">
            Search
          </label>
          <Input id="q" name="q" defaultValue={q} placeholder="Business, email or ZIP" />
          <label className="sr-only" htmlFor="status">
            Verification status
          </label>
          <Select id="status" name="status" defaultValue={sp.status ?? ""}>
            <option value="">All statuses</option>
            {Object.keys(VERIFICATION_TONE).map((s) => (
              <option key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
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
          <Table head={["Business", "Truck", "Documents", "Services", "Availability", "Status"]} caption="Providers">
            {rows.map((p) => (
              <tr key={p.id}>
                <Td>
                  <Link href={`/admin/providers/${p.id}`} className="font-semibold">
                    {p.businessName}
                  </Link>
                  <span className="block text-xs text-ink-muted">{p.user.email}</span>
                </Td>
                <Td>{TRUCK_TYPES.find((t) => t.value === p.truckType)?.label ?? "Not set"}</Td>
                <Td>
                  {p.documents.filter((d) => d.status === "APPROVED").length}/{p.documents.length} approved
                  {p.documents.some((d) => d.status === "PENDING") ? (
                    <Badge tone="gold" className="ml-1">
                      Review
                    </Badge>
                  ) : null}
                </Td>
                <Td>
                  {p.services.filter((s) => s.authorized).length}/{p.services.length} authorized
                </Td>
                <Td>
                  {p.user.status !== "ACTIVE" ? (
                    <Badge tone="danger">Account {p.user.status.toLowerCase()}</Badge>
                  ) : (
                    <Badge tone={p.isOnline ? "ok" : "neutral"}>{p.isOnline ? "Online" : "Offline"}</Badge>
                  )}
                </Td>
                <Td>
                  <Badge tone={VERIFICATION_TONE[p.verificationStatus as keyof typeof VERIFICATION_TONE] ?? "neutral"}>{p.verificationStatus.toLowerCase()}</Badge>
                </Td>
              </tr>
            ))}
          </Table>
        ) : (
          <EmptyState icon={<TruckIcon />} title="No providers match" />
        )}
      </Card>
    </>
  );
}
