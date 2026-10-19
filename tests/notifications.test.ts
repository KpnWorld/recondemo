import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { MAX_ATTEMPTS, notify, processNotificationQueue } from "@/lib/services/notifications";
import { makeCustomer, resetDb } from "./helpers";

describe("notifications", () => {
  beforeEach(resetDb);

  it("creates in-app notifications immediately and never duplicates an event", async () => {
    const c = await makeCustomer();
    const n = { userId: c.id, type: "REQUEST_CONFIRMED" as const, title: "t", body: "b", requestId: null };
    await notify(db, n);
    await notify(db, n);
    const rows = await db.notification.findMany({ where: { userId: c.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ channel: "IN_APP", status: "SENT" });
  });

  it("only queues external channels the user opted into", async () => {
    const c = await makeCustomer();
    await db.user.update({ where: { id: c.id }, data: { emailNotifications: true, phone: "+18135550100", smsNotifications: false } });
    await notify(db, { userId: c.id, type: "DRIVER_EN_ROUTE", title: "t", body: "b" });
    expect((await db.notification.findMany({ where: { userId: c.id } })).map((r) => r.channel).sort()).toEqual(["EMAIL", "IN_APP"]);
  });

  it("marks unconfigured channels SKIPPED instead of pretending they were sent", async () => {
    const c = await makeCustomer();
    await db.user.update({ where: { id: c.id }, data: { emailNotifications: true } });
    await notify(db, { userId: c.id, type: "DRIVER_ARRIVED", title: "t", body: "b" });
    await processNotificationQueue();
    expect(await db.notification.findFirst({ where: { userId: c.id, channel: "EMAIL" } })).toMatchObject({ status: "SKIPPED" });
  });

  it("retries failed deliveries with backoff and stops after the max attempts", async () => {
    const c = await makeCustomer();
    await db.user.update({ where: { id: c.id }, data: { emailNotifications: true } });
    await notify(db, { userId: c.id, type: "SERVICE_COMPLETED", title: "t", body: "b" });
    let calls = 0;
    const failing = async () => {
      calls++;
      return { status: "FAILED" as const, error: "503", retryable: true };
    };
    let now = new Date();
    await processNotificationQueue({ now, sender: failing });
    let row = await db.notification.findFirstOrThrow({ where: { userId: c.id, channel: "EMAIL" } });
    expect(row).toMatchObject({ status: "FAILED", attempts: 1 });
    expect(row.nextAttemptAt!.getTime()).toBeGreaterThan(now.getTime());

    await processNotificationQueue({ now, sender: failing }); // not due yet
    expect(calls).toBe(1);

    for (let i = 0; i < 10; i++) {
      now = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      await processNotificationQueue({ now, sender: failing });
    }
    row = await db.notification.findFirstOrThrow({ where: { userId: c.id, channel: "EMAIL" } });
    expect(row.attempts).toBe(MAX_ATTEMPTS);
    expect(calls).toBe(MAX_ATTEMPTS);
    expect(row.nextAttemptAt).toBeNull();

    // A later success path
    await notify(db, { userId: c.id, type: "RECEIPT_AVAILABLE", title: "t", body: "b" });
    await processNotificationQueue({ now, sender: async () => ({ status: "SENT" }) });
    expect(await db.notification.findFirst({ where: { type: "RECEIPT_AVAILABLE", channel: "EMAIL" } })).toMatchObject({ status: "SENT" });
  });
});
