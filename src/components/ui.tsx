import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { STATUS_LABELS, type RequestStatus } from "@/lib/constants";
import { AlertIcon, CheckIcon, InfoIcon } from "./icons";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "danger" | "gold";
type Size = "md" | "lg" | "sm";

const variants: Record<Variant, string> = {
  primary: "bg-deep text-white hover:bg-deep-700 shadow-sm",
  secondary: "bg-white text-deep ring-1 ring-inset ring-line hover:bg-mint-50",
  ghost: "bg-transparent text-deep hover:bg-mint-50",
  danger: "bg-white text-danger ring-1 ring-inset ring-danger/40 hover:bg-danger-50",
  gold: "bg-gold text-deep hover:brightness-95 shadow-sm",
};
const sizes: Record<Size, string> = {
  sm: "min-h-10 px-3.5 text-sm rounded-xl",
  md: "min-h-12 px-5 text-base rounded-xl",
  lg: "min-h-14 px-7 text-lg rounded-2xl",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cx(
    "inline-flex items-center justify-center gap-2 font-semibold no-underline transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60 select-none",
    variants[variant],
    sizes[size],
    extra,
  );
}

export function Button({ variant = "primary", size = "md", className, ...props }: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({ variant = "primary", size = "md", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export function Card({
  className,
  as = "section",
  ...props
}: Omit<ComponentProps<"section">, "ref"> & {
  as?: "section" | "div" | "article" | "li";
}) {
  const As = as as "section";
  return <As className={cx("rounded-[var(--radius-card)] bg-white p-5 shadow-[var(--shadow-card)] sm:p-6", className)} {...props} />;
}

export function Badge({ tone = "neutral", children, className }: { tone?: "neutral" | "mint" | "gold" | "danger" | "ok" | "deep"; children: ReactNode; className?: string }) {
  const tones = {
    neutral: "bg-soft text-ink-muted ring-line",
    mint: "bg-mint-50 text-sea-700 ring-mint",
    gold: "bg-gold-50 text-gold-800 ring-gold/60",
    danger: "bg-danger-50 text-danger ring-danger/30",
    ok: "bg-ok-50 text-ok ring-ok/30",
    deep: "bg-deep text-white ring-deep",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset", tones[tone], className)}>{children}</span>;
}

const STATUS_TONE: Record<RequestStatus, Parameters<typeof Badge>[0]["tone"]> = {
  SUBMITTED: "neutral",
  SEARCHING: "gold",
  ASSIGNED: "mint",
  EN_ROUTE: "mint",
  ARRIVED: "mint",
  IN_PROGRESS: "mint",
  COMPLETED: "ok",
  CANCELLED: "neutral",
  NO_PROVIDER_AVAILABLE: "danger",
};
export function StatusBadge({ status }: { status: string }) {
  const s = status as RequestStatus;
  return <Badge tone={STATUS_TONE[s] ?? "neutral"}>{STATUS_LABELS[s] ?? status}</Badge>;
}

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "warning" | "success" | "error";
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const styles = {
    info: "bg-mint-50 ring-mint text-deep",
    warning: "bg-gold-50 ring-gold/70 text-ink",
    success: "bg-ok-50 ring-ok/30 text-ink",
    error: "bg-danger-50 ring-danger/30 text-ink",
  };
  const icon =
    tone === "success" ? (
      <CheckIcon className="text-ok" />
    ) : tone === "info" ? (
      <InfoIcon className="text-sea" />
    ) : (
      <AlertIcon className={tone === "error" ? "text-danger" : "text-gold-800"} />
    );
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("flex gap-3 rounded-2xl p-4 ring-1 ring-inset", styles[tone], className)}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 text-sm leading-relaxed">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children}
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: ReactNode; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? <p className="mb-1 text-sm font-semibold uppercase tracking-wide text-sea">{eyebrow}</p> : null}
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        {description ? <div className="mt-1.5 max-w-2xl text-ink-muted">{description}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-[var(--radius-card)] border-2 border-dashed border-line bg-white/60 px-6 py-10 text-center">
      {icon ? <div className="mb-3 rounded-2xl bg-mint-50 p-3 text-sea">{icon}</div> : null}
      <p className="font-semibold text-deep">{title}</p>
      {children ? <div className="mt-1 max-w-md text-sm text-ink-muted">{children}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

// ---- Form fields ---------------------------------------------------------------------

export const inputClass =
  "block w-full min-h-12 rounded-xl border border-line bg-white px-4 text-base text-ink placeholder:text-ink-muted/70 shadow-[inset_0_1px_2px_rgb(18_59_69/0.04)] focus:border-sea focus:outline-none focus:ring-2 focus:ring-sea/30 disabled:bg-soft aria-[invalid=true]:border-danger";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string | string[];
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const err = Array.isArray(error) ? error[0] : error;
  return (
    <div className={cx("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-deep">
        {label}
        {required ? (
          <span className="ml-0.5 text-danger" aria-hidden>
            {" "}
            *
          </span>
        ) : (
          <span className="ml-1 font-normal text-ink-muted">(optional)</span>
        )}
      </label>
      {children}
      {hint && !err ? (
        <p id={`${htmlFor}-hint`} className="text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
      {err ? (
        <p id={`${htmlFor}-error`} className="text-sm font-medium text-danger">
          {err}
        </p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(inputClass, className)} {...props} />;
}
export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cx(
        inputClass,
        "appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%234f6168%22 stroke-width=%222%22><path d=%22M6 9l6 6 6-6%22/></svg>')] bg-[length:1.25rem] bg-[right_0.9rem_center] bg-no-repeat pr-10",
        className,
      )}
      {...props}
    />
  );
}
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(inputClass, "min-h-24 py-3", className)} {...props} />;
}

export function Checkbox({ label, description, className, ...props }: ComponentProps<"input"> & { label: ReactNode; description?: ReactNode }) {
  return (
    <label className={cx("flex min-h-12 cursor-pointer items-start gap-3 rounded-xl py-2", className)}>
      <input type="checkbox" className="mt-0.5 size-5 shrink-0 cursor-pointer rounded border-line accent-[var(--color-sea)]" {...props} />
      <span className="text-sm leading-relaxed">
        <span className="font-medium text-ink">{label}</span>
        {description ? <span className="block text-ink-muted">{description}</span> : null}
      </span>
    </label>
  );
}

export function DescriptionList({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="divide-y divide-line">
      {items.map(([k, v], i) => (
        <div key={i} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:gap-4">
          <dt className="shrink-0 text-sm text-ink-muted sm:w-40">{k}</dt>
          <dd className="min-w-0 break-words text-sm font-medium text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Placeholder shown wherever an editable business detail hasn't been entered yet. */
export function Placeholder({ children }: { children: ReactNode }) {
  return <span className="rounded-md bg-gold-50 px-1.5 py-0.5 text-sm font-medium text-gold-800 ring-1 ring-inset ring-gold/50">[{children}]</span>;
}

export function Flash({ ok, error }: { ok?: string | string[]; error?: string | string[] }) {
  const o = Array.isArray(ok) ? ok[0] : ok;
  const e = Array.isArray(error) ? error[0] : error;
  if (!o && !e) return null;
  return <div className="mb-5 fade-in">{e ? <Alert tone="error">{e}</Alert> : <Alert tone="success">{o}</Alert>}</div>;
}

export function Table({ head, children, caption }: { head: ReactNode[]; children: ReactNode; caption?: string }) {
  return (
    <div className="relative -mx-5 overflow-x-auto sm:mx-0">
      <table className="w-full min-w-[640px] text-left text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
            {head.map((h, i) => (
              <th key={i} scope="col" className="px-5 py-3 font-semibold sm:px-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}
export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => <td className={cx("px-5 py-3 align-top sm:px-3", className)}>{children}</td>;
