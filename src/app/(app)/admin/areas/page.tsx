import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { areaAction } from "@/app/actions/admin";
import { Alert, Badge, Card, Checkbox, Field, Flash, Input, PageHeader, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export const metadata: Metadata = { title: "Service areas" };

type Area = {
  id: string;
  name: string;
  description: string | null;
  centerLat: number | null;
  centerLng: number | null;
  radiusMiles: number | null;
  zips: string;
  active: boolean;
};

function AreaForm({ a }: { a?: Area }) {
  const k = a?.id ?? "new";
  return (
    <form action={areaAction} className="grid gap-3 sm:grid-cols-3">
      {a ? <input type="hidden" name="id" value={a.id} /> : null}
      <Field label="Name" htmlFor={`n-${k}`} required className="sm:col-span-3">
        <Input id={`n-${k}`} name="name" defaultValue={a?.name} required />
      </Field>
      <Field label="ZIP codes" htmlFor={`z-${k}`} hint="Comma separated." className="sm:col-span-3">
        <Textarea id={`z-${k}`} name="zips" defaultValue={a?.zips.split(",").filter(Boolean).join(", ")} rows={2} />
      </Field>
      <Field label="Center latitude" htmlFor={`la-${k}`}>
        <Input id={`la-${k}`} name="centerLat" type="number" step="any" defaultValue={a?.centerLat ?? ""} />
      </Field>
      <Field label="Center longitude" htmlFor={`lo-${k}`}>
        <Input id={`lo-${k}`} name="centerLng" type="number" step="any" defaultValue={a?.centerLng ?? ""} />
      </Field>
      <Field label="Radius (miles)" htmlFor={`r-${k}`}>
        <Input id={`r-${k}`} name="radiusMiles" type="number" min={1} max={500} defaultValue={a?.radiusMiles ?? ""} />
      </Field>
      <Field label="Internal description" htmlFor={`d-${k}`} className="sm:col-span-3">
        <Input id={`d-${k}`} name="description" defaultValue={a?.description ?? ""} />
      </Field>
      <Checkbox name="active" value="true" defaultChecked={a?.active ?? true} label="Accepting requests" className="sm:col-span-3" />
      <div className="sm:col-span-3">
        <SubmitButton size="sm" variant={a ? "secondary" : "primary"}>
          {a ? "Save area" : "Add area"}
        </SubmitButton>
      </div>
    </form>
  );
}

export default async function AdminAreas({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requirePagePermission("areas.manage");
  const sp = await searchParams;
  const areas = await db.serviceArea.findMany({
    orderBy: { createdAt: "asc" },
  });
  return (
    <>
      <PageHeader title="Service areas" description="Customers outside every active area are told service isn't available yet, before they enter any other details." />
      <Flash {...sp} />
      <Alert tone="info" className="mb-5">
        Only list areas where verified providers are actually onboarded. Public pages never claim coverage beyond what&apos;s configured here.
      </Alert>
      <div className="space-y-4">
        {areas.map((a) => (
          <Card key={a.id}>
            <details>
              <summary className="flex cursor-pointer items-center gap-2 font-semibold text-deep">
                <span className="flex-1">{a.name}</span>
                {a.isDemo ? <Badge>Demo</Badge> : null}
                <Badge tone={a.active ? "ok" : "neutral"}>{a.active ? "Active" : "Inactive"}</Badge>
              </summary>
              <div className="mt-4">
                <AreaForm a={a} />
              </div>
            </details>
          </Card>
        ))}
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Add a service area</h2>
          <AreaForm />
        </Card>
      </div>
    </>
  );
}
