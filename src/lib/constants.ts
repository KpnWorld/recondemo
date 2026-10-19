// Shared enum-like values. The database stores these as strings (portable across
// SQLite and Postgres); every write goes through zod schemas built from these lists.

export const ROLES = ["CUSTOMER", "PROVIDER", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const ADMIN_ROLES = ["SUPER_ADMIN", "DISPATCHER", "SUPPORT", "FINANCE"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const REQUEST_STATUSES = ["SUBMITTED", "SEARCHING", "ASSIGNED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_PROVIDER_AVAILABLE"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const ACTIVE_STATUSES: RequestStatus[] = ["SUBMITTED", "SEARCHING", "ASSIGNED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS", "NO_PROVIDER_AVAILABLE"];
export const TERMINAL_STATUSES: RequestStatus[] = ["COMPLETED", "CANCELLED"];
/** Statuses during which an assigned provider is actively working the job. */
export const ASSIGNED_STATUSES: RequestStatus[] = ["ASSIGNED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"];

/** Customer-facing timeline, in order. */
export const TIMELINE: { status: RequestStatus; label: string }[] = [
  { status: "SUBMITTED", label: "Request Submitted" },
  { status: "SEARCHING", label: "Finding a Provider" },
  { status: "ASSIGNED", label: "Provider Assigned" },
  { status: "EN_ROUTE", label: "Driver En Route" },
  { status: "ARRIVED", label: "Driver Arrived" },
  { status: "IN_PROGRESS", label: "Service In Progress" },
  { status: "COMPLETED", label: "Service Completed" },
];

export const STATUS_LABELS: Record<RequestStatus, string> = {
  SUBMITTED: "Request Submitted",
  SEARCHING: "Finding a Provider",
  ASSIGNED: "Provider Assigned",
  EN_ROUTE: "Driver En Route",
  ARRIVED: "Driver Arrived",
  IN_PROGRESS: "Service In Progress",
  COMPLETED: "Service Completed",
  CANCELLED: "Cancelled",
  NO_PROVIDER_AVAILABLE: "No Provider Available",
};

export const SITUATIONS = [
  { value: "WONT_START", label: "Vehicle will not start" },
  { value: "FLAT_TIRE", label: "Flat tire" },
  { value: "ACCIDENT_OR_BREAKDOWN", label: "Accident or breakdown" },
  { value: "BATTERY", label: "Battery problem" },
  { value: "LOCKED_OUT", label: "Locked out" },
  { value: "OUT_OF_FUEL", label: "Out of fuel" },
  { value: "OTHER", label: "Other" },
] as const;
export type Situation = (typeof SITUATIONS)[number]["value"];

export const VEHICLE_TYPES = [
  { value: "SEDAN", label: "Car / sedan" },
  { value: "SUV", label: "SUV / crossover" },
  { value: "PICKUP", label: "Pickup truck" },
  { value: "VAN", label: "Van / minivan" },
  { value: "MOTORCYCLE", label: "Motorcycle" },
  { value: "EV", label: "Electric vehicle" },
  { value: "OTHER", label: "Other" },
] as const;

export const DRIVETRAINS = ["FWD", "RWD", "AWD", "4WD"] as const;

export const TRUCK_TYPES = [
  { value: "FLATBED", label: "Flatbed / rollback" },
  { value: "WHEEL_LIFT", label: "Wheel-lift tow truck" },
  { value: "SERVICE_VAN", label: "Roadside service vehicle" },
  { value: "MOTORCYCLE_TRAILER", label: "Motorcycle trailer / carrier" },
  { value: "HEAVY_DUTY", label: "Heavy-duty wrecker" },
] as const;

export const PROVIDER_VERIFICATION = ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"] as const;

export const DOCUMENT_TYPES = [
  { value: "DRIVERS_LICENSE", label: "Driver's license" },
  { value: "INSURANCE", label: "Commercial insurance certificate" },
  { value: "BUSINESS_LICENSE", label: "Business license" },
  { value: "VEHICLE_REGISTRATION", label: "Truck registration" },
  { value: "TOWING_PERMIT", label: "Towing permit / authority" },
  { value: "OTHER", label: "Other credential" },
] as const;
/** Documents an administrator must approve before a provider can be approved. */
export const REQUIRED_DOCUMENT_TYPES = ["DRIVERS_LICENSE", "INSURANCE", "VEHICLE_REGISTRATION"];

export const TICKET_CATEGORIES = [
  { value: "GENERAL", label: "General question" },
  { value: "COMPLAINT", label: "Complaint" },
  { value: "DISPUTE", label: "Charge dispute" },
  { value: "REFUND", label: "Refund request" },
  { value: "PROVIDER", label: "Provider question" },
  { value: "ACCOUNT", label: "Account help" },
] as const;
export const TICKET_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;

export const NOTIFICATION_TYPES = [
  "REQUEST_CONFIRMED",
  "QUOTE_READY",
  "PROVIDER_ASSIGNED",
  "DRIVER_EN_ROUTE",
  "DRIVER_ARRIVED",
  "SERVICE_STARTED",
  "SERVICE_COMPLETED",
  "RECEIPT_AVAILABLE",
  "REQUEST_CANCELLED",
  "NO_PROVIDER_AVAILABLE",
  "PRICE_CHANGE_PENDING",
  "NEW_JOB_OFFER",
  "JOB_ASSIGNED",
  "JOB_CANCELLED",
  "PROVIDER_APPROVED",
  "PROVIDER_STATUS_CHANGED",
  "NEW_MESSAGE",
  "DISPATCH_ATTENTION",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export const CHANNELS = ["IN_APP", "EMAIL", "SMS", "PUSH"] as const;
export type Channel = (typeof CHANNELS)[number];

export const PAYMENT_STATUSES = [
  "REQUIRES_PAYMENT_METHOD",
  "AUTHORIZED",
  "SUCCEEDED",
  "FAILED",
  "CANCELED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
  "DISPUTED",
  "DEMO_NOT_CHARGED",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const VERIFICATION_TONE = {
  PENDING: "gold",
  APPROVED: "ok",
  REJECTED: "danger",
  SUSPENDED: "danger",
} as const;
