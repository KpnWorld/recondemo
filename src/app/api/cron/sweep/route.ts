import { NextResponse } from "next/server";
import { config } from "@/lib/env";
import { safeEqual } from "@/lib/auth/crypto";
import { sweepDispatch } from "@/lib/services/dispatch";
import { processNotificationQueue } from "@/lib/services/notifications";

/**
 * Scheduled job: expires unanswered offers, advances dispatch rounds and retries
 * notification delivery. Call every minute with `Authorization: Bearer $CRON_SECRET`.
 */
async function handle(req: Request) {
  const secret = config.cronSecret();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ") || !safeEqual(auth.slice(7), secret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dispatch = await sweepDispatch();
  const notifications = await processNotificationQueue();
  return NextResponse.json({ ok: true, dispatch, notifications });
}

export const GET = handle;
export const POST = handle;
