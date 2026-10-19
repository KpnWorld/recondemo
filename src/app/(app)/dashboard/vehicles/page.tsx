import type { Metadata } from "next";
import { requirePageUser } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { DRIVETRAINS, VEHICLE_TYPES } from "@/lib/constants";
import { vehicleAction } from "@/app/actions/customer";
import { Card, EmptyState, Field, Flash, Input, PageHeader, Select } from "@/components/ui";
import { ConfirmSubmit, SubmitButton } from "@/components/client";
import { TruckIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Vehicles" };

type V = {
  id?: string;
  nickname?: string | null;
  make?: string;
  model?: string;
  year?: number;
  vehicleType?: string;
  drivetrain?: string | null;
  color?: string | null;
  licensePlate?: string | null;
  specialHandling?: string | null;
};

function VehicleFields({ v, idp }: { v: V; idp: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Nickname" htmlFor={`${idp}-nick`}>
        <Input id={`${idp}-nick`} name="nickname" defaultValue={v.nickname ?? ""} />
      </Field>
      <Field label="Make" htmlFor={`${idp}-make`} required>
        <Input id={`${idp}-make`} name="make" defaultValue={v.make} required />
      </Field>
      <Field label="Model" htmlFor={`${idp}-model`} required>
        <Input id={`${idp}-model`} name="model" defaultValue={v.model} required />
      </Field>
      <Field label="Year" htmlFor={`${idp}-year`} required>
        <Input id={`${idp}-year`} name="year" inputMode="numeric" defaultValue={v.year} required pattern="\d{4}" />
      </Field>
      <Field label="Type" htmlFor={`${idp}-type`} required>
        <Select id={`${idp}-type`} name="vehicleType" defaultValue={v.vehicleType ?? "SEDAN"}>
          {VEHICLE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Drivetrain" htmlFor={`${idp}-dt`}>
        <Select id={`${idp}-dt`} name="drivetrain" defaultValue={v.drivetrain ?? ""}>
          <option value="">Not sure</option>
          {DRIVETRAINS.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </Select>
      </Field>
      <Field label="Color" htmlFor={`${idp}-color`}>
        <Input id={`${idp}-color`} name="color" defaultValue={v.color ?? ""} />
      </Field>
      <Field label="License plate" htmlFor={`${idp}-plate`}>
        <Input id={`${idp}-plate`} name="licensePlate" defaultValue={v.licensePlate ?? ""} maxLength={12} />
      </Field>
      <Field label="Special handling" htmlFor={`${idp}-sh`} className="sm:col-span-2">
        <Input id={`${idp}-sh`} name="specialHandling" defaultValue={v.specialHandling ?? ""} />
      </Field>
    </div>
  );
}

export default async function VehiclesPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requirePageUser(["CUSTOMER"]);
  const sp = await searchParams;
  const vehicles = await db.vehicle.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  return (
    <>
      <PageHeader title="Saved vehicles" description="Saved vehicles fill in automatically when you request help." />
      <Flash {...sp} />
      <div className="space-y-4">
        {vehicles.length === 0 ? <EmptyState icon={<TruckIcon />} title="No saved vehicles yet" /> : null}
        {vehicles.map((v) => (
          <Card key={v.id}>
            <details>
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                <span>
                  <span className="block font-semibold text-deep">
                    {v.year} {v.make} {v.model}
                  </span>
                  <span className="text-sm text-ink-muted">{[v.nickname, v.color, v.drivetrain, v.licensePlate].filter(Boolean).join(" · ") || "No extra details"}</span>
                </span>
                <span className="text-sm font-semibold text-sea">Edit</span>
              </summary>
              <form action={vehicleAction} className="mt-5 space-y-4">
                <input type="hidden" name="id" value={v.id} />
                <VehicleFields v={v} idp={v.id} />
                <div className="flex flex-wrap gap-2">
                  <SubmitButton name="op" value="save">
                    Save changes
                  </SubmitButton>
                  <ConfirmSubmit name="op" value="delete" variant="danger" message="Remove this vehicle?" formNoValidate>
                    Remove
                  </ConfirmSubmit>
                </div>
              </form>
            </details>
          </Card>
        ))}
        <Card>
          <h2 className="mb-4 text-lg font-semibold">Add a vehicle</h2>
          <form action={vehicleAction} className="space-y-4">
            <VehicleFields v={{}} idp="new" />
            <SubmitButton>Save vehicle</SubmitButton>
          </form>
        </Card>
      </div>
    </>
  );
}
