import type { Metadata } from "next";
import { Card, LinkButton } from "@/components/ui";
import { SectionHeading } from "@/components/concept/shell";
import { BellIcon, CardIcon, ClockIcon, LocateIcon, PinIcon, ReceiptIcon, ShieldIcon, TruckIcon, UserIcon } from "@/components/icons";

export const metadata: Metadata = { title: "The vision" };

const PROBLEMS = [
  ["Vague prices", "Today you often call around and hear a number that changes on arrival."],
  ["No visibility", "You wait with no idea who is coming, or whether anyone accepted your job."],
  ["Hard for good operators to be found", "Independent tow and roadside businesses depend on word of mouth and missed calls."],
];

const ENGINE_INPUTS = [
  [LocateIcon, "Where the customer is", "Location shared with the customer's permission, or an address they type. We never guess or fill in a location for them."],
  [
    TruckIcon,
    "What needs moving or fixing",
    "Vehicle year, make, model and size class, whether it can be driven, and the situation. A flatbed job is not offered to a jump-start-only provider.",
  ],
  [
    ClockIcon,
    "Which drivers are really available",
    "A driver is offered a job only while they are online, approved for that service, and covering that area. Position comes from their own phone, never a made-up point.",
  ],
  [
    ReceiptIcon,
    "What the job should cost",
    "A pricing engine applies the rules an administrator sets: base fee, mileage, disclosed surcharges and tax. If it cannot price a job, a person sends a confirmed quote.",
  ],
] as const;

const PRINCIPLES = [
  "No invented reviews, ratings or testimonials. They appear only after real customers write them.",
  "No arrival time is shown as live unless a driver is sharing real location and a mapping service computed the route.",
  "Prices are itemized before you confirm, and any increase needs your approval.",
  "Cards are handled by a payment processor. A payment counts as paid only when the processor confirms it, never because a browser says so.",
  "Providers are reviewed on license, insurance and registration before they can take a job.",
  "Call Recon is not an emergency service. If anyone is hurt or in danger, call 911.",
];

