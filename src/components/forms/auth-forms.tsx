"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { forgotPasswordAction, loginAction, resetPasswordAction, signupAction } from "@/app/actions/auth";
import { SubmitButton } from "../client";
import { Alert, Checkbox, Field, Input } from "../ui";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(loginAction, null);
  const err = state && !state.ok ? state : null;
  return (
    <form action={action} className="space-y-4" noValidate>
      {err ? <Alert tone="error">{err.error}</Alert> : null}
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Email" htmlFor="email" required>
        <Input id="email" name="email" type="email" autoComplete="email" required inputMode="email" />
      </Field>
      <Field label="Password" htmlFor="password" required>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm font-medium">
          Forgot password?
        </Link>
      </div>
      <SubmitButton className="w-full" size="lg" pendingText="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}

export function SignupForm({ next, provider }: { next?: string; provider?: boolean }) {
  const [state, action] = useActionState(signupAction, null);
  const [type, setType] = useState<"CUSTOMER" | "PROVIDER">(provider ? "PROVIDER" : "CUSTOMER");
  const err = state && !state.ok ? state : null;
  const fe = err?.fieldErrors ?? {};
  const aria = (k: string) => ({
    "aria-invalid": fe[k] ? true : undefined,
    "aria-describedby": fe[k] ? `${k}-error` : undefined,
  });
  return (
    <form action={action} className="space-y-4" noValidate>
      {err ? <Alert tone="error">{err.error}</Alert> : null}
      <input type="hidden" name="next" value={next ?? ""} />
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-deep">I&apos;m signing up as</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["CUSTOMER", "A customer", "Request help"],
              ["PROVIDER", "A tow provider", "Receive jobs"],
            ] as const
          ).map(([v, l, d]) => (
            <label
              key={v}
              className={`flex min-h-16 cursor-pointer flex-col justify-center rounded-xl px-4 py-2 ring-1 ring-inset ${type === v ? "bg-mint-50 ring-sea" : "bg-white ring-line"}`}
            >
              <input type="radio" name="accountType" value={v} checked={type === v} onChange={() => setType(v)} className="sr-only" />
              <span className="font-semibold text-deep">{l}</span>
              <span className="text-sm text-ink-muted">{d}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Full name" htmlFor="name" required error={fe.name}>
        <Input id="name" name="name" autoComplete="name" required {...aria("name")} />
      </Field>
      {type === "PROVIDER" ? (
        <Field label="Business name" htmlFor="businessName" required error={fe.businessName}>
          <Input id="businessName" name="businessName" autoComplete="organization" required {...aria("businessName")} />
        </Field>
      ) : null}
      <Field label="Email" htmlFor="email" required error={fe.email}>
        <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required {...aria("email")} />
      </Field>
      <Field label="Mobile phone" htmlFor="phone" error={fe.phone} hint="So your driver can reach you through Call Recon. Verified by text once SMS is set up.">
        <Input id="phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" {...aria("phone")} />
      </Field>
      <Field label="Password" htmlFor="password" required error={fe.password} hint="At least 10 characters, with a letter and a number.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required {...aria("password")} />
      </Field>
      <div className="rounded-2xl bg-soft p-4">
        <p className="text-sm font-semibold text-deep">Notifications</p>
        <p className="text-sm text-ink-muted">You&apos;ll always get updates in the app. Choose any extra ways to hear from us.</p>
        <Checkbox name="emailNotifications" label="Email me status updates and receipts" defaultChecked />
        <Checkbox name="smsNotifications" label="Text me status updates" description="Message and data rates may apply. Reply STOP to opt out." />
      </div>
      <Checkbox
        name="acceptTerms"
        required
        label={
          <>
            I agree to the{" "}
            <Link href="/legal/terms" target="_blank">
              Terms of service
            </Link>{" "}
            and{" "}
            <Link href="/legal/privacy" target="_blank">
              Privacy policy
            </Link>
            .
          </>
        }
      />
      {fe.acceptTerms ? <p className="-mt-2 text-sm font-medium text-danger">{fe.acceptTerms[0]}</p> : null}
      <SubmitButton className="w-full" size="lg" pendingText="Creating account…">
        Create account
      </SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(forgotPasswordAction, null);
  if (state?.ok) {
    return (
      <div className="space-y-4">
        <Alert tone="success" title="Check your email">
          If an account exists for that address, we&apos;ve sent a link to reset your password. It expires in 1 hour.
        </Alert>
        {!state.data?.emailSent ? (
          <Alert tone="warning" title="Email isn't connected yet">
            Password reset emails will send once an email provider is configured.
            {state.data?.demoLink ? (
              <>
                {" "}
                In this demo you can use the link directly:{" "}
                <a href={state.data.demoLink} className="break-all font-semibold">
                  Reset password
                </a>
              </>
            ) : (
              " Please contact support for help."
            )}
          </Alert>
        ) : null}
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4" noValidate>
      {state && !state.ok ? <Alert tone="error">{state.error}</Alert> : null}
      <Field label="Email" htmlFor="email" required>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <SubmitButton className="w-full" size="lg" pendingText="Sending…">
        Send reset link
      </SubmitButton>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPasswordAction, null);
  return (
    <form action={action} className="space-y-4" noValidate>
      {state && !state.ok ? <Alert tone="error">{state.error}</Alert> : null}
      <input type="hidden" name="token" value={token} />
      <Field label="New password" htmlFor="password" required hint="At least 10 characters, with a letter and a number.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
      </Field>
      <SubmitButton className="w-full" size="lg" pendingText="Saving…">
        Set new password
      </SubmitButton>
    </form>
  );
}
