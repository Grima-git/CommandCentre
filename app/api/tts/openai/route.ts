import { requireApiAccess, safeText } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OpenAiTtsBody = {
  text?: string;
};

const DEFAULT_OPENAI_TTS_MODEL = "gpt-4o-mini-tts";
const DEFAULT_OPENAI_TTS_VOICE = "onyx";
const DEFAULT_OPENAI_TTS_SPEED = 1.08;

function cleanOpenAiKey(value: string): string {
  const cleaned = value
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^(?:GPT_API_KEY|OPENAI_API_KEY)=/i, "")
    .replace(/^Bearer\s+/i, "")
    .replace(/\s+/g, "")
    .trim();
  return cleaned.match(/sk-[A-Za-z0-9._-]+/)?.[0] ?? cleaned;
}

function getOpenAiKey(): string {
  return cleanOpenAiKey(process.env.GPT_API_KEY || process.env.OPENAI_API_KEY || "");
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
    .replace(/\s+/g, " ")
    .trim();
}

function jsonUnavailable(error: string, status = 503) {
  return Response.json(
    { ok: false, error, fallback: "piper" },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

async function synthesizeOpenAi(text: string): Promise<Response> {
  const apiKey = getOpenAiKey();
  if (!apiKey) return jsonUnavailable("OpenAI TTS key is not configured");

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_TTS_MODEL || DEFAULT_OPENAI_TTS_MODEL,
      voice: process.env.OPENAI_TTS_VOICE || DEFAULT_OPENAI_TTS_VOICE,
      input: humanizeForSpeech(text),
      instructions:
        process.env.OPENAI_TTS_INSTRUCTIONS ||
        "Speak in a warm, calm, lower-register British assistant voice. Keep it smooth, natural, and conversational with brief pauses.",
      response_format: "mp3",
      speed: Number(process.env.OPENAI_TTS_SPEED || DEFAULT_OPENAI_TTS_SPEED),
    }),
    cache: "no-store",
  });

  if (!res.ok) return jsonUnavailable(`OpenAI TTS failed with ${res.status}`, res.status === 401 ? 401 : 503);

  return new Response(await res.arrayBuffer(), {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
      "X-ODIN-Voice": process.env.OPENAI_TTS_VOICE || DEFAULT_OPENAI_TTS_VOICE,
    },
  });
}

export async function POST(req: Request) {
  const access = await requireApiAccess(req, {
    section: "home",
    limit: { windowMs: 60_000, max: 120 },
  });
  if (access.response) return access.response;

  let body: OpenAiTtsBody;
  try {
    body = (await req.json()) as OpenAiTtsBody;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const text = safeText(body.text, 1200);
  if (!text) return Response.json({ ok: false, error: "Text is required" }, { status: 400 });

  try {
    return await synthesizeOpenAi(text);
  } catch {
    return jsonUnavailable("OpenAI TTS is not available");
  }
}
