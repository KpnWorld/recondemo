import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/layout/auth-shell";
import { ForgotPasswordForm } from "@/components/forms/auth-forms";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      subtitle={
        <>
          Enter your email and we&apos;ll send you a reset link. <Link href="/login">Back to sign in</Link>
        </>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
