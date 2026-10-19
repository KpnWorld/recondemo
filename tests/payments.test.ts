import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { signStripePayload, verifyStripeSignature } from "@/lib/integrations/stripe";
import { handleStripeEvent, issueRefund, markPayoutPaid } from "@/lib/services/payments";
import { createServiceRequest } from "@/lib/services/requests";
import { makeAdmin, makeCustomer, makeProvider, requestInput, resetDb, seedCatalog } from "./helpers";

const SECRET = "whsec_test_secret";

function enableStripe() {
  process.env.STRIPE_SECRET_KEY = "sk_test_123";
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_123";
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
}

describe("webhook signature verification", () => {
  const body = JSON.stringify({ id: "evt_1", type: "payment_intent.succeeded", data: { object: { id: "pi_1" } } });

  it("accepts a correctly signed payload", () => {
    expect(verifyStripeSignature(body, signStripePayload(body, SECRET), SECRET).id).toBe("evt_1");
  });

  it("rejects missing, forged, tampered and stale signatures", () => {
    expect(() => verifyStripeSignature(body, null, SECRET)).toThrow();
    expect(() => verifyStripeSignature(body, signStripePayload(body, "whsec_wrong"), SECRET)).toThrow(/Invalid/);
    expect(() => verifyStripeSignature(body.replace("pi_1", "pi_2"), signStripePayload(body, SECRET), SECRET)).toThrow(/Invalid/);
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect(() => verifyStripeSignature(body, signStripePayload(body, SECRET, old), SECRET)).toThrow(/tolerance/);
  });
});

describe("payment event handling", () => {
  let cat: Awaited<ReturnType<typeof seedCatalog>>;
  beforeEach(async () => {
    await resetDb();
    cat = await seedCatalog();
  });
  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    vi.unstubAllGlobals();
  });

  it("waits for a verified authorization before dispatching when Stripe is configured", async () => {
    enableStripe();
    const customer = await makeCustomer();
    await makeProvider({ services: [cat.jump.id] });
    const { request, next } = await createServiceRequest(customer, requestInput(cat.jump.id));
    expect(next).toBe("AWAITING_PAYMENT");
    expect((await db.serviceRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("SUBMITTED");

    const payment = await db.payment.create({ data: { requestId: request.id, processor: "STRIPE", processorRef: "pi_abc", status: "REQUIRES_PAYMENT_METHOD", amountCents: 7525 } });
    const event = { id: "evt_auth", type: "payment_intent.amount_capturable_updated", data: { object: { id: "pi_abc", amount_capturable: 7525 } } };
    expect(await handleStripeEvent(event)).toBe("processed");
    expect((await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("AUTHORIZED");
    expect((await db.serviceRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("SEARCHING");
  });

  it("processes each event exactly once", async () => {
    const customer = await makeCustomer();
    const { request } = await createServiceRequest(customer, requestInput(cat.jump.id));
    await db.payment.create({ data: { requestId: request.id, processor: "STRIPE", processorRef: "pi_dup", status: "AUTHORIZED", amountCents: 7525 } });
    const event = { id: "evt_dup", type: "payment_intent.succeeded", data: { object: { id: "pi_dup", amount_received: 7525 } } };
    expect(await handleStripeEvent(event)).toBe("processed");
    expect(await handleStripeEvent(event)).toBe("duplicate");
    expect(await db.notification.count({ where: { userId: customer.id, type: "RECEIPT_AVAILABLE", channel: "IN_APP" } })).toBe(1);
    expect((await db.payment.findFirstOrThrow({ where: { processorRef: "pi_dup" } })).capturedCents).toBe(7525);
  });

  it("records failures, refunds and disputes from webhooks", async () => {
    const customer = await makeCustomer();
    const { request } = await createServiceRequest(customer, requestInput(cat.jump.id));
    const p = await db.payment.create({ data: { requestId: request.id, processor: "STRIPE", processorRef: "pi_x", status: "SUCCEEDED", amountCents: 7525, capturedCents: 7525 } });
    await db.refund.create({ data: { paymentId: p.id, amountCents: 2000, reason: "late", status: "PENDING", processorRef: "re_1", requestedById: customer.id } });
    await handleStripeEvent({
      id: "evt_ref",
      type: "charge.refunded",
      data: { object: { id: "ch_1", payment_intent: "pi_x", amount_refunded: 2000, refunds: { data: [{ id: "re_1", status: "succeeded" }] } } },
    });
    expect(await db.payment.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ status: "PARTIALLY_REFUNDED", refundedCents: 2000 });
    expect((await db.refund.findFirstOrThrow({ where: { processorRef: "re_1" } })).status).toBe("SUCCEEDED");
    await handleStripeEvent({ id: "evt_disp", type: "charge.dispute.created", data: { object: { id: "dp_1", payment_intent: "pi_x", reason: "fraudulent" } } });
    expect((await db.payment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("DISPUTED");
    expect(await db.supportTicket.count({ where: { category: "DISPUTE", requestId: request.id } })).toBe(1);
  });

  it("ignores events for unknown payments without changing anything", async () => {
    expect(await handleStripeEvent({ id: "evt_unknown", type: "payment_intent.succeeded", data: { object: { id: "pi_nope" } } })).toBe("ignored");
  });

  it("only lets finance roles issue refunds, within the refundable amount", async () => {
    enableStripe();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "re_new", status: "pending" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const customer = await makeCustomer();
    const { request } = await createServiceRequest(customer, requestInput(cat.jump.id));
    const p = await db.payment.create({ data: { requestId: request.id, processor: "STRIPE", processorRef: "pi_r", status: "SUCCEEDED", amountCents: 7525, capturedCents: 7525 } });
    await expect(issueRefund(await makeAdmin("DISPATCHER"), p.id, 1000, "x")).rejects.toMatchObject({ code: "FORBIDDEN" });
    const finance = await makeAdmin("FINANCE");
    await expect(issueRefund(finance, p.id, 9000, "too much")).rejects.toMatchObject({ code: "VALIDATION" });
    const refund = await issueRefund(finance, p.id, 1000, "Late arrival goodwill");
    expect((await db.refund.findUniqueOrThrow({ where: { id: refund.id } })).status).toBe("PENDING"); // not SUCCEEDED until webhook
    expect((await db.payment.findUniqueOrThrow({ where: { id: p.id } })).refundedCents).toBe(0);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("won't mark a payout paid before the customer payment is confirmed", async () => {
    const customer = await makeCustomer();
    const { profile } = await makeProvider({ services: [cat.jump.id] });
    const { request } = await createServiceRequest(customer, requestInput(cat.jump.id));
    const payout = await db.providerPayout.create({
      data: { providerId: profile.id, requestId: request.id, grossCents: 7000, platformFeeCents: 1050, netCents: 5950, status: "PENDING" },
    });
    const finance = await makeAdmin("FINANCE");
    await expect(markPayoutPaid(finance, payout.id, "ACH-1")).rejects.toMatchObject({ code: "CONFLICT" });
    await db.payment.create({ data: { requestId: request.id, processor: "STRIPE", processorRef: "pi_paid", status: "SUCCEEDED", amountCents: 7525, capturedCents: 7525 } });
    await markPayoutPaid(finance, payout.id, "ACH-1");
    expect((await db.providerPayout.findUniqueOrThrow({ where: { id: payout.id } })).status).toBe("PAID");
  });
});
