import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current";
import { isAppError } from "@/lib/errors";
import { updateProviderLocation } from "@/lib/services/providers";

/** Receives real device location from a provider's browser while they're online or on a job. */
export async function POST(req: Request) {
  // Same-origin only (defense in depth on top of SameSite cookies).
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user || user.role !== "PROVIDER") return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  try {
    const body = await req.json();
    await updateProviderLocation(user, Number(body.lat), Number(body.lng));
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (isAppError(e)) return NextResponse.json({ error: e.message }, { status: e.httpStatus });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
