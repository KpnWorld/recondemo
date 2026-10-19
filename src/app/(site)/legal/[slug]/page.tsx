import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { LEGAL_PAGES, type LegalSlug } from "@/lib/content";
import { Alert } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = LEGAL_PAGES[slug as LegalSlug];
  return { title: page?.title ?? "Policy" };
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = LEGAL_PAGES[slug as LegalSlug];
  if (!page) notFound();
  const { legal, business } = await getSettings();
  const text = legal[page.key].trim();
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="text-sm">
        <Link href="/help">← Help center</Link>
      </p>
      <h1 className="mt-2 text-3xl font-bold sm:text-4xl">{page.title}</h1>
      {business.legalName ? <p className="mt-2 text-ink-muted">{business.legalName}</p> : null}
      {text ? (
        <div className="prose-policy mt-8">
          {text.split(/\n\s*\n/).map((para, i) => (
            <p key={i} className="whitespace-pre-line">
              {para}
            </p>
          ))}
        </div>
      ) : (
        <Alert tone="warning" className="mt-8" title="This policy hasn't been published yet">
          [{page.title} placeholder] The final text must be written or approved by Call Recon&apos;s legal counsel and entered in Admin → Settings → Policies before Call Recon
          accepts real bookings. Until then, nothing on this page is an offer or commitment.
        </Alert>
      )}
    </div>
  );
}
