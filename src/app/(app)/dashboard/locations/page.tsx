import type { Metadata } from "next";
import { requirePageUser } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { locationAction } from "@/app/actions/customer";
import { Card, EmptyState, Field, Flash, Input, PageHeader } from "@/components/ui";
import { ConfirmSubmit, SubmitButton } from "@/components/client";
import { PinIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Saved places" };

export default async function LocationsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requirePageUser(["CUSTOMER"]);
  const sp = await searchParams;
  const places = await db.savedLocation.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  return (
    <>
      <PageHeader title="Saved places" description="Home, work or your preferred repair shop, ready to pick as a pickup or destination." />
      <Flash {...sp} />
      <Card className="mb-4">
        {places.length ? (
          <ul className="divide-y divide-line">
            {places.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                <span className="flex items-start gap-3">
                  <PinIcon className="mt-0.5 shrink-0 text-sea" />
                  <span>
                    <span className="block font-semibold text-deep">{p.label}</span>
                    <span className="text-sm text-ink-muted">
                      {p.line1}, {p.city}, {p.state} {p.zip}
                    </span>
                  </span>
                </span>
                <form action={locationAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <ConfirmSubmit name="op" value="delete" variant="ghost" size="sm" message={`Remove ${p.label}?`}>
                    Remove<span className="sr-only"> {p.label}</span>
                  </ConfirmSubmit>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<PinIcon />} title="No saved places yet" />
        )}
      </Card>
      <Card>
        <h2 className="mb-4 text-lg font-semibold">Add a place</h2>
        <form action={locationAction} className="grid gap-4 sm:grid-cols-6">
          <Field label="Label" htmlFor="label" required className="sm:col-span-2">
            <Input id="label" name="label" placeholder="Home" required maxLength={40} />
          </Field>
          <Field label="Street address" htmlFor="line1" required className="sm:col-span-4">
            <Input id="line1" name="line1" autoComplete="street-address" required />
          </Field>
          <Field label="City" htmlFor="city" required className="sm:col-span-3">
            <Input id="city" name="city" autoComplete="address-level2" required />
          </Field>
          <Field label="State" htmlFor="state" required className="sm:col-span-1">
            <Input id="state" name="state" maxLength={2} placeholder="FL" required />
          </Field>
          <Field label="ZIP" htmlFor="zip" required className="sm:col-span-2">
            <Input id="zip" name="zip" inputMode="numeric" maxLength={5} required />
          </Field>
          <div className="sm:col-span-6">
            <SubmitButton>Save place</SubmitButton>
          </div>
        </form>
      </Card>
    </>
  );
}
