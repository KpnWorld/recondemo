import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { authenticate, registerUser, requestPasswordReset, resetPassword, deleteOwnAccount } from "@/lib/services/accounts";
import { createSession, revokeSession, validateSession } from "@/lib/auth/session";
import { sha256 } from "@/lib/auth/crypto";
import { asActor, resetDb } from "./helpers";

const signup = (extra = {}) => ({ name: "Jamie Doe", email: "Jamie@Example.com", password: "s3cure-password", acceptTerms: true, ...extra });

describe("authentication", () => {
  beforeEach(resetDb);

  it("registers a customer with a hashed password and normalized email", async () => {
    const u = await registerUser(signup({ phone: "(813) 555-0100" }));
    expect(u.email).toBe("jamie@example.com");
    expect(u.passwordHash).not.toContain("s3cure");
    expect(u.phone).toBe("+18135550100");
    expect(u.role).toBe("CUSTOMER");
    expect(await db.customerProfile.count({ where: { userId: u.id } })).toBe(1);
  });

  it("registers providers as PENDING verification", async () => {
    const u = await registerUser(signup({ email: "p@x.dev", accountType: "PROVIDER", businessName: "Acme Tow" }));
    const p = await db.providerProfile.findUniqueOrThrow({ where: { userId: u.id } });
    expect(p.verificationStatus).toBe("PENDING");
  });

  it("rejects weak passwords, missing consent and duplicate emails", async () => {
    await expect(registerUser(signup({ password: "short" }))).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(registerUser(signup({ acceptTerms: false }))).rejects.toMatchObject({ code: "VALIDATION" });
    await registerUser(signup());
    await expect(registerUser(signup())).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("can't self-register as an administrator", async () => {
    await expect(registerUser(signup({ accountType: "ADMIN" }))).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("logs in with the right password only, and rate-limits guessing", async () => {
    await registerUser(signup());
    await expect(authenticate({ email: "jamie@example.com", password: "s3cure-password" })).resolves.toBeTruthy();
    await expect(authenticate({ email: "jamie@example.com", password: "wrong-password1" })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(authenticate({ email: "nobody@example.com", password: "whatever123" })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    const attempts = [];
    for (let i = 0; i < 10; i++) attempts.push(authenticate({ email: "jamie@example.com", password: "wrong-password1" }).catch((e) => e.code));
    expect(await Promise.all(attempts)).toContain("RATE_LIMITED");
  });

  it("blocks suspended accounts", async () => {
    const u = await registerUser(signup());
    await db.user.update({ where: { id: u.id }, data: { status: "SUSPENDED" } });
    await expect(authenticate({ email: u.email, password: "s3cure-password" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("issues opaque session tokens stored only as hashes, and revokes them", async () => {
    const u = await registerUser(signup());
    const { token } = await createSession(u.id);
    expect(await db.session.findFirst({ where: { tokenHash: token } })).toBeNull();
    expect(await db.session.findFirst({ where: { tokenHash: sha256(token) } })).not.toBeNull();
    expect((await validateSession(token))?.id).toBe(u.id);
    await revokeSession(token);
    expect(await validateSession(token)).toBeNull();
  });

  it("rejects expired sessions and sessions of suspended users", async () => {
    const u = await registerUser(signup());
    const { token } = await createSession(u.id);
    await db.session.updateMany({ where: { userId: u.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await validateSession(token)).toBeNull();
    const second = await createSession(u.id);
    await db.user.update({ where: { id: u.id }, data: { status: "SUSPENDED" } });
    expect(await validateSession(second.token)).toBeNull();
  });

  it("resets a password with a single-use token and signs out other sessions", async () => {
    const u = await registerUser(signup());
    const { token: sessionToken } = await createSession(u.id);
    const { demoLink } = await requestPasswordReset("jamie@example.com");
    const token = new URL(demoLink!).searchParams.get("token")!;
    await resetPassword(token, "brand-new-pass1");
    await expect(authenticate({ email: u.email, password: "brand-new-pass1" })).resolves.toBeTruthy();
    expect(await validateSession(sessionToken)).toBeNull();
    await expect(resetPassword(token, "another-pass12")).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("doesn't reveal whether an email has an account", async () => {
    const r = await requestPasswordReset("unknown@example.com");
    expect(r.demoLink).toBeUndefined();
  });

  it("anonymizes personal data when a customer deletes their account", async () => {
    const u = await registerUser(signup());
    await deleteOwnAccount(asActor(u), "s3cure-password");
    const after = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.status).toBe("DELETED");
    expect(after.email).not.toContain("jamie");
    expect(after.phone).toBeNull();
  });
});
