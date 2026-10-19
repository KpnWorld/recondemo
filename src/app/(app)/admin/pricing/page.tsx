import type { Metadata } from "next";
import Link from "next/link";
import { requirePagePermission } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { pricingRuleAction } from "@/app/actions/admin";
import { Alert, Badge, Card, Checkbox, Field, Flash, Input, LinkButton, PageHeader, Select, Table, Td } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export const metadata: Metadata = { title: "Pricing rules" };

type Surcharge = {
  code: string;
  label: string;
  amountCents: number;
  condition: string;
};
const CONDITIONS = [
  ["ALWAYS", "Always"],
  ["AFTER_HOURS", "After hours (7pm–7am)"],
  ["WEEKEND", "Weekends"],
  ["HEAVY_VEHICLE", "Pickups and vans"],
] as const;
const dollars = (c: number | null | undefined) => (c == null ? "" : (c / 100).toFixed(2));

export default async function AdminPricing({ searchParams }: { searchParams: Promise<{ edit?: string; ok?: string; error?: string }> }) {
  await requirePagePermission("pricing.manage");
  const sp = await searchParams;
  const [rules, categories, areas] = await Promise.all([
    db.pricingRule.findMany({
      include: { serviceCategory: true, serviceArea: true },
      orderBy: [{ serviceCategory: { sortOrder: "asc" } }, { createdAt: "asc" }],
    }),
    db.serviceCategory.findMany({ orderBy: { sortOrder: "asc" } }),
    db.serviceArea.findMany({ orderBy: { name: "asc" } }),
  ]);
  const editing = sp.edit === "new" ? null : rules.find((r) => r.id === sp.edit);
  const showForm = sp.edit === "new" || Boolean(editing);
  const surcharges: Surcharge[] = editing ? JSON.parse(editing.surcharges) : [];
  const rowsToShow = [...surcharges, ...Array.from({ length: 2 }, () => null)];
  const uncovered = categories.filter((c) => c.active && !rules.some((r) => r.active && r.serviceCategoryId === c.id));

  return (
    <>
      <PageHeader
        title="Pricing rules"
        description="Every customer estimate is calculated from these rules. Area-specific rules take priority over general ones."
        actions={!showForm ? <LinkButton href="/admin/pricing?edit=new">New rule</LinkButton> : null}
      />
      <Flash ok={sp.ok} error={sp.error} />
      {uncovered.length ? (
        <Alert tone="warning" className="mb-5">
          No active rule for: {uncovered.map((c) => c.name).join(", ")}. Customers requesting these will wait for a dispatcher-confirmed quote.
        </Alert>
      ) : null}

      {showForm ? (
        <Card className="mb-6">
          <h2 className="mb-4 text-lg font-semibold">{editing ? `Edit rule: ${editing.serviceCategory.name}` : "New pricing rule"}</h2>
          {editing?.isDemo ? (
            <Alert tone="warning" className="mb-4">
              This is a demo rule with sample prices. Saving it marks it as a real rule.
            </Alert>
          ) : null}
          <form action={pricingRuleAction} className="space-y-5">
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Service" htmlFor="serviceCategoryId" required>
                <Select id="serviceCategoryId" name="serviceCategoryId" defaultValue={editing?.serviceCategoryId ?? ""} required>
                  <option value="" disabled>
                    Choose…
                  </option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Service area" htmlFor="serviceAreaId" hint="Leave as “All areas” for a default rule.">
                <Select id="serviceAreaId" name="serviceAreaId" defaultValue={editing?.serviceAreaId ?? ""}>
                  <option value="">All areas</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Base / hookup fee (USD)" htmlFor="baseFee" required>
                <Input id="baseFee" name="baseFee" type="number" step="0.01" min={0} defaultValue={dollars(editing?.baseFeeCents)} required />
              </Field>
              <Field label="Service fee (USD)" htmlFor="serviceFee" hint="Platform/booking fee shown as its own line.">
                <Input id="serviceFee" name="serviceFee" type="number" step="0.01" min={0} defaultValue={dollars(editing?.serviceFeeCents)} />
              </Field>
              <Field label="Included miles" htmlFor="includedMiles">
                <Input id="includedMiles" name="includedMiles" type="number" step="0.1" min={0} defaultValue={editing?.includedMiles ?? ""} />
              </Field>
              <Field label="Per-mile rate after included miles (USD)" htmlFor="perMile">
                <Input id="perMile" name="perMile" type="number" step="0.01" min={0} defaultValue={dollars(editing?.perMileCents)} />
              </Field>
              <Field label="Minimum charge (USD)" htmlFor="minimumCharge">
                <Input id="minimumCharge" name="minimumCharge" type="number" step="0.01" min={0} defaultValue={dollars(editing?.minimumChargeCents)} />
              </Field>
              <Field label="Tax rate (%)" htmlFor="taxPercent" hint="Confirm applicable sales tax with your accountant.">
                <Input id="taxPercent" name="taxPercent" type="number" step="0.01" min={0} max={30} defaultValue={editing ? editing.taxRateBps / 100 : ""} />
              </Field>
              <Field label="Quote valid for (minutes)" htmlFor="quoteValidityMinutes">
                <Input id="quoteValidityMinutes" name="quoteValidityMinutes" type="number" min={5} max={1440} defaultValue={editing?.quoteValidityMinutes ?? 30} />
              </Field>
            </div>
            <fieldset>
              <legend className="mb-1 font-semibold text-deep">Disclosed surcharges</legend>
              <p className="mb-3 text-sm text-ink-muted">Shown as separate lines on the estimate whenever their condition applies. Leave a row blank to remove it.</p>
              <div className="space-y-2">
                {rowsToShow.map((s, i) => (
                  <div key={i} className="grid gap-2 sm:grid-cols-[1fr_8rem_14rem]">
                    <input type="hidden" name={`s_code_${i}`} value={s?.code ?? ""} />
                    <label className="sr-only" htmlFor={`s_label_${i}`}>
                      Surcharge {i + 1} label
                    </label>
                    <Input id={`s_label_${i}`} name={`s_label_${i}`} defaultValue={s?.label ?? ""} placeholder="Label, e.g. After-hours service" />
                    <label className="sr-only" htmlFor={`s_amount_${i}`}>
                      Surcharge {i + 1} amount
                    </label>
                    <Input id={`s_amount_${i}`} name={`s_amount_${i}`} type="number" step="0.01" min={0} defaultValue={dollars(s?.amountCents)} placeholder="USD" />
                    <label className="sr-only" htmlFor={`s_condition_${i}`}>
                      Surcharge {i + 1} condition
                    </label>
                    <Select id={`s_condition_${i}`} name={`s_condition_${i}`} defaultValue={s?.condition ?? "ALWAYS"}>
                      {CONDITIONS.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </Select>
                  </div>
                ))}
              </div>
            </fieldset>
            <Checkbox name="active" value="true" defaultChecked={editing?.active ?? true} label="Active" />
            <div className="flex gap-2">
              <SubmitButton>Save rule</SubmitButton>
              <LinkButton href="/admin/pricing" variant="ghost">
                Cancel
              </LinkButton>
            </div>
          </form>
        </Card>
      ) : null}

      <Card>
        <Table head={["Service", "Area", "Base", "Miles incl.", "Per mile", "Service fee", "Minimum", "Tax", "Surcharges", ""]} caption="Pricing rules">
          {rules.map((r) => (
            <tr key={r.id} className={r.active ? undefined : "opacity-60"}>
              <Td>
                <span className="font-semibold">{r.serviceCategory.name}</span> {r.isDemo ? <Badge>Demo</Badge> : null} {!r.active ? <Badge>Inactive</Badge> : null}
              </Td>
              <Td>{r.serviceArea?.name ?? "All areas"}</Td>
              <Td className="tabular-nums">{formatCents(r.baseFeeCents)}</Td>
              <Td>{r.includedMiles}</Td>
              <Td className="tabular-nums">{r.perMileCents ? formatCents(r.perMileCents) : "—"}</Td>
              <Td className="tabular-nums">{r.serviceFeeCents ? formatCents(r.serviceFeeCents) : "—"}</Td>
              <Td className="tabular-nums">{r.minimumChargeCents ? formatCents(r.minimumChargeCents) : "—"}</Td>
              <Td>{(r.taxRateBps / 100).toFixed(2)}%</Td>
              <Td>{(JSON.parse(r.surcharges) as Surcharge[]).length || "—"}</Td>
              <Td>
                <Link href={`/admin/pricing?edit=${r.id}`}>Edit</Link>
              </Td>
            </tr>
          ))}
        </Table>
        {!rules.length ? (
          <p className="py-6 text-center text-sm text-ink-muted">No pricing rules yet. Customers will receive dispatcher-confirmed quotes until you add them.</p>
        ) : null}
      </Card>
    </>
  );
}
