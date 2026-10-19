"use server";

import { requirePageUser } from "@/lib/auth/current";
import { bool, cents, num, optStr, run, str } from "@/lib/actions";
import { AppError } from "@/lib/errors";
import { manualAssign, releaseJob, retrySearch, sweepDispatch } from "@/lib/services/dispatch";
import { cancelRequest, proposePriceRevision, purgeOldLocationData, sendConfirmedQuote, updateJobStatus } from "@/lib/services/requests";
import { reviewDocument, setProviderVerification } from "@/lib/services/providers";
import { adminCreateStaff, adminSetAdminRole, adminSetUserStatus } from "@/lib/services/accounts";
import { issueRefund, markPayoutPaid, setPayoutHold } from "@/lib/services/payments";
import { updateSettings, updateTicket, upsertPricingRule, upsertPromo, upsertServiceArea, upsertServiceCategory } from "@/lib/services/admin";
import { processNotificationQueue } from "@/lib/services/notifications";
import type { RequestStatus } from "@/lib/constants";
import type { SettingsSection } from "@/lib/settings";
import { assertCan } from "@/lib/permissions";

const admin = () => requirePageUser(["ADMIN"]);
const reqBack = (id: string) => `/admin/requests/${id}`;
const mustCents = (fd: FormData, k: string, label: string) => {
  const v = cents(fd, k);
  if (v == null || Number.isNaN(v)) throw new AppError("VALIDATION", `Enter ${label}.`);
  return v;
};
/** Repeated rows like label_0/amount_0 … */
function rows(fd: FormData, prefix: string, keys: string[], required = ["label", "amount"]) {
  const out: Record<string, string>[] = [];
  for (let i = 0; i < 20; i++) {
    const row = Object.fromEntries(keys.map((k) => [k, str(fd, `${prefix}${k}_${i}`)]));
    // Rows with neither a label nor an amount are blank (select menus always carry a value).
    if (required.some((k) => row[k])) out.push(row);
  }
  return out;
}

// ---- Requests & dispatch ---------------------------------------------------------------

export async function assignAction(fd: FormData) {
  const user = await admin();
  const id = str(fd, "requestId");
  await run(() => manualAssign(user, id, str(fd, "providerId"), str(fd, "reason")), { back: reqBack(id), ok: "Provider assigned and notified." });
}

export async function retryDispatchAction(fd: FormData) {
  const user = await admin();
  const id = str(fd, "requestId");
  await run(() => retrySearch(user, id), {
    back: reqBack(id),
    ok: "Dispatch restarted.",
  });
}

export async function quoteAction(fd: FormData) {
  const user = await admin();
  const id = str(fd, "requestId");
  await run(
    async () => {
      const extraLines = rows(fd, "", ["label", "amount"]).map((r) => {
        const amountCents = Math.round(Number(r.amount.replace(/[$,\s]/g, "")) * 100);
        if (!r.label || !Number.isFinite(amountCents)) throw new AppError("VALIDATION", "Each charge needs a label and an amount.");
        return { label: r.label, amountCents };
      });
      const taxPct = num(fd, "taxPercent");
      await sendConfirmedQuote(user, id, {
        miles: num(fd, "miles"),
        extraLines,
        taxRateBps: taxPct == null ? undefined : Math.round(taxPct * 100),
        note: optStr(fd, "note"),
      });
    },
    { back: reqBack(id), ok: "Quote sent to the customer for approval." },
  );
}

export async function adminRevisionAction(fd: FormData) {
  const user = await admin();
  const id = str(fd, "requestId");
  await run(
    async () =>
      proposePriceRevision(user, id, {
        lines: [
          {
            label: str(fd, "label"),
            amountCents: mustCents(fd, "amount", "the amount"),
          },
        ],
        reason: str(fd, "reason"),
      }),
    {
      back: reqBack(id),
      ok: "Price change sent to the customer.",
    },
  );
}

export async function adminCancelAction(fd: FormData) {
  const user = await admin();
  const id = str(fd, "requestId");
  await run(
    () =>
      cancelRequest(user, id, str(fd, "reason"), {
        waiveFee: !bool(fd, "chargeFee"),
      }),
    { back: reqBack(id), ok: "Request cancelled." },
  );
}

export async function adminStatusAction(fd: FormData) {
  const user = await admin();
  const id = str(fd, "requestId");
  await run(
    () =>
      updateJobStatus(user, id, str(fd, "to") as RequestStatus, {
        notes: optStr(fd, "notes"),
      }),
    { back: reqBack(id), ok: "Status updated." },
  );
}

export async function adminReleaseAction(fd: FormData) {
  const user = await admin();
  const id = str(fd, "requestId");
  await run(() => releaseJob(user, id, str(fd, "reason")), {
    back: reqBack(id),
    ok: "Provider released. Searching again.",
  });
}

