import { describe, expect, it } from "vitest";
import { ADMIN_PERMISSIONS, can, type Actor } from "@/lib/permissions";
import { allowedTransitions, isTransitionAllowed } from "@/lib/services/lifecycle";

const admin = (adminRole: Actor["adminRole"]): Actor => ({ id: "a", role: "ADMIN", adminRole });

describe("role permissions", () => {
  it("only super admins can approve providers, change pricing or manage users", () => {
    for (const p of ["providers.verify", "pricing.manage", "users.manage"] as const) {
      expect(can(admin("SUPER_ADMIN"), p)).toBe(true);
      expect(can(admin("DISPATCHER"), p)).toBe(false);
      expect(can(admin("SUPPORT"), p)).toBe(false);
      expect(can(admin("FINANCE"), p)).toBe(false);
    }
  });

  it("finance manages payments; dispatch and support do not", () => {
    expect(can(admin("FINANCE"), "payments.manage")).toBe(true);
    expect(can(admin("DISPATCHER"), "payments.manage")).toBe(false);
    expect(can(admin("SUPPORT"), "payments.manage")).toBe(false);
  });

  it("dispatchers can assign providers", () => {
    expect(can(admin("DISPATCHER"), "dispatch.assign")).toBe(true);
    expect(can(admin("FINANCE"), "dispatch.assign")).toBe(false);
  });

  it("customers and providers have no admin permissions", () => {
    expect(can({ id: "c", role: "CUSTOMER", adminRole: null }, "requests.view")).toBe(false);
    expect(can({ id: "p", role: "PROVIDER", adminRole: "SUPER_ADMIN" }, "requests.view")).toBe(false);
    expect(can(admin(null), "requests.view")).toBe(false);
  });

  it("every admin role can view the dashboard", () => {
    for (const set of Object.values(ADMIN_PERMISSIONS)) expect(set.has("dashboard.view")).toBe(true);
  });
});

describe("lifecycle transition table", () => {
  it("follows the happy path in order", () => {
    expect(isTransitionAllowed("SUBMITTED", "SEARCHING", "SYSTEM")).toBe(true);
    expect(isTransitionAllowed("SEARCHING", "ASSIGNED", "PROVIDER")).toBe(true);
    expect(isTransitionAllowed("ASSIGNED", "EN_ROUTE", "PROVIDER")).toBe(true);
    expect(isTransitionAllowed("EN_ROUTE", "ARRIVED", "PROVIDER")).toBe(true);
    expect(isTransitionAllowed("ARRIVED", "IN_PROGRESS", "PROVIDER")).toBe(true);
    expect(isTransitionAllowed("IN_PROGRESS", "COMPLETED", "PROVIDER")).toBe(true);
  });

  it("rejects skipping steps and moving backwards", () => {
    expect(isTransitionAllowed("ASSIGNED", "COMPLETED", "PROVIDER")).toBe(false);
    expect(isTransitionAllowed("COMPLETED", "IN_PROGRESS", "ADMIN")).toBe(false);
    expect(isTransitionAllowed("CANCELLED", "SEARCHING", "ADMIN")).toBe(false);
  });

  it("customers can only cancel or retry", () => {
    for (const s of ["SUBMITTED", "SEARCHING", "ASSIGNED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"] as const) {
      expect(allowedTransitions(s, "CUSTOMER").every((t) => t === "CANCELLED")).toBe(true);
    }
    expect(allowedTransitions("NO_PROVIDER_AVAILABLE", "CUSTOMER").sort()).toEqual(["CANCELLED", "SEARCHING"]);
    expect(allowedTransitions("ARRIVED", "CUSTOMER")).toEqual([]);
  });

  it("providers can't cancel a customer's request", () => {
    for (const s of ["ASSIGNED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"] as const) expect(isTransitionAllowed(s, "CANCELLED", "PROVIDER")).toBe(false);
  });
});
