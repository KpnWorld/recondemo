import { config } from "@/lib/env";

/**
 * Outbound channel adapters. Each returns { status: "SENT" } only when the provider
 * accepted the message; an unconfigured channel returns SKIPPED rather than pretending.
 */
export type DeliveryResult = {
  status: "SENT" | "SKIPPED" | "FAILED";
  error?: string;
  retryable?: boolean;
};

export type OutboundMessage = { to: string; subject: string; text: string };

async function postJson(url: string, body: unknown, headers: Record<string, string>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return res;
}

export async function sendEmail(msg: OutboundMessage): Promise<DeliveryResult> {
  const key = config.email.resendKey();
  const from = config.email.from();
  if (!key || !from) return { status: "SKIPPED", error: "Email provider not configured" };
  if (config.demoMode()) return { status: "SKIPPED", error: "Demo mode: outbound email disabled" };
  try {
    const res = await postJson("https://api.resend.com/emails", { from, to: [msg.to], subject: msg.subject, text: msg.text }, { Authorization: `Bearer ${key}` });
    if (res.ok) return { status: "SENT" };
    return {
      status: "FAILED",
      error: `Email provider responded ${res.status}`,
      retryable: res.status >= 500 || res.status === 429,
    };
  } catch (e) {
    return { status: "FAILED", error: (e as Error).message, retryable: true };
  }
}

export async function sendSms(msg: { to: string; text: string }): Promise<DeliveryResult> {
  const sid = config.sms.twilioSid();
  const token = config.sms.twilioToken();
  const from = config.sms.twilioFrom();
  if (!sid || !token || !from) return { status: "SKIPPED", error: "SMS provider not configured" };
  if (config.demoMode()) return { status: "SKIPPED", error: "Demo mode: outbound SMS disabled" };
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: msg.to, From: from, Body: msg.text }),
    });
    if (res.ok) return { status: "SENT" };
    return {
      status: "FAILED",
      error: `SMS provider responded ${res.status}`,
      retryable: res.status >= 500 || res.status === 429,
    };
  } catch (e) {
    return { status: "FAILED", error: (e as Error).message, retryable: true };
  }
}

export async function sendPush(msg: { userId: string; title: string; body: string; link?: string | null }): Promise<DeliveryResult> {
  const url = config.push.webhookUrl();
  if (!url) return { status: "SKIPPED", error: "Push gateway not configured" };
  if (config.demoMode()) return { status: "SKIPPED", error: "Demo mode: push disabled" };
  try {
    const res = await postJson(url, msg, {});
    if (res.ok) return { status: "SENT" };
    return {
      status: "FAILED",
      error: `Push gateway responded ${res.status}`,
      retryable: res.status >= 500,
    };
  } catch (e) {
    return { status: "FAILED", error: (e as Error).message, retryable: true };
  }
}

export const smsConfigured = () => Boolean(config.sms.twilioSid() && config.sms.twilioToken() && config.sms.twilioFrom());
export const emailConfigured = () => Boolean(config.email.resendKey() && config.email.from());
