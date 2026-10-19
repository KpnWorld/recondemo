import { db } from "@/lib/db";
import type { Tx } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { config } from "@/lib/env";
import { generateReference } from "@/lib/auth/crypto";
import type { Actor } from "@/lib/permissions";
import { assertCan } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import type { StripeEvent } from "@/lib/integrations/stripe";
import { stripe, stripeConfigured } from "@/lib/integrations/stripe";
import { parseBreakdown } from "./pricing";
import { kickNotificationQueue, notify, notifyAdmins } from "./notifications";

/**
 * Payments. Rules this module enforces:
 * - Card data never touches our server (Stripe Elements collects it).
 * - A payment becomes AUTHORIZED / SUCCEEDED / REFUNDED only from a verified Stripe
 *   webhook, never from a browser redirect or client callback.
 * - In demo mode, nothing is charged: payments are recorded as DEMO_NOT_CHARGED.
 * - With no processor configured, receipts say payment was not collected through Call Recon.
 */

export const paymentsEnabled = () => stripeConfigured();

export async function paymentAuthorizationRequired(isDemoRequest: boolean) {
  if (!stripeConfigured()) return false;
  if (isDemoRequest && config.stripe.secretKey()?.startsWith("sk_live")) return false;
  const s = await getSettings();
  return s.payments.requireAuthorizationBeforeDispatch;
}

export async function approvedQuote(tx: Tx, requestId: string) {
  return tx.quote.findFirst({
    where: { requestId, status: "APPROVED" },
    orderBy: { createdAt: "desc" },
  });
}

/** Create (or reuse) a manual-capture PaymentIntent for the approved amount. */
export async function ensurePaymentIntent(actor: Actor, requestId: string) {
  const r = await db.serviceRequest.findUnique({
    where: { id: requestId },
    include: { customer: { include: { customerProfile: true } } },
  });
  if (!r || r.customerId !== actor.id) throw new AppError("NOT_FOUND", "Request not found.");
  if (!stripeConfigured()) throw new AppError("NOT_CONFIGURED", "Online payments aren't set up yet.");
  if (r.status !== "SUBMITTED") throw new AppError("CONFLICT", "This request no longer needs a payment authorization.");
  const quote = await approvedQuote(db, requestId);
  if (!quote?.totalCents) throw new AppError("CONFLICT", "Approve a price before adding payment.");

  const existing = await db.payment.findFirst({
    where: {
      requestId,
      processor: "STRIPE",
      status: "REQUIRES_PAYMENT_METHOD",
      amountCents: quote.totalCents,
    },
  });
  if (existing?.processorRef) {
    const pi = await stripe.retrievePaymentIntent(existing.processorRef);
    return { clientSecret: pi.client_secret, amountCents: quote.totalCents };
  }
  const customerRef = await ensureStripeCustomer(r.customerId);
  const s = await getSettings();
  const pi = await stripe.createPaymentIntent({
    amountCents: quote.totalCents,
    currency: s.payments.currency,
    customer: customerRef,
    requestId,
    requestNumber: r.number,
  });
  await db.payment.create({
    data: {
      requestId,
      processor: "STRIPE",
      processorRef: pi.id,
      status: "REQUIRES_PAYMENT_METHOD",
      amountCents: quote.totalCents,
      currency: s.payments.currency,
    },
  });
  return { clientSecret: pi.client_secret, amountCents: quote.totalCents };
}

export async function ensureStripeCustomer(userId: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    include: { customerProfile: true },
  });
  if (user.customerProfile?.paymentCustomerRef) return user.customerProfile.paymentCustomerRef;
  const c = await stripe.createCustomer({
    email: user.email,
    name: user.name,
    userId,
  });
  await db.customerProfile.upsert({
    where: { userId },
    create: { userId, paymentCustomerRef: c.id },
    update: { paymentCustomerRef: c.id },
  });
  return c.id;
}

// ---- Webhooks ------------------------------------------------------------------------