export async function sweepAction() {
  const user = await admin();
  await run(
    async () => {
      assertCan(user, "dispatch.assign");
      await sweepDispatch();
      await processNotificationQueue();
    },
    { back: "/admin", ok: "Dispatch timers and notification queue processed." },
  );
}

// ---- Providers ---------------------------------------------------------------------------

export async function documentReviewAction(fd: FormData) {
  const user = await admin();
  const back = `/admin/providers/${str(fd, "providerId")}`;
  await run(() => reviewDocument(user, str(fd, "documentId"), str(fd, "decision") === "approve" ? "APPROVED" : "REJECTED", optStr(fd, "notes")), {
    back,
    ok: "Document reviewed.",
  });
}

export async function verificationAction(fd: FormData) {
  const user = await admin();
  const id = str(fd, "providerId");
  const status = str(fd, "status") as "APPROVED" | "REJECTED" | "SUSPENDED" | "PENDING";
  await run(
    () =>
      setProviderVerification(user, id, status, {
        notes: optStr(fd, "notes"),
        authorizedServiceIds: fd.getAll("authorized").map(String),
      }),
    {
      back: `/admin/providers/${id}`,
      ok: "Verification updated and the provider was notified.",
    },
  );
}

// ---- Users -------------------------------------------------------------------------------

export async function userStatusAction(fd: FormData) {
  const user = await admin();
  const back = str(fd, "back") || "/admin/users";
  await run(() => adminSetUserStatus(user, str(fd, "userId"), str(fd, "status") === "ACTIVE" ? "ACTIVE" : "SUSPENDED", str(fd, "reason")), { back, ok: "Account updated." });
}

export async function adminRoleAction(fd: FormData) {
  const user = await admin();
  await run(() => adminSetAdminRole(user, str(fd, "userId"), optStr(fd, "adminRole")), {
    back: "/admin/users?tab=staff",
    ok: "Role updated. They'll need to sign in again.",
  });
}

export async function createStaffAction(fd: FormData) {
  const user = await admin();
  await run(
    () =>
      adminCreateStaff(user, {
        name: str(fd, "name"),
        email: str(fd, "email"),
        adminRole: str(fd, "adminRole"),
        password: str(fd, "password"),
      }),
    {
      back: "/admin/users?tab=staff",
      ok: "Staff account created. Share the temporary password securely.",
    },
  );
}

// ---- Support -----------------------------------------------------------------------------

export async function ticketAction(fd: FormData) {
  const user = await admin();
  const id = str(fd, "ticketId");
  await run(
    () =>
      updateTicket(user, id, {
        status: str(fd, "status"),
        resolution: optStr(fd, "resolution"),
        assignToMe: bool(fd, "assignToMe"),
      }),
    {
      back: `/admin/support/${id}`,
      ok: "Ticket updated.",
    },
  );
}

// ---- Payments ----------------------------------------------------------------------------

export async function refundAction(fd: FormData) {
  const user = await admin();
  const back = str(fd, "back") || "/admin/payments";
  await run(async () => issueRefund(user, str(fd, "paymentId"), mustCents(fd, "amount", "a refund amount"), str(fd, "reason")), {
    back,
    ok: "Refund submitted. Its final status comes from the payment processor.",
  });
}

export async function payoutAction(fd: FormData) {
  const user = await admin();
  const id = str(fd, "payoutId");
  const op = str(fd, "op");
  await run(() => (op === "paid" ? markPayoutPaid(user, id, str(fd, "reference")) : setPayoutHold(user, id, op === "hold")), {
    back: "/admin/payments?tab=payouts",
    ok: op === "paid" ? "Payout marked as paid." : op === "hold" ? "Payout placed on hold." : "Payout released.",
  });
}

// ---- Catalog, pricing, areas, promotions -------------------------------------------------

export async function pricingRuleAction(fd: FormData) {
  const user = await admin();
  const id = optStr(fd, "id");
  await run(
    async () => {
      const surcharges = rows(fd, "s_", ["code", "label", "amount", "condition"]).map((r) => {
        const amountCents = Math.round(Number(r.amount.replace(/[$,\s]/g, "")) * 100);
        if (!r.label || !Number.isFinite(amountCents)) throw new AppError("VALIDATION", "Each surcharge needs a label and an amount.");
        return {
          code: r.code || r.label.toUpperCase().replace(/[^A-Z0-9]+/g, "_"),
          label: r.label,
          amountCents,
          condition: r.condition || "ALWAYS",
        };
      });
      await upsertPricingRule(user, id, {
        serviceCategoryId: str(fd, "serviceCategoryId"),
        serviceAreaId: optStr(fd, "serviceAreaId"),
        baseFeeCents: mustCents(fd, "baseFee", "a base fee"),
        includedMiles: num(fd, "includedMiles") ?? 0,
        perMileCents: cents(fd, "perMile") ?? 0,
        serviceFeeCents: cents(fd, "serviceFee") ?? 0,
        minimumChargeCents: cents(fd, "minimumCharge") ?? 0,
        taxRateBps: Math.round((num(fd, "taxPercent") ?? 0) * 100),
        quoteValidityMinutes: num(fd, "quoteValidityMinutes") ?? 30,
        surcharges,
        active: bool(fd, "active"),
      });
    },
    {
      back: id ? `/admin/pricing?edit=${id}` : "/admin/pricing?edit=new",
      to: "/admin/pricing",
      ok: "Pricing rule saved. New estimates use it immediately.",
    },
  );
}

