/** Shared marketing/help copy. Nothing here states coverage, prices or response times. */
export const FAQS: { q: string; a: string }[] = [
  {
    q: "How do I request a tow or roadside help?",
    a: "Tap Request a Tow, confirm where you are, choose the service, and tell us about your vehicle. You'll see an itemized estimate (or be told a confirmed quote is needed) before anything is sent to providers.",
  },
  {
    q: "How is the price calculated?",
    a: "Prices come from the rates configured for each service: a base fee, any mileage beyond the included miles, disclosed surcharges, and tax. You'll see each line before you confirm. If we can't calculate an estimate automatically, a dispatcher sends you a confirmed quote to approve first.",
  },
  {
    q: "Can the price change after I confirm?",
    a: "Only if the job turns out to need more than what was described. Your provider or dispatcher must explain the change, and any increase needs your approval in the app before the extra work happens.",
  },
  {
    q: "Who are the providers?",
    a: "Independent towing and roadside businesses. Each must upload a driver's license, insurance and truck registration, and be approved by a Call Recon administrator before they can accept jobs. They're only offered services they're equipped and authorized for.",
  },
  {
    q: "Will I see where my driver is?",
    a: "You'll see each status update as your driver reports it. A live arrival estimate is shown only when the driver is sharing their location and a mapping service can calculate the route. Otherwise we'll show the driver's own estimate, clearly labeled.",
  },
  {
    q: "Can I cancel?",
    a: "Yes. Cancelling before a provider is assigned is free. After assignment a cancellation fee may apply. The exact terms are shown before you confirm and again before you cancel.",
  },
  {
    q: "Is Call Recon an emergency service?",
    a: "No. If anyone is injured, if you're in immediate danger, or if your vehicle is blocking traffic in an unsafe spot, call 911 first. Move to a safe place away from traffic if you can.",
  },
  {
    q: "How do payments work?",
    a: "Card details are entered into our payment processor's secure form; Call Recon never sees or stores your full card number. Your card may be authorized for the approved amount when you confirm and charged the final amount after service.",
  },
];

export const LEGAL_PAGES = {
  terms: { title: "Terms of service", key: "terms" },
  privacy: { title: "Privacy policy", key: "privacyPolicy" },
  cancellation: { title: "Cancellation policy", key: "cancellationPolicy" },
  refunds: { title: "Refund policy", key: "refundPolicy" },
  "provider-requirements": {
    title: "Provider requirements",
    key: "providerRequirements",
  },
  payments: {
    title: "Pricing & payment disclosures",
    key: "paymentDisclosures",
  },
} as const;
export type LegalSlug = keyof typeof LEGAL_PAGES;
