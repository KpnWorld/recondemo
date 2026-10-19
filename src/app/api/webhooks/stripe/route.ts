import { NextResponse } from "next/server";
import { config } from "@/lib/env";
import { isAppError } from "@/lib/errors";
import { verifyStripeSignature } from "@/lib/integrations/stripe";
import { handleStripeEvent } from "@/lib/services/payments";

/**
 * Stripe webhook. Payment status changes are trusted only from here, after the
 * signature is verified against STRIPE_WEBHOOK_SECRET using the raw request body.
 */
export async function POST(req: Request) {
  const secret = config.stripe.webhookSecret();
  if (!secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  const raw = await req.text();
  let event;
  try {
    event = verifyStripeSignature(raw, req.headers.get("stripe-signature"), secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  try {
    const result = await handleStripeEvent(event);
    return NextResponse.json({ received: true, result });
  } catch (e) {
    console.error("[stripe webhook]", e);
    // A non-2xx response makes Stripe retry the delivery.
    return NextResponse.json({ error: isAppError(e) ? e.message : "Processing failed" }, { status: 500 });
  }
}
