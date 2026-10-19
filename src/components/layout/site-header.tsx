import Link from "next/link";
import { getCurrentUser, homeFor } from "@/lib/auth/current";
import { Logo } from "../logo";
import { LinkButton } from "../ui";
import { MenuIcon } from "../icons";

const NAV = [
  { href: "/#services", label: "Services" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/drive", label: "Become a Driver" },
  { href: "/help", label: "Help" },
];

export async function SiteHeader() {
  const user = await getCurrentUser();
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-soft/90 backdrop-blur supports-[backdrop-filter]:bg-soft/75">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:h-18 sm:px-6">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-xl px-3 py-2 text-sm font-medium text-ink no-underline hover:bg-white hover:text-deep">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <LinkButton href={homeFor(user)} variant="ghost" size="sm" className="hidden sm:inline-flex">
              My account
            </LinkButton>
          ) : (
            <LinkButton href="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">
              Sign in
            </LinkButton>
          )}
          {user?.role === "PROVIDER" || user?.role === "ADMIN" ? null : (
            <LinkButton href="/request" size="sm">
              Request a Tow
            </LinkButton>
          )}
          <details className="relative lg:hidden">
            <summary
              className="flex size-11 cursor-pointer list-none items-center justify-center rounded-xl text-deep hover:bg-white [&::-webkit-details-marker]:hidden"
              aria-label="Open menu"
            >
              <MenuIcon />
            </summary>
            <nav aria-label="Mobile" className="absolute right-0 mt-2 w-64 rounded-2xl bg-white p-2 shadow-[var(--shadow-lift)] ring-1 ring-line">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="block rounded-xl px-4 py-3 font-medium text-ink no-underline hover:bg-mint-50">
                  {n.label}
                </Link>
              ))}
              <Link href={user ? homeFor(user) : "/login"} className="block rounded-xl px-4 py-3 font-medium text-ink no-underline hover:bg-mint-50">
                {user ? "My account" : "Sign in"}
              </Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
