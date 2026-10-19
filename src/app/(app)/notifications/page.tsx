import type { Metadata } from "next";
import Link from "next/link";
import { requirePageUser } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { markAllReadAction } from "@/app/actions/notifications";
import { Card, EmptyState, PageHeader, cx } from "@/components/ui";
import { LocalTime, SubmitButton } from "@/components/client";
import { BellIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requirePageUser();
  const items = await db.notification.findMany({
    where: { userId: user.id, channel: "IN_APP" },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const external = await db.notification.groupBy({
    by: ["channel", "status"],
    where: { userId: user.id, channel: { not: "IN_APP" } },
    _count: true,
  });
  const unread = items.filter((i) => !i.readAt).length;
  return (
    <>
      <PageHeader
        title="Notifications"
        description={unread ? `${unread} unread` : "You're all caught up."}
        actions={
          unread ? (
            <form action={markAllReadAction}>
              <SubmitButton variant="secondary" size="sm">
                Mark all as read
              </SubmitButton>
            </form>
          ) : null
        }
      />
      <Card className="p-2 sm:p-3">
        {items.length ? (
          <ul className="divide-y divide-line">
            {items.map((n) => {
              const body = (
                <>
                  <span className="flex items-center gap-2">
                    {!n.readAt ? <span className="size-2 shrink-0 rounded-full bg-gold" aria-label="Unread" /> : null}
                    <span className="font-semibold text-deep">{n.title}</span>
                  </span>
                  <span className="mt-0.5 block text-sm text-ink">{n.body}</span>
                  <span className="mt-1 block text-xs text-ink-muted">
                    <LocalTime iso={n.createdAt.toISOString()} />
                  </span>
                </>
              );
              return (
                <li key={n.id}>
                  {n.link ? (
                    <Link href={n.link} className={cx("block rounded-xl px-3 py-3 no-underline hover:bg-soft", !n.readAt && "bg-mint-50/60")}>
                      {body}
                    </Link>
                  ) : (
                    <div className={cx("rounded-xl px-3 py-3", !n.readAt && "bg-mint-50/60")}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={<BellIcon />} title="No notifications yet" />
        )}
      </Card>
      {external.length ? (
        <p className="mt-4 text-xs text-ink-muted">
          Other channels: {external.map((e) => `${e.channel.toLowerCase()} ${e.status.toLowerCase()} (${e._count})`).join(", ")}. Skipped means that channel isn&apos;t connected
          yet.
        </p>
      ) : null}
    </>
  );
}
