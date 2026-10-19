"use client";

import { useEffect } from "react";
import { Button, LinkButton } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="main" className="mx-auto flex min-h-[70dvh] max-w-lg flex-col items-center justify-center px-4 text-center">
      <h1 className="text-3xl font-bold">Something went wrong</h1>
      <p className="mt-2 text-ink-muted">Please try again. If you were submitting a request, check your dashboard before resubmitting. If anyone is in danger, call 911.</p>
      {error.digest ? <p className="mt-2 text-xs text-ink-muted">Reference: {error.digest}</p> : null}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button onClick={reset}>Try again</Button>
        <LinkButton href="/help" variant="secondary">
          Help center
        </LinkButton>
      </div>
    </main>
  );
}
