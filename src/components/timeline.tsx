import { TIMELINE, type RequestStatus } from "@/lib/constants";
import { LocalTime } from "./client";
import { CheckIcon } from "./icons";
import { cx } from "./ui";

type Entry = { toStatus: string; createdAt: Date };

/** Customer-facing status timeline. Times come from the recorded status history only. */
export function StatusTimeline({ status, history }: { status: string; history: Entry[] }) {
  const s = status as RequestStatus;
  const reached = new Map<string, Date>();
  for (const h of history) reached.set(h.toStatus, h.createdAt); // latest occurrence wins
  const currentIdx = TIMELINE.findIndex((t) => t.status === s);
  // After a reassignment the request may go back to SEARCHING; only show steps up to current.
  const lastActive = s === "CANCELLED" || s === "NO_PROVIDER_AVAILABLE" ? Math.max(...TIMELINE.map((t, i) => (reached.has(t.status) ? i : -1))) : currentIdx;

  return (
    <ol className="relative space-y-0" aria-label="Request status">
      {TIMELINE.map((t, i) => {
        const done = i < lastActive || (i === lastActive && (s === "COMPLETED" || s === "CANCELLED" || s === "NO_PROVIDER_AVAILABLE"));
        const current = i === lastActive && !done;
        const at = i <= lastActive ? reached.get(t.status) : undefined;
        return (
          <li key={t.status} className="relative flex gap-4 pb-6 last:pb-0" aria-current={current ? "step" : undefined}>
            {i < TIMELINE.length - 1 ? <span aria-hidden className={cx("absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-0.5", i < lastActive ? "bg-sea" : "bg-line")} /> : null}
            <span
              className={cx(
                "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-white",
                done ? "bg-sea text-white" : current ? "bg-mint text-deep" : "bg-soft text-ink-muted ring-line",
              )}
            >
              {done ? <CheckIcon className="size-4" /> : current ? <span className="pulse-dot size-2.5 rounded-full bg-deep" /> : <span className="size-2 rounded-full bg-line" />}
            </span>
            <div className="pt-1">
              <p className={cx("font-semibold", done || current ? "text-deep" : "text-ink-muted")}>
                {t.label}
                {current ? <span className="sr-only"> (current step)</span> : null}
              </p>
              {at ? (
                <p className="text-sm text-ink-muted">
                  <LocalTime iso={at.toISOString()} mode="time" />
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
