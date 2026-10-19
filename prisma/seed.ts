/**
 * Seed script.
 * - Always: the service catalog (names/descriptions only, no prices).
 * - Only when DEMO_MODE=true: clearly labeled demo accounts, providers, a demo service
 *   area, demo pricing and demo settings. None of these are real businesses or rates.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

const db = new PrismaClient();
import { DEMO_PASSWORD } from "../src/lib/demo";
export { DEMO_PASSWORD };

const CATEGORIES = [
  {
    slug: "flatbed-towing",
    name: "Flatbed towing",
    description: "Vehicle loaded fully onto a flatbed. Best for AWD, EVs and damaged vehicles.",
    requiresDestination: true,
    requiredTruckTypes: "FLATBED",
    requiresWinch: false,
    sortOrder: 1,
  },
  {
    slug: "standard-towing",
    name: "Standard towing",
    description: "Wheel-lift or flatbed tow to a shop or address you choose.",
    requiresDestination: true,
    requiredTruckTypes: "FLATBED,WHEEL_LIFT,HEAVY_DUTY",
    requiresWinch: false,
    sortOrder: 2,
  },
  {
    slug: "motorcycle-towing",
    name: "Motorcycle towing",
    description: "Secure transport on a motorcycle-rated carrier.",
    requiresDestination: true,
    requiredTruckTypes: "MOTORCYCLE_TRAILER,FLATBED",
    requiresWinch: false,
    sortOrder: 3,
  },
  {
    slug: "winch-out",
    name: "Accident recovery / winch-out",
    description: "Recovery from a ditch, mud, sand or after a collision.",
    requiresDestination: false,
    requiredTruckTypes: "FLATBED,WHEEL_LIFT,HEAVY_DUTY",
    requiresWinch: true,
    sortOrder: 4,
  },
  {
    slug: "jump-start",
    name: "Battery jump-start",
    description: "Get a dead battery started so you can drive on.",
    requiresDestination: false,
    requiredTruckTypes: "",
    requiresWinch: false,
    sortOrder: 5,
  },
  {
    slug: "flat-tire",
    name: "Flat tire assistance",
    description: "Spare tire installed, if your vehicle has a usable spare.",
    requiresDestination: false,
    requiredTruckTypes: "",
    requiresWinch: false,
    sortOrder: 6,
  },
  {
    slug: "lockout",
    name: "Lockout assistance",
    description: "Help getting back into your vehicle. Proof of ownership required.",
    requiresDestination: false,
    requiredTruckTypes: "",
    requiresWinch: false,
    sortOrder: 7,
  },
  {
    slug: "fuel-delivery",
    name: "Fuel delivery",
    description: "Enough fuel to reach the nearest station. Fuel cost may be extra.",
    requiresDestination: false,
    requiredTruckTypes: "",
    requiresWinch: false,
    sortOrder: 8,
  },
  {
    slug: "other-roadside",
    name: "Other roadside assistance",
    description: "Something else? Describe it and a dispatcher will review.",
    requiresDestination: false,
    requiredTruckTypes: "",
    requiresWinch: false,
    sortOrder: 9,
  },
];

// DEMO pricing only. Real rates must be entered by an administrator before launch.
const DEMO_PRICING: Record<string, { base: number; inc: number; perMile: number; fee: number; min: number }> = {
  "flatbed-towing": { base: 9500, inc: 5, perMile: 450, fee: 500, min: 9500 },
  "standard-towing": { base: 7500, inc: 5, perMile: 400, fee: 500, min: 7500 },
  "motorcycle-towing": { base: 8500, inc: 5, perMile: 400, fee: 500, min: 8500 },
  "winch-out": { base: 11000, inc: 0, perMile: 0, fee: 500, min: 0 },
  "jump-start": { base: 6500, inc: 0, perMile: 0, fee: 500, min: 0 },
  "flat-tire": { base: 7000, inc: 0, perMile: 0, fee: 500, min: 0 },
  lockout: { base: 7000, inc: 0, perMile: 0, fee: 500, min: 0 },
  "fuel-delivery": { base: 6500, inc: 0, perMile: 0, fee: 500, min: 0 },
};

const TAMPA = { lat: 27.9506, lng: -82.4572 };
const DEMO_ZIPS = "33602,33603,33604,33605,33606,33607,33609,33610,33611,33629";

function demoFile(name: string) {
  // A tiny valid PDF so document review has something to open.
  const pdf = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj 4 0 obj<</Length 60>>stream\nBT /F1 14 Tf 20 70 Td (DEMO DOCUMENT - ${name}) Tj ET\nendstream endobj 5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`;
  const key = `demo/${randomBytes(8).toString("hex")}.pdf`;
  const full = path.resolve(process.env.UPLOAD_DIR || "./storage/uploads", key);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, pdf);
  return { storageKey: key, mimeType: "application/pdf", sizeBytes: Buffer.byteLength(pdf) };
}

async function main() {
  for (const c of CATEGORIES) {
    await db.serviceCategory.upsert({ where: { slug: c.slug }, create: c, update: {} });
  }
  console.log(`Service catalog: ${CATEGORIES.length} categories`);

  if (process.env.DEMO_MODE !== "true") {
    console.log("DEMO_MODE is not true: skipping demo accounts, pricing and settings.");
    console.log("Create the first administrator with: npm run create-admin -- <email> <name>");
    return;
  }
  if (await db.user.findFirst({ where: { isDemo: true } })) {
    console.log("Demo data already present. Run `npm run db:reset` for a clean demo.");
    return;
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const cats = Object.fromEntries((await db.serviceCategory.findMany()).map((c) => [c.slug, c]));

  const area = await db.serviceArea.create({
    data: {
      name: "Demo area: Tampa (sample data)",
      description: "Sample coverage used only in the demo environment.",
      centerLat: TAMPA.lat,
      centerLng: TAMPA.lng,
      radiusMiles: 25,
      zips: DEMO_ZIPS,
      isDemo: true,
    },
  });

  for (const [slug, p] of Object.entries(DEMO_PRICING)) {
    const tow = cats[slug].requiresDestination;
    await db.pricingRule.create({
      data: {
        serviceCategoryId: cats[slug].id,
        serviceAreaId: area.id,
        baseFeeCents: p.base,
        includedMiles: p.inc,
        perMileCents: p.perMile,
        serviceFeeCents: p.fee,
        minimumChargeCents: p.min,
        taxRateBps: 750,
        quoteValidityMinutes: 30,
        surcharges: JSON.stringify([
          { code: "AFTER_HOURS", label: "After-hours surcharge", amountCents: 2500, condition: "AFTER_HOURS" },
          ...(tow ? [{ code: "HEAVY", label: "Larger vehicle handling", amountCents: 1500, condition: "HEAVY_VEHICLE" }] : []),
        ]),
        isDemo: true,
      },
    });
  }
  // "Other roadside" intentionally has no rule: it always needs a dispatcher-confirmed quote.

  const settings = {
    dispatch: { autoDispatch: true, offerBatchSize: 3, offerTimeoutSeconds: 120, maxRounds: 3, maxRadiusMiles: 40, useReliability: true },
    cancellation: { feeAfterAssignmentCents: 2500, freeCancellationMinutes: 5 },
    payments: { platformFeeBps: 1500, requireAuthorizationBeforeDispatch: true, currency: "usd" },
    pricing: { revisionApprovalThresholdCents: 0 },
  };
  for (const [key, value] of Object.entries(settings)) {
    await db.setting.upsert({ where: { key }, create: { key, value: JSON.stringify(value) }, update: { value: JSON.stringify(value) } });
  }

  const staff = [
    { email: "admin@demo.callrecon.test", name: "Avery Admin (Demo)", adminRole: "SUPER_ADMIN" },
    { email: "dispatch@demo.callrecon.test", name: "Dana Dispatcher (Demo)", adminRole: "DISPATCHER" },
    { email: "support@demo.callrecon.test", name: "Sam Support (Demo)", adminRole: "SUPPORT" },
    { email: "finance@demo.callrecon.test", name: "Fran Finance (Demo)", adminRole: "FINANCE" },
  ];
  for (const s of staff) {
    await db.user.create({ data: { ...s, role: "ADMIN", passwordHash, isDemo: true, termsAcceptedAt: new Date() } });
  }

  const customer = await db.user.create({
    data: {
      email: "customer@demo.callrecon.test",
      name: "Casey Customer (Demo)",
      phone: "+15555550100",
      role: "CUSTOMER",
      passwordHash,
      isDemo: true,
      termsAcceptedAt: new Date(),
      customerProfile: { create: {} },
      vehicles: { create: [{ nickname: "Daily driver", make: "Toyota", model: "Camry", year: 2019, vehicleType: "SEDAN", drivetrain: "FWD", color: "Silver" }] },
      savedLocations: { create: [{ label: "Home (sample)", line1: "100 Sample St", city: "Tampa", state: "FL", zip: "33606", lat: 27.9378, lng: -82.4654 }] },
    },
  });

  const allIds = (slugs: string[]) => slugs.map((s) => cats[s].id);
  const providers = [
    {
      email: "driver.bayside@demo.callrecon.test",
      name: "Jordan Rivera (Demo)",
      businessName: "Bayside Towing (Demo)",
      truck: { truckType: "FLATBED", truckMake: "Ford", truckModel: "F-550 Rollback", truckYear: 2021, truckPlate: "DEMO101", truckColor: "White", canWinch: true },
      base: { baseAddress: "Tampa, FL (demo base)", baseLat: 27.96, baseLng: -82.46, serviceRadiusMiles: 20 },
      online: true,
      status: "APPROVED",
      services: allIds(["flatbed-towing", "standard-towing", "motorcycle-towing", "winch-out", "jump-start", "flat-tire", "lockout", "fuel-delivery", "other-roadside"]),
    },
    {
      email: "driver.harbor@demo.callrecon.test",
      name: "Morgan Lee (Demo)",
      businessName: "Harbor Roadside (Demo)",
      truck: { truckType: "SERVICE_VAN", truckMake: "Ram", truckModel: "ProMaster", truckYear: 2022, truckPlate: "DEMO202", truckColor: "Blue", canWinch: false },
      base: { baseAddress: "South Tampa, FL (demo base)", baseLat: 27.91, baseLng: -82.49, serviceRadiusMiles: 15 },
      online: true,
      status: "APPROVED",
      services: allIds(["jump-start", "flat-tire", "lockout", "fuel-delivery", "other-roadside"]),
    },
    {
      email: "driver.gulf@demo.callrecon.test",
      name: "Riley Chen (Demo)",
      businessName: "Gulf Moto Haul (Demo)",
      truck: {
        truckType: "MOTORCYCLE_TRAILER",
        truckMake: "Chevrolet",
        truckModel: "Silverado 2500 + trailer",
        truckYear: 2020,
        truckPlate: "DEMO303",
        truckColor: "Black",
        canWinch: false,
      },
      base: { baseAddress: "Tampa, FL (demo base)", baseLat: 27.98, baseLng: -82.44, serviceRadiusMiles: 25 },
      online: false,
      status: "APPROVED",
      services: allIds(["motorcycle-towing"]),
    },
    {
      email: "driver.pending@demo.callrecon.test",
      name: "Taylor Brooks (Demo)",
      businessName: "Sunrise Wrecker Co. (Demo)",
      truck: { truckType: "WHEEL_LIFT", truckMake: "International", truckModel: "MV Wrecker", truckYear: 2018, truckPlate: "DEMO404", truckColor: "Red", canWinch: true },
      base: { baseAddress: "Tampa, FL (demo base)", baseLat: 27.95, baseLng: -82.47, serviceRadiusMiles: 20 },
      online: false,
      status: "PENDING",
      services: allIds(["standard-towing", "winch-out"]),
    },
  ];

  const createdProviders = [];
  for (const p of providers) {
    const user = await db.user.create({
      data: { email: p.email, name: p.name, phone: null, role: "PROVIDER", passwordHash, isDemo: true, termsAcceptedAt: new Date(), locationConsentAt: new Date() },
    });
    const approved = p.status === "APPROVED";
    const profile = await db.providerProfile.create({
      data: {
        userId: user.id,
        businessName: p.businessName,
        businessPhone: null,
        licenseNumber: "DEMO-LICENSE",
        ...p.truck,
        ...p.base,
        serviceZips: DEMO_ZIPS,
        verificationStatus: p.status,
        verifiedAt: approved ? new Date() : null,
        isOnline: p.online,
        onlineSince: p.online ? new Date() : null,
        services: { create: p.services.map((id) => ({ serviceCategoryId: id, authorized: approved })) },
      },
    });
    for (const type of ["DRIVERS_LICENSE", "INSURANCE", "VEHICLE_REGISTRATION"]) {
      const f = await db.storedFile.create({ data: { ownerId: user.id, ...demoFile(type), originalName: `${type.toLowerCase()}-demo.pdf`, purpose: "PROVIDER_DOCUMENT" } });
      await db.providerDocument.create({
        data: {
          providerId: profile.id,
          type,
          fileId: f.id,
          status: approved ? "APPROVED" : "PENDING",
          reviewedAt: approved ? new Date() : null,
          expiresOn: new Date(Date.now() + 365 * 86400000),
        },
      });
    }
    createdProviders.push(profile);
  }

  // One finished job in the customer's history, so receipts and earnings have content.
  const done = new Date(Date.now() - 3 * 86400000);
  const breakdown = {
    currency: "usd",
    lines: [
      { code: "BASE", label: "Base service fee", amountCents: 6500, kind: "base" },
      { code: "SERVICE_FEE", label: "Call Recon service fee", amountCents: 500, kind: "service_fee" },
      { code: "TAX", label: "Tax (7.50%)", amountCents: 525, kind: "tax" },
    ],
    subtotalCents: 7000,
    taxCents: 525,
    taxRateBps: 750,
    totalCents: 7525,
    estimatedMiles: null,
    includedMiles: 0,
    billableMiles: 0,
    mileageSource: null,
    pricingRuleId: null,
  };
  const past = await db.serviceRequest.create({
    data: {
      number: "CR-DEMO01",
      customerId: customer.id,
      serviceCategoryId: cats["jump-start"].id,
      status: "COMPLETED",
      isDemo: true,
      vehicleSnapshot: JSON.stringify({ make: "Toyota", model: "Camry", year: 2019, vehicleType: "SEDAN", drivetrain: "FWD", color: "Silver" }),
      situation: "BATTERY",
      isSafeLocation: true,
      pickupLine1: "100 Sample St",
      pickupCity: "Tampa",
      pickupState: "FL",
      pickupZip: "33606",
      pickupLat: 27.9378,
      pickupLng: -82.4654,
      pickupSource: "DEMO_SAMPLE",
      finalTotalCents: 7525,
      createdAt: done,
      completedAt: new Date(done.getTime() + 50 * 60000),
      quotes: { create: { kind: "ESTIMATE", status: "APPROVED", breakdown: JSON.stringify(breakdown), totalCents: 7525, approvedAt: done } },
      assignments: { create: { providerId: createdProviders[1].id, method: "ACCEPTED_OFFER", createdAt: new Date(done.getTime() + 4 * 60000) } },
      receipt: { create: { number: "RC-DEMO0001", breakdown: JSON.stringify(breakdown), totalCents: 7525, isDemo: true } },
      payments: { create: { processor: "DEMO", status: "DEMO_NOT_CHARGED", amountCents: 7525 } },
    },
  });
  const steps: [string | null, string, string, number][] = [
    [null, "SUBMITTED", "CUSTOMER", 0],
    ["SUBMITTED", "SEARCHING", "SYSTEM", 0.2],
    ["SEARCHING", "ASSIGNED", "PROVIDER", 4],
    ["ASSIGNED", "EN_ROUTE", "PROVIDER", 6],
    ["EN_ROUTE", "ARRIVED", "PROVIDER", 30],
    ["ARRIVED", "IN_PROGRESS", "PROVIDER", 32],
    ["IN_PROGRESS", "COMPLETED", "PROVIDER", 50],
  ];
  for (const [from, to, role, min] of steps) {
    await db.requestStatusHistory.create({
      data: {
        requestId: past.id,
        fromStatus: from,
        toStatus: to,
        actorRole: role,
        actorId: role === "CUSTOMER" ? customer.id : role === "PROVIDER" ? createdProviders[1].userId : null,
        createdAt: new Date(done.getTime() + min * 60000),
      },
    });
  }
  await db.providerPayout.create({
    data: { providerId: createdProviders[1].id, requestId: past.id, grossCents: 7000, platformFeeCents: 1050, netCents: 5950, status: "DEMO_NOT_PAID" },
  });
  await db.providerProfile.update({ where: { id: createdProviders[1].id }, data: { jobsCompleted: 1, offersReceived: 1, offersAccepted: 1 } });

  await db.promoCode.create({ data: { code: "DEMO10", description: "Demo promo: 10% off", percentOff: 10, active: true } });

  console.log("Demo data created. All demo accounts use password:", DEMO_PASSWORD);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
