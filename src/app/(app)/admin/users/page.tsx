import type { Metadata } from "next";
import Link from "next/link";
import { requirePagePermission } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { ADMIN_ROLES } from "@/lib/constants";
import { adminRoleAction, createStaffAction, userStatusAction } from "@/app/actions/admin";
import { Badge, Card, Field, Flash, Input, PageHeader, Select, Table, Td, cx } from "@/components/ui";
import { ConfirmSubmit, LocalTime, SubmitButton } from "@/components/client";

export const metadata: Metadata = { title: "Customers & staff" };

const ROLE_HELP: Record<string, string> = {
  SUPER_ADMIN: "Everything, including settings, pricing and staff.",
  DISPATCHER: "Requests, quotes, manual assignment and support.",
  SUPPORT: "Support tickets and read-only request, provider and payment views.",
  FINANCE: "Payments, refunds, payouts and reports.",
};

export default async function AdminUsers({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    q?: string;
    ok?: string;
    error?: string;
  }>;
}) {
  const user = await requirePagePermission("users.view");
  const sp = await searchParams;
  const tab = sp.tab === "staff" ? "staff" : "customers";
  const manage = can(user, "users.manage");
  const q = sp.q?.trim().toLowerCase();
  const rows = await db.user.findMany({
    where: {
      role: tab === "staff" ? "ADMIN" : "CUSTOMER",
      ...(q
        ? {
            OR: [{ email: { contains: q } }, { name: { contains: q } }, { phone: { contains: q } }],
          }
        : {}),
    },
    include: { _count: { select: { requests: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return (
    <>
      <PageHeader title="Customers & staff" description="Providers are managed under Providers." />
      <Flash ok={sp.ok} error={sp.error} />
      <nav aria-label="User type" className="mb-5 flex gap-2">
        {(["customers", "staff"] as const).map((t) => (
          <Link
            key={t}
            href={`/admin/users?tab=${t}`}
            aria-current={tab === t ? "page" : undefined}
            className={cx("rounded-xl px-4 py-2 font-semibold no-underline", tab === t ? "bg-deep text-white" : "bg-white text-deep ring-1 ring-line")}
          >
            {t === "customers" ? "Customers" : "Staff"}
          </Link>
        ))}
      </nav>
      <Card className="mb-5">
        <form className="flex gap-3" role="search">
          <input type="hidden" name="tab" value={tab} />
          <label htmlFor="q" className="sr-only">
            Search
          </label>
          <Input id="q" name="q" defaultValue={sp.q} placeholder="Name, email or phone" />
          <button type="submit" className="min-h-12 rounded-xl bg-deep px-5 font-semibold text-white">
            Search
          </button>
        </form>
      </Card>
      <Card>
        <Table head={tab === "staff" ? ["Name", "Role", "Status", "Joined", ""] : ["Name", "Requests", "Status", "Joined", ""]} caption={tab}>
          {rows.map((u) => (
            <tr key={u.id}>
              <Td>
                <span className="font-semibold">{u.name}</span>
                <span className="block text-xs text-ink-muted">
                  {u.email}
                  {u.phone ? ` · ${u.phone}` : ""}
                </span>
              </Td>
              <Td>
                {tab === "staff" ? (
                  manage && u.id !== user.id ? (
                    <form action={adminRoleAction} className="flex items-center gap-2">
                      <input type="hidden" name="userId" value={u.id} />
                      <label className="sr-only" htmlFor={`role-${u.id}`}>
                        Role for {u.name}
                      </label>
                      <Select id={`role-${u.id}`} name="adminRole" defaultValue={u.adminRole ?? ""} className="min-h-10 w-44 text-sm">
                        <option value="">No access</option>
                        {ADMIN_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r.replace("_", " ").toLowerCase()}
                          </option>
                        ))}
                      </Select>
                      <SubmitButton size="sm" variant="secondary">
                        Save
                      </SubmitButton>
                    </form>
                  ) : (
                    (u.adminRole?.replace("_", " ").toLowerCase() ?? "no access")
                  )
                ) : (
                  u._count.requests
                )}
              </Td>
              <Td>
                <Badge tone={u.status === "ACTIVE" ? "ok" : "danger"}>{u.status.toLowerCase()}</Badge>
              </Td>
              <Td>
                <LocalTime iso={u.createdAt.toISOString()} mode="date" />
              </Td>
              <Td>
                {manage && u.id !== user.id && u.status !== "DELETED" ? (
                  <form action={userStatusAction} className="flex items-center gap-2">
                    <input type="hidden" name="userId" value={u.id} />
                    <input type="hidden" name="back" value={`/admin/users?tab=${tab}`} />
                    <input type="hidden" name="status" value={u.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"} />
                    <label className="sr-only" htmlFor={`reason-${u.id}`}>
                      Reason
                    </label>
                    <Input id={`reason-${u.id}`} name="reason" required placeholder="Reason" className="min-h-10 w-36 text-sm" />
                    <ConfirmSubmit size="sm" variant={u.status === "ACTIVE" ? "danger" : "secondary"} message="Change this account's access?">
                      {u.status === "ACTIVE" ? "Suspend" : "Reactivate"}
                    </ConfirmSubmit>
                  </form>
                ) : null}
              </Td>
            </tr>
          ))}
        </Table>
        {!rows.length ? <p className="py-6 text-center text-sm text-ink-muted">No accounts found.</p> : null}
      </Card>

      {tab === "staff" && manage ? (
        <Card className="mt-5">
          <h2 className="text-lg font-semibold">Add a staff member</h2>
          <ul className="mt-2 space-y-1 text-sm text-ink-muted">
            {ADMIN_ROLES.map((r) => (
              <li key={r}>
                <strong className="text-ink">{r.replace("_", " ").toLowerCase()}</strong>: {ROLE_HELP[r]}
              </li>
            ))}
          </ul>
          <form action={createStaffAction} className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="s-name" required>
              <Input id="s-name" name="name" required />
            </Field>
            <Field label="Email" htmlFor="s-email" required>
              <Input id="s-email" name="email" type="email" required />
            </Field>
            <Field label="Role" htmlFor="s-role" required>
              <Select id="s-role" name="adminRole" defaultValue="DISPATCHER">
                {ADMIN_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r.replace("_", " ").toLowerCase()}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Temporary password" htmlFor="s-pw" required hint="At least 10 characters. Ask them to change it after signing in.">
              <Input id="s-pw" name="password" type="password" autoComplete="new-password" required minLength={10} />
            </Field>
            <div className="sm:col-span-2">
              <SubmitButton>Create staff account</SubmitButton>
            </div>
          </form>
        </Card>
      ) : null}
    </>
  );
}
