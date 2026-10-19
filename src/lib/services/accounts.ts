import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { config } from "@/lib/env";
import { generateNumericCode, generateToken, hashPassword, sha256, verifyPassword } from "@/lib/auth/crypto";
import { revokeAllSessions } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { emailSchema, loginSchema, parse, passwordSchema, phoneSchema, signupSchema } from "@/lib/validation";
import { emailConfigured, sendEmail, sendSms, smsConfigured } from "@/lib/integrations/messaging";
import type { Actor } from "@/lib/permissions";
import { assertCan } from "@/lib/permissions";
import { ACTIVE_STATUSES, ADMIN_ROLES } from "@/lib/constants";

// Compared against for unknown emails so login timing doesn't reveal which accounts exist.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hashPassword(generateToken()));

export async function registerUser(input: unknown, ip = "local") {
  rateLimit(`signup:${ip}`, 10, 60 * 60 * 1000);
  const data = parse(signupSchema, input);
  if (data.accountType === "PROVIDER" && !data.businessName) {
    throw new AppError("VALIDATION", "Enter your business name", {
      businessName: ["Enter your business name"],
    });
  }
  const existing = await db.user.findUnique({ where: { email: data.email } });
  if (existing) throw new AppError("CONFLICT", "An account with this email already exists. Try signing in or resetting your password.");

  const now = new Date();
  const user = await db.user.create({
    data: {
      email: data.email,
      name: data.name,
      phone: data.phone ?? null,
      passwordHash: await hashPassword(data.password),
      role: data.accountType,
      termsAcceptedAt: now,
      emailNotifications: data.emailNotifications,
      smsNotifications: data.smsNotifications && Boolean(data.phone),
      customerProfile: data.accountType === "CUSTOMER" ? { create: {} } : undefined,
      providerProfile:
        data.accountType === "PROVIDER"
          ? {
              create: {
                businessName: data.businessName!,
                verificationStatus: "PENDING",
              },
            }
          : undefined,
    },
  });
  await audit({
    actorId: user.id,
    action: "user.register",
    entityType: "User",
    entityId: user.id,
    details: { role: user.role },
    ip,
  });
  return user;
}

export async function authenticate(input: unknown, ip = "local") {
  const { email, password } = parse(loginSchema, input);
  rateLimit(`login:ip:${ip}`, 30, 15 * 60 * 1000);
  rateLimit(`login:email:${email}`, 8, 15 * 60 * 1000);
  const user = await db.user.findUnique({ where: { email } });
  const ok = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !ok) {
    if (user)
      await audit({
        actorId: user.id,
        action: "auth.login_failed",
        entityType: "User",
        entityId: user.id,
        ip,
      });
    throw new AppError("UNAUTHENTICATED", "That email and password don't match. Please try again.");
  }
  if (user.status !== "ACTIVE") throw new AppError("FORBIDDEN", "This account is not active. Please contact support.");
  if (user.role === "ADMIN")
    await audit({
      actorId: user.id,
      action: "auth.staff_login",
      entityType: "User",
      entityId: user.id,
      ip,
    });
  return user;
}

/**
 * Starts a password reset. Always succeeds from the caller's point of view so the
 * response doesn't reveal which emails have accounts. Returns the link only in demo
 * mode (where no email can be sent) so the flow can be tested.
 */
export async function requestPasswordReset(emailInput: unknown, ip = "local"): Promise<{ demoLink?: string; emailSent: boolean }> {
  rateLimit(`reset:${ip}`, 5, 15 * 60 * 1000);
  const email = parse(emailSchema, emailInput);
  const user = await db.user.findUnique({ where: { email } });
  if (!user || user.status !== "ACTIVE") return { emailSent: emailConfigured() };
  const token = generateToken();
  await db.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  const link = `${config.appUrl()}/reset-password?token=${token}`;
  const result = await sendEmail({
    to: user.email,
    subject: "Reset your Call Recon password",
    text: `Use this link within 1 hour to reset your password:\n\n${link}\n\nIf you didn't ask for this, you can ignore this email.`,
  });
  return {
    emailSent: result.status === "SENT",
    demoLink: config.demoMode() ? link : undefined,
  };
}

