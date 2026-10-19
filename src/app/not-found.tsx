import Link from "next/link";
import { Logo } from "@/components/logo";
import { LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-4 text-center">
      <Logo />
      <h1 className="mt-8 text-3xl font-bold">We couldn&apos;t find that page</h1>
      <p className="mt-2 text-ink-muted">It may have moved, or you may not have access to it.</p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <LinkButton href="/">Go home</LinkButton>
        <LinkButton href="/help" variant="secondary">
          Help center
        </LinkButton>
      </div>
      <p className="mt-8 text-sm text-ink-muted">
        Stranded right now? <Link href="/request">Request a Tow</Link>. If anyone is in danger, call 911.
      </p>
    </main>
  );
}
