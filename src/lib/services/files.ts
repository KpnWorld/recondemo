import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { Actor } from "@/lib/permissions";
import { can } from "@/lib/permissions";
import { getFile } from "@/lib/integrations/storage";
import { relationTo } from "./requests";

/** Authorize and load a stored file. Unauthorized viewers get NOT_FOUND. */
export async function readFileFor(actor: Actor, fileId: string) {
  const f = await db.storedFile.findUnique({ where: { id: fileId } });
  if (!f) throw new AppError("NOT_FOUND", "File not found.");
  let allowed = f.ownerId === actor.id;
  if (!allowed && f.purpose === "PROVIDER_DOCUMENT") allowed = can(actor, "providers.verify") || can(actor, "providers.view");
  if (!allowed && f.requestId) {
    try {
      const rel = await relationTo(actor, f.requestId);
      allowed = rel === "CUSTOMER" || rel === "ADMIN" || rel === "ASSIGNED_PROVIDER" || (rel === "PAST_PROVIDER" && f.purpose === "JOB_DOCUMENTATION");
    } catch {
      allowed = false;
    }
  }
  if (!allowed) throw new AppError("NOT_FOUND", "File not found.");
  return { file: f, data: await getFile(f.storageKey) };
}