/** Process a signature-verified Stripe event exactly once. */
export async function handleStripeEvent(event: StripeEvent): Promise<"processed" | "duplicate" | "ignored"> {
  const seen = await db.paymentEvent.findUnique({ where: { id: event.id } });
  if (seen?.processedAt) return "duplicate";
  if (!seen) {
    try {
      await db.paymentEvent.create({
        data: {
          id: event.id,
          processor: "STRIPE",
          type: event.type,
          payload: JSON.stringify(event),
        },
      });
    } catch {
      return "duplicate"; // concurrent delivery of the same event
    }
  }

  let outcome: "processed" | "ignored" = "processed";
  let startDispatchFor: string | null = null;
  try {
    await db.$transaction(async (tx) => {
      const obj = event.data.object;
      const piId = event.type.startsWith("charge.") ? (obj.payment_intent as string) : obj.id;
      const payment = piId
        ? await tx.payment.findUnique({
            where: { processorRef: piId },
            include: { request: true },
          })
        : null;
      if (!payment) {
        outcome = "ignored";
        return;
      }
      switch (event.type) {
        case "payment_intent.amount_capturable_updated": {
          await tx.payment.update({
            where: { id: payment.id },
            data: { status: "AUTHORIZED" },
          });
          if (payment.request.status === "SUBMITTED") startDispatchFor = payment.requestId;
          break;
        }
        case "payment_intent.succeeded": {
          const received = Number(obj.amount_received ?? 0);
          await tx.payment.update({
            where: { id: payment.id },
            data: { status: "SUCCEEDED", capturedCents: received },
          });
          await notify(tx, {
            userId: payment.request.customerId,
            type: "RECEIPT_AVAILABLE",
            title: "Payment received",
            body: `Your payment for ${payment.request.number} was processed.`,
            requestId: payment.requestId,
            link: `/requests/${payment.requestId}/receipt`,
            dedupeSuffix: `paid-${payment.id}`,
          });
          break;
        }
        case "payment_intent.payment_failed":
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: "FAILED",
              failureReason: String((obj.last_payment_error as { message?: string })?.message ?? "Payment failed"),
            },
          });
          break;
        case "payment_intent.canceled":
          await tx.payment.update({
            where: { id: payment.id },
            data: { status: "CANCELED" },
          });
          break;
        case "charge.refunded": {
          const refunded = Number(obj.amount_refunded ?? 0);
          const full = refunded >= payment.capturedCents && payment.capturedCents > 0;
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              refundedCents: refunded,
              status: full ? "REFUNDED" : "PARTIALLY_REFUNDED",
            },
          });
          const refunds = ((obj.refunds as { data?: { id: string; status: string }[] })?.data ?? []) as { id: string; status: string }[];
          for (const rf of refunds) {
            await tx.refund.updateMany({
              where: { processorRef: rf.id },
              data: {
                status: rf.status === "succeeded" ? "SUCCEEDED" : rf.status === "failed" ? "FAILED" : "PENDING",
              },
            });
          }
          break;
        }
        case "charge.dispute.created": {
          await tx.payment.update({
            where: { id: payment.id },
            data: { status: "DISPUTED" },
          });
          const number = generateReference("TK");
          await tx.supportTicket.create({
            data: {
              number,
              contactName: "Stripe dispute",
              contactEmail: "disputes@stripe.invalid",
              category: "DISPUTE",
              subject: `Card dispute opened for ${payment.request.number}`,
              body: `Stripe reported a dispute (${obj.reason ?? "no reason given"}). Respond in the Stripe dashboard before the deadline.`,
              requestId: payment.requestId,
            },
          });
          await notifyAdmins(
            tx,
            {
              type: "DISPATCH_ATTENTION",
              title: "Card dispute opened",
              body: `Request ${payment.request.number}`,
              requestId: payment.requestId,
              link: "/admin/payments",
              dedupeSuffix: event.id,
            },
            ["SUPER_ADMIN", "FINANCE"],
          );
          break;
        }
        default:
          outcome = "ignored";
      }
    });
    await db.paymentEvent.update({
      where: { id: event.id },
      data: { processedAt: new Date(), error: null },
    });
  } catch (e) {
    await db.paymentEvent.update({
      where: { id: event.id },
      data: { error: (e as Error).message },
    });
    throw e;
  }

  if (startDispatchFor) {
    const { startDispatch } = await import("./dispatch");
    await startDispatch(startDispatchFor).catch((e) => console.error("[payments] dispatch after authorization failed", e));
  }
  kickNotificationQueue();
  return outcome;
}

// ---- Completion / cancellation --------------------------------------------------------

/**
 * Inside the completion transaction: write the receipt (final charge = latest approved
 * price) and the provider payout record. Capturing the card happens after commit.
 */
