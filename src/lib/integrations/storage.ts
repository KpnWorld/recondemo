import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { config } from "@/lib/env";
import { AppError } from "@/lib/errors";

/**
 * Private file storage. Files live outside /public and are only served through
 * /api/files/[id], which checks the viewer's access. Swap this module for an
 * S3-compatible implementation (same three functions) in production.
 */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const SIGNATURES: {
  mime: string;
  ext: string;
  test: (b: Buffer) => boolean;
}[] = [
  {
    mime: "image/jpeg",
    ext: "jpg",
    test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: "image/png",
    ext: "png",
    test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: "image/webp",
    ext: "webp",
    test: (b) => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP",
  },
  {
    mime: "application/pdf",
    ext: "pdf",
    test: (b) => b.subarray(0, 5).toString() === "%PDF-",
  },
];

/** Identify a file by its contents, not by the name or browser-supplied type. */
export function sniffType(buf: Buffer) {
  return SIGNATURES.find((s) => s.test(buf)) ?? null;
}

const root = () => path.resolve(config.storage.dir());

export async function putFile(buf: Buffer, opts: { allowPdf: boolean }) {
  if (buf.length === 0) throw new AppError("VALIDATION", "The file is empty.");
  if (buf.length > MAX_UPLOAD_BYTES) throw new AppError("VALIDATION", "Files must be 10 MB or smaller.");
  const type = sniffType(buf);
  if (!type || (!opts.allowPdf && type.mime === "application/pdf")) {
    throw new AppError("VALIDATION", opts.allowPdf ? "Please upload a JPG, PNG, WebP or PDF file." : "Please upload a JPG, PNG or WebP photo.");
  }
  const key = `${new Date().toISOString().slice(0, 7)}/${randomBytes(16).toString("hex")}.${type.ext}`;
  const full = path.join(root(), key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, buf, { mode: 0o600 });
  return { storageKey: key, mimeType: type.mime, sizeBytes: buf.length };
}

function resolveKey(key: string) {
  const full = path.resolve(root(), key);
  if (!full.startsWith(root() + path.sep)) throw new AppError("FORBIDDEN", "Invalid file path.");
  return full;
}

export const getFile = (key: string) => readFile(resolveKey(key));
export const deleteFile = (key: string) => unlink(resolveKey(key)).catch(() => {});
