import type { Metadata } from "next";
import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { DOCUMENT_TYPES, REQUIRED_DOCUMENT_TYPES } from "@/lib/constants";
import { Card, LinkButton } from "@/components/ui";
import { CheckIcon, DocumentIcon, DollarIcon, NavigationIcon, ShieldIcon, TruckIcon } from "@/components/icons";

export const metadata: Metadata = {
  title: "Become a Driver",
  description: "Join Call Recon as a verified towing or roadside assistance provider.",
};
export const dynamic = "force-dynamic";

export default async function DrivePage() {
  const { payments } = await getSettings();
  const fee = payments.platformFeeBps;
  const steps = [
    {
      Icon: TruckIcon,
      title: "Create your provider account",
      body: "Tell us about your business, your truck and equipment, the services you offer and where you work.",
    },
    {
      Icon: DocumentIcon,
      title: "Upload your documents",
      body: `We need your ${REQUIRED_DOCUMENT_TYPES.map((t) => DOCUMENT_TYPES.find((d) => d.value === t)!.label.toLowerCase()).join(", ")}. Files are stored privately.`,
    },
    {
      Icon: ShieldIcon,
      title: "Get verified",
      body: "A Call Recon administrator reviews your details and approves the specific services you're equipped for.",
    },
    {
      Icon: NavigationIcon,
      title: "Go online and accept jobs",
      body: "Offers show the service, general area and approved price. You decide whether to accept. Exact details unlock once you do.",
    },
  ];
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="text-sm font-semibold uppercase tracking-wide text-sea">For towing & roadside professionals</p>
      <h1 className="mt-2 text-3xl font-bold sm:text-5xl">Become a Call Recon provider</h1>
      <p className="mt-4 max-w-2xl text-lg text-ink-muted">
        Receive roadside and towing requests from customers near you, with the price agreed before you roll and clear status updates for everyone.
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <LinkButton href="/signup?as=provider" size="lg">
          Become a Driver
        </LinkButton>
        <LinkButton href="/login?next=/provider" size="lg" variant="secondary">
          Provider sign in
        </LinkButton>
      </div>

      <ol className="mt-12 grid gap-4 sm:grid-cols-2">
        {steps.map((s, i) => (
          <li key={s.title}>
            <Card className="h-full">
              <div className="flex items-start gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-mint-50 text-sea">
                  <s.Icon />
                </span>
                <div>
                  <p className="text-sm font-semibold text-sea">Step {i + 1}</p>
                  <h2 className="text-lg font-semibold">{s.title}</h2>
                  <p className="mt-1 text-sm text-ink-muted">{s.body}</p>
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ol>

      <div className="mt-10 grid gap-5 md:grid-cols-2">
        <Card>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <CheckIcon className="text-sea" /> What you get
          </h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-ink-muted">
            <li>Job offers only for services you&apos;re approved for, inside the area and hours you set.</li>
            <li>The customer&apos;s approved price before you accept, and a built-in flow to request approval if the job turns out different.</li>
            <li>In-app messaging with customers without sharing personal phone numbers.</li>
            <li>An earnings view with every payout and the platform fee shown line by line.</li>
          </ul>
        </Card>
        <Card>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <DollarIcon className="text-sea" /> How you&apos;re paid
          </h2>
          <p className="mt-3 text-sm text-ink-muted">
            Customers pay Call Recon. After a job is completed and payment is confirmed, Call Recon pays you the job total minus taxes and a disclosed platform fee
            {fee != null ? ` of ${(fee / 100).toFixed(fee % 100 ? 2 : 0)}%` : " (set out in your provider agreement)"}. See the{" "}
            <Link href="/legal/provider-requirements">provider requirements</Link> and <Link href="/legal/payments">payment disclosures</Link>.
          </p>
        </Card>
      </div>
    </div>
  );
}
