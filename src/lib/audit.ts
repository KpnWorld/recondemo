import type { Tx } from "./db";
import { db } from "./db";

export async function audit(
  entry: {
    actorId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    details?: unknown;
    ip?: string | null;
  },
  tx: Tx = db,
) {
  await tx.auditLog.create({
    data: {
      actorId: entry.actorId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      details: JSON.stringify(entry.details ?? {}),
      ip: entry.ip ?? null,
    },
  });
}
