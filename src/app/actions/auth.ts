"use server";

import { redirect } from "next/navigation";
import { clientIp, getCurrentUser, homeFor, signIn, signOut } from "@/lib/auth/current";
import { authenticate, registerUser, requestPasswordReset, resetPassword } from "@/lib/services/accounts";
import { toActionError, type ActionResult } from "@/lib/errors";

/** Only allow redirects to our own relative paths. */
function safeNext(next: FormDataEntryValue | null) {
  const s = typeof next === "string" ? next : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : null;
}

export async function loginAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let dest: string;
  try {
    const user = await authenticate({ email: fd.get("email"), password: fd.get("password") }, await clientIp());
    await signIn(user.id);
    dest = safeNext(fd.get("next")) ?? homeFor({ role: user.role as "CUSTOMER" });
  } catch (e) {
    return toActionError(e);
  }
  redirect(dest);
}

export async function demoLoginAction(fd: FormData) {
  const { config } = await import("@/lib/env");
  if (!config.demoMode()) redirect("/login");
  const email = String(fd.get("email"));
  if (!email.endsWith("@demo.callrecon.test")) redirect("/login");
  const { DEMO_PASSWORD } = await import("@/lib/demo");
  const user = await authenticate({ email, password: DEMO_PASSWORD }, await clientIp());
  await signIn(user.id);
  redirect(safeNext(fd.get("next")) ?? homeFor({ role: user.role as "CUSTOMER" }));
}

export async function signupAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let dest: string;
  try {
    const accountType = fd.get("accountType") === "PROVIDER" ? "PROVIDER" : "CUSTOMER";
    const user = await registerUser(
      {
        name: fd.get("name"),
        email: fd.get("email"),
        phone: fd.get("phone") ?? "",
        password: fd.get("password"),
        acceptTerms: fd.get("acceptTerms") === "on",
        emailNotifications: fd.get("emailNotifications") === "on",
        smsNotifications: fd.get("smsNotifications") === "on",
        accountType,
        businessName: fd.get("businessName") || null,
      },
      await clientIp(),
    );
    await signIn(user.id);
    dest = accountType === "PROVIDER" ? "/provider/onboarding?welcome=1" : (safeNext(fd.get("next")) ?? "/dashboard?welcome=1");
  } catch (e) {
    return toActionError(e);
  }
  redirect(dest);
}

export async function logoutAction() {
  await signOut();
  redirect("/");
}

export async function forgotPasswordAction(
  _: ActionResult<{ demoLink?: string; emailSent: boolean }> | null,
  fd: FormData,
): Promise<ActionResult<{ demoLink?: string; emailSent: boolean }>> {
  try {
    const r = await requestPasswordReset(fd.get("email"), await clientIp());
    return { ok: true, data: r };
  } catch (e) {
    return toActionError(e);
  }
}

export async function resetPasswordAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    await resetPassword(String(fd.get("token") ?? ""), fd.get("password"));
  } catch (e) {
    return toActionError(e);
  }
  redirect("/login?reset=1");
}

export async function currentUserHome() {
  const u = await getCurrentUser();
  return u ? homeFor(u) : null;
}
