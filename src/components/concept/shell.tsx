import Link from "next/link";
import { Logo } from "../logo";
import { LinkButton, cx } from "../ui";
import { PhoneIcon } from "../icons";

export const CONCEPT_NAV = [
  { href: "/launch", label: "The vision" },
  { href: "/demo", label: "Demo" },
  { href: "/demo/engine", label: "Dispatch engine" },
];

/** Shown on every concept page so nobody mistakes it for a live service. */
export function ConceptBanner() {
  return (
    <div className="bg-gold px-4 py-2 text-center text-sm font-semibold text-deep" role="note">
      Concept preview. Call Recon is still being built and is not taking requests, dispatching drivers or charging cards yet.
    </div>
  );
}

export function ConceptHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-soft/90 backdrop-blur supports-[backdrop-filter]:bg-soft/75">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo href="/launch" />
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {CONCEPT_NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-xl px-3 py-2 text-sm font-medium text-ink no-underline hover:bg-white hover:text-deep">
              {n.label}
            </Link>
          ))}
        </nav>
        <LinkButton href="/demo" size="sm">
          Try the demo
        </LinkButton>
      </div>
      <nav aria-label="Mobile" className="flex gap-1 overflow-x-auto border-t border-line/60 px-4 py-1.5 md:hidden">
        {CONCEPT_NAV.map((n) => (
          <Link key={n.href} href={n.href} className="shrink-0 rounded-xl px-3 py-2 text-sm font-medium text-ink no-underline hover:bg-white">
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

export function ConceptFooter() {
  return (
    <footer className="on-dark mt-20 bg-deep text-white/85">
      <div className="mx-auto max-w-6xl space-y-3 px-4 py-12 sm:px-6">
        <Logo dark href="/launch" />
        <p className="text-sm text-white/70">Roadside Assistance, Reimagined.</p>
        <p className="flex items-start gap-2 text-xs text-white/70">
          <PhoneIcon className="mt-0.5 size-4 shrink-0" />
          Call Recon is not an emergency service. If anyone is hurt or in danger, call 911.
        </p>
        <p className="text-xs text-white/60">Everything under /demo uses made-up sample data that lives only in your browser tab. Nothing you click is saved, sent or charged.</p>
      </div>
    </footer>
  );
}

/** Marks a value on a demo screen as illustrative, never a real price, driver or arrival time. */
export function SampleTag({ children = "Sample", className }: { children?: React.ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center rounded-full bg-gold-50 px-2 py-0.5 text-xs font-semibold text-gold-800 ring-1 ring-inset ring-gold/60", className)}>
      {children}
    </span>
  );
}

export function SectionHeading({ eyebrow, title, id, align = "center" }: { eyebrow: string; title: string; id?: string; align?: "center" | "left" }) {
  return (
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <p className="text-sm font-semibold uppercase tracking-wider text-sea">{eyebrow}</p>
      <h2 id={id} className="mt-2 text-3xl font-bold sm:text-4xl">
        {title}
      </h2>
    </div>
  );
}
