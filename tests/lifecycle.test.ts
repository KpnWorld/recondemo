import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createServiceRequest, getRequestDetail, updateJobStatus, sendConfirmedQuote, respondToQuote, proposePriceRevision, postMessage } from "@/lib/services/requests";
import { acceptOffer, declineOffer, manualAssign, releaseJob, retrySearch, sweepDispatch } from "@/lib/services/dispatch";
import { saveSettingsSection, DEFAULT_SETTINGS } from "@/lib/settings";
import { makeAdmin, makeCustomer, makeProvider, requestInput, resetDb, seedCatalog } from "./helpers";

async function pendingOffer(providerId: string, requestId: string) {
  return db.jobOffer.findFirstOrThrow({ where: { providerId, requestId, status: "PENDING" } });
}

describe("complete request lifecycle", () => {
  let cat: Awaited<ReturnType<typeof seedCatalog>>;
  beforeEach(async () => {
    await resetDb();
    cat = await seedCatalog();
  });

  it("runs a request from submission to completion with receipts, payouts and an audit trail", async () => {
    const customer = await makeCustomer();
    const { actor: driver, profile } = await makeProvider({ services: [cat.jump.id], name: "Jordan" });

    const { request, next } = await createServiceRequest(customer, requestInput(cat.jump.id), { expectedTotalCents: 7525 });
    expect(next).toBe("DISPATCHING");
    expect(request.number).toMatch(/^CR-[A-Z0-9]{6}$/);

    let r = await db.serviceRequest.findUniqueOrThrow({ where: { id: request.id }, include: { quotes: true } });
    expect(r.status).toBe("SEARCHING");
    expect(r.quotes[0]).toMatchObject({ kind: "ESTIMATE", status: "APPROVED", totalCents: 7525 });

    // The customer is not told anyone is coming until the provider accepts.
    expect(await db.notification.count({ where: { userId: customer.id, type: "PROVIDER_ASSIGNED" } })).toBe(0);
    const offer = await pendingOffer(profile.id, request.id);
    await acceptOffer(driver, offer.id);
    expect(await db.notification.count({ where: { userId: customer.id, type: "PROVIDER_ASSIGNED", channel: "IN_APP" } })).toBe(1);

    await updateJobStatus(driver, request.id, "EN_ROUTE", { etaMinutes: 20 });
    await updateJobStatus(driver, request.id, "ARRIVED");
    await updateJobStatus(driver, request.id, "IN_PROGRESS");
    await updateJobStatus(driver, request.id, "COMPLETED", { notes: "Jumped battery; recommend replacement." });

    r = await db.serviceRequest.findUniqueOrThrow({ where: { id: request.id }, include: { quotes: true } });
    expect(r.status).toBe("COMPLETED");
    expect(r.finalTotalCents).toBe(7525);
    expect(r.driverEtaMinutes).toBe(20);

    const history = await db.requestStatusHistory.findMany({ where: { requestId: request.id }, orderBy: { createdAt: "asc" } });
    expect(history.map((h) => h.toStatus)).toEqual(["SUBMITTED", "SEARCHING", "ASSIGNED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS", "COMPLETED"]);
    expect(history.find((h) => h.toStatus === "ASSIGNED")).toMatchObject({ actorId: driver.id, actorRole: "PROVIDER" });
    expect(history.find((h) => h.toStatus === "SEARCHING")).toMatchObject({ actorId: null, actorRole: "SYSTEM" });

    expect(await db.receipt.findUnique({ where: { requestId: request.id } })).toMatchObject({ totalCents: 7525, isDemo: true });
    const payout = await db.providerPayout.findUniqueOrThrow({ where: { requestId: request.id } });
    expect(payout).toMatchObject({ grossCents: 7000, platformFeeCents: 1050, netCents: 5950, status: "DEMO_NOT_PAID" });
    expect(await db.payment.findFirst({ where: { requestId: request.id } })).toMatchObject({ processor: "DEMO", status: "DEMO_NOT_CHARGED" });

    const types = (await db.notification.findMany({ where: { userId: customer.id, channel: "IN_APP" } })).map((n) => n.type);
    expect(types).toEqual(expect.arrayContaining(["REQUEST_CONFIRMED", "PROVIDER_ASSIGNED", "DRIVER_EN_ROUTE", "DRIVER_ARRIVED", "SERVICE_COMPLETED", "RECEIPT_AVAILABLE"]));
  });

  it("rejects invalid and unauthorized transitions on the server", async () => {
    const customer = await makeCustomer();
    const { actor: driver, profile } = await makeProvider({ services: [cat.jump.id] });
    const { actor: other } = await makeProvider({ services: [cat.jump.id], lat: 27.97 });
    const { request } = await createServiceRequest(customer, requestInput(cat.jump.id));
    await acceptOffer(driver, (await pendingOffer(profile.id, request.id)).id);

    await expect(updateJobStatus(driver, request.id, "COMPLETED")).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(updateJobStatus(other, request.id, "EN_ROUTE")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateJobStatus(customer, request.id, "EN_ROUTE")).rejects.toMatchObject({ code: "FORBIDDEN" });
    const support = await makeAdmin("SUPPORT");
    await expect(updateJobStatus(support, request.id, "EN_ROUTE")).rejects.toMatchObject({ code: "FORBIDDEN" });
    const dispatcher = await makeAdmin("DISPATCHER");
    await updateJobStatus(dispatcher, request.id, "EN_ROUTE");
    expect((await db.auditLog.findFirst({ where: { action: "request.status_override" } }))?.actorId).toBe(dispatcher.id);
  });

  it("stops two providers from accepting the same job", async () => {
    const customer = await makeCustomer();
    const a = await makeProvider({ services: [cat.jump.id], lat: 27.951 });
    const b = await makeProvider({ services: [cat.jump.id], lat: 27.952 });
    const { request } = await createServiceRequest(customer, requestInput(cat.jump.id));
    const [oa, ob] = await Promise.all([pendingOffer(a.profile.id, request.id), pendingOffer(b.profile.id, request.id)]);
    const results = await Promise.allSettled([acceptOffer(a.actor, oa.id), acceptOffer(b.actor, ob.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.providerAssignment.count({ where: { requestId: request.id, active: true } })).toBe(1);
  });

  it("never offers jobs to unverified providers and blocks them from accepting", async () => {
    const customer = await makeCustomer();
    const pending = await makeProvider({ services: [cat.jump.id], approved: false });
    const { request } = await createServiceRequest(customer, requestInput(cat.jump.id));
    expect(await db.jobOffer.count({ where: { providerId: pending.profile.id } })).toBe(0);
    expect((await db.serviceRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("NO_PROVIDER_AVAILABLE");
    // Even with a forged offer row, acceptance is refused.
    await db.serviceRequest.update({ where: { id: request.id }, data: { status: "SEARCHING" } });
    const forged = await db.jobOffer.create({ data: { requestId: request.id, providerId: pending.profile.id, rank: 1, expiresAt: new Date(Date.now() + 60000) } });
    await expect(acceptOffer(pending.actor, forged.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("moves through offer timeouts and declines to the next round, then to no-provider-available", async () => {
    await saveSettingsSection("dispatch", { ...DEFAULT_SETTINGS.dispatch, offerBatchSize: 1, maxRounds: 2 }, "test");
    const customer = await makeCustomer();
    const near = await makeProvider({ services: [cat.jump.id], lat: 27.951 });
    const far = await makeProvider({ services: [cat.jump.id], lat: 27.99 });
    const { request } = await createServiceRequest(customer, requestInput(cat.jump.id));

    const first = await pendingOffer(near.profile.id, request.id);
    await sweepDispatch(new Date(first.expiresAt.getTime() + 1000)); // near provider times out
    expect((await db.jobOffer.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("EXPIRED");
    const second = await pendingOffer(far.profile.id, request.id);
    expect(second.round).toBe(2);

    await declineOffer(far.actor, second.id);
    const r = await db.serviceRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(r.status).toBe("NO_PROVIDER_AVAILABLE");
    expect(await db.notification.count({ where: { userId: customer.id, type: "NO_PROVIDER_AVAILABLE" } })).toBeGreaterThan(0);

    // Customer can search again; previously-offered providers become eligible again.
    await retrySearch(customer, request.id);
    expect((await db.serviceRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("SEARCHING");
    expect(await db.jobOffer.count({ where: { requestId: request.id, status: "PENDING" } })).toBe(1);
  });

  it("re-dispatches when a provider releases a job, excluding that provider", async () => {
    const customer = await makeCustomer();
    const a = await makeProvider({ services: [cat.jump.id], lat: 27.951 });
    const b = await makeProvider({ services: [cat.jump.id], lat: 27.99 });
    const { request } = await createServiceRequest(customer, requestInput(cat.jump.id));
    await acceptOffer(a.actor, (await pendingOffer(a.profile.id, request.id)).id);
    await releaseJob(a.actor, request.id, "Truck broke down");
    const r = await db.serviceRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(r.status).toBe("SEARCHING");
    const pend = await db.jobOffer.findMany({ where: { requestId: request.id, status: "PENDING" } });
    expect(pend.map((o) => o.providerId)).toEqual([b.profile.id]);
  });

  it("lets a dispatcher manually assign or reassign a verified provider", async () => {
    await saveSettingsSection("dispatch", { ...DEFAULT_SETTINGS.dispatch, autoDispatch: false }, "test");
    const customer = await makeCustomer();
    const dispatcher = await makeAdmin("DISPATCHER");
    const offline = await makeProvider({ services: [cat.jump.id], online: false });
    const other = await makeProvider({ services: [cat.jump.id], online: false });
    const unverified = await makeProvider({ services: [cat.jump.id], approved: false });
    const { request } = await createServiceRequest(customer, requestInput(cat.jump.id));
    expect((await db.serviceRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("SEARCHING");
    expect(await db.jobOffer.count()).toBe(0);

    await expect(manualAssign(dispatcher, request.id, unverified.profile.id, "nearby")).rejects.toMatchObject({ code: "FORBIDDEN" });
    const finance = await makeAdmin("FINANCE");
    await expect(manualAssign(finance, request.id, offline.profile.id, "nearby")).rejects.toMatchObject({ code: "FORBIDDEN" });

    await manualAssign(dispatcher, request.id, offline.profile.id, "Called and confirmed availability");
    await manualAssign(dispatcher, request.id, other.profile.id, "First driver delayed");
    const active = await db.providerAssignment.findMany({ where: { requestId: request.id, active: true } });
    expect(active.map((a) => a.providerId)).toEqual([other.profile.id]);
    expect(await db.auditLog.count({ where: { action: "dispatch.manual_assign" } })).toBe(2);
  });

  it("requires a dispatcher-confirmed quote when the tow distance can't be calculated", async () => {
    const customer = await makeCustomer();
    const admin = await makeAdmin("DISPATCHER");
    await makeProvider({ services: [cat.tow.id] });
    const input = requestInput(cat.tow.id, { destination: { line1: "9 Shop Rd", city: "Tampa", state: "FL", zip: "33606" } });
    const { request, next } = await createServiceRequest(customer, input);
    expect(next).toBe("AWAITING_QUOTE");
    expect((await db.serviceRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("SUBMITTED");
    expect(await db.jobOffer.count()).toBe(0);

    await sendConfirmedQuote(admin, request.id, { miles: 10 });
    const q = await db.quote.findFirstOrThrow({ where: { requestId: request.id, kind: "CONFIRMED" } });
    // 9500 + (5 mi * 450) + 500 = 12250; tax 7.5% = 919 (918.75 rounded)
    expect(q.totalCents).toBe(12250 + 919);
    await respondToQuote(customer, q.id, true);
    expect((await db.serviceRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("SEARCHING");
  });

  it("holds completion until the customer approves a material price increase", async () => {
    const customer = await makeCustomer();
    const { actor: driver, profile } = await makeProvider({ services: [cat.jump.id] });
    const { request } = await createServiceRequest(customer, requestInput(cat.jump.id));
    await acceptOffer(driver, (await pendingOffer(profile.id, request.id)).id);
    await updateJobStatus(driver, request.id, "EN_ROUTE");
    await updateJobStatus(driver, request.id, "ARRIVED");
    await updateJobStatus(driver, request.id, "IN_PROGRESS");
    const { material, quoteId } = await proposePriceRevision(driver, request.id, {
      lines: [{ label: "Battery terminal cleaning", amountCents: 2000 }],
      reason: "Terminals heavily corroded",
    });
    expect(material).toBe(true);
    await expect(updateJobStatus(driver, request.id, "COMPLETED")).rejects.toMatchObject({ code: "CONFLICT" });
    await respondToQuote(customer, quoteId, true);
    await updateJobStatus(driver, request.id, "COMPLETED");
    const r = await db.serviceRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(r.finalTotalCents).toBe(7000 + 2000 + Math.round(9000 * 0.075));
  });

  it("protects records: customers see only their own; providers see location only while assigned", async () => {
    const owner = await makeCustomer();
    const stranger = await makeCustomer();
    const a = await makeProvider({ services: [cat.jump.id], lat: 27.951 });
    const b = await makeProvider({ services: [cat.jump.id], lat: 27.952 });
    const unrelated = await makeProvider({ services: [cat.tow.id] });
    const { request } = await createServiceRequest(owner, requestInput(cat.jump.id));

    await expect(getRequestDetail(stranger, request.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getRequestDetail(unrelated.actor, request.id)).rejects.toMatchObject({ code: "NOT_FOUND" });

    const offered = await getRequestDetail(b.actor, request.id);
    expect(offered.relation).toBe("OFFERED_PROVIDER");
    expect(offered.request.pickupLine1).toBeNull();
    expect(offered.request.pickupLat).toBeNull();

    await acceptOffer(a.actor, (await pendingOffer(a.profile.id, request.id)).id);
    const assigned = await getRequestDetail(a.actor, request.id);
    expect(assigned.relation).toBe("ASSIGNED_PROVIDER");
    expect(assigned.request.pickupLine1).toBe("1 Test Ave");
    expect(assigned.request.customer.phone).toBeNull(); // contact goes through in-app messages
    await expect(getRequestDetail(b.actor, request.id)).rejects.toMatchObject({ code: "NOT_FOUND" });

    await postMessage(a.actor, request.id, { body: "On my way" });
    await expect(postMessage(b.actor, request.id, { body: "hi" })).rejects.toBeTruthy();
  });

  it("validates request input", async () => {
    const customer = await makeCustomer();
    await expect(createServiceRequest(customer, requestInput(cat.jump.id, { isSafeLocation: undefined }))).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createServiceRequest(customer, requestInput(cat.tow.id))).rejects.toMatchObject({ code: "VALIDATION" }); // tow needs destination
    await expect(
      createServiceRequest(customer, requestInput(cat.jump.id, { pickup: { line1: "x", city: "Tampa", state: "Florida", zip: "1", source: "MANUAL" } })),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const { actor: provider } = await makeProvider({ services: [cat.jump.id] });
    await expect(createServiceRequest(provider, requestInput(cat.jump.id))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("asks the customer to re-confirm if the estimate changed", async () => {
    const customer = await makeCustomer();
    await expect(createServiceRequest(customer, requestInput(cat.jump.id), { expectedTotalCents: 100 })).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
