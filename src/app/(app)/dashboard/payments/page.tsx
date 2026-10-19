import type { Metadata } from "next";
import { requirePageUser } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { config } from "@/lib/env";
import { stripe, stripeConfigured } from "@/lib/integrations/stripe";
import { removeCardAction } from "@/app/actions/customer";
import { Alert, Card, Flash, PageHeader } from "@/components/ui";
import { ConfirmSubmit } from "@/components/client";
import { AddCard } from "@/components/add-card";
import { CardIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Payment methods" };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requirePageUser(["CUSTOMER"]);
  const sp = await searchParams;
  const enabled = stripeConfigured();
  let cards: {
    id: string;
    card?: {
      brand: string;
      last4: string;
      exp_month: number;
      exp_year: number;
    };
  }[] = [];
  let loadError: string | null = null;
  if (enabled) {
    const profile = await db.customerProfile.findUnique({
      where: { userId: user.id },
    });
    if (profile?.paymentCustomerRef) {
      try {
        cards = (await stripe.listPaymentMethods(profile.paymentCustomerRef)).data;
      } catch (e) {
        loadError = (e as Error).message;
      }
    }
  }
  return (
    <>
      <PageHeader title="Payment methods" description="Cards are stored by our payment processor, Stripe. Call Recon never sees or stores your full card number." />
      <Flash {...sp} />
      {!enabled ? (
        <Alert tone="info" title="Online payments aren't set up yet">
          Card payments will be available once Call Recon connects its payment processor. Until then, no card is needed to request service
          {config.demoMode() ? ", and nothing is charged in this demo" : ""}.
        </Alert>
      ) : (
        <Card>
          {loadError ? <Alert tone="error">{loadError}</Alert> : null}
          {cards.length ? (
            <ul className="mb-6 divide-y divide-line">
              {cards.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                  <span className="flex items-center gap-3">
                    <CardIcon className="text-sea" />
                    <span className="font-medium capitalize">
                      {c.card?.brand} •••• {c.card?.last4}
                      <span className="ml-2 text-sm font-normal text-ink-muted">
                        Expires {c.card?.exp_month}/{c.card?.exp_year}
                      </span>
                    </span>
                  </span>
                  <form action={removeCardAction}>
                    <input type="hidden" name="paymentMethodId" value={c.id} />
                    <ConfirmSubmit variant="ghost" size="sm" message="Remove this card?">
                      Remove
                    </ConfirmSubmit>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-4 text-sm text-ink-muted">No saved cards yet.</p>
          )}
          <AddCard publishableKey={config.stripe.publishableKey()!} />
        </Card>
      )}
    </>
  );
}
