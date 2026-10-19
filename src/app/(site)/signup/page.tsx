import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/components/layout/auth-shell";
import { SignupForm } from "@/components/forms/auth-forms";
import { CheckIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string; as?: string }> }) {
  const sp = await searchParams;
  return (
    <AuthShell
      title="Create your account"
      subtitle={
        <>
          Already have one? <Link href="/login">Sign in</Link>
        </>
      }
      aside={
        <div className="hidden space-y-4 pt-6 lg:block">
          {["Save your vehicles and places for faster requests", "See your price before you confirm", "Track every status update and keep your receipts"].map((t) => (
            <p key={t} className="flex items-start gap-3 text-ink">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-mint text-deep">
                <CheckIcon className="size-4" />
              </span>
              {t}
            </p>
          ))}
        </div>
      }
    >
      <SignupForm next={sp.next} provider={sp.as === "provider"} />
    </AuthShell>
  );
}