export async function categoryAction(fd: FormData) {
  const user = await admin();
  const id = optStr(fd, "id");
  await run(
    () =>
      upsertServiceCategory(user, id, {
        name: str(fd, "name"),
        description: str(fd, "description"),
        requiresDestination: bool(fd, "requiresDestination"),
        requiredTruckTypes: fd.getAll("requiredTruckTypes").map(String),
        requiresWinch: bool(fd, "requiresWinch"),
        active: bool(fd, "active"),
        sortOrder: num(fd, "sortOrder") ?? 0,
      }),
    { back: "/admin/catalog", ok: "Service saved." },
  );
}

export async function areaAction(fd: FormData) {
  const user = await admin();
  const id = optStr(fd, "id");
  await run(
    () =>
      upsertServiceArea(user, id, {
        name: str(fd, "name"),
        description: optStr(fd, "description"),
        centerLat: num(fd, "centerLat"),
        centerLng: num(fd, "centerLng"),
        radiusMiles: num(fd, "radiusMiles"),
        zips: str(fd, "zips"),
        active: bool(fd, "active"),
      }),
    { back: "/admin/areas", ok: "Service area saved." },
  );
}

export async function promoAction(fd: FormData) {
  const user = await admin();
  const id = optStr(fd, "id");
  const kind = str(fd, "kind");
  await run(
    () =>
      upsertPromo(user, id, {
        code: str(fd, "code"),
        description: optStr(fd, "description"),
        percentOff: kind === "percent" ? num(fd, "value") : null,
        amountOffCents: kind === "amount" ? cents(fd, "value") : null,
        maxRedemptions: num(fd, "maxRedemptions"),
        expiresAt: optStr(fd, "expiresAt"),
        active: bool(fd, "active"),
      }),
    { back: "/admin/promotions", ok: "Promotion saved." },
  );
}

// ---- Settings ----------------------------------------------------------------------------

function settingsInput(section: SettingsSection, fd: FormData): unknown {
  switch (section) {
    case "business":
      return Object.fromEntries(["legalName", "address", "supportPhone", "supportEmail", "supportHours", "serviceAreaSummary"].map((k) => [k, str(fd, k)]));
    case "legal":
      return Object.fromEntries(
        ["privacyPolicy", "terms", "cancellationPolicy", "refundPolicy", "providerRequirements", "paymentDisclosures"].map((k) => [k, String(fd.get(k) ?? "")]),
      );
    case "dispatch":
      return {
        autoDispatch: bool(fd, "autoDispatch"),
        offerBatchSize: num(fd, "offerBatchSize"),
        offerTimeoutSeconds: num(fd, "offerTimeoutSeconds"),
        maxRounds: num(fd, "maxRounds"),
        maxRadiusMiles: num(fd, "maxRadiusMiles"),
        useReliability: bool(fd, "useReliability"),
      };
    case "cancellation":
      return {
        feeAfterAssignmentCents: cents(fd, "fee"),
        freeCancellationMinutes: num(fd, "freeCancellationMinutes") ?? 0,
      };
    case "payments": {
      const pct = num(fd, "platformFeePercent");
      return {
        platformFeeBps: pct == null ? null : Math.round(pct * 100),
        requireAuthorizationBeforeDispatch: bool(fd, "requireAuthorizationBeforeDispatch"),
        currency: "usd",
      };
    }
    case "pricing":
      return { revisionApprovalThresholdCents: cents(fd, "threshold") ?? 0 };
    case "retention":
      return { locationDataDays: num(fd, "locationDataDays") };
    case "referral":
      return {
        enabled: bool(fd, "enabled"),
        rewardDescription: str(fd, "rewardDescription"),
      };
  }
}

export async function settingsAction(fd: FormData) {
  const user = await admin();
  const section = str(fd, "section") as SettingsSection;
  const back = str(fd, "back") || `/admin/settings#${section}`;
  await run(() => updateSettings(user, section, settingsInput(section, fd)), {
    back,
    ok: "Settings saved.",
  });
}

export async function purgeAction() {
  const user = await admin();
  await run(() => purgeOldLocationData(user), {
    back: "/admin/settings#retention",
    ok: "Old location data removed.",
  });
}
