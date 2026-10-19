import type { Metadata } from "next";
import { getSharedStatus } from "@/lib/services/requests";
import { STATUS_LABELS } from "@/lib/constants";
import { Alert, Badge, Card, StatusBadge } from "@/components/ui";
import { AutoRefresh, LocalTime } from "@/components/client";
import { StatusTimeline } from "@/components/timeline";
import { ShieldIcon } from "@/components/icons";

export const metadata: Metadata = {
  title: "Shared request status",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function SharedStatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const s = await getSharedStatus(token);
  if (!s) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <Alert tone="warning" title="This link isn't active">
          The person who shared it may have turned it off, or it has expired.
        </Alert>
      </div>
    );
  }
  const done = s.status === "COMPLETED" || s.status === "CANCELLED";
  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:px-6">
      {!done ? <AutoRefresh seconds={30} /> : null}
      <p className="text-sm text-ink-muted">Shared roadside request {s.number}</p>
      <h1 className="mt-1 text-2xl font-bold">{s.service}</h1>
      <div className="mt-3">
        <StatusBadge status={s.status} />
      </div>
      <Card className="mt-6">
        <p className="text-lg font-semibold text-deep">{STATUS_LABELS[s.status]}</p>
        {s.provider ? (
          <div className="mt-3 text-sm">
            <p>
              Provider: {s.provider.firstName} with {s.provider.businessName}{" "}
              {s.provider.verified ? (
                <Badge tone="mint">
                  <ShieldIcon className="size-3.5" /> Verified provider
                </Badge>
              ) : null}
            </p>
            {s.provider.truck ? <p className="text-ink-muted">Vehicle: {s.provider.truck}</p> : null}
          </div>
        ) : null}
        <div className="mt-5">
          <StatusTimeline
            status={s.status}
            history={s.history.map((h) => ({
              ...h,
              reason: null,
              actor: null,
            }))}
          />
        </div>
      </Card>
      <p className="mt-4 text-xs text-ink-muted">
        For privacy this page doesn&apos;t show locations, contact details or prices. Link expires <LocalTime iso={s.expiresAt.toISOString()} />.
      </p>
    </div>
  );
}
