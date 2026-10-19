import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { TRUCK_TYPES } from "@/lib/constants";
import { categoryAction } from "@/app/actions/admin";
import { Badge, Card, Checkbox, Field, Flash, Input, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { ServiceIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Service catalog" };

type Cat = {
  id: string;
  name: string;
  description: string;
  requiresDestination: boolean;
  requiredTruckTypes: string;
  requiresWinch: boolean;
  active: boolean;
  sortOrder: number;
  slug?: string;
};

function CategoryForm({ c }: { c?: Cat }) {
  const key = c?.id ?? "new";
  const trucks = (c?.requiredTruckTypes ?? "").split(",").filter(Boolean);
  return (
    <form action={categoryAction} className="space-y-3">
      {c ? <input type="hidden" name="id" value={c.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
        <Field label="Name" htmlFor={`name-${key}`} required>
          <Input id={`name-${key}`} name="name" defaultValue={c?.name} required />
        </Field>
        <Field label="Order" htmlFor={`order-${key}`} required>
          <Input id={`order-${key}`} name="sortOrder" type="number" min={0} max={999} defaultValue={c?.sortOrder ?? 100} required />
        </Field>
      </div>
      <Field label="Short description" htmlFor={`desc-${key}`} required>
        <Input id={`desc-${key}`} name="description" defaultValue={c?.description} required />
      </Field>
      <fieldset>
        <legend className="text-sm font-semibold text-deep">Truck types that can do this job (none = any)</legend>
        <div className="grid sm:grid-cols-2">
          {TRUCK_TYPES.map((t) => (
            <Checkbox key={t.value} name="requiredTruckTypes" value={t.value} defaultChecked={trucks.includes(t.value)} label={t.label} className="min-h-10 py-1" />
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-x-6">
        <Checkbox name="requiresDestination" value="true" defaultChecked={c?.requiresDestination} label="Needs a tow destination" />
        <Checkbox name="requiresWinch" value="true" defaultChecked={c?.requiresWinch} label="Needs a winch" />
        <Checkbox name="active" value="true" defaultChecked={c?.active ?? true} label="Offered to customers" />
      </div>
      <SubmitButton variant={c ? "secondary" : "primary"} size="sm">
        {c ? "Save" : "Add service"}
      </SubmitButton>
    </form>
  );
}

export default async function AdminCatalog({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requirePagePermission("catalog.manage");
  const sp = await searchParams;
  const cats = await db.serviceCategory.findMany({
    orderBy: { sortOrder: "asc" },
  });
  return (
    <>
      <PageHeader
        title="Service catalog"
        description="Services customers can request, and the equipment each one needs. Providers must also be authorized for a service to receive it."
      />
      <Flash {...sp} />
      <div className="space-y-4">
        {cats.map((c) => (
          <Card key={c.id}>
            <details>
              <summary className="flex cursor-pointer items-center gap-3">
                <ServiceIcon slug={c.slug} className="text-sea" />
                <span className="flex-1 font-semibold text-deep">{c.name}</span>
                {!c.active ? <Badge>Hidden</Badge> : null}
              </summary>
              <div className="mt-4">
                <CategoryForm c={c} />
              </div>
            </details>
          </Card>
        ))}
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Add a service</h2>
          <CategoryForm />
        </Card>
      </div>
    </>
  );
}
