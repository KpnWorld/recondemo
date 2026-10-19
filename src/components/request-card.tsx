import Link from "next/link";
import { formatCents } from "@/lib/money";
import { ServiceIcon, ChevronRightIcon } from "./icons";
import { LocalTime } from "./client";
import { StatusBadge } from "./ui";

export function RequestRow({
  r,
  href,
}: {
  r: {
    id: string;
    number: string;
    status: string;
    createdAt: Date;
    finalTotalCents: number | null;
    pickupCity: string | null;
    serviceCategory: { name: string; slug: string };
  };
  href: string;
}) {
  return (
    <Link href={href} className="flex items-center gap-4 rounded-2xl px-3 py-3 no-underline hover:bg-soft">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-mint-50 text-sea">
        <ServiceIcon slug={r.serviceCategory.slug} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-deep">{r.serviceCategory.name}</span>
        <span className="block truncate text-sm text-ink-muted">
          {r.number} · <LocalTime iso={r.createdAt.toISOString()} mode="date" />
          {r.pickupCity ? ` · ${r.pickupCity}` : ""}
        </span>
      </span>
      <span className="hidden text-right sm:block">
        <StatusBadge status={r.status} />
        {r.finalTotalCents != null ? <span className="mt-1 block text-sm font-medium text-ink">{formatCents(r.finalTotalCents)}</span> : null}
      </span>
      <ChevronRightIcon className="size-5 shrink-0 text-ink-muted" />
    </Link>
  );
}
