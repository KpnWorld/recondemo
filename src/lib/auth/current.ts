// Request-scoped helpers for server components and server actions (uses next/headers).
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { SESSION_COOKIE, createSession, revokeSession, validateSession } from "./session";
import type { Actor, Permission } from "@/lib/permissions";
import { can } from "@/lib/permissions";
import type { Role } from "@/lib/constants";

export const getCurrentUser = cache(async (): Promise<Actor | null> => {
  const store = await cookies();
  return validateSession(store.get(SESSION_COOKIE)?.value);
});

export async function signIn(userId: string) {
  const h = await headers();
  const { token, expiresAt } = await createSession(userId, h.get("user-agent"));
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function signOut() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await revokeSession(token);
  store.delete(SESSION_COOKIE);
}

export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

/** For pages: redirect to login (or home) instead of throwing. */
export async function requirePageUser(roles?: Role[], next?: string): Promise<Actor> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  if (roles && !roles.includes(user.role)) redirect(homeFor(user));
  return user;
}

export async function requirePagePermission(permission: Permission): Promise<Actor> {
  const user = await requirePageUser(["ADMIN"], "/admin");
  if (!can(user, permission)) redirect("/admin?denied=1");
  return user;
}

export function homeFor(user: Pick<Actor, "role">) {
  return user.role === "ADMIN" ? "/admin" : user.role === "PROVIDER" ? "/provider" : "/dashboard";
}
