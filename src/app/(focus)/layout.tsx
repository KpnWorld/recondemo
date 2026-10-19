import Link from "next/link";
import { Logo } from "@/components/logo";
import { PhoneIcon } from "@/components/icons";

/** Distraction-free layout for the request flow. */
export default function FocusLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b border-line/70 bg-soft">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
          <Logo href="/dashboard" />
          <div className="flex items-center gap-1">
            <a href="tel:911" className="flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-deep no-underline hover:bg-white">
              <PhoneIcon className="size-4" /> Emergency? 911
            </a>
            <Link href="/dashboard" className="flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-ink no-underline hover:bg-white">
              Exit
            </Link>
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="px-4 py-6 focus:outline-none sm:px-6 sm:py-10">
        {children}
      </main>
    </>
  );
}
