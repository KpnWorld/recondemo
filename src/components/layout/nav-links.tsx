"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "../ui";

export type NavItem = { href: string; label: string; exact?: boolean };

export function NavLinks({ items, orientation }: { items: NavItem[]; orientation: "vertical" | "horizontal" }) {
  const pathname = usePathname();
  const isActive = (i: NavItem) => (i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(`${i.href}/`));
  return (
    <ul className={orientation === "vertical" ? "space-y-1" : "flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]"}>
      {items.map((i) => {
        const active = isActive(i);
        return (
          <li key={i.href} className="shrink-0">
            <Link
              href={i.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex min-h-11 items-center rounded-xl px-3.5 text-sm font-medium no-underline transition-colors",
                active ? "bg-deep text-white" : "text-ink hover:bg-white hover:text-deep",
              )}
            >
              {i.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
