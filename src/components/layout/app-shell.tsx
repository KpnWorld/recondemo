import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction } from "@/app/actions/auth";
import type { Actor } from "@/lib/permissions";
import { can } from "@/lib/permissions";
import { unreadCount } from "@/lib/services/notifications";
import { Logo } from "../logo";
import { BellIcon, LogoutIcon } from "../icons";
import { NavLinks, type NavItem } from "./nav-links";
import { LinkButton } from "../ui";

export function navFor(user: Actor): NavItem[] {
  if (user.role === "CUSTOMER")
    return [
      { href: "/dashboard", label: "Overview", exact: true },
      { href: "/dashboard/history", label: "History & receipts" },
      { href: "/dashboard/vehicles", label: "Vehicles" },
      { href: "/dashboard/locations", label: "Saved places" },
      { href: "/dashboard/payments", label: "Payment methods" },
      { href: "/notifications", label: "Notifications" },
      { href: "/dashboard/profile", label: "Profile & settings" },
      { href: "/help", label: "Help" },
    ];
  if (user.role === "PROVIDER")
    return [
      { href: "/provider", label: "Jobs", exact: true },
      { href: "/provider/history", label: "Job history" },
      { href: "/provider/earnings", label: "Earnings & payouts" },
      { href: "/provider/onboarding", label: "Business & documents" },
      { href: "/notifications", label: "Notifications" },
      { href: "/provider/account", label: "Account" },
    ];
  const items: (NavItem & { perm?: Parameters<typeof can>[1] })[] = [
    { href: "/admin", label: "Overview", exact: true },
    {
      href: "/admin/requests",
      label: "Requests & dispatch",
      perm: "requests.view",
    },
    { href: "/admin/providers", label: "Providers", perm: "providers.view" },
    { href: "/admin/users", label: "Customers & staff", perm: "users.view" },
    {
      href: "/admin/support",
      label: "Support & disputes",
      perm: "support.manage",
    },
    {
      href: "/admin/payments",
      label: "Payments & payouts",
      perm: "payments.view",
    },
    { href: "/admin/pricing", label: "Pricing rules", perm: "pricing.manage" },
    {
      href: "/admin/catalog",
      label: "Service catalog",
      perm: "catalog.manage",
    },
    { href: "/admin/areas", label: "Service areas", perm: "areas.manage" },
    {
      href: "/admin/promotions",
      label: "Promotions",
      perm: "promotions.manage",
    },
    {
      href: "/admin/reports",
      label: "Reports & exports",
      perm: "reports.export",
    },
    { href: "/admin/audit", label: "Audit log", perm: "audit.view" },
    { href: "/admin/settings", label: "Settings", perm: "settings.manage" },
    { href: "/notifications", label: "Notifications" },
    { href: "/admin/account", label: "My account" },
  ];
  return items.filter((i) => !i.perm || can(user, i.perm));
}

const ROLE_LABEL = {
  CUSTOMER: "Customer",
  PROVIDER: "Provider",
  ADMIN: "Admin",
} as const;

export async function AppShell({ user, children }: { user: Actor; children: ReactNode }) {
  const unread = await unreadCount(user.id);
  const nav = navFor(user);
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-line/70 bg-soft/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <Logo href={nav[0].href} />
          <div className="flex items-center gap-1 sm:gap-2">
            {user.role === "CUSTOMER" ? (
              <LinkButton href="/request" size="sm" className="hidden sm:inline-flex">
                Request a Tow
              </LinkButton>
            ) : null}
            <Link
              href="/notifications"
              className="relative flex size-11 items-center justify-center rounded-xl text-deep hover:bg-white"
              aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
            >
              <BellIcon />
              {unread ? (
                <span className="absolute right-1.5 top-1.5 flex min-w-5 items-center justify-center rounded-full bg-gold px-1 text-[11px] font-bold text-deep">
                  {unread > 99 ? "99+" : unread}
                </span>
              ) : null}
            </Link>
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold leading-tight text-deep">{user.name}</p>
              <p className="text-xs text-ink-muted">{user.role === "ADMIN" && user.adminRole ? user.adminRole.replace("_", " ").toLowerCase() : ROLE_LABEL[user.role]}</p>
            </div>
            <form action={logoutAction}>
              <button type="submit" className="flex size-11 items-center justify-center rounded-xl text-deep hover:bg-white" aria-label="Sign out" title="Sign out">
                <LogoutIcon />
              </button>
            </form>
          </div>
        </div>
        <nav aria-label="Section" className="mx-auto max-w-7xl px-4 pb-2 sm:px-6 lg:hidden">
          <NavLinks items={nav} orientation="horizontal" />
        </nav>
      </header>
      <div className="mx-auto flex max-w-7xl gap-8 px-4 py-6 sm:px-6 sm:py-8">
        <nav aria-label="Section" className="sticky top-24 hidden h-fit w-56 shrink-0 lg:block">
          <NavLinks items={nav} orientation="vertical" />
        </nav>
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
          {children}
        </main>
      </div>
    </div>
  );
}
