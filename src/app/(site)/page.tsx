import Link from "next/link";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { config } from "@/lib/env";
import { FAQS } from "@/lib/content";
import { Card, LinkButton, Placeholder } from "@/components/ui";
import {
  CardIcon,
  ChevronRightIcon,
  ClockIcon,
  PhoneIcon,
  PinIcon,
  ReceiptIcon,
  ServiceIcon,
  ShieldIcon,
  TruckIcon,
  BatteryIcon,
  TireIcon,
  KeyIcon,
  ChatIcon,
} from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [categories, settings, areas] = await Promise.all([
    db.serviceCategory.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
    }),
    getSettings(),
    db.serviceArea.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const quick = [
    {
      slug: "standard-towing",
      label: "Towing",
      sub: "Move your vehicle",
      Icon: TruckIcon,
    },
    {
      slug: "jump-start",
      label: "Jump-start",
      sub: "Battery assistance",
      Icon: BatteryIcon,
    },
    {
      slug: "flat-tire",
      label: "Flat tire",
      sub: "Tire assistance",
      Icon: TireIcon,
    },
    {
      slug: "lockout",
      label: "Lockout",
      sub: "Locked out assistance",
      Icon: KeyIcon,
    },
  ];
  const { business } = settings;

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute -right-40 -top-40 size-[36rem] rounded-full bg-mint/25 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pb-24 lg:pt-16">
          <div className="fade-in">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-sm font-medium text-sea shadow-sm ring-1 ring-line">
              <span className="size-2 rounded-full bg-mint" aria-hidden /> Fast response. Clear pricing. Peace of mind.
            </p>
            <h1 className="text-4xl font-bold leading-[1.08] sm:text-5xl lg:text-6xl">Stranded? We&apos;ll Help You Get Moving.</h1>
            <p className="mt-5 max-w-xl text-lg text-ink-muted sm:text-xl">Request trusted roadside assistance in a few simple steps.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <LinkButton href="/request" size="lg">
                Request a Tow
              </LinkButton>
              <LinkButton href="/drive" size="lg" variant="secondary">
                Become a Driver
              </LinkButton>
            </div>
            <p className="mt-6 flex items-start gap-2 text-sm text-ink-muted">
              <PhoneIcon className="mt-0.5 size-4 shrink-0 text-sea" />
              In danger or injured? Call 911 first. Call Recon is not an emergency service.
            </p>
          </div>

          {/* Request card */}
          <Card className="fade-in shadow-[var(--shadow-lift)]" aria-labelledby="request-card-title">
            <h2 id="request-card-title" className="text-xl font-semibold">
              What do you need help with?
            </h2>
            <p className="mt-1 text-sm text-ink-muted">Choose a service to start. You&apos;ll see pricing before you confirm.</p>
            <ul className="mt-5 grid grid-cols-2 gap-3">
              {quick.map(({ slug, label, sub, Icon }) => {
                const cat = categories.find((c) => c.slug === slug);
                return (
                  <li key={slug}>
                    <Link
                      href={cat ? `/request?service=${cat.id}` : "/request"}
                      className="flex h-full min-h-28 flex-col gap-2 rounded-2xl bg-soft p-4 text-left no-underline ring-1 ring-inset ring-line transition hover:bg-mint-50 hover:ring-sea/40"
                    >
                      <span className="flex size-10 items-center justify-center rounded-xl bg-white text-sea shadow-sm">
                        <Icon />
                      </span>
                      <span className="font-semibold text-deep">{label}</span>
                      <span className="-mt-1.5 text-sm text-ink-muted">{sub}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="mt-5 flex items-center gap-3 rounded-2xl bg-mint-50 p-4 text-sm">
              <PinIcon className="shrink-0 text-sea" />
              <p>We&apos;ll ask to use your location (or you can type an address), then confirm the details with you.</p>
            </div>
            <LinkButton href="/request" className="mt-5 w-full" size="lg">
              Start my request
            </LinkButton>
          </Card>
        </div>
      </section>

      {/* Services */}
      <section id="services" className="scroll-mt-24 bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading eyebrow="Services" title="Help for the most common roadside problems" />
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/request?service=${c.id}`}
                  className="group flex h-full items-start gap-4 rounded-[var(--radius-card)] bg-soft p-5 no-underline ring-1 ring-inset ring-transparent transition hover:ring-sea/30"
                >
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white text-sea shadow-sm">
                    <ServiceIcon slug={c.slug} />
                  </span>
                  <span>
                    <span className="flex items-center gap-1 font-semibold text-deep">
                      {c.name}
                      <ChevronRightIcon className="size-4 opacity-0 transition group-hover:opacity-100" />
                    </span>
                    <span className="mt-1 block text-sm text-ink-muted">{c.description}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-ink-muted">
            Availability depends on verified providers in your area. We&apos;ll show what&apos;s offered at your location before you choose.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-24 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading eyebrow="How it works" title="Three steps, then we keep you posted" />
          <ol className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              ["Tell us where you are", "Share your location or type an address, and add a landmark so your driver can find you."],
              ["Review your price", "Pick the service, describe your vehicle, and see an itemized estimate before you confirm."],
              ["Track your help", "We contact verified providers. Once one accepts, you'll see who's coming and each status update."],
            ].map(([t, d], i) => (
              <li key={t}>
                <Card className="h-full">
                  <span className="flex size-10 items-center justify-center rounded-full bg-deep text-lg font-bold text-white">{i + 1}</span>
                  <h3 className="mt-4 text-lg font-semibold">{t}</h3>
                  <p className="mt-2 text-ink-muted">{d}</p>
                </Card>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Benefits */}
      <section className="bg-white py-16 sm:py-20" aria-labelledby="benefits">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading id="benefits" eyebrow="Why Call Recon" title="Built to take the stress out of a breakdown" />
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [ReceiptIcon, "Transparent estimates", "Every fee, surcharge and tax is itemized before you confirm. Price increases need your approval."],
              [ShieldIcon, "Verified providers", "Providers submit license, insurance and registration, and are reviewed before they can take jobs."],
              [ClockIcon, "Live status updates", "Follow each step from Finding a Provider to Service Completed, and message your driver in the app."],
              [CardIcon, "Secure payments", "Cards are handled by a PCI-compliant payment processor. We never store your card number."],
            ].map(([Icon, t, d]) => {
              const I = Icon as typeof ReceiptIcon;
              return (
                <div key={t as string} className="rounded-[var(--radius-card)] bg-soft p-6">
                  <I className="text-sea" />
                  <h3 className="mt-4 font-semibold">{t as string}</h3>
                  <p className="mt-2 text-sm text-ink-muted">{d as string}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Service area */}
      <section className="py-16 sm:py-20" aria-labelledby="area">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 sm:px-6 lg:grid-cols-2">
          <div>
            <SectionHeading id="area" eyebrow="Service area" title="Where we operate" align="left" />
            <div className="mt-4 space-y-3 text-ink-muted">
              {business.serviceAreaSummary ? (
                <p>{business.serviceAreaSummary}</p>
              ) : (
                <p>
                  <Placeholder>Service area description, set in Admin → Settings</Placeholder>
                </p>
              )}
              <p>Coverage depends on verified providers being available. When you start a request, we&apos;ll tell you which services are offered at your exact location.</p>
            </div>
          </div>
          <Card>
            <h3 className="font-semibold">Configured service areas</h3>
            {areas.length ? (
              <ul className="mt-3 divide-y divide-line">
                {areas.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 py-3">
                    <PinIcon className="shrink-0 text-sea" />
                    <span>
                      <span className="font-medium">{a.name}</span>
                      {a.isDemo || config.demoMode() ? <span className="ml-2 text-xs text-gold-800">Sample data</span> : null}
                      {a.description ? <span className="block text-sm text-ink-muted">{a.description}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-ink-muted">No service areas have been published yet.</p>
            )}
          </Card>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-white py-16 sm:py-20" aria-labelledby="faq">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <SectionHeading id="faq" eyebrow="FAQ" title="Questions people ask" />
          <div className="mt-8 divide-y divide-line rounded-[var(--radius-card)] bg-soft">
            {FAQS.map((f) => (
              <details key={f.q} className="group px-5 py-1">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 font-semibold text-deep [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <ChevronRightIcon className="size-5 shrink-0 transition group-open:rotate-90" />
                </summary>
                <p className="pb-5 text-ink-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Support */}
      <section className="py-16 sm:py-20" aria-labelledby="support">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="on-dark grid gap-8 rounded-[2rem] bg-deep p-8 text-white sm:p-12 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <h2 id="support" className="text-3xl font-bold text-white">
                Need a hand with something else?
              </h2>
              <p className="mt-3 max-w-xl text-white/80">Our support team can help with requests, receipts, refunds and provider questions.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <LinkButton href="/help#contact" variant="gold">
                  <ChatIcon className="size-5" /> Contact support
                </LinkButton>
                <LinkButton href="/help" variant="secondary">
                  Visit help center
                </LinkButton>
              </div>
            </div>
            <dl className="space-y-4 text-white/85">
              <div>
                <dt className="text-sm text-white/60">Support phone</dt>
                <dd className="text-lg font-semibold">
                  {business.supportPhone ? (
                    <a className="text-mint" href={`tel:${business.supportPhone}`}>
                      {business.supportPhone}
                    </a>
                  ) : (
                    <Placeholder>Support phone number</Placeholder>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-white/60">Support email</dt>
                <dd className="text-lg font-semibold">
                  {business.supportEmail ? (
                    <a className="text-mint" href={`mailto:${business.supportEmail}`}>
                      {business.supportEmail}
                    </a>
                  ) : (
                    <Placeholder>Support email</Placeholder>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-white/60">Hours</dt>
                <dd className="font-semibold">{business.supportHours || <Placeholder>Support hours</Placeholder>}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>
    </>
  );
}

function SectionHeading({ eyebrow, title, id, align = "center" }: { eyebrow: string; title: string; id?: string; align?: "center" | "left" }) {
  return (
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : ""}>
      <p className="text-sm font-semibold uppercase tracking-wide text-sea">{eyebrow}</p>
      <h2 id={id} className="mt-2 text-3xl font-bold sm:text-4xl">
        {title}
      </h2>
    </div>
  );
}
