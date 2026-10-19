export const dynamic = "force-dynamic";

/** Liveness only, no database. Used by the Docker health check. */
export function GET() {
  return Response.json({ ok: true });
}