export default function LaunchPage() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute -right-40 -top-40 size-[36rem] rounded-full bg-mint/25 blur-3xl" />
        <div className="relative mx-auto max-w-4xl px-4 pb-16 pt-14 text-center sm:px-6 lg:pb-24 lg:pt-20">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-sm font-medium text-sea shadow-sm ring-1 ring-line">
            <span className="size-2 rounded-full bg-gold" aria-hidden /> Coming soon, currently in development
          </p>
          <h1 className="text-4xl font-bold leading-[1.08] sm:text-5xl lg:text-6xl">Roadside Assistance, Reimagined.</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-muted sm:text-xl">Fast response. Clear pricing. Peace of mind.</p>
          <p className="mx-auto mt-4 max-w-2xl text-ink-muted">
            Call Recon is an on-demand marketplace that connects people who are stranded with verified independent tow and roadside providers, with the price and every status
            update in plain view.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <LinkButton href="/demo" size="lg">
              See how it will work
            </LinkButton>
            <LinkButton href="#engine" size="lg" variant="secondary">
              How dispatch works
            </LinkButton>
          </div>
        </div>
      </section>

      <section className="bg-white py-16 sm:py-20" aria-labelledby="problem">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading id="problem" eyebrow="Why we are building it" title="A breakdown is stressful enough" />
          <ul className="mt-10 grid gap-5 md:grid-cols-3">
            {PROBLEMS.map(([t, d]) => (
              <li key={t} className="rounded-[var(--radius-card)] bg-soft p-6">
                <h3 className="font-semibold">{t}</h3>
                <p className="mt-2 text-sm text-ink-muted">{d}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="py-16 sm:py-20" aria-labelledby="sides">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading id="sides" eyebrow="One platform, three sides" title="Built for everyone in the job" />
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              [UserIcon, "Customers", "Say where you are, describe the vehicle, see an itemized price, then follow the job to completion.", "/demo/customer"],
              [TruckIcon, "Providers", "Go online, receive offers that fit your equipment and area, accept, and get paid for completed work.", "/demo/driver"],
              [ShieldIcon, "Operations", "A dispatch board, pricing rules, provider approvals and an audit trail so every job is accountable.", "/demo/admin"],
            ].map(([Icon, t, d, href]) => {
              const I = Icon as typeof UserIcon;
              return (
                <Card key={t as string} className="flex h-full flex-col">
                  <I className="text-sea" />
                  <h3 className="mt-4 text-lg font-semibold">{t as string}</h3>
                  <p className="mt-2 flex-1 text-ink-muted">{d as string}</p>
                  <LinkButton href={href as string} variant="secondary" size="sm" className="mt-5 self-start">
                    Preview the {(t as string).toLowerCase()} view
                  </LinkButton>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section id="engine" className="scroll-mt-24 bg-deep py-16 text-white sm:py-20" aria-labelledby="engine-title">
        <div className="on-dark mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-mint">The dispatch engine</p>
            <h2 id="engine-title" className="mt-2 text-3xl font-bold !text-white sm:text-4xl">
              Matching like a ride-hailing app, built for roadside work
            </h2>
            <p className="mt-4 text-white/75">Four things have to be true before a job is offered to a driver. This is the logic we are building the back end around.</p>
          </div>
          <ul className="mt-10 grid gap-5 md:grid-cols-2">
            {ENGINE_INPUTS.map(([Icon, t, d]) => (
              <li key={t} className="rounded-[var(--radius-card)] bg-white/10 p-6 ring-1 ring-white/15">
                <Icon className="text-mint" />
                <h3 className="mt-4 font-semibold text-white">{t}</h3>
                <p className="mt-2 text-sm text-white/75">{d}</p>
              </li>
            ))}
          </ul>
          <ol className="mx-auto mt-10 grid max-w-4xl gap-3 sm:grid-cols-5">
            {["Request", "Eligible drivers found", "Offer sent", "Driver accepts", "Live status"].map((s, i) => (
              <li key={s} className="rounded-2xl bg-white/10 px-3 py-4 text-center text-sm font-medium ring-1 ring-white/15">
                <span className="mb-1 block text-xs text-mint">Step {i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
          <p className="mt-8 text-center text-sm text-white/70">
            If nobody accepts, the offer moves to the next eligible driver, then to a human dispatcher. If no one is available, the customer is told so plainly.
          </p>
          <div className="mt-6 text-center">
            <LinkButton href="/demo/engine" variant="gold">
              Try the matching demo
            </LinkButton>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-20" aria-labelledby="principles">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <SectionHeading id="principles" eyebrow="Our rules" title="What we will not do" />
          <ul className="mt-8 space-y-3">
            {PRINCIPLES.map((p) => (
              <li key={p} className="flex gap-3 rounded-2xl bg-white p-4 shadow-[var(--shadow-card)]">
                <ShieldIcon className="mt-0.5 shrink-0 text-sea" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-white py-16 sm:py-20" aria-labelledby="roadmap">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <SectionHeading id="roadmap" eyebrow="What is next" title="Where the build stands" />
          <ol className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              [PinIcon, "Web app first", "Customer, provider and admin experiences in the browser, backed by a real database."],
              [BellIcon, "Then native apps", "Android and iOS apps, starting with the driver app for background location and job alerts."],
              [CardIcon, "Then go live", "Live payments, mapping and notifications, plus the licensing and insurance checks the business needs, before any real request is taken."],
            ].map(([Icon, t, d]) => {
              const I = Icon as typeof PinIcon;
              return (
                <li key={t as string} className="rounded-[var(--radius-card)] bg-soft p-6">
                  <I className="text-sea" />
                  <h3 className="mt-3 font-semibold">{t as string}</h3>
                  <p className="mt-2 text-sm text-ink-muted">{d as string}</p>
                </li>
              );
            })}
          </ol>
          <p className="mt-6 text-center text-sm text-ink-muted">We have not set launch dates or service areas yet, and we will not announce either until they are real.</p>
        </div>
      </section>
    </>
  );
}
