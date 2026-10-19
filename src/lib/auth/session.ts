import { db } from "@/lib/db";
import { generateToken, sha256 } from "./crypto";
import type { Actor } from "@/lib/permissions";

export const SESSION_COOKIE = "cr_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days, sliding

export async function createSession(userId: string, userAgent?: string | null) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.create({
    data: {
      tokenHash: sha256(token),
      userId,
      expiresAt,
      userAgent: userAgent?.slice(0, 200),
    },
  });
  return { token, expiresAt };
}

/** Resolve a raw session token to an active user, sliding the expiry. */
export async function validateSession(token: string | undefined | null): Promise<Actor | null> {
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt < new Date() || session.user.status !== "ACTIVE") {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  // Refresh at most once an hour to avoid a write per request.
  if (Date.now() - session.lastSeenAt.getTime() > 60 * 60 * 1000) {
    await db.session.update({
      where: { id: session.id },
      data: {
        lastSeenAt: new Date(),
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
  }
  const u = session.user;
  return {
    id: u.id,
    role: u.role as Actor["role"],
    adminRole: (u.adminRole as Actor["adminRole"]) ?? null,
    name: u.name,
    email: u.email,
  };
}

export async function revokeSession(token: string) {
  await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
}

export async function revokeAllSessions(userId: string) {
  await db.session.deleteMany({ where: { userId } });
}
