import type { Metadata } from "next";
import Link from "next/link";
import { requirePageUser } from "@/lib/auth/current";
import { formatCents } from "@/lib/money";
import { providerEarnings } from "@/lib/services/providers";
import { getSettings } from "@/lib/settings";
import { Alert, Badge, Card, EmptyState, PageHeader, Table, Td } from "@/components/ui";
import { LocalTime } from "@/components/client";
import { DollarIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Earnings & payouts" };

const LABEL: Record<string, { text: string; tone: "ok" | "gold" | "danger" | "neutral" }> = {
  PAID: { text: "Paid", tone: "ok" },
  PENDING: { text: "Pending", tone: "gold" },
  ON_HOLD: { text: "On hold", tone: "danger" },
  DEMO_NOT_PAID: { text: "Demo (not paid)", tone: "neutral" },
};

export default async function EarningsPage() {
  const user = await requirePageUser(["PROVIDER"], "/provider/earnings");
  const [{ payouts, totals }, settings] = await Promise.all([providerEarnings(user), getSettings()]);
  const fee = settings.payments.platformFeeBps;
  return (
    <>
      <PageHeader title="Earnings & payouts" description="Payout records are created when a job is completed and the customer's payment is confirmed by the payment processor." />
      <Alert tone="info" className="mb-5">
        {fee != null
          ? `Call Recon's platform fee is ${(fee / 100).toFixed(fee % 100 ? 2 : 0)}% of each job total, shown on every payout below.`
          : "The platform fee has not been configured yet. Payout amounts will appear once it is set."}{" "}
        Payouts are sent by Call Recon according to your provider agreement.
      </Alert>
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        {[
          ["Paid out", totals.paid],
          ["Pending", totals.pending],
          ["On hold", totals.onHold],
        ].map(([k, v]) => (
          <Card key={k as string}>
            <p className="text-sm text-ink-muted">{k}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-deep">{formatCents(v as number)}</p>
          </Card>
        ))}
      </div>
      {totals.demo ? <p className="mb-5 text-sm text-ink-muted">Demo jobs (not real money): {formatCents(totals.demo)}</p> : null}
      <Card>
        {payouts.length ? (
          <Table head={["Job", "Completed", "Job total", "Platform fee", "Your payout", "Status"]} caption="Payouts">
            {payouts.map((p) => (
              <tr key={p.id}>
                <Td>
                  <Link href={`/provider/jobs/${p.requestId}`} className="font-mono font-semibold">
                    {p.request?.number ?? "—"}
                  </Link>
                  <span className="block text-xs text-ink-muted">{p.request?.serviceCategory.name}</span>
                </Td>
                <Td>{p.request?.completedAt ? <LocalTime iso={p.request.completedAt.toISOString()} mode="date" /> : "—"}</Td>
                <Td className="tabular-nums">{formatCents(p.grossCents)}</Td>
                <Td className="tabular-nums">−{formatCents(p.platformFeeCents)}</Td>
                <Td className="font-semibold tabular-nums">{formatCents(p.netCents)}</Td>
                <Td>
                  <Badge tone={LABEL[p.status]?.tone ?? "neutral"}>{LABEL[p.status]?.text ?? p.status}</Badge>
                  {p.paidAt ? (
                    <span className="mt-1 block text-xs text-ink-muted">
                      <LocalTime iso={p.paidAt.toISOString()} mode="date" />
                    </span>
                  ) : null}
                </Td>
              </tr>
            ))}
          </Table>
        ) : (
          <EmptyState icon={<DollarIcon />} title="No payouts yet">
            Completed jobs appear here.
          </EmptyState>
        )}
      </Card>
    </>
  );
}
