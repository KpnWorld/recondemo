import { z } from "zod";
import { AppError } from "./errors";
import { DOCUMENT_TYPES, DRIVERS_OR_NULL, SITUATION_VALUES, TICKET_CATEGORY_VALUES, TRUCK_TYPE_VALUES, VEHICLE_TYPE_VALUES } from "./validation-enums";

export function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input);
  if (!r.success) {
    const fieldErrors = r.error.flatten().fieldErrors as Record<string, string[] | undefined>;
    const first = r.error.issues[0];
    throw new AppError("VALIDATION", first ? `${first.path.join(".") ? `${humanize(first.path.join("."))}: ` : ""}${first.message}` : "Please check the form.", fieldErrors);
  }
  return r.data;
}

const humanize = (s: string) =>
  s
    .replace(/\./g, " ")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase());

const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(200);
export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(200)
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), "Include at least one letter and one number");
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[^\d+]/g, ""))
  .refine((v) => /^\+?1?\d{10}$/.test(v), "Enter a 10-digit US phone number")
  .transform((v) => {
    const digits = v.replace(/\D/g, "");
    return `+1${digits.slice(-10)}`;
  });
export const zipSchema = z
  .string()
  .trim()
  .regex(/^\d{5}$/, "Enter a 5-digit ZIP code");
export const stateSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, "Use the 2-letter state code");
const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);

export const signupSchema = z.object({
  name: trimmed(100).min(2, "Enter your name"),
  email: emailSchema,
  phone: phoneSchema.optional().or(z.literal("").transform(() => undefined)),
  password: passwordSchema,
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: "Please accept the terms to continue" }),
  }),
  emailNotifications: z.boolean().default(false),
  smsNotifications: z.boolean().default(false),
  accountType: z.enum(["CUSTOMER", "PROVIDER"]).default("CUSTOMER"),
  businessName: optionalText(120),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(200),
});

export const addressSchema = z.object({
  line1: trimmed(160).min(3, "Enter a street address or nearest cross street"),
  city: trimmed(80).min(2, "Enter a city"),
  state: stateSchema,
  zip: zipSchema,
  lat: lat.nullable().optional(),
  lng: lng.nullable().optional(),
});

export const vehicleSchema = z.object({
  nickname: optionalText(40),
  make: trimmed(40).min(1, "Enter the make"),
  model: trimmed(40).min(1, "Enter the model"),
  year: z.coerce
    .number()
    .int()
    .min(1950, "Enter a valid year")
    .max(new Date().getFullYear() + 1, "Enter a valid year"),
  vehicleType: z.enum(VEHICLE_TYPE_VALUES),
  drivetrain: DRIVERS_OR_NULL,
  color: optionalText(30),
  licensePlate: optionalText(12),
  specialHandling: optionalText(300),
});

export const createRequestSchema = z.object({
  serviceCategoryId: z.string().min(1, "Choose a service"),
  pickup: addressSchema.extend({
    landmarks: optionalText(500),
    source: z.enum(["DEVICE", "MANUAL", "SAVED", "MAP_PIN", "DEMO_SAMPLE"]),
  }),
  destination: addressSchema.nullable().optional(),
  vehicleId: z.string().optional().nullable(),
  vehicle: vehicleSchema,
  saveVehicle: z.boolean().default(false),
  vehicleCondition: optionalText(300),
  situation: z.enum(SITUATION_VALUES),
  situationNotes: optionalText(1000),
  isSafeLocation: z.boolean({
    required_error: "Tell us whether you are in a safe location",
  }),
  promoCode: optionalText(40),
  acceptTerms: z.literal(true, {
    errorMap: () => ({
      message: "Please review and accept the cancellation terms",
    }),
  }),
  locationConsent: z.literal(true, {
    errorMap: () => ({
      message: "We need your permission to share your pickup location with the assigned provider",
    }),
  }),
});
export type CreateRequestInput = z.input<typeof createRequestSchema>;

export const providerOnboardingSchema = z.object({
  businessName: trimmed(120).min(2, "Enter your business name"),
  businessPhone: phoneSchema.optional().or(z.literal("").transform(() => undefined)),
  licenseNumber: optionalText(60),
  truckType: z.enum(TRUCK_TYPE_VALUES),
  truckMake: trimmed(40).min(1, "Enter the truck make"),
  truckModel: trimmed(40).min(1, "Enter the truck model"),
  truckYear: z.coerce
    .number()
    .int()
    .min(1980)
    .max(new Date().getFullYear() + 1),
  truckPlate: trimmed(12).min(2, "Enter the plate"),
  truckColor: optionalText(30),
  canWinch: z.boolean().default(false),
  baseAddress: optionalText(200),
  baseLat: lat.nullable().optional(),
  baseLng: lng.nullable().optional(),
  serviceRadiusMiles: z.coerce.number().min(1).max(200).nullable().optional(),
  serviceZips: z
    .string()
    .trim()
    .max(2000)
    .refine(
      (s) =>
        s === "" ||
        s
          .split(/[\s,]+/)
          .filter(Boolean)
          .every((z) => /^\d{5}$/.test(z)),
      "ZIP codes must be 5 digits, separated by commas",
    ),
  serviceCategoryIds: z.array(z.string()).min(1, "Choose at least one service you offer"),
  operatingHours: z.record(z.enum(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]), z.tuple([z.string().regex(/^\d{2}:\d{2}$/), z.string().regex(/^\d{2}:\d{2}$/)])),
});

export const documentTypeSchema = z.enum(DOCUMENT_TYPES);

export const ticketSchema = z.object({
  contactName: trimmed(100).min(2, "Enter your name"),
  contactEmail: emailSchema,
  category: z.enum(TICKET_CATEGORY_VALUES),
  subject: trimmed(150).min(3, "Add a short subject"),
  body: trimmed(5000).min(10, "Tell us a little more (at least 10 characters)"),
  requestNumber: optionalText(20),
});

export const pricingRuleSchema = z.object({
  serviceCategoryId: z.string().min(1),
  serviceAreaId: z.string().nullable().optional(),
  baseFeeCents: z.number().int().min(0).max(10_000_00),
  includedMiles: z.number().min(0).max(500),
  perMileCents: z.number().int().min(0).max(100_00),
  serviceFeeCents: z.number().int().min(0).max(1_000_00),
  minimumChargeCents: z.number().int().min(0).max(10_000_00),
  taxRateBps: z.number().int().min(0).max(3000),
  quoteValidityMinutes: z
    .number()
    .int()
    .min(5)
    .max(24 * 60),
  surcharges: z.array(
    z.object({
      code: z.string().trim().min(1).max(40),
      label: z.string().trim().min(1).max(80),
      amountCents: z.number().int().min(0).max(1_000_00),
      condition: z.enum(["ALWAYS", "AFTER_HOURS", "WEEKEND", "HEAVY_VEHICLE"]),
    }),
  ),
  active: z.boolean(),
});

export const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: optionalText(1000),
});
export const messageSchema = z.object({
  body: trimmed(1000).min(1, "Type a message"),
});
