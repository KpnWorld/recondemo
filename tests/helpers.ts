import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/crypto";
import type { Actor } from "@/lib/permissions";
import type { AdminRole } from "@/lib/constants";
import { resetRateLimits } from "@/lib/rate-limit";
import { saveSettingsSection, DEFAULT_SETTINGS } from "@/lib/settings";

export async function resetDb() {
  resetRateLimits();
  const tables = await db.$queryRawUnsafe<{ name: string }[]>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%'");
  await db.$executeRawUnsafe("PRAGMA foreign_keys = OFF");
  for (const t of tables) await db.$executeRawUnsafe(`DELETE FROM "${t.name}"`);
  await db.$executeRawUnsafe("PRAGMA foreign_keys = ON");
}

let n = 0;
const uniq = () => `${Date.now().toString(36)}${n++}`;
const PASSWORD_HASH = hashPassword("Password123!");

export const asActor = (u: { id: string; role: string; adminRole: string | null }): Actor => ({
  id: u.id,
  role: u.role as Actor["role"],
  adminRole: u.adminRole as AdminRole | null,
});

export async function makeCustomer() {
  const u = await db.user.create({
    data: { email: `c${uniq()}@test.dev`, name: "Test Customer", role: "CUSTOMER", passwordHash: await PASSWORD_HASH, customerProfile: { create: {} } },
  });
  return asActor(u);
}

export async function makeAdmin(adminRole: AdminRole = "SUPER_ADMIN") {
  const u = await db.user.create({ data: { email: `a${uniq()}@test.dev`, name: `Admin ${adminRole}`, role: "ADMIN", adminRole, passwordHash: await PASSWORD_HASH } });
  return asActor(u);
}

export const ZIP = "33602";
export const PICKUP = { lat: 27.95, lng: -82.46 };

export async function seedCatalog() {
  const jump = await db.serviceCategory.create({ data: { slug: "jump-start", name: "Battery jump-start", description: "Jump", requiresDestination: false } });
  const tow = await db.serviceCategory.create({
    data: { slug: "flatbed-towing", name: "Flatbed towing", description: "Tow", requiresDestination: true, requiredTruckTypes: "FLATBED" },
  });
  const other = await db.serviceCategory.create({ data: { slug: "other", name: "Other", description: "Other", requiresDestination: false } });
  await db.pricingRule.create({ data: { serviceCategoryId: jump.id, baseFeeCents: 6500, serviceFeeCents: 500, taxRateBps: 750, quoteValidityMinutes: 30 } });
  await db.pricingRule.create({
    data: { serviceCategoryId: tow.id, baseFeeCents: 9500, includedMiles: 5, perMileCents: 450, serviceFeeCents: 500, taxRateBps: 750, quoteValidityMinutes: 30 },
  });
  await saveSettingsSection("cancellation", { feeAfterAssignmentCents: 2500, freeCancellationMinutes: 5 }, "test");
  await saveSettingsSection("payments", { ...DEFAULT_SETTINGS.payments, platformFeeBps: 1500 }, "test");
  return { jump, tow, other };
}

export async function makeProvider(opts: { services: string[]; approved?: boolean; online?: boolean; truckType?: string; lat?: number; lng?: number; name?: string }) {
  const approved = opts.approved ?? true;
  const u = await db.user.create({
    data: { email: `p${uniq()}@test.dev`, name: opts.name ?? "Pat Provider", role: "PROVIDER", passwordHash: await PASSWORD_HASH, locationConsentAt: new Date() },
  });
  const profile = await db.providerProfile.create({
    data: {
      userId: u.id,
      businessName: `${opts.name ?? "Provider"} Towing`,
      verificationStatus: approved ? "APPROVED" : "PENDING",
      isOnline: opts.online ?? true,
      truckType: opts.truckType ?? "FLATBED",
      truckPlate: "TEST1",
      baseLat: opts.lat ?? 27.96,
      baseLng: opts.lng ?? -82.46,
      serviceRadiusMiles: 20,
      serviceZips: ZIP,
      services: { create: opts.services.map((id) => ({ serviceCategoryId: id, authorized: approved })) },
    },
  });
  return { actor: asActor(u), profile };
}

export function requestInput(serviceCategoryId: string, extra: Record<string, unknown> = {}) {
  return {
    serviceCategoryId,
    pickup: { line1: "1 Test Ave", city: "Tampa", state: "FL", zip: ZIP, lat: PICKUP.lat, lng: PICKUP.lng, landmarks: "Near the gas station", source: "MANUAL" },
    destination: null,
    vehicle: { make: "Toyota", model: "Camry", year: 2019, vehicleType: "SEDAN", drivetrain: "FWD" },
    situation: "BATTERY",
    isSafeLocation: true,
    acceptTerms: true,
    locationConsent: true,
    ...extra,
  };
}
