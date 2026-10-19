import type { Metadata } from "next";
import type { ReactNode } from "react";
import { requirePagePermission } from "@/lib/auth/current";
import { getSettings } from "@/lib/settings";
import { integrationStatuses } from "@/lib/env";
import { purgeAction, settingsAction } from "@/app/actions/admin";
import { Alert, Badge, Card, Checkbox, Field, Flash, Input, PageHeader, Textarea } from "@/components/ui";
import { ConfirmSubmit, SubmitButton } from "@/components/client";

export const metadata: Metadata = { title: "Settings" };

function Section({ id, title, description, children }: { id: string; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-24">
      <h2 className="text-lg font-semibold">{title}</h2>
      {description ? <div className="mt-1 text-sm text-ink-muted">{description}</div> : null}
      <form action={settingsAction} className="mt-4 space-y-4">
        <input type="hidden" name="section" value={id} />
        {children}
        <SubmitButton variant="secondary">Save {title.toLowerCase()}</SubmitButton>
      </form>
    </Card>
  );
}

const LEGAL_FIELDS = [
  ["terms", "Terms of service"],
  ["privacyPolicy", "Privacy policy"],
  ["cancellationPolicy", "Cancellation policy"],
  ["refundPolicy", "Refund policy"],
  ["providerRequirements", "Provider requirements"],
  ["paymentDisclosures", "Payment disclosures"],
] as const;

