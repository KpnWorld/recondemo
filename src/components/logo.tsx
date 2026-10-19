import Link from "next/link";
import { cx } from "./ui";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cx("size-9 shrink-0", className)} aria-hidden>
      <rect width="40" height="40" rx="11" fill="#123B45" />
      <path d="M9 27.5c4-9.5 11-14 22-15" stroke="#8EDBD0" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M26.5 9.5l5 3-3.5 4.6" stroke="#8EDBD0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="12" cy="29" r="2.6" fill="#E7B96C" />
    </svg>
  );
}

export function Logo({ dark = false, href = "/" }: { dark?: boolean; href?: string }) {
  return (
    <Link href={href} className={cx("flex items-center gap-2.5 rounded-xl no-underline", dark ? "text-white" : "text-deep")} aria-label="Call Recon home">
      <LogoMark />
      <span className="text-lg font-bold tracking-tight">
        Call <span className={dark ? "text-mint" : "text-sea"}>Recon</span>
      </span>
    </Link>
  );
}
