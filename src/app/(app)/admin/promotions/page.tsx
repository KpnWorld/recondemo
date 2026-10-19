import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { promoAction, settingsAction } from "@/app/actions/admin";
import { Badge, Card, Checkbox, Field, Flash, Input, PageHeader, Select, Table, Td, Textarea } from "@/components/ui";
import { LocalTime, SubmitButton } from "@/components/client";

export const metadata: Metadata = { title: "Promotions & referrals" };

export default async function AdminPromotions({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requirePagePermission("promotions.manage");
  const sp = await searchParams;
  const [promos, settings] = await Promise.all([db.promoCode.findMany({ orderBy: { createdAt: "desc" } }), getSettings()]);
  return (
    <>
      <PageHeader title="Promotions & referrals" description="Promo codes reduce the customer's total and are shown as a separate discount line." />
      <Flash {...sp} />
      <Card className="mb-5">
        <Table head={["Code", "Discount", "Used", "Expires", "Status"]} caption="Promo codes">
          {promos.map((p) => (
            <tr key={p.id}>
              <Td>
                <span className="font-mono font-semibold">{p.code}</span>
                {p.description ? <span className="block text-xs text-ink-muted">{p.description}</span> : null}
              </Td>
              <Td>{p.percentOff != null ? `${p.percentOff}% off` : `${formatCents(p.amountOffCents ?? 0)} off`}</Td>
              <Td>
                {p.redemptions}
                {p.maxRedemptions ? ` / ${p.maxRedemptions}` : ""}
              </Td>
              <Td>{p.expiresAt ? <LocalTime iso={p.expiresAt.toISOString()} mode="date" /> : "—"}</Td>
              <Td>
                <form action={promoAction} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="code" value={p.code} />
                  <input type="hidden" name="description" value={p.description ?? ""} />
                  <input type="hidden" name="kind" value={p.percentOff != null ? "percent" : "amount"} />
                  <input type="hidden" name="value" value={p.percentOff ?? ((p.amountOffCents ?? 0) / 100).toFixed(2)} />
                  <input type="hidden" name="maxRedemptions" value={p.maxRedemptions ?? ""} />
                  <input type="hidden" name="expiresAt" value={p.expiresAt?.toISOString().slice(0, 10) ?? ""} />
                  {p.active ? null : <input type="hidden" name="active" value="true" />}
                  <Badge tone={p.active ? "ok" : "neutral"}>{p.active ? "Active" : "Off"}</Badge>
                  <SubmitButton size="sm" variant="ghost">
                    {p.active ? "Turn off" : "Turn on"}
                  </SubmitButton>
                </form>
              </Td>
            </tr>
          ))}
        </Table>
        {!promos.length ? <p className="py-6 text-center text-sm text-ink-muted">No promo codes.</p> : null}
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-lg font-semibold">New promo code</h2>
          <form action={promoAction} className="grid gap-3 sm:grid-cols-2">
            <Field label="Code" htmlFor="p-code" required>
              <Input id="p-code" name="code" required pattern="[A-Za-z0-9-]{3,20}" autoCapitalize="characters" />
            </Field>
            <Field label="Type" htmlFor="p-kind" required>
              <Select id="p-kind" name="kind" defaultValue="percent">
                <option value="percent">Percent off</option>
                <option value="amount">Dollar amount off</option>
              </Select>
            </Field>
            <Field label="Value" htmlFor="p-value" required hint="Percent (e.g. 10) or dollars (e.g. 15.00).">
              <Input id="p-value" name="value" type="number" step="0.01" min={0.01} required />
            </Field>
            <Field label="Max uses" htmlFor="p-max">
              <Input id="p-max" name="maxRedemptions" type="number" min={1} />
            </Field>
            <Field label="Expires" htmlFor="p-exp">
              <Input id="p-exp" name="expiresAt" type="date" />
            </Field>
            <Field label="Description" htmlFor="p-desc">
              <Input id="p-desc" name="description" />
            </Field>
            <Checkbox name="active" value="true" defaultChecked label="Active" className="sm:col-span-2" />
            <div className="sm:col-span-2">
              <SubmitButton>Create code</SubmitButton>
            </div>
          </form>
        </Card>
        <Card>
          <h2 className="mb-1 text-lg font-semibold">Referral program</h2>
          <p className="mb-3 text-sm text-ink-muted">Describe the reward exactly as it will be honored. Nothing is shown to customers while this is off.</p>
          <form action={settingsAction} className="space-y-3">
            <input type="hidden" name="section" value="referral" />
            <input type="hidden" name="back" value="/admin/promotions" />
            <Checkbox name="enabled" value="true" defaultChecked={settings.referral.enabled} label="Referral program on" />
            <Field label="Reward description" htmlFor="ref-desc">
              <Textarea id="ref-desc" name="rewardDescription" defaultValue={settings.referral.rewardDescription} maxLength={300} />
            </Field>
            <SubmitButton variant="secondary">Save</SubmitButton>
          </form>
        </Card>
      </div>
    </>
  );
}