export async function recordCompletionFinancials(tx: Tx, requestId: string) {
  const r = await tx.serviceRequest.findUniqueOrThrow({
    where: { id: requestId },
  });
  const quote = await approvedQuote(tx, requestId);
  if (!quote || quote.totalCents == null) throw new AppError("CONFLICT", "This job has no approved price. A dispatcher must confirm the price before completion.");
  const breakdown = parseBreakdown(quote.breakdown);
  const total = quote.totalCents;
  await tx.serviceRequest.update({
    where: { id: requestId },
    data: { finalTotalCents: total },
  });
  await tx.receipt.create({
    data: {
      number: generateReference("RC", 8),
      requestId,
      breakdown: quote.breakdown,
      totalCents: total,
      isDemo: r.isDemo,
    },
  });

  const assignment = await tx.providerAssignment.findFirstOrThrow({
    where: { requestId, active: true },
  });
  const settings = await getSettings(tx);
  const gross = total - (breakdown?.taxCents ?? 0); // taxes are remitted by the platform
  const feeBps = settings.payments.platformFeeBps;
  const platformFee = feeBps == null ? 0 : Math.round((gross * feeBps) / 10_000);
  await tx.providerPayout.create({
    data: {
      providerId: assignment.providerId,
      requestId,
      grossCents: gross,
      platformFeeCents: platformFee,
      netCents: gross - platformFee,
      // A payout can't be released until the platform fee is configured and money is collected.
      status: r.isDemo ? "DEMO_NOT_PAID" : feeBps == null ? "ON_HOLD" : "PENDING",
    },
  });

  const stripePayment = await tx.payment.findFirst({
    where: { requestId, processor: "STRIPE", status: "AUTHORIZED" },
  });
  if (!stripePayment && r.isDemo) {
    await tx.payment.create({
      data: {
        requestId,
        processor: "DEMO",
        status: "DEMO_NOT_CHARGED",
        amountCents: total,
      },
    });
  }
  await notify(tx, {
    userId: r.customerId,
    type: "RECEIPT_AVAILABLE",
    title: "Your receipt is ready",
    body: `Final total for ${r.number}: $${(total / 100).toFixed(2)}.`,
    requestId,
    link: `/requests/${requestId}/receipt`,
  });
  return { totalCents: total, capturePaymentId: stripePayment?.id ?? null };
}

/** After commit: capture the final amount. Status flips to SUCCEEDED only via webhook. */
export async function captureFinal(paymentId: string, totalCents: number) {
  const p = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  if (p.processor !== "STRIPE" || !p.processorRef || p.status !== "AUTHORIZED") return;
  const amount = Math.min(totalCents, p.amountCents);
  try {
    await stripe.capture(p.processorRef, amount);
    if (totalCents > p.amountCents) {
      await db.payment.update({
        where: { id: p.id },
        data: {
          failureReason: `Final total exceeds authorization by $${((totalCents - p.amountCents) / 100).toFixed(2)}; collect balance separately.`,
        },
      });
    }
  } catch (e) {
    await db.payment.update({
      where: { id: p.id },
      data: { failureReason: `Capture failed: ${(e as Error).message}` },
    });
    await db.$transaction((tx) =>
      notifyAdmins(
        tx,
        {
          type: "DISPATCH_ATTENTION",
          title: "Payment capture failed",
          body: (e as Error).message,
          requestId: p.requestId,
          link: "/admin/payments",
          dedupeSuffix: `cap-${p.id}`,
        },
        ["SUPER_ADMIN", "FINANCE"],
      ),
    );
  }
}

/** After a cancellation commits: capture the disclosed fee or release the authorization. */
export async function settleCancellation(requestId: string, feeCents: number) {
  const r = await db.serviceRequest.findUniqueOrThrow({
    where: { id: requestId },
  });
  const auth = await db.payment.findFirst({
    where: {
      requestId,
      processor: "STRIPE",
      status: { in: ["AUTHORIZED", "REQUIRES_PAYMENT_METHOD"] },
    },
  });
  if (auth?.processorRef) {
    try {
      if (feeCents > 0 && auth.status === "AUTHORIZED") await stripe.capture(auth.processorRef, Math.min(feeCents, auth.amountCents));
      else await stripe.cancel(auth.processorRef);
    } catch (e) {
      await db.payment.update({
        where: { id: auth.id },
        data: {
          failureReason: `Cancellation settlement failed: ${(e as Error).message}`,
        },
      });
    }
  } else if (feeCents > 0 && r.isDemo) {
    await db.payment.create({
      data: {
        requestId,
        processor: "DEMO",
        status: "DEMO_NOT_CHARGED",
        amountCents: feeCents,
      },
    });
  }
}

// ---- Admin: refunds and payouts ----------------------------------------------------------