export async function resetPassword(token: string, newPassword: unknown) {
  const password = parse(passwordSchema, newPassword);
  const row = await db.passwordResetToken.findUnique({
    where: { tokenHash: sha256(token ?? "") },
  });
  if (!row || row.usedAt || row.expiresAt < new Date()) throw new AppError("VALIDATION", "This reset link is invalid or has expired. Please request a new one.");
  await db.$transaction([
    db.user.update({
      where: { id: row.userId },
      data: { passwordHash: await hashPassword(password) },
    }),
    db.passwordResetToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    }),
  ]);
  await revokeAllSessions(row.userId);
  await audit({
    actorId: row.userId,
    action: "user.password_reset",
    entityType: "User",
    entityId: row.userId,
  });
}

export async function changePassword(actor: Actor, current: string, next: unknown) {
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
  if (!(await verifyPassword(current, user.passwordHash))) throw new AppError("VALIDATION", "Your current password is incorrect.");
  const password = parse(passwordSchema, next);
  await db.user.update({
    where: { id: actor.id },
    data: { passwordHash: await hashPassword(password) },
  });
  await audit({
    actorId: actor.id,
    action: "user.password_change",
    entityType: "User",
    entityId: actor.id,
  });
}

const profileSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: phoneSchema.optional().or(z.literal("").transform(() => undefined)),
  emailNotifications: z.boolean(),
  smsNotifications: z.boolean(),
  pushNotifications: z.boolean(),
  emergencyContactName: z.string().trim().max(100).optional().nullable(),
  emergencyContactPhone: z.string().trim().max(30).optional().nullable(),
});

export async function updateProfile(actor: Actor, input: unknown) {
  const data = parse(profileSchema, input);
  const current = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
  const phoneChanged = (data.phone ?? null) !== current.phone;
  await db.user.update({
    where: { id: actor.id },
    data: {
      name: data.name,
      phone: data.phone ?? null,
      phoneVerified: phoneChanged ? false : current.phoneVerified,
      emailNotifications: data.emailNotifications,
      smsNotifications: data.smsNotifications && Boolean(data.phone),
      pushNotifications: data.pushNotifications,
    },
  });
  if (actor.role === "CUSTOMER") {
    await db.customerProfile.upsert({
      where: { userId: actor.id },
      create: {
        userId: actor.id,
        emergencyContactName: data.emergencyContactName || null,
        emergencyContactPhone: data.emergencyContactPhone || null,
      },
      update: {
        emergencyContactName: data.emergencyContactName || null,
        emergencyContactPhone: data.emergencyContactPhone || null,
      },
    });
  }
}

export async function recordLocationConsent(actor: Actor, granted: boolean) {
  await db.user.update({
    where: { id: actor.id },
    data: { locationConsentAt: granted ? new Date() : null },
  });
}

/** Sends a 6-digit code by SMS. Requires a configured SMS provider. */
export async function sendPhoneVerification(actor: Actor) {
  if (!smsConfigured()) throw new AppError("NOT_CONFIGURED", "Phone verification will be available once an SMS provider is connected.");
  rateLimit(`phone:${actor.id}`, 3, 15 * 60 * 1000);
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
  if (!user.phone) throw new AppError("VALIDATION", "Add a phone number to your profile first.");
  const code = generateNumericCode();
  await db.phoneVerificationCode.create({
    data: {
      userId: user.id,
      phone: user.phone,
      codeHash: sha256(code),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });
  const r = await sendSms({
    to: user.phone,
    text: `Your Call Recon verification code is ${code}. It expires in 10 minutes.`,
  });
  if (r.status !== "SENT") throw new AppError("INTEGRATION_ERROR", "We couldn't send the code. Please try again shortly.");
}

export async function verifyPhoneCode(actor: Actor, code: string) {
  const row = await db.phoneVerificationCode.findFirst({
    where: { userId: actor.id, usedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!row || row.expiresAt < new Date() || row.attempts >= 5) throw new AppError("VALIDATION", "That code has expired. Please request a new one.");
  if (row.codeHash !== sha256(code.trim())) {
    await db.phoneVerificationCode.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
    });
    throw new AppError("VALIDATION", "That code isn't right. Please check and try again.");
  }
  await db.$transaction([
    db.phoneVerificationCode.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    }),
    db.user.update({ where: { id: actor.id }, data: { phoneVerified: true } }),
  ]);
}

/**
 * Account deletion: personal data is removed or anonymized; financial and service
 * records are kept (with the person's identity stripped) for legal/accounting needs.
 */
