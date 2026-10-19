import { NextResponse, type NextRequest } from "next/server";

/**
 * DEMO_SITE="true" turns the deployment into a public concept site: only the launch page and the sample-data
 * demos are reachable, so nothing that needs a database, a login or a payment can be hit by a visitor.
 */
const OPEN = /^\/(launch|demo(\/.*)?|healthz|icon\.svg|_next\/.*)$/;

export function middleware(req: NextRequest) {
  if (process.env.DEMO_SITE !== "true") return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (OPEN.test(pathname)) return NextResponse.next();
  return NextResponse.redirect(new URL("/launch", req.url), 307);
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
