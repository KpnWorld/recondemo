import type { ReactNode } from "react";
import { Card } from "../ui";

export function AuthShell({ title, subtitle, children, aside }: { title: string; subtitle?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 sm:px-6 sm:py-16 lg:grid-cols-[1fr_0.9fr]">
      <Card className="mx-auto w-full max-w-md p-6 sm:p-8">
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle ? <div className="mt-1.5 text-ink-muted">{subtitle}</div> : null}
        <div className="mt-6">{children}</div>
      </Card>
      {aside ? <div>{aside}</div> : null}
    </div>
  );
}
