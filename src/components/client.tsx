"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass } from "./ui";

/** Submit button that shows a busy state while its form's server action runs. */
export function SubmitButton({
  children,
  pendingText,
  variant,
  size,
  className,
  ...props
}: ComponentProps<"button"> & {
  pendingText?: string;
  variant?: Parameters<typeof buttonClass>[0];
  size?: Parameters<typeof buttonClass>[1];
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || props.disabled} aria-busy={pending} className={buttonClass(variant, size, className)} {...props}>
      {pending ? (
        <>
          <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
          {pendingText ?? "Working…"}
        </>
      ) : (
        children
      )}
    </button>
  );
}

/** Asks for confirmation before submitting the surrounding form. */
export function ConfirmSubmit({ message, children, ...props }: ComponentProps<typeof SubmitButton> & { message: string }) {
  return (
    <SubmitButton
      {...props}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </SubmitButton>
  );
}

/** Re-fetches server data on an interval while the tab is visible (status tracking). */
export function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}

export function CopyButton({ text, label = "Copy link" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={buttonClass("secondary", "sm")}
      onClick={async () => {
        try {
          if (navigator.share)
            await navigator.share({
              title: "Call Recon service status",
              url: text,
            });
          else {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
          }
        } catch {
          /* user dismissed share sheet */
        }
      }}
    >
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </button>
  );
}

export function LocalTime({ iso, mode = "datetime" }: { iso: string; mode?: "datetime" | "time" | "date" }) {
  const [text, setText] = useState<ReactNode>(null);
  useEffect(() => {
    const d = new Date(iso);
    setText(
      mode === "time"
        ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
        : mode === "date"
          ? d.toLocaleDateString()
          : d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }),
    );
  }, [iso, mode]);
  return <time dateTime={iso}>{text ?? iso.slice(0, 16).replace("T", " ")}</time>;
}
