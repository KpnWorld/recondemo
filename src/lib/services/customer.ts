import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { Actor } from "@/lib/permissions";
import { assertRole } from "@/lib/permissions";
import { addressSchema, parse, vehicleSchema } from "@/lib/validation";
import { z } from "zod";

export async function saveVehicle(actor: Actor, id: string | null, input: unknown) {
  assertRole(actor, "CUSTOMER");
  const data = parse(vehicleSchema, input);
  if (id) {
    const res = await db.vehicle.updateMany({
      where: { id, userId: actor.id },
      data,
    });
    if (res.count !== 1) throw new AppError("NOT_FOUND", "Vehicle not found.");
    return;
  }
  if ((await db.vehicle.count({ where: { userId: actor.id } })) >= 10) throw new AppError("CONFLICT", "You can save up to 10 vehicles.");
  await db.vehicle.create({ data: { ...data, userId: actor.id } });
}

export async function deleteVehicle(actor: Actor, id: string) {
  assertRole(actor, "CUSTOMER");
  const v = await db.vehicle.findFirst({ where: { id, userId: actor.id } });
  if (!v) throw new AppError("NOT_FOUND", "Vehicle not found.");
  // Requests keep their own vehicle snapshot, so unlinking is safe.
  await db.$transaction([
    db.serviceRequest.updateMany({
      where: { vehicleId: id },
      data: { vehicleId: null },
    }),
    db.vehicle.delete({ where: { id } }),
  ]);
}

export async function saveLocation(actor: Actor, input: unknown) {
  assertRole(actor, "CUSTOMER");
  const data = parse(addressSchema.extend({ label: z.string().trim().min(1).max(40) }), input);
  if ((await db.savedLocation.count({ where: { userId: actor.id } })) >= 10) throw new AppError("CONFLICT", "You can save up to 10 locations.");
  await db.savedLocation.create({
    data: {
      userId: actor.id,
      label: data.label,
      line1: data.line1,
      city: data.city,
      state: data.state,
      zip: data.zip,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
    },
  });
}

export async function deleteLocation(actor: Actor, id: string) {
  assertRole(actor, "CUSTOMER");
  const res = await db.savedLocation.deleteMany({
    where: { id, userId: actor.id },
  });
  if (res.count !== 1) throw new AppError("NOT_FOUND", "Location not found.");
}
