import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";

// Raster formats every major browser can actually render from an <img src="...">
// without a plugin — HEIC/HEIF and TIFF are excluded even though phones commonly produce
// them, since Chrome/Firefox can't display them and an upload that silently renders as a
// broken image is worse than not accepting it. SVG is deliberately excluded too: it's a
// well-known upload-XSS vector (an uploaded file is served statically from /uploads/, and
// a browser navigated directly to that URL executes any <script> embedded in the SVG,
// unlike an <img>-embedded one) — not worth taking on without a sanitization step.
const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/bmp": "bmp",
};

const MAX_BYTES = 3 * 1024 * 1024;
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

export async function POST(req: NextRequest) {
  const body = await req.json();
  const dataUrl = String(body.dataUrl || "");
  const match = /^data:(image\/[a-z]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return NextResponse.json({ error: "Invalid image data" }, { status: 400 });

  const [, mimeType, base64] = match;
  const ext = ALLOWED_TYPES[mimeType];
  if (!ext) return NextResponse.json({ error: "Unsupported image type" }, { status: 400 });

  const buffer = Buffer.from(base64, "base64");
  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large (max 3MB)" }, { status: 400 });
  }

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const filename = `${crypto.randomUUID()}.${ext}`;
  await fs.writeFile(path.join(UPLOAD_DIR, filename), buffer);

  return NextResponse.json({ url: `/uploads/${filename}` });
}
