import { requireApiAccess, safeText } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PiperBody = {
  text?: string;
};

const DEFAULT_PIPER_URL = "http://127.0.0.1:5000";
const DEFAULT_PIPER_VOICE = "en_GB-northern_english_male-medium";

function getPiperUrl(): string {
  const raw = process.env.PIPER_TTS_URL;
  if (!raw) {
    // In production the env var must be set; fall back to localhost only in dev.
    if (process.env.NODE_ENV === "production") throw new Error("PIPER_TTS_URL not configured");
    return DEFAULT_PIPER_URL;
  }
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Invalid PIPER_TTS_URL protocol");
  return url.toString().replace(/\/$/, "");
}

function humanizeForSpeech(text: string): string {
  return text
    .replace(/\bODIN\b/gi, "Odin")
    .replace(/\bOD1N\b/g, "Odin")
    .replace(/\bGWP\b/g, "G W P")
    .replace(/\bYTD\b/g, "year to date")
    .replace(/\bavg\b/gi, "average")
    .replace(/\bOK\b/g, "okay")
    .replace(/\s+-\s+/g, ", ")
    .replace(/:\s+/g, ". ")
    .replace(/;\s+/g, ". ")
    .replace(/,\s+/g, ", ")
    .replace(/\b(Right|Okay|Alright|Got it|Perfect)\b,?/i, "$1,")
    .replace(/\s+/g, " ")
    .trim();
}

async function synthesizePiper(text: string): Promise<Response> {
  const res = await fetch(getPiperUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: humanizeForSpeech(text),
      voice: process.env.PIPER_TTS_VOICE || DEFAULT_PIPER_VOICE,
      length_scale: Number(process.env.PIPER_TTS_LENGTH_SCALE || "1.02"),
      noise_scale: Number(process.env.PIPER_TTS_NOISE_SCALE || "0.68"),
      noise_w_scale: Number(process.env.PIPER_TTS_NOISE_W_SCALE || "0.82"),
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    return Response.json({ ok: false, error: "Piper did not return audio" }, { status: 502 });
  }

  return new Response(await res.arrayBuffer(), {
    headers: {
      "Content-Type": "audio/wav",
      "Cache-Control": "no-store",
      "X-ODIN-Voice": process.env.PIPER_TTS_VOICE || DEFAULT_PIPER_VOICE,
    },
  });
}

export async function POST(req: Request) {
  const access = await requireApiAccess(req, {
    section: "home",
    limit: { windowMs: 60_000, max: 120 },
  });
  if (access.response) return access.response;

  let body: PiperBody;
  try {
    body = (await req.json()) as PiperBody;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const text = safeText(body.text, 600);
  if (!text) return Response.json({ ok: false, error: "Text is required" }, { status: 400 });

  try {
    return await synthesizePiper(text);
  } catch {
    return Response.json({ ok: false, error: "Piper TTS is not available" }, { status: 502 });
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost" && url.hostname !== "::1") {
    return Response.json({ ok: false, error: "Local test only" }, { status: 403 });
  }

  const text = safeText(url.searchParams.get("text") || "ODIN Piper voice test.", 200);
  try {
    return await synthesizePiper(text);
  } catch {
    return Response.json({ ok: false, error: "Piper TTS is not available" }, { status: 502 });
  }
}
