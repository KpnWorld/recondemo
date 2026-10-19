"use server";

import { redirect } from "next/navigation";
import { getCurrentUser, clientIp } from "@/lib/auth/current";
import { optStr, str, withParam } from "@/lib/actions";
import { isAppError } from "@/lib/errors";
import { createTicket } from "@/lib/services/admin";

export async function contactAction(fd: FormData) {
  const user = await getCurrentUser();
  let number = "";
  try {
    const t = await createTicket(
      user,
      {
        contactName: str(fd, "contactName"),
        contactEmail: str(fd, "contactEmail"),
        category: str(fd, "category"),
        subject: str(fd, "subject"),
        body: str(fd, "body"),
        requestNumber: optStr(fd, "requestNumber"),
      },
      await clientIp(),
    );
    number = t.number;
  } catch (e) {
    redirect(withParam("/help#contact", "error", isAppError(e) ? e.message : "We couldn't send your message. Please try again."));
  }
  redirect(withParam("/help#contact", "ok", `Thanks. Your message was received as ticket ${number}. Our team will reply by email.`));
}
