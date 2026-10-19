import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { parseBreakdown } from "@/lib/services/pricing";
import { Badge, Card, DescriptionList, LinkButton, Placeholder } from "@/components/ui";
import { PriceTable } from "@/components/price";
import { Logo } from "@/components/logo";
import { PrintButton } from "@/components/print-button";

export const metadata: Metadata = { title: "Receipt" };

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser(["CUSTOMER"]);
  const r = await db.serviceRequest.findFirst({
    where: { id, customerId: user.id },
    include: {
      receipt: true,
      serviceCategory: true,
      payments: { include: { refunds: true } },
      assignments: { where: { active: true }, include: { provider: true } },
    },
  });
  if (!r || !r.receipt) notFound();
  const b = parseBreakdown(r.receipt.breakdown);
  const { business } = await getSettings();
  const paid = r.payments.filter((p) => ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(p.status));
  const refunded = r.payments.reduce((s, p) => s + p.refundedCents, 0);
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex justify-between gap-2 print:hidden">
        <LinkButton href={`/requests/${r.id}`} variant="ghost" size="sm">
          ← Back to request
        </LinkButton>
        <PrintButton />
      </div>
      <Card className="p-6 sm:p-10">
        <div className="flex items-start justify-between gap-4">
          <Logo />
          <div className="text-right text-sm">
            <p className="font-semibold text-deep">Receipt {r.receipt.number}</p>
            <p className="text-ink-muted">
              {r.receipt.createdAt.toLocaleDateString("en-US", {
                dateStyle: "long",
              })}
            </p>
            {r.receipt.isDemo ? (
              <Badge tone="gold" className="mt-1">
                Demo, not a real charge
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="mt-6 text-sm text-ink-muted">
          <p>{business.legalName || <Placeholder>Business legal name</Placeholder>}</p>
          <p>{business.address || <Placeholder>Business address</Placeholder>}</p>
        </div>
        <div className="mt-6">
          <DescriptionList
            items={[
              ["Request", r.number],
              ["Service", r.serviceCategory.name],
              ["Provider", r.assignments[0]?.provider.businessName ?? "—"],
              [
                "Completed",
                r.completedAt?.toLocaleString("en-US", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }) ?? "—",
              ],
            ]}
          />
        </div>
        {b ? (
          <div className="mt-6 rounded-2xl bg-soft p-4">
            <PriceTable breakdown={b} label="Total" />
          </div>
        ) : null}
        <div className="mt-4 text-sm text-ink-muted">
          {r.receipt.isDemo ? (
            <p>This is a demo receipt. No payment was collected.</p>
          ) : paid.length ? (
            <p>
              Paid by card {formatCents(paid.reduce((s, p) => s + p.capturedCents, 0))}
              {refunded ? `, refunded ${formatCents(refunded)}` : ""}.
            </p>
          ) : (
            <p>Payment status: awaiting confirmation from the payment processor, or collected outside Call Recon.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
