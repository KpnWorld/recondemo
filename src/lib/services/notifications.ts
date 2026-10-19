import type { Channel, NotificationType } from "@/lib/constants";
import { db } from "@/lib/db";
import type { Tx } from "@/lib/db";
import type { DeliveryResult } from "@/lib/integrations/messaging";
import { sendEmail, sendPush, sendSms } from "@/lib/integrations/messaging";

/**
 * Notification framework.
 * - In-app notifications are written immediately (status SENT).
 * - Email / SMS / push rows are created PENDING (only for users who opted in) and
 *   delivered by `processNotificationQueue`, with exponential-backoff retries.
 * - `dedupeKey` is unique, so the same event can never notify the same person on the
 *   same channel twice, even if the triggering code runs again.
 */

export const MAX_ATTEMPTS = 5;

export type NotifyInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  requestId?: string | null;
  link?: string | null;
  /** Distinguishes events that may legitimately repeat (e.g. a second assignment). */
  dedupeSuffix?: string;
};

export function dedupeKey(n: NotifyInput, channel: Channel) {
  return [n.type, n.requestId ?? "-", n.userId, channel, n.dedupeSuffix ?? ""].join(":");
}

export async function notify(tx: Tx, n: NotifyInput) {
  const user = await tx.user.findUnique({
    where: { id: n.userId },
    select: {
      status: true,
      emailNotifications: true,
      smsNotifications: true,
      pushNotifications: true,
      phone: true,
    },
  });
  if (!user || user.status === "DELETED") return [];
  const channels: Channel[] = ["IN_APP"];
  if (user.emailNotifications) channels.push("EMAIL");
  if (user.smsNotifications && user.phone) channels.push("SMS");
  if (user.pushNotifications) channels.push("PUSH");

  const created = [];
  for (const channel of channels) {
    const key = dedupeKey(n, channel);
    const existing = await tx.notification.findUnique({
      where: { dedupeKey: key },
      select: { id: true },
    });
    if (existing) continue;
    const now = new Date();
    created.push(
      await tx.notification.create({
        data: {
          userId: n.userId,
          requestId: n.requestId ?? null,
          type: n.type,
          channel,
          title: n.title,
          body: n.body,
          link: n.link ?? null,
          dedupeKey: key,
          status: channel === "IN_APP" ? "SENT" : "PENDING",
          sentAt: channel === "IN_APP" ? now : null,
          attempts: channel === "IN_APP" ? 1 : 0,
          nextAttemptAt: channel === "IN_APP" ? null : now,
        },
      }),
    );
  }
  return created;
}

export async function notifyAdmins(tx: Tx, n: Omit<NotifyInput, "userId">, adminRoles = ["SUPER_ADMIN", "DISPATCHER"]) {
  const admins = await tx.user.findMany({
    where: { role: "ADMIN", status: "ACTIVE", adminRole: { in: adminRoles } },
    select: { id: true },
  });
  for (const a of admins) await notify(tx, { ...n, userId: a.id });
}

export function backoffMs(attempts: number) {
  return Math.min(60 * 60 * 1000, 30_000 * 2 ** Math.max(0, attempts - 1));
}

type Sender = (n: { channel: string; title: string; body: string; link: string | null; user: { id: string; email: string; phone: string | null } }) => Promise<DeliveryResult>;

const defaultSender: Sender = async (n) => {
  const text = `${n.body}${n.link ? `\n\n${process.env.APP_URL ?? ""}${n.link}` : ""}`;
  if (n.channel === "EMAIL")
    return sendEmail({
      to: n.user.email,
      subject: `Call Recon: ${n.title}`,
      text,
    });
  if (n.channel === "SMS") return n.user.phone ? sendSms({ to: n.user.phone, text: `Call Recon: ${n.title}. ${text}` }) : { status: "SKIPPED", error: "No phone number" };
  if (n.channel === "PUSH")
    return sendPush({
      userId: n.user.id,
      title: n.title,
      body: n.body,
      link: n.link,
    });
  return { status: "SKIPPED", error: "Unknown channel" };
};

/** Deliver due external notifications. Safe to call repeatedly (cron or after writes). */
export async function processNotificationQueue(opts: { now?: Date; limit?: number; sender?: Sender } = {}) {
  const now = opts.now ?? new Date();
  const sender = opts.sender ?? defaultSender;
  const due = await db.notification.findMany({
    where: {
      channel: { not: "IN_APP" },
      status: { in: ["PENDING", "FAILED"] },
      attempts: { lt: MAX_ATTEMPTS },
      nextAttemptAt: { lte: now },
    },
    include: { user: { select: { id: true, email: true, phone: true } } },
    take: opts.limit ?? 50,
    orderBy: { createdAt: "asc" },
  });
  const results = { sent: 0, failed: 0, skipped: 0 };
  for (const n of due) {
    // Claim the row so concurrent workers don't double-send.
    const claimed = await db.notification.updateMany({
      where: { id: n.id, attempts: n.attempts, status: n.status },
      data: { attempts: n.attempts + 1 },
    });
    if (claimed.count !== 1) continue;
    const attempts = n.attempts + 1;
    let result: DeliveryResult;
    try {
      result = await sender(n);
    } catch (e) {
      result = {
        status: "FAILED",
        error: (e as Error).message,
        retryable: true,
      };
    }
    if (result.status === "SENT") {
      await db.notification.update({
        where: { id: n.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          lastError: null,
          nextAttemptAt: null,
        },
      });
      results.sent++;
    } else if (result.status === "SKIPPED") {
      await db.notification.update({
        where: { id: n.id },
        data: {
          status: "SKIPPED",
          lastError: result.error ?? null,
          nextAttemptAt: null,
        },
      });
      results.skipped++;
    } else {
      const giveUp = !result.retryable || attempts >= MAX_ATTEMPTS;
      await db.notification.update({
        where: { id: n.id },
        data: {
          status: "FAILED",
          lastError: result.error ?? "Delivery failed",
          nextAttemptAt: giveUp ? null : new Date(now.getTime() + backoffMs(attempts)),
        },
      });
      results.failed++;
    }
  }
  return results;
}

/** Fire-and-forget after a transaction commits; delivery errors never break the request. */
export function kickNotificationQueue() {
  if (process.env.VITEST) return; // tests drive the queue explicitly
  processNotificationQueue().catch((e) => console.error("[notifications] queue error", e));
}

export async function markRead(userId: string, ids?: string[]) {
  await db.notification.updateMany({
    where: {
      userId,
      channel: "IN_APP",
      readAt: null,
      ...(ids ? { id: { in: ids } } : {}),
    },
    data: { readAt: new Date() },
  });
}

export const unreadCount = (userId: string) => db.notification.count({ where: { userId, channel: "IN_APP", readAt: null } });
