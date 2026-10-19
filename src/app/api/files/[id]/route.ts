import { getCurrentUser } from "@/lib/auth/current";
import { isAppError } from "@/lib/errors";
import { readFileFor } from "@/lib/services/files";

/** Serves private uploads only to people allowed to see them. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Not found", { status: 404 });
  const { id } = await params;
  try {
    const { file, data } = await readFileFor(user, id);
    const pdf = file.mimeType === "application/pdf";
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": file.mimeType,
        // PDFs download rather than render inline, so no uploaded document runs in our origin.
        "Content-Disposition": `${pdf ? "attachment" : "inline"}; filename="call-recon-${file.id}.${pdf ? "pdf" : file.mimeType.split("/")[1]}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; sandbox",
      },
    });
  } catch (e) {
    if (isAppError(e)) return new Response("Not found", { status: 404 });
    console.error("[files]", e);
    return new Response("Server error", { status: 500 });
  }
}