export default async function AdminSettings({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requirePagePermission("settings.manage");
  const sp = await searchParams;
  const s = await getSettings();
  return (
    <>
      <PageHeader title="Settings" description="Business details, policies, dispatch rules, fees and data retention. Every change is recorded in the audit log." />
      <Flash {...sp} />
      <nav aria-label="Settings sections" className="mb-5 flex flex-wrap gap-2 text-sm">
        {["business", "legal", "dispatch", "cancellation", "payments", "pricing", "retention", "integrations"].map((k) => (
          <a key={k} href={`#${k}`} className="rounded-lg bg-white px-3 py-1.5 capitalize no-underline ring-1 ring-line">
            {k}
          </a>
        ))}
      </nav>
      <div className="space-y-5">
        <Section
          id="business"
          title="Business details"
          description="Shown in the footer, help center, receipts and policies. Leave blank anything you haven't confirmed; pages show a clear placeholder instead."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Legal business name" htmlFor="legalName">
              <Input id="legalName" name="legalName" defaultValue={s.business.legalName} />
            </Field>
            <Field label="Support email" htmlFor="supportEmail">
              <Input id="supportEmail" name="supportEmail" type="email" defaultValue={s.business.supportEmail} />
            </Field>
            <Field label="Support phone" htmlFor="supportPhone">
              <Input id="supportPhone" name="supportPhone" type="tel" defaultValue={s.business.supportPhone} />
            </Field>
            <Field label="Support hours" htmlFor="supportHours">
              <Input id="supportHours" name="supportHours" defaultValue={s.business.supportHours} placeholder="e.g. 24/7, or Mon–Fri 8am–8pm ET" />
            </Field>
            <Field label="Business address" htmlFor="address" className="sm:col-span-2">
              <Input id="address" name="address" defaultValue={s.business.address} />
            </Field>
            <Field label="Service area summary (public)" htmlFor="serviceAreaSummary" className="sm:col-span-2" hint="Describe only areas where verified providers are onboarded.">
              <Textarea id="serviceAreaSummary" name="serviceAreaSummary" defaultValue={s.business.serviceAreaSummary} maxLength={500} />
            </Field>
          </div>
        </Section>

        <Section
          id="legal"
          title="Policies"
          description="Paste the final text approved by your attorney. Plain text; blank lines start new paragraphs. Public policy pages show a placeholder notice until text is saved."
        >
          {LEGAL_FIELDS.map(([k, label]) => (
            <Field key={k} label={label} htmlFor={k}>
              <Textarea id={k} name={k} defaultValue={s.legal[k]} rows={6} />
            </Field>
          ))}
        </Section>

        <Section id="dispatch" title="Dispatch" description="How offers go out to providers. Offers expire automatically; unanswered rounds move on to the next providers.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Providers per offer round" htmlFor="offerBatchSize" required>
              <Input id="offerBatchSize" name="offerBatchSize" type="number" min={1} max={10} defaultValue={s.dispatch.offerBatchSize} required />
            </Field>
            <Field label="Offer timeout (seconds)" htmlFor="offerTimeoutSeconds" required>
              <Input id="offerTimeoutSeconds" name="offerTimeoutSeconds" type="number" min={30} max={900} defaultValue={s.dispatch.offerTimeoutSeconds} required />
            </Field>
            <Field label="Rounds before “no provider available”" htmlFor="maxRounds" required>
              <Input id="maxRounds" name="maxRounds" type="number" min={1} max={10} defaultValue={s.dispatch.maxRounds} required />
            </Field>
            <Field label="Maximum distance (miles)" htmlFor="maxRadiusMiles" required>
              <Input id="maxRadiusMiles" name="maxRadiusMiles" type="number" min={1} max={200} defaultValue={s.dispatch.maxRadiusMiles} required />
            </Field>
          </div>
          <Checkbox
            name="autoDispatch"
            value="true"
            defaultChecked={s.dispatch.autoDispatch}
            label="Automatic dispatch"
            description="When off, every request waits for a dispatcher to assign a provider manually."
          />
          <Checkbox name="useReliability" value="true" defaultChecked={s.dispatch.useReliability} label="Favor providers who accept offers reliably" />
        </Section>

        <Section id="cancellation" title="Cancellation" description="Customers see these terms before they confirm and again before they cancel.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fee after a provider is assigned (USD)" htmlFor="fee" hint="Leave blank if not yet decided; no fee is charged until set.">
              <Input
                id="fee"
                name="fee"
                type="number"
                step="0.01"
                min={0}
                defaultValue={s.cancellation.feeAfterAssignmentCents == null ? "" : (s.cancellation.feeAfterAssignmentCents / 100).toFixed(2)}
              />
            </Field>
            <Field label="Free cancellation window (minutes after assignment)" htmlFor="freeCancellationMinutes">
              <Input id="freeCancellationMinutes" name="freeCancellationMinutes" type="number" min={0} max={120} defaultValue={s.cancellation.freeCancellationMinutes} />
            </Field>
          </div>
        </Section>

        <Section id="payments" title="Payments" description="Call Recon's revenue is a disclosed platform fee deducted from each job's pre-tax total before provider payout.">
          <Field label="Platform fee (% of pre-tax job total)" htmlFor="platformFeePercent" hint="Must match your provider agreement. Payouts stay on hold until this is set.">
            <Input
              id="platformFeePercent"
              name="platformFeePercent"
              type="number"
              step="0.01"
              min={0}
              max={50}
              defaultValue={s.payments.platformFeeBps == null ? "" : s.payments.platformFeeBps / 100}
            />
          </Field>
          <Checkbox
            name="requireAuthorizationBeforeDispatch"
            value="true"
            defaultChecked={s.payments.requireAuthorizationBeforeDispatch}
            label="Require a card authorization before dispatch"
            description="When the payment processor is connected, customers authorize (not charge) the approved amount before providers are contacted."
          />
        </Section>

        <Section
          id="pricing"
          title="Price changes"
          description="Price changes proposed during a job always need customer approval when they increase the total by more than this amount."
        >
          <Field label="Approval threshold (USD)" htmlFor="threshold" hint="0 means every increase needs approval.">
            <Input id="threshold" name="threshold" type="number" step="0.01" min={0} defaultValue={(s.pricing.revisionApprovalThresholdCents / 100).toFixed(2)} />
          </Field>
        </Section>

        <Section
          id="retention"
          title="Data retention"
          description="Street addresses and pin locations on finished requests are removed after this many days. Records needed for receipts and disputes are kept without the exact location."
        >
          <Field label="Keep exact locations for (days)" htmlFor="locationDataDays" required>
            <Input id="locationDataDays" name="locationDataDays" type="number" min={7} max={3650} defaultValue={s.retention.locationDataDays} required />
          </Field>
        </Section>
        <Card>
          <h2 className="text-lg font-semibold">Run retention cleanup now</h2>
          <p className="mt-1 text-sm text-ink-muted">Also runs automatically with the scheduled job if configured.</p>
          <form action={purgeAction} className="mt-3">
            <ConfirmSubmit variant="danger" message="Remove exact locations from finished requests older than the retention period? This can't be undone.">
              Remove old location data
            </ConfirmSubmit>
          </form>
        </Card>

        <Card id="integrations" className="scroll-mt-24">
          <h2 className="text-lg font-semibold">Integrations</h2>
          <p className="mt-1 text-sm text-ink-muted">Integrations are configured with server environment variables so keys never pass through the browser or database.</p>
          <Alert tone="info" className="mt-3">
            After changing environment variables, restart the app. See the README for setup steps.
          </Alert>
          <ul className="mt-4 divide-y divide-line">
            {integrationStatuses().map((i) => (
              <li key={i.key} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  <span className="block font-semibold text-deep">{i.name}</span>
                  <span className="text-sm text-ink-muted">
                    {i.detail} <code className="text-xs">{i.envVars.join(", ")}</code>
                  </span>
                </span>
                <Badge tone={i.configured ? "ok" : "neutral"}>{i.configured ? "Configured" : "Not configured"}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
