import type { PriceBreakdown } from "@/lib/services/pricing";
import { formatCents } from "@/lib/money";
import { cx } from "./ui";

export function PriceTable({ breakdown, label = "Estimated total", compact = false }: { breakdown: PriceBreakdown; label?: string; compact?: boolean }) {
  return (
    <div>
      <table className="w-full text-sm">
        <caption className="sr-only">Itemized price</caption>
        <tbody className="divide-y divide-line">
          {breakdown.lines.map((l, i) => (
            <tr key={i}>
              <th scope="row" className={cx("py-2.5 pr-4 text-left font-normal", l.kind === "discount" && "text-ok")}>
                {l.label}
                {l.detail && !compact ? <span className="block text-xs text-ink-muted">{l.detail}</span> : null}
              </th>
              <td className={cx("py-2.5 text-right tabular-nums", l.kind === "discount" && "text-ok")}>{formatCents(l.amountCents)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-deep/20">
            <th scope="row" className="pt-3 text-left text-base font-semibold text-deep">
              {label}
            </th>
            <td className="pt-3 text-right text-xl font-bold tabular-nums text-deep">{formatCents(breakdown.totalCents)}</td>
          </tr>
        </tfoot>
      </table>
      {breakdown.estimatedMiles != null && !compact ? (
        <p className="mt-2 text-xs text-ink-muted">
          Distance: {breakdown.estimatedMiles.toFixed(1)} mi
          {breakdown.mileageSource ? ` (${breakdown.mileageSource})` : ""}.
        </p>
      ) : null}
    </div>
  );
}
