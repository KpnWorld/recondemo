"use server";

import { requirePageUser } from "@/lib/auth/current";
import { bool, num, optStr, run, str, withParam } from "@/lib/actions";
import { isAppError, toActionError, type ActionResult } from "@/lib/errors";
import { cancelRequest, createShareLink, postMessage, respondToQuote, revokeShareLinks, submitReview } from "@/lib/services/requests";
import { retrySearch } from "@/lib/services/dispatch";
import { ensurePaymentIntent } from "@/lib/services/payments";
import { deleteLocation, deleteVehicle, saveLocation, saveVehicle } from "@/lib/services/customer";
import { changePassword, deleteOwnAccount, sendPhoneVerification, updateProfile, verifyPhoneCode } from "@/lib/services/accounts";
import { signOut } from "@/lib/auth/current";
import { redirect } from "next/navigation";

const back = (id: string) => `/requests/${id}`;

export async function cancelRequestAction(fd: FormData) {
  const user = await requirePageUser(["CUSTOMER"]);
  const id = str(fd, "requestId");
  const reason = [str(fd, "reason"), str(fd, "details")].filter(Boolean).join(": ");
  await run(() => cancelRequest(user, id, reason), {
    back: back(id),
    ok: "Your request was cancelled.",
  });
}

export async function retrySearchAction(fd: FormData) {
  const user = await requirePageUser(["CUSTOMER"]);
  const id = str(fd, "requestId");
  await run(() => retrySearch(user, id), {
    back: back(id),
    ok: "We're contacting providers again.",
  });
}

export async function respondQuoteAction(fd: FormData) {
  const user = await requirePageUser(["CUSTOMER"]);
  const id = str(fd, "requestId");
  const approve = str(fd, "decision") === "approve";
  await run(() => respondToQuote(user, str(fd, "quoteId"), approve), {
    back: back(id),
    ok: approve ? "Thanks, the price is approved." : "You declined the price.",
  });
}

export async function messageAction(fd: FormData) {
  const user = await requirePageUser();
  const id = str(fd, "requestId");
  const backTo = str(fd, "back") || back(id);
  await run(() => postMessage(user, id, { body: str(fd, "body") }), {
    back: `${backTo}#messages`,
    ok: "Message sent.",
  });
}

export async function shareAction(fd: FormData) {
  const user = await requirePageUser(["CUSTOMER"]);
  const id = str(fd, "requestId");
  if (str(fd, "op") === "revoke")
    await run(() => revokeShareLinks(user, id), {
      back: `${back(id)}#share`,
      ok: "Shared links turned off.",
    });
  let link: string;
  try {
    link = await createShareLink(user, id);
  } catch (e) {
    redirect(withParam(back(id), "error", isAppError(e) ? e.message : "Couldn't create a link."));
  }
  redirect(`${back(id)}?share=${encodeURIComponent(link)}#share`);
}

export async function reviewAction(fd: FormData) {
  const user = await requirePageUser(["CUSTOMER"]);
  const id = str(fd, "requestId");
  await run(
    () =>
      submitReview(user, id, {
        rating: num(fd, "rating"),
        comment: optStr(fd, "comment"),
      }),
    { back: back(id), ok: "Thanks for your feedback." },
  );
}

export async function paymentIntentAction(requestId: string): Promise<ActionResult<{ clientSecret: string; amountCents: number }>> {
  try {
    const user = await requirePageUser(["CUSTOMER"]);
    return { ok: true, data: await ensurePaymentIntent(user, requestId) };
  } catch (e) {
    return toActionError(e);
  }
}

// ---- Account ----------------------------------------------------------------------------

export async function vehicleAction(fd: FormData) {
  const user = await requirePageUser(["CUSTOMER"]);
  const id = optStr(fd, "id");
  if (str(fd, "op") === "delete")
    await run(() => deleteVehicle(user, id!), {
      back: "/dashboard/vehicles",
      ok: "Vehicle removed.",
    });
  await run(
    () =>
      saveVehicle(user, id, {
        nickname: optStr(fd, "nickname"),
        make: str(fd, "make"),
        model: str(fd, "model"),
        year: str(fd, "year"),
        vehicleType: str(fd, "vehicleType"),
        drivetrain: str(fd, "drivetrain"),
        color: optStr(fd, "color"),
        licensePlate: optStr(fd, "licensePlate"),
        specialHandling: optStr(fd, "specialHandling"),
      }),
    {
      back: "/dashboard/vehicles",
      ok: id ? "Vehicle updated." : "Vehicle saved.",
    },
  );
}

