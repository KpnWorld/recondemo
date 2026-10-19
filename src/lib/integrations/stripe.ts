import { createHmac } from "node:crypto";
import { config } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { safeEqual } from "@/lib/auth/crypto";

/**
 * Minimal Stripe REST client (no SDK dependency) plus webhook signature verification.
 * Card details are only ever entered into Stripe Elements in the browser; this server
 * sees PaymentIntent / SetupIntent ids, never card numbers or CVV.
 */

export const stripeConfigured = () => Boolean(config.stripe.secretKey() && config.stripe.publishableKey() && config.stripe.webhookSecret());

function encode(obj: Record<string, unknown>, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object" && !Array.isArray(v)) out.push(...encode(v as Record<string, unknown>, key));
    else if (Array.isArray(v)) v.forEach((item, i) => out.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`));
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out;
}

export async function stripeRequest<T = Record<string, unknown>>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  params?: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<T> {
  const key = config.stripe.secretKey();
  if (!key) throw new AppError("NOT_CONFIGURED", "Payments aren't set up yet.");
  if (config.demoMode() && key.startsWith("sk_live")) throw new AppError("NOT_CONFIGURED", "Live payment keys are blocked while DEMO_MODE is on. Use Stripe test keys.");
  const body = params ? encode(params).join("&") : undefined;
  const url = `https://api.stripe.com/v1${path}${method === "GET" && body ? `?${body}` : ""}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: method === "GET" ? undefined : body,
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json as { error?: { message?: string } }).error?.message ?? `Stripe error ${res.status}`;
    throw new AppError("PAYMENT_ERROR", msg);
  }
  return json as T;
}

export type StripeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> & { id: string } };
};

/** Verify a Stripe-Signature header (t=...,v1=...) against the raw body. */
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string, toleranceSeconds = 300, nowSeconds = Math.floor(Date.now() / 1000)): StripeEvent {
  if (!header) throw new AppError("FORBIDDEN", "Missing Stripe signature.");
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i), p.slice(i + 1)];
    }),
  );
  const signatures = header
    .split(",")
    .filter((p) => p.startsWith("v1="))
    .map((p) => p.slice(3));
  const t = Number(parts.t);
  if (!t || signatures.length === 0) throw new AppError("FORBIDDEN", "Malformed Stripe signature.");
  if (Math.abs(nowSeconds - t) > toleranceSeconds) throw new AppError("FORBIDDEN", "Stripe signature timestamp outside tolerance.");
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  if (!signatures.some((s) => safeEqual(s, expected))) throw new AppError("FORBIDDEN", "Invalid Stripe signature.");
  return JSON.parse(rawBody) as StripeEvent;
}

/** Used by tests to produce a valid header. */
export function signStripePayload(rawBody: string, secret: string, t = Math.floor(Date.now() / 1000)) {
  const sig = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return `t=${t},v1=${sig}`;
}

export type PaymentIntent = {
  id: string;
  client_secret: string;
  status: string;
  amount: number;
  amount_capturable: number;
  amount_received: number;
};

export const stripe = {
  createPaymentIntent: (p: { amountCents: number; currency: string; customer?: string | null; requestId: string; requestNumber: string }) =>
    stripeRequest<PaymentIntent>(
      "POST",
      "/payment_intents",
      {
        amount: p.amountCents,
        currency: p.currency,
        capture_method: "manual", // authorize now, capture the final amount after service
        customer: p.customer ?? undefined,
        automatic_payment_methods: { enabled: true },
        description: `Call Recon request ${p.requestNumber}`,
        metadata: { requestId: p.requestId, requestNumber: p.requestNumber },
      },
      `pi-${p.requestId}-${p.amountCents}`,
    ),
  retrievePaymentIntent: (id: string) => stripeRequest<PaymentIntent>("GET", `/payment_intents/${id}`),
  capture: (id: string, amountCents: number) =>
    stripeRequest<PaymentIntent>("POST", `/payment_intents/${id}/capture`, { amount_to_capture: amountCents }, `cap-${id}-${amountCents}`),
  cancel: (id: string) => stripeRequest<PaymentIntent>("POST", `/payment_intents/${id}/cancel`, {}, `cancel-${id}`),
  refund: (p: { paymentIntent: string; amountCents: number; refundId: string }) =>
    stripeRequest<{ id: string; status: string }>(
      "POST",
      "/refunds",
      {
        payment_intent: p.paymentIntent,
        amount: p.amountCents,
        metadata: { refundId: p.refundId },
      },
      `refund-${p.refundId}`,
    ),
  createCustomer: (p: { email: string; name: string; userId: string }) =>
    stripeRequest<{ id: string }>("POST", "/customers", { email: p.email, name: p.name, metadata: { userId: p.userId } }, `cus-${p.userId}`),
  createSetupIntent: (customer: string) =>
    stripeRequest<{ id: string; client_secret: string }>("POST", "/setup_intents", { customer, automatic_payment_methods: { enabled: true } }),
  listPaymentMethods: (customer: string) =>
    stripeRequest<{
      data: {
        id: string;
        card?: {
          brand: string;
          last4: string;
          exp_month: number;
          exp_year: number;
        };
      }[];
    }>("GET", `/customers/${customer}/payment_methods`, { type: "card" }),
  detachPaymentMethod: (id: string) => stripeRequest("POST", `/payment_methods/${id}/detach`),
};
