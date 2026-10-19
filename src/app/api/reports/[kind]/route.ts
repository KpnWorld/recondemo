import { getCurrentUser } from "@/lib/auth/current";
import { isAppError } from "@/lib/errors";
import { exportReport } from "@/lib/services/admin";

const KINDS = ["requests", "payments", "payouts", "tickets"] as const;

export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const user = await getCurrentUser();
  const { kind } = await params;
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!(KINDS as readonly string[]).includes(kind)) return new Response("Not found", { status: 404 });
  try {
    const csv = await exportReport(user, kind as (typeof KINDS)[number]);
    const date = new Date().toISOString().slice(0, 10);
    return new Response(`﻿${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="call-recon-${kind}-${date}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (isAppError(e)) return new Response(e.message, { status: e.httpStatus });
    console.error("[reports]", e);
    return new Response("Server error", { status: 500 });
  }
}
