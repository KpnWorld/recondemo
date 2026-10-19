import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { FAQS, LEGAL_PAGES } from "@/lib/content";
import { TICKET_CATEGORIES } from "@/lib/constants";
import { contactAction } from "@/app/actions/support";
import { Alert, Card, Field, Flash, Input, LinkButton, Placeholder, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { ChatIcon, PhoneIcon } from "@/components/icons";

export const metadata: Metadata = {
  title: "Help center",
  description: "Answers about requests, pricing, cancellations and payments, and how to contact Call Recon support.",
};
export const dynamic = "force-dynamic";

export default async function HelpPage({
  searchParams,
}: {
  searchParams: Promise<{
    ok?: string;
    error?: string;
    request?: string;
    topic?: string;
  }>;
}) {
  const sp = await searchParams;
  const [user, { business }] = await Promise.all([getCurrentUser(), getSettings()]);
  const full = user
    ? await db.user.findUnique({
        where: { id: user.id },
        select: { name: true, email: true },
      })
    : null;
  const topic = TICKET_CATEGORIES.some((c) => c.value === sp.topic) ? sp.topic : "GENERAL";
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-3xl font-bold sm:text-4xl">Help center</h1>
      <p className="mt-2 max-w-2xl text-lg text-ink-muted">Answers to common questions, and a way to reach our team.</p>

      <Alert tone="error" className="mt-6" title="In an emergency, call 911">
        Call Recon is not an emergency service. If anyone is hurt, you&apos;re in immediate danger, or your vehicle is blocking traffic unsafely, call 911 first.{" "}
        <a href="tel:911">Call 911</a>
      </Alert>

      <div className="mt-8 grid gap-5 md:grid-cols-3">
        <Card className="md:col-span-2">
          <h2 className="mb-3 text-xl font-semibold">Frequently asked questions</h2>
          <div className="divide-y divide-line">
            {FAQS.map((f) => (
              <details key={f.q} className="group py-3">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-semibold text-deep">
                  {f.q}
                  <span aria-hidden className="text-sea transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-2 text-ink-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </Card>
        <div className="space-y-5">
          <Card>
            <h2 className="text-lg font-semibold">Reach support</h2>
            <ul className="mt-3 space-y-3 text-sm">
              <li className="flex gap-2">
                <PhoneIcon className="size-5 shrink-0 text-sea" />
                {business.supportPhone ? (
                  <a href={`tel:${business.supportPhone.replace(/[^\d+]/g, "")}`}>{business.supportPhone}</a>
                ) : (
                  <Placeholder>Support phone not yet published</Placeholder>
                )}
              </li>
              <li className="flex gap-2">
                <ChatIcon className="size-5 shrink-0 text-sea" />
                {business.supportEmail ? <a href={`mailto:${business.supportEmail}`}>{business.supportEmail}</a> : <Placeholder>Support email not yet published</Placeholder>}
              </li>
              <li className="text-ink-muted">Hours: {business.supportHours || <Placeholder>Support hours not yet published</Placeholder>}</li>
            </ul>
            <p className="mt-3 text-sm text-ink-muted">For an active request, message your provider from the tracking page.</p>
            {user?.role === "CUSTOMER" ? (
              <LinkButton href="/dashboard" variant="secondary" size="sm" className="mt-3">
                My requests
              </LinkButton>
            ) : null}
          </Card>
          <Card>
            <h2 className="text-lg font-semibold">Policies</h2>
            <ul className="mt-2 space-y-1.5 text-sm">
              {Object.entries(LEGAL_PAGES).map(([slug, p]) => (
                <li key={slug}>
                  <Link href={`/legal/${slug}`}>{p.title}</Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <Card id="contact" className="mt-8 scroll-mt-24">
        <h2 className="text-xl font-semibold">Contact us</h2>
        <p className="mt-1 text-sm text-ink-muted">Questions, complaints, refund requests or charge disputes. Include your request number if you have one.</p>
        <div className="mt-4">
          <Flash ok={sp.ok} error={sp.error} />
        </div>
        <form action={contactAction} className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name" htmlFor="contactName" required>
            <Input id="contactName" name="contactName" defaultValue={full?.name} required autoComplete="name" />
          </Field>
          <Field label="Email" htmlFor="contactEmail" required>
            <Input id="contactEmail" name="contactEmail" type="email" defaultValue={full?.email} required autoComplete="email" />
          </Field>
          <Field label="Topic" htmlFor="category" required>
            <Select id="category" name="category" defaultValue={topic}>
              {TICKET_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Request number" htmlFor="requestNumber" hint="Looks like CR-ABC123.">
            <Input id="requestNumber" name="requestNumber" defaultValue={sp.request} autoCapitalize="characters" />
          </Field>
          <Field label="Subject" htmlFor="subject" required className="sm:col-span-2">
            <Input id="subject" name="subject" required maxLength={150} />
          </Field>
          <Field label="How can we help?" htmlFor="body" required className="sm:col-span-2">
            <Textarea id="body" name="body" required minLength={10} maxLength={5000} rows={5} />
          </Field>
          <div className="sm:col-span-2">
            <SubmitButton size="lg" pendingText="Sending…">
              Send message
            </SubmitButton>
          </div>
        </form>
      </Card>
    </div>
  );
}
