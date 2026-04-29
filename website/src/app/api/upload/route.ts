import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_PREFIXES = ["image/", "application/pdf", "text/"];
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

function isAllowed(mime: string): boolean {
  return ALLOWED_PREFIXES.some((p) =>
    p.endsWith("/") ? mime.startsWith(p) : mime === p
  );
}

function safeExt(name: string, mime: string): string {
  const fromName = path.extname(name).toLowerCase().replace(/[^a-z0-9.]/g, "");
  if (fromName && fromName.length <= 6) return fromName;
  if (mime === "application/pdf") return ".pdf";
  if (mime.startsWith("image/")) return `.${mime.split("/")[1]?.replace(/[^a-z0-9]/g, "") || "bin"}`;
  if (mime.startsWith("text/")) return ".txt";
  return ".bin";
}

export async function POST(request: NextRequest) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing 'file' field" }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `File exceeds ${MAX_FILE_BYTES / (1024 * 1024)}MB limit` },
      { status: 413 }
    );
  }

  const mime = file.type || "application/octet-stream";
  if (!isAllowed(mime)) {
    return NextResponse.json({ error: `Unsupported content type: ${mime}` }, { status: 415 });
  }

  const ext = safeExt(file.name, mime);
  const id = crypto.randomBytes(12).toString("hex");
  const storedName = `${Date.now()}-${id}${ext}`;

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(UPLOAD_DIR, storedName), buffer);

  const url = `/uploads/${storedName}`;
  return NextResponse.json({
    url,
    name: storedName,
    originalName: file.name,
    size: file.size,
    contentType: mime,
  });
}

export async function GET() {
  try {
    const files = await fs.readdir(UPLOAD_DIR);
    return NextResponse.json({
      files: files.map((name) => ({ name, url: `/uploads/${name}` })),
    });
  } catch {
    return NextResponse.json({ files: [] });
  }
}
