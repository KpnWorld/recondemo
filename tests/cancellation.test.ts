import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { cancelRequest, cancellationTerms, createServiceRequest, updateJobStatus } from "@/lib/services/requests";
import { acceptOffer } from "@/lib/services/dispatch";
import { saveSettingsSection } from "@/lib/settings";
import { makeAdmin, makeCustomer, makeProvider, requestInput, resetDb, seedCatalog } from "./helpers";

describe("cancellation", () => {
  let cat: Awaited<ReturnType<typeof seedCatalog>>;
  beforeEach(async () => {
    await resetDb();
    cat = await seedCatalog();
  });

  async function assigned() {
    const customer = await makeCustomer();
    const p = await makeProvider({ services: [cat.jump.id] });
    const { request } = await createServiceRequest(customer, requestInput(cat.jump.id));
    const offer = await db.jobOffer.findFirstOrThrow({ where: { requestId: request.id } });
    await acceptOffer(p.actor, offer.id);
    return { customer, provider: p, request };
  }

  it("is free before a provider is assigned and withdraws open offers", async () => {
    const customer = await makeCustomer();
    await makeProvider({ services: [cat.jump.id] });
    const { request } = await createServiceRequest(customer, requestInput(cat.jump.id));
    const { feeCents } = await cancelRequest(customer, request.id, "Got a jump from a friend");
    expect(feeCents).toBe(0);
    const r = await db.serviceRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(r.status).toBe("CANCELLED");
    expect(r.cancelledAt).not.toBeNull();
    expect(await db.jobOffer.count({ where: { requestId: request.id, status: "PENDING" } })).toBe(0);
  });

  it("is free within the grace window after assignment, then charges the disclosed fee", async () => {
    const { customer, request } = await assigned();
    expect((await cancellationTerms(request.id)).feeCents).toBe(0);
    const later = new Date(Date.now() + 6 * 60_000);
    expect((await cancellationTerms(request.id, later)).feeCents).toBe(2500);
    const { feeCents } = await cancelRequest(customer, request.id, "No longer needed", { now: later });
    expect(feeCents).toBe(2500);
    expect(await db.payment.findFirst({ where: { requestId: request.id } })).toMatchObject({ processor: "DEMO", status: "DEMO_NOT_CHARGED", amountCents: 2500 });
  });

  it("reports an unconfigured fee instead of inventing one", async () => {
    await saveSettingsSection("cancellation", { feeAfterAssignmentCents: null, freeCancellationMinutes: 0 }, "t");
    const { request } = await assigned();
    const terms = await cancellationTerms(request.id);
    expect(terms).toMatchObject({ feeCents: 0, feeConfigured: false });
  });

  it("frees the provider and notifies them", async () => {
    const { customer, provider, request } = await assigned();
    await cancelRequest(customer, request.id, "Changed plans");
    expect(await db.providerAssignment.count({ where: { requestId: request.id, active: true } })).toBe(0);
    expect(await db.notification.count({ where: { userId: provider.actor.id, type: "JOB_CANCELLED" } })).toBeGreaterThan(0);
  });

  it("doesn't let customers cancel in-app after the driver arrives, but dispatch can (fee waived)", async () => {
    const { customer, provider, request } = await assigned();
    await updateJobStatus(provider.actor, request.id, "EN_ROUTE");
    await updateJobStatus(provider.actor, request.id, "ARRIVED");
    await expect(cancelRequest(customer, request.id, "too slow")).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    const support = await makeAdmin("SUPPORT");
    await expect(cancelRequest(support, request.id, "customer called")).rejects.toMatchObject({ code: "FORBIDDEN" });
    const dispatcher = await makeAdmin("DISPATCHER");
    const res = await cancelRequest(dispatcher, request.id, "Customer called; vehicle started");
    expect(res.feeCents).toBe(0);
    expect(await db.auditLog.count({ where: { action: "request.cancel", actorId: dispatcher.id } })).toBe(1);
  });

  it("doesn't let providers or other customers cancel", async () => {
    const { provider, request } = await assigned();
    await expect(cancelRequest(provider.actor, request.id, "x")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(cancelRequest(await makeCustomer(), request.id, "x")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("can't cancel twice or after completion", async () => {
    const customer = await makeCustomer();
    const { request } = await createServiceRequest(customer, requestInput(cat.jump.id));
    await cancelRequest(customer, request.id, "first");
    await expect(cancelRequest(customer, request.id, "again")).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });
});
