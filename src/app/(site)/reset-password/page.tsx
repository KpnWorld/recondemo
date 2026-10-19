import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/layout/auth-shell";
import { ResetPasswordForm } from "@/components/forms/auth-forms";
import { Alert } from "@/components/ui";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthShell title="Choose a new password">
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <Alert tone="error">
          This reset link is missing its token. <Link href="/forgot-password">Request a new link</Link>.
        </Alert>
      )}
    </AuthShell>
  );
}
