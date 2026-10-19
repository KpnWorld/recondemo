"use server";

import { requirePageUser } from "@/lib/auth/current";
import { run } from "@/lib/actions";
import { markRead } from "@/lib/services/notifications";

export async function markAllReadAction() {
  const user = await requirePageUser();
  await run(() => markRead(user.id), { back: "/notifications" });
}