export async function deleteOwnAccount(actor: Actor, password: string) {
  if (actor.role === "ADMIN") throw new AppError("FORBIDDEN", "Staff accounts are deactivated by a super admin, not deleted.");
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
  if (!(await verifyPassword(password, user.passwordHash))) throw new AppError("VALIDATION", "Your password is incorrect.");
  const active = await db.serviceRequest.count({
    where: { customerId: actor.id, status: { in: ACTIVE_STATUSES } },
  });
  if (active > 0) throw new AppError("CONFLICT", "Please wait until your active request is finished or cancelled before deleting your account.");
  if (actor.role === "PROVIDER") {
    const jobs = await db.providerAssignment.count({
      where: {
        active: true,
        provider: { userId: actor.id },
        request: { status: { in: ACTIVE_STATUSES } },
      },
    });
    if (jobs > 0) throw new AppError("CONFLICT", "Please finish or release your active job first.");
  }
  await db.$transaction(async (tx) => {
    await tx.vehicle.deleteMany({ where: { userId: actor.id } });
    await tx.savedLocation.deleteMany({ where: { userId: actor.id } });
    await tx.session.deleteMany({ where: { userId: actor.id } });
    await tx.notification.deleteMany({ where: { userId: actor.id } });
    await tx.user.update({
      where: { id: actor.id },
      data: {
        email: `deleted-${actor.id}@deleted.invalid`,
        name: "Deleted user",
        phone: null,
        passwordHash: "!",
        status: "DELETED",
        deletedAt: new Date(),
        emailNotifications: false,
        smsNotifications: false,
        pushNotifications: false,
      },
    });
    if (actor.role === "PROVIDER") {
      await tx.providerProfile.update({
        where: { userId: actor.id },
        data: {
          isOnline: false,
          lastLat: null,
          lastLng: null,
          verificationStatus: "SUSPENDED",
        },
      });
    }
    await audit(
      {
        actorId: actor.id,
        action: "user.delete_self",
        entityType: "User",
        entityId: actor.id,
      },
      tx,
    );
  });
}

// ---- Administrator user management -------------------------------------------------

export async function adminSetUserStatus(admin: Actor, userId: string, status: "ACTIVE" | "SUSPENDED", reason: string) {
  assertCan(admin, "users.manage");
  if (userId === admin.id) throw new AppError("VALIDATION", "You can't change your own account status.");
  await db.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId },
      data: { status },
    });
    if (status === "SUSPENDED") {
      await tx.session.deleteMany({ where: { userId } });
      if (user.role === "PROVIDER")
        await tx.providerProfile.updateMany({
          where: { userId },
          data: { isOnline: false },
        });
    }
    await audit(
      {
        actorId: admin.id,
        action: `user.${status === "ACTIVE" ? "reactivate" : "suspend"}`,
        entityType: "User",
        entityId: userId,
        details: { reason },
      },
      tx,
    );
  });
}

export async function adminSetAdminRole(admin: Actor, userId: string, adminRole: string | null) {
  assertCan(admin, "users.manage");
  if (userId === admin.id) throw new AppError("VALIDATION", "You can't change your own administrator role.");
  if (adminRole && !(ADMIN_ROLES as readonly string[]).includes(adminRole)) throw new AppError("VALIDATION", "Unknown role.");
  const target = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (target.role !== "ADMIN") throw new AppError("VALIDATION", "Only administrator accounts have administrator roles.");
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { adminRole } });
    await tx.session.deleteMany({ where: { userId } });
    await audit(
      {
        actorId: admin.id,
        action: "user.set_admin_role",
        entityType: "User",
        entityId: userId,
        details: { from: target.adminRole, to: adminRole },
      },
      tx,
    );
  });
}

export async function adminCreateStaff(admin: Actor, input: unknown) {
  assertCan(admin, "users.manage");
  const data = parse(
    z.object({
      name: z.string().trim().min(2).max(100),
      email: emailSchema,
      adminRole: z.enum(ADMIN_ROLES),
      password: passwordSchema,
    }),
    input,
  );
  if (await db.user.findUnique({ where: { email: data.email } })) throw new AppError("CONFLICT", "An account with this email already exists.");
  const user = await db.user.create({
    data: {
      email: data.email,
      name: data.name,
      role: "ADMIN",
      adminRole: data.adminRole,
      passwordHash: await hashPassword(data.password),
      termsAcceptedAt: new Date(),
    },
  });
  await audit({
    actorId: admin.id,
    action: "user.create_staff",
    entityType: "User",
    entityId: user.id,
    details: { adminRole: data.adminRole },
  });
  return user;
}
