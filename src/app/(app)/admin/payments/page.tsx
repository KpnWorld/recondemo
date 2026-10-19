import type { Metadata } from "next";
import Link from "next/link";
import { requirePagePermission } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { formatCents } from "@/lib/money";
import { stripeConfigured } from "@/lib/integrations/stripe";
import { getSettings } from "@/lib/settings";
import { payoutAction } from "@/app/actions/admin";
import { Alert, Badge, Card, Flash, Input, PageHeader, Table, Td, cx } from "@/components/ui";
import { ConfirmSubmit, LocalTime, SubmitButton } from "@/components/client";

export const metadata: Metadata = { title: "Payments & payouts" };

const TONE: Record<string, "ok" | "gold" | "danger" | "neutral"> = {
  SUCCEEDED: "ok",
  PAID: "ok",
  AUTHORIZED: "gold",
  PENDING: "gold",
  REQUIRES_PAYMENT_METHOD: "neutral",
  PARTIALLY_REFUNDED: "gold",
  REFUNDED: "neutral",
  FAILED: "danger",
  DISPUTED: "danger",
  ON_HOLD: "danger",
  CANCELED: "neutral",
};

export default async function AdminPayments({ searchParams }: { searchParams: Promise<{ tab?: string; ok?: string; error?: string }> }) {
  const user = await requirePagePermission("payments.view");
  const sp = await searchParams;
  const tab = sp.tab === "payouts" ? "payouts" : sp.tab === "refunds" ? "refunds" : "payments";
  const settings = await getSettings();
  const [payments, payouts, refunds] = await Promise.all([
    tab === "payments"
      ? db.payment.findMany({
          include: { request: { select: { id: true, number: true } } },
          orderBy: { createdAt: "desc" },
          take: 200,
        })
      : [],
    tab === "payouts"
      ? db.providerPayout.findMany({
          include: { provider: { select: { id: true, businessName: true } } },
          orderBy: { createdAt: "desc" },
          take: 200,
        })
      : [],
    tab === "refunds"
      ? db.refund.findMany({
          include: {
            payment: {
              include: { request: { select: { id: true, number: true } } },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 200,
        })
      : [],
  ]);
  const payoutRequests =
    tab === "payouts"
      ? await db.serviceRequest.findMany({
          where: { id: { in: payouts.map((p) => p.requestId) } },
          select: { id: true, number: true },
        })
      : [];
  const numberOf = new Map(payoutRequests.map((r) => [r.id, r.number]));
  const managePayouts = can(user, "payouts.manage");

  return (
    <>
      <PageHeader title="Payments & payouts" description="Payment status comes only from the payment processor's verified webhooks." />
      <Flash ok={sp.ok} error={sp.error} />
      {!stripeConfigured() ? (
        <Alert tone="info" className="mb-5" title="Payment processor not connected">
          Requests are recorded without charging anyone. Add Stripe test-mode keys and a webhook secret to take card authorizations.
        </Alert>
      ) : null}
      {settings.payments.platformFeeBps == null ? (
        <Alert tone="warning" className="mb-5">
          The platform fee isn&apos;t set, so new payouts are created on hold. Set it in <Link href="/admin/settings#payments">Settings</Link>.
        </Alert>
      ) : null}
      <nav aria-label="Payment records" className="mb-5 flex gap-2">
        {(["payments", "payouts", "refunds"] as const).map((t) => (
          <Link
            key={t}
            href={`/admin/payments?tab=${t}`}
            aria-current={tab === t ? "page" : undefined}
            className={cx("rounded-xl px-4 py-2 font-semibold capitalize no-underline", tab === t ? "bg-deep text-white" : "bg-white text-deep ring-1 ring-line")}
          >
            {t}
          </Link>
        ))}
      </nav>
      <Card>
        {tab === "payments" ? (
          <Table head={["Request", "Created", "Processor", "Status", "Amount", "Captured", "Refunded"]} caption="Payments">
            {payments.map((p) => (
              <tr key={p.id}>
                <Td>
                  <Link href={`/admin/requests/${p.request.id}`} className="font-mono">
                    {p.request.number}
                  </Link>
                </Td>
                <Td>
                  <LocalTime iso={p.createdAt.toISOString()} />
                </Td>
                <Td>
                  {p.processor === "DEMO" ? <Badge>Demo</Badge> : "Stripe"}
                  {p.processorRef ? <span className="block font-mono text-xs text-ink-muted">{p.processorRef}</span> : null}
                </Td>
                <Td>
                  <Badge tone={TONE[p.status] ?? "neutral"}>{p.status === "DEMO_NOT_CHARGED" ? "not charged (demo)" : p.status.replace(/_/g, " ").toLowerCase()}</Badge>
                  {p.failureReason ? <span className="block text-xs text-danger">{p.failureReason}</span> : null}
                </Td>
                <Td className="tabular-nums">{formatCents(p.amountCents)}</Td>
                <Td className="tabular-nums">{formatCents(p.capturedCents)}</Td>
                <Td className="tabular-nums">{formatCents(p.refundedCents)}</Td>
              </tr>
            ))}
          </Table>
        ) : null}
        {tab === "payouts" ? (
          <Table head={["Provider", "Job", "Gross", "Platform fee", "Net", "Status", ""]} caption="Provider payouts">
            {payouts.map((p) => (
              <tr key={p.id}>
                <Td>
                  <Link href={`/admin/providers/${p.provider.id}`}>{p.provider.businessName}</Link>
                </Td>
                <Td>
                  <Link href={`/admin/requests/${p.requestId}`} className="font-mono">
                    {numberOf.get(p.requestId) ?? "—"}
                  </Link>
                </Td>
                <Td className="tabular-nums">{formatCents(p.grossCents)}</Td>
                <Td className="tabular-nums">{formatCents(p.platformFeeCents)}</Td>
                <Td className="font-semibold tabular-nums">{formatCents(p.netCents)}</Td>
                <Td>
                  <Badge tone={TONE[p.status] ?? "neutral"}>{p.status === "DEMO_NOT_PAID" ? "demo (not paid)" : p.status.replace("_", " ").toLowerCase()}</Badge>
                  {p.processorRef ? <span className="block text-xs text-ink-muted">Ref {p.processorRef}</span> : null}
                </Td>
                <Td>
                  {managePayouts && p.status === "PENDING" ? (
                    <div className="flex flex-col gap-2">
                      <form action={payoutAction} className="flex gap-2">
                        <input type="hidden" name="payoutId" value={p.id} />
                        <input type="hidden" name="op" value="paid" />
                        <label className="sr-only" htmlFor={`ref-${p.id}`}>
                          Transfer reference
                        </label>
                        <Input id={`ref-${p.id}`} name="reference" required placeholder="Transfer ref" className="min-h-10 w-32 text-sm" />
                        <ConfirmSubmit size="sm" message="Mark this payout as paid? Only do this after the transfer has been sent.">
                          Mark paid
                        </ConfirmSubmit>
                      </form>
                      <form action={payoutAction}>
                        <input type="hidden" name="payoutId" value={p.id} />
                        <input type="hidden" name="op" value="hold" />
                        <SubmitButton size="sm" variant="ghost">
                          Hold
                        </SubmitButton>
                      </form>
                    </div>
                  ) : managePayouts && p.status === "ON_HOLD" ? (
                    <form action={payoutAction}>
                      <input type="hidden" name="payoutId" value={p.id} />
                      <input type="hidden" name="op" value="release" />
                      <SubmitButton size="sm" variant="secondary">
                        Release hold
                      </SubmitButton>
                    </form>
                  ) : null}
                </Td>
              </tr>
            ))}
          </Table>
        ) : null}
        {tab === "refunds" ? (
          <Table head={["Request", "Requested", "Amount", "Reason", "Status"]} caption="Refunds">
            {refunds.map((r) => (
              <tr key={r.id}>
                <Td>
                  <Link href={`/admin/requests/${r.payment.request.id}`} className="font-mono">
                    {r.payment.request.number}
                  </Link>
                </Td>
                <Td>
                  <LocalTime iso={r.createdAt.toISOString()} />
                </Td>
                <Td className="tabular-nums">{formatCents(r.amountCents)}</Td>
                <Td>{r.reason}</Td>
                <Td>
                  <Badge tone={TONE[r.status] ?? "neutral"}>{r.status === "DEMO_RECORDED" ? "demo (no money moved)" : r.status.toLowerCase()}</Badge>
                </Td>
              </tr>
            ))}
          </Table>
        ) : null}
        {(tab === "payments" ? payments : tab === "payouts" ? payouts : refunds).length === 0 ? <p className="py-6 text-center text-sm text-ink-muted">No records yet.</p> : null}
      </Card>
      <p className="mt-4 text-sm text-ink-muted">Refunds are issued from each request&apos;s page.</p>
    </>
  );
}
