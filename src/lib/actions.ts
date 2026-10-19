import "server-only";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isAppError } from "./errors";

export function withParam(path: string, key: string, value: string) {
  const [base, hash] = path.split("#");
  const u = new URL(base, "http://x");
  u.searchParams.delete("ok");
  u.searchParams.delete("error");
  u.searchParams.set(key, value);
  return `${u.pathname}${u.search}${hash ? `#${hash}` : ""}`;
}

/**
 * Run a service call from a form's server action and redirect back with a flash
 * message. Errors from services are shown to the user; unexpected errors are logged
 * and replaced with a generic message.
 */
export async function run(fn: () => Promise<unknown>, opts: { back: string; ok?: string; to?: string }): Promise<never> {
  let error: string | null = null;
  try {
    await fn();
  } catch (e) {
    if (isAppError(e)) error = e.message;
    else {
      console.error("[action]", e);
      error = "Something went wrong on our side. Please try again.";
    }
  }
  if (error) redirect(withParam(opts.back, "error", error));
  revalidatePath(opts.to ?? opts.back);
  redirect(opts.ok ? withParam(opts.to ?? opts.back, "ok", opts.ok) : (opts.to ?? opts.back));
}

export const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
export const optStr = (fd: FormData, k: string) => str(fd, k) || null;
export const bool = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";
export const num = (fd: FormData, k: string) => {
  const s = str(fd, k);
  return s === "" ? null : Number(s);
};
/** Dollars field ("12.50") to integer cents; empty = null. */
export const cents = (fd: FormData, k: string) => {
  const s = str(fd, k).replace(/[$,\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};
