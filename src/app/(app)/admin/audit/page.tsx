import type { Metadata } from "next";
import Link from "next/link";
import { requirePagePermission } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { Card, Input, PageHeader, Table, Td } from "@/components/ui";
import { LocalTime } from "@/components/client";

export const metadata: Metadata = { title: "Audit log" };

const PAGE = 50;

export default async function AdminAudit({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requirePagePermission("audit.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = sp.q?.trim();
  const where = q
    ? {
        OR: [{ action: { contains: q } }, { entityType: { contains: q } }, { entityId: q }],
      }
    : {};
  const [rows, count] = await Promise.all([
    db.auditLog.findMany({
      where,
      include: { actor: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: PAGE,
      skip: (page - 1) * PAGE,
    }),
    db.auditLog.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(count / PAGE));
  const href = (p: number) => `/admin/audit?page=${p}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  return (
    <>
      <PageHeader title="Audit log" description="Sign-ins, administrative changes, pricing edits, assignments, refunds and exports. Entries can't be edited." />
      <Card className="mb-5">
        <form className="flex gap-3" role="search">
          <label htmlFor="q" className="sr-only">
            Filter
          </label>
          <Input id="q" name="q" defaultValue={q} placeholder="Action (e.g. pricing), entity type or id" />
          <button type="submit" className="min-h-12 rounded-xl bg-deep px-5 font-semibold text-white">
            Filter
          </button>
        </form>
      </Card>
      <Card>
        <Table head={["When", "Who", "Action", "Entity", "Details"]} caption="Audit entries">
          {rows.map((a) => (
            <tr key={a.id}>
              <Td>
                <LocalTime iso={a.createdAt.toISOString()} />
              </Td>
              <Td>{a.actor ? a.actor.name : "System"}</Td>
              <Td className="font-mono text-xs">{a.action}</Td>
              <Td className="text-xs">
                {a.entityType}
                {a.entityId ? <span className="block font-mono text-ink-muted">{a.entityId}</span> : null}
              </Td>
              <Td>
                {a.details && a.details !== "{}" ? (
                  <details>
                    <summary className="cursor-pointer text-xs">View</summary>
                    <pre className="mt-1 max-w-md overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-soft p-2 text-xs">{a.details}</pre>
                  </details>
                ) : (
                  "—"
                )}
              </Td>
            </tr>
          ))}
        </Table>
        {!rows.length ? <p className="py-6 text-center text-sm text-ink-muted">No entries.</p> : null}
        <nav aria-label="Pages" className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? <Link href={href(page - 1)}>← Newer</Link> : <span />}
          <span className="text-ink-muted">
            Page {page} of {pages}
          </span>
          {page < pages ? <Link href={href(page + 1)}>Older →</Link> : <span />}
        </nav>
      </Card>
    </>
  );
}