export async function locationAction(fd: FormData) {
  const user = await requirePageUser(["CUSTOMER"]);
  if (str(fd, "op") === "delete")
    await run(() => deleteLocation(user, str(fd, "id")), {
      back: "/dashboard/locations",
      ok: "Place removed.",
    });
  await run(
    () =>
      saveLocation(user, {
        label: str(fd, "label"),
        line1: str(fd, "line1"),
        city: str(fd, "city"),
        state: str(fd, "state"),
        zip: str(fd, "zip"),
      }),
    { back: "/dashboard/locations", ok: "Place saved." },
  );
}

export async function profileAction(fd: FormData) {
  const user = await requirePageUser();
  const backTo = user.role === "PROVIDER" ? "/provider/account" : user.role === "ADMIN" ? "/admin/account" : "/dashboard/profile";
  await run(
    () =>
      updateProfile(user, {
        name: str(fd, "name"),
        phone: str(fd, "phone"),
        emailNotifications: bool(fd, "emailNotifications"),
        smsNotifications: bool(fd, "smsNotifications"),
        pushNotifications: bool(fd, "pushNotifications"),
        emergencyContactName: optStr(fd, "emergencyContactName"),
        emergencyContactPhone: optStr(fd, "emergencyContactPhone"),
      }),
    { back: backTo, ok: "Profile saved." },
  );
}

export async function passwordAction(fd: FormData) {
  const user = await requirePageUser();
  const backTo = user.role === "PROVIDER" ? "/provider/account" : user.role === "ADMIN" ? "/admin/account" : "/dashboard/profile";
  await run(() => changePassword(user, str(fd, "current"), str(fd, "next")), {
    back: backTo,
    ok: "Password changed.",
  });
}

export async function phoneVerifyAction(fd: FormData) {
  const user = await requirePageUser();
  const backTo = user.role === "PROVIDER" ? "/provider/account" : user.role === "ADMIN" ? "/admin/account" : "/dashboard/profile";
  if (str(fd, "op") === "send")
    await run(() => sendPhoneVerification(user), {
      back: backTo,
      ok: "We sent a code to your phone.",
    });
  await run(() => verifyPhoneCode(user, str(fd, "code")), {
    back: backTo,
    ok: "Phone number verified.",
  });
}

export async function deleteAccountAction(fd: FormData) {
  const user = await requirePageUser();
  const backTo = user.role === "PROVIDER" ? "/provider/account" : user.role === "ADMIN" ? "/admin/account" : "/dashboard/profile";
  try {
    await deleteOwnAccount(user, str(fd, "password"));
  } catch (e) {
    redirect(withParam(backTo, "error", isAppError(e) ? e.message : "Couldn't delete your account."));
  }
  await signOut();
  redirect("/?deleted=1");
}

// ---- Saved cards (Stripe) ----------------------------------------------------------------

export async function setupIntentAction(): Promise<ActionResult<{ clientSecret: string }>> {
  try {
    const user = await requirePageUser(["CUSTOMER"]);
    const { stripe } = await import("@/lib/integrations/stripe");
    const { ensureStripeCustomer } = await import("@/lib/services/payments");
    const si = await stripe.createSetupIntent(await ensureStripeCustomer(user.id));
    return { ok: true, data: { clientSecret: si.client_secret } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function removeCardAction(fd: FormData) {
  const user = await requirePageUser(["CUSTOMER"]);
  const { stripe } = await import("@/lib/integrations/stripe");
  const { db } = await import("@/lib/db");
  const pmId = str(fd, "paymentMethodId");
  await run(
    async () => {
      const profile = await db.customerProfile.findUnique({
        where: { userId: user.id },
      });
      if (!profile?.paymentCustomerRef) return;
      // Only detach a card that belongs to this customer.
      const cards = await stripe.listPaymentMethods(profile.paymentCustomerRef);
      if (!cards.data.some((c) => c.id === pmId)) return;
      await stripe.detachPaymentMethod(pmId);
    },
    { back: "/dashboard/payments", ok: "Card removed." },
  );
}
