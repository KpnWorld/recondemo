"use client";

import { loadStripe } from "@stripe/stripe-js/pure";
import type { Stripe, StripeElements } from "@stripe/stripe-js";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { setupIntentAction } from "@/app/actions/customer";
import { Alert, Button } from "./ui";

export function AddCard({ publishableKey }: { publishableKey: string }) {
  const router = useRouter();
  const mountRef = useRef<HTMLDivElement>(null);
  const [s, setS] = useState<{
    stripe: Stripe;
    elements: StripeElements;
  } | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setState("loading");
    const r = await setupIntentAction();
    if (!r.ok) {
      setError(r.error);
      setState("idle");
      return;
    }
    const stripe = await loadStripe(publishableKey);
    if (!stripe || !mountRef.current) return;
    const elements = stripe.elements({
      clientSecret: r.data!.clientSecret,
      appearance: {
        theme: "stripe",
        variables: { colorPrimary: "#2F7778", borderRadius: "12px" },
      },
    });
    elements.create("payment").mount(mountRef.current);
    setS({ stripe, elements });
    setState("ready");
  }

  async function save() {
    if (!s) return;
    setState("saving");
    const { error } = await s.stripe.confirmSetup({
      elements: s.elements,
      confirmParams: {
        return_url: `${window.location.origin}/dashboard/payments`,
      },
      redirect: "if_required",
    });
    if (error) {
      setError(error.message ?? "Couldn't save the card.");
      setState("ready");
    } else router.refresh();
  }

  return (
    <div className="space-y-3">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div ref={mountRef} />
      {state === "idle" || state === "loading" ? (
        <Button type="button" onClick={open} disabled={state === "loading"}>
          {state === "loading" ? "Loading…" : "Add a card"}
        </Button>
      ) : (
        <Button type="button" onClick={save} disabled={state === "saving"}>
          {state === "saving" ? "Saving…" : "Save card"}
        </Button>
      )}
    </div>
  );
}
