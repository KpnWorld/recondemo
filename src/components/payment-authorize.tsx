"use client";

import { loadStripe } from "@stripe/stripe-js/pure";
import type { Stripe, StripeElements } from "@stripe/stripe-js";
import { useEffect, useRef, useState } from "react";
import { paymentIntentAction } from "@/app/actions/customer";
import { formatCents } from "@/lib/money";
import { Alert, Button } from "./ui";

/**
 * Card authorization with Stripe's Payment Element. Card details go straight to
 * Stripe. A successful confirmation here is NOT treated as payment success: the
 * server waits for the signed webhook before marking the payment authorized.
 */
export function PaymentAuthorize({ requestId, publishableKey }: { requestId: string; publishableKey: string }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [stripe, setStripe] = useState<Stripe | null>(null);
  const [elements, setElements] = useState<StripeElements | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "submitting" | "submitted">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await paymentIntentAction(requestId);
      if (!r.ok) return setError(r.error);
      const s = await loadStripe(publishableKey);
      if (!s || cancelled || !mountRef.current) return;
      const els = s.elements({
        clientSecret: r.data!.clientSecret,
        appearance: {
          theme: "stripe",
          variables: {
            colorPrimary: "#2F7778",
            colorText: "#25343A",
            borderRadius: "12px",
            fontFamily: "Inter Variable, system-ui, sans-serif",
          },
        },
      });
      els.create("payment", { layout: "tabs" }).mount(mountRef.current);
      setStripe(s);
      setElements(els);
      setAmount(r.data!.amountCents);
      setState("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [requestId, publishableKey]);

  async function submit() {
    if (!stripe || !elements) return;
    setState("submitting");
    setError(null);
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/requests/${requestId}`,
      },
      redirect: "if_required",
    });
    if (error) {
      setError(error.message ?? "Your card couldn't be authorized.");
      setState("ready");
    } else setState("submitted");
  }

  if (state === "submitted")
    return (
      <Alert tone="info" title="Confirming with our payment processor…">
        This page updates automatically once the authorization is confirmed. You haven&apos;t been charged yet.
      </Alert>
    );

  return (
    <div className="space-y-4">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div ref={mountRef} className="min-h-24" aria-busy={state === "loading"} />
      {state === "loading" && !error ? <p className="text-sm text-ink-muted">Loading secure payment form…</p> : null}
      <Button type="button" size="lg" className="w-full" onClick={submit} disabled={state !== "ready"}>
        {state === "submitting" ? "Authorizing…" : `Authorize ${amount != null ? formatCents(amount) : ""}`}
      </Button>
      <p className="text-xs text-ink-muted">
        Your card is authorized now and charged the final amount after service. Card details are handled by Stripe; Call Recon never sees your full card number.
      </p>
    </div>
  );
}
