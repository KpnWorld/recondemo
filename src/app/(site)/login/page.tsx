import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AuthShell } from "@/components/layout/auth-shell";
import { LoginForm } from "@/components/forms/auth-forms";
import { Alert, Card } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { demoLoginAction } from "@/app/actions/auth";
import { getCurrentUser, homeFor } from "@/lib/auth/current";
import { config } from "@/lib/env";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/demo";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user));
  return (
    <AuthShell
      title="Welcome back"
      subtitle={
        <>
          New to Call Recon? <Link href={`/signup${sp.next ? `?next=${encodeURIComponent(sp.next)}` : ""}`}>Create an account</Link>
        </>
      }
      aside={config.demoMode() ? <DemoAccounts next={sp.next} /> : undefined}
    >
      {sp.reset ? (
        <Alert tone="success" className="mb-4">
          Your password was updated. Please sign in.
        </Alert>
      ) : null}
      <LoginForm next={sp.next} />
    </AuthShell>
  );
}

function DemoAccounts({ next }: { next?: string }) {
  return (
    <Card className="bg-gold-50 ring-1 ring-gold/50">
      <h2 className="text-lg font-semibold">Demo accounts</h2>
      <p className="mt-1 text-sm text-ink-muted">
        One-tap sign in for testing. Password for all demo accounts: <code className="rounded bg-white px-1.5 py-0.5 font-mono text-deep">{DEMO_PASSWORD}</code>
      </p>
      <ul className="mt-4 space-y-2">
        {DEMO_ACCOUNTS.map((a) => (
          <li key={a.email}>
            <form action={demoLoginAction}>
              <input type="hidden" name="email" value={a.email} />
              <input type="hidden" name="next" value={next ?? ""} />
              <SubmitButton variant="secondary" className="w-full justify-between text-left" pendingText="Signing in…">
                <span>
                  <span className="block">{a.label}</span>
                  <span className="block text-xs font-normal text-ink-muted">{a.detail}</span>
                </span>
                <span aria-hidden>→</span>
              </SubmitButton>
            </form>
          </li>
        ))}
      </ul>
    </Card>
  );
}