export async function issueRefund(admin: Actor, paymentId: string, amountCents: number, reason: string) {
  assertCan(admin, "payments.manage");
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new AppError("VALIDATION", "Enter a refund amount greater than zero.");
  if (!reason?.trim()) throw new AppError("VALIDATION", "Add a reason for the refund.");
  const p = await db.payment.findUnique({
    where: { id: paymentId },
    include: { refunds: true },
  });
  if (!p) throw new AppError("NOT_FOUND", "Payment not found.");

  if (p.processor === "DEMO") {
    const pendingDemo = p.refunds.reduce((s, r) => s + r.amountCents, 0);
    if (amountCents > p.amountCents - pendingDemo) throw new AppError("VALIDATION", "Refund exceeds the recorded amount.");
    const refund = await db.refund.create({
      data: {
        paymentId,
        amountCents,
        reason,
        status: "DEMO_RECORDED",
        requestedById: admin.id,
      },
    });
    await audit({
      actorId: admin.id,
      action: "payment.refund_demo",
      entityType: "Payment",
      entityId: paymentId,
      details: { amountCents, reason },
    });
    return refund;
  }

  if (!["SUCCEEDED", "PARTIALLY_REFUNDED"].includes(p.status)) throw new AppError("CONFLICT", "Only collected payments can be refunded.");
  const inFlight = p.refunds.filter((r) => r.status === "PENDING" || r.status === "REQUESTED").reduce((s, r) => s + r.amountCents, 0);
  if (amountCents > p.capturedCents - p.refundedCents - inFlight) throw new AppError("VALIDATION", "Refund exceeds the amount still refundable.");
  const refund = await db.refund.create({
    data: {
      paymentId,
      amountCents,
      reason,
      status: "REQUESTED",
      requestedById: admin.id,
    },
  });
  try {
    const sr = await stripe.refund({
      paymentIntent: p.processorRef!,
      amountCents,
      refundId: refund.id,
    });
    // Final status arrives via the charge.refunded webhook.
    await db.refund.update({
      where: { id: refund.id },
      data: { processorRef: sr.id, status: "PENDING" },
    });
  } catch (e) {
    await db.refund.update({
      where: { id: refund.id },
      data: { status: "FAILED" },
    });
    throw e;
  }
  await audit({
    actorId: admin.id,
    action: "payment.refund",
    entityType: "Payment",
    entityId: paymentId,
    details: { amountCents, reason },
  });
  return refund;
}

export async function markPayoutPaid(admin: Actor, payoutId: string, reference: string) {
  assertCan(admin, "payouts.manage");
  if (!reference?.trim()) throw new AppError("VALIDATION", "Enter the transfer reference.");
  const payout = await db.providerPayout.findUnique({
    where: { id: payoutId },
    include: { provider: true },
  });
  if (!payout) throw new AppError("NOT_FOUND", "Payout not found.");
  if (payout.status === "DEMO_NOT_PAID") throw new AppError("CONFLICT", "Demo payouts can't be marked paid.");
  if (payout.status !== "PENDING") throw new AppError("CONFLICT", "Only pending payouts can be marked paid.");
  const collected = await db.payment.findFirst({
    where: {
      requestId: payout.requestId,
      status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED"] },
    },
  });
  if (!collected) throw new AppError("CONFLICT", "The customer's payment hasn't been confirmed by the processor yet.");
  await db.providerPayout.update({
    where: { id: payoutId },
    data: {
      status: "PAID",
      processorRef: reference.trim(),
      paidAt: new Date(),
    },
  });
  await audit({
    actorId: admin.id,
    action: "payout.mark_paid",
    entityType: "ProviderPayout",
    entityId: payoutId,
    details: { reference },
  });
}

export async function setPayoutHold(admin: Actor, payoutId: string, hold: boolean) {
  assertCan(admin, "payouts.manage");
  const payout = await db.providerPayout.findUniqueOrThrow({
    where: { id: payoutId },
  });
  if (!["PENDING", "ON_HOLD"].includes(payout.status)) throw new AppError("CONFLICT", "This payout can't be changed.");
  const settings = await getSettings();
  if (!hold && settings.payments.platformFeeBps == null) throw new AppError("CONFLICT", "Set the platform fee in Settings before releasing payouts.");
  // Payouts created before the platform fee was configured get the fee applied on release.
  const bps = settings.payments.platformFeeBps;
  const recompute = !hold && payout.platformFeeCents === 0 && bps != null && bps > 0;
  const fee = recompute ? Math.round((payout.grossCents * bps) / 10_000) : payout.platformFeeCents;
  await db.providerPayout.update({
    where: { id: payoutId },
    data: {
      status: hold ? "ON_HOLD" : "PENDING",
      platformFeeCents: fee,
      netCents: payout.grossCents - fee,
    },
  });
  await audit({
    actorId: admin.id,
    action: hold ? "payout.hold" : "payout.release",
    entityType: "ProviderPayout",
    entityId: payoutId,
  });
}
