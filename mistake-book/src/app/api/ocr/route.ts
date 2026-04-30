import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/db/schema";

let initialized = false;

function ensureDb() {
  if (!initialized) {
    initDb();
    initialized = true;
  }
}

export async function GET() {
  ensureDb();
  return NextResponse.json({ status: "ok", timestamp: Date.now() });
}

export async function POST(req: NextRequest) {
  ensureDb();
  try {
    const body = await req.json();
    const { imageBase64 } = body as { imageBase64: string };

    if (!imageBase64) {
      return NextResponse.json({ error: "imageBase64 is required" }, { status: 400 });
    }

    const { ocrImage } = await import("@/lib/ai");
    const result = await ocrImage(imageBase64);

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
