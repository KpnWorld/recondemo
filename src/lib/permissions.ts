import type { AdminRole, Role } from "./constants";
import { AppError } from "./errors";

export type Actor = {
  id: string;
  role: Role;
  adminRole: AdminRole | null;
  name?: string;
  email?: string;
};
export const SYSTEM_ACTOR = "SYSTEM" as const;

export const PERMISSIONS = [
  "dashboard.view",
  "requests.view",
  "dispatch.assign",
  "requests.cancel",
  "requests.override_status",
  "quotes.manage",
  "providers.view",
  "providers.verify",
  "users.view",
  "users.manage",
  "catalog.manage",
  "pricing.manage",
  "areas.manage",
  "dispatch.configure",
  "payments.view",
  "payments.manage",
  "payouts.manage",
  "support.manage",
  "promotions.manage",
  "audit.view",
  "reports.export",
  "settings.manage",
  "data.retention",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL = new Set<Permission>(PERMISSIONS);

/** Role-based permission matrix for administrators. */
export const ADMIN_PERMISSIONS: Record<AdminRole, Set<Permission>> = {
  SUPER_ADMIN: ALL,
  DISPATCHER: new Set<Permission>([
    "dashboard.view",
    "requests.view",
    "dispatch.assign",
    "requests.cancel",
    "requests.override_status",
    "quotes.manage",
    "providers.view",
    "users.view",
    "support.manage",
    "reports.export",
  ]),
  SUPPORT: new Set<Permission>(["dashboard.view", "requests.view", "providers.view", "users.view", "support.manage", "payments.view"]),
  FINANCE: new Set<Permission>(["dashboard.view", "requests.view", "payments.view", "payments.manage", "payouts.manage", "reports.export", "support.manage"]),
};

export function can(actor: Actor | null | undefined, permission: Permission): boolean {
  if (!actor || actor.role !== "ADMIN" || !actor.adminRole) return false;
  return ADMIN_PERMISSIONS[actor.adminRole]?.has(permission) ?? false;
}

export function assertCan(actor: Actor | null | undefined, permission: Permission) {
  if (!actor) throw new AppError("UNAUTHENTICATED", "Please sign in to continue.");
  if (!can(actor, permission)) throw new AppError("FORBIDDEN", "You don't have permission to do that.");
}

export function assertRole(actor: Actor | null | undefined, ...roles: Role[]): asserts actor is Actor {
  if (!actor) throw new AppError("UNAUTHENTICATED", "Please sign in to continue.");
  if (!roles.includes(actor.role)) throw new AppError("FORBIDDEN", "You don't have access to this.");
}
