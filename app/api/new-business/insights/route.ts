import { isDbConfigured, dbQuery, dbQueryOne } from "@/lib/db";
import { requireApiAccess, safeText } from "@/lib/security";
import type { SummaryResponse } from "@/app/api/new-business/summary/route";

export const dynamic = "force-dynamic";

const CACHE_ID = "new-business:ytd:ceo-insights";
const CACHE_SUBJECT = "new-business-ytd";
const CACHE_MS = 48 * 60 * 60 * 1000;

type InsightPayload = {
  headline: string;
  bullets: { title: string; body: string }[];
  opportunities: string[];
  watchouts: string[];
};

type CacheRow = {
  payload: InsightPayload;
  generated_at: string;
  expires_at: string;
};

function cleanOpenAiKey(value: string | undefined): string | null {
  const key = (value ?? "").trim().replace(/^["']|["']$/g, "");
  return key || null;
}

function getOpenAiApiKey(): string | null {
  return cleanOpenAiKey(process.env.GPT_API_KEY) ?? cleanOpenAiKey(process.env.OPENAI_API_KEY);
}

function compactSummary(summary: SummaryResponse) {
  return {
    period: summary.period,
    dateRange: safeText(summary.dateRange, 80),
    totals: {
      policies: summary.totalPolicies,
      written: summary.renewedPolicies,
      gwp: Math.round(summary.gwp),
      netEarn: Math.round(summary.netEarn),
      avgPremium: Math.round(summary.avgPremium),
      totalFees: Math.round(summary.totalFees),
      totalCommission: Math.round(summary.totalCommission),
      totalFinanceFees: Math.round(summary.totalFinanceFees),
      financePenPct: Math.round(summary.financePenPct),
      legalAddonPct: Math.round(summary.legalAddonPct),
      breakdownPct: Math.round(summary.breakdownPct),
    },
    topAdvisors: summary.advisors.slice(0, 15).map((advisor) => ({
      name: safeText(advisor.name, 80),
      policies: advisor.policies,
      gwp: Math.round(advisor.gwp),
      earn: Math.round(advisor.earn),
    })),
    topInsurers: summary.insurers.slice(0, 12).map((insurer) => ({
      insurer: safeText(insurer.insurer, 80),
      count: insurer.count,
      written: insurer.renewedCount,
      gwp: Math.round(insurer.gwp),
      avgGwp: Math.round(insurer.avgGwp),
      sharePct: Math.round(insurer.pct),
    })),
    weekdayBreakdown: (summary.weekdayBreakdown ?? []).map((row) => ({
      weekday: safeText(row.label, 20),
      policies: row.policies,
      gwp: Math.round(row.gwp),
      earn: Math.round(row.earn),
    })),
    advisorWeekdays: (summary.advisorWeekdays ?? []).slice(0, 40).map((row) => ({
      advisor: safeText(row.advisor, 80),
      weekday: safeText(row.label, 20),
      policies: row.policies,
      gwp: Math.round(row.gwp),
      earn: Math.round(row.earn),
    })),
    advisorMonths: (summary.advisorMonths ?? []).slice(0, 80).map((row) => ({
      advisor: safeText(row.advisor, 80),
      month: safeText(row.label, 20),
      policies: row.policies,
      gwp: Math.round(row.gwp),
      earn: Math.round(row.earn),
    })),
    dailyTrend: summary.trend.slice(-90).map((point) => ({
      date: safeText(point.date, 20),
      policies: point.policies,
      gwp: Math.round(point.gwp),
      earn: Math.round(point.earn),
    })),
  };
}

function coerceInsights(value: unknown): InsightPayload | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Partial<InsightPayload>;
  if (typeof obj.headline !== "string" || !Array.isArray(obj.bullets)) return null;
  return {
    headline: safeText(obj.headline, 220),
    bullets: obj.bullets.slice(0, 6).map((item) => ({
      title: safeText((item as { title?: unknown }).title, 80),
      body: safeText((item as { body?: unknown }).body, 260),
    })).filter((item) => item.title && item.body),
    opportunities: Array.isArray(obj.opportunities)
      ? obj.opportunities.slice(0, 4).map((item) => safeText(item, 220)).filter(Boolean)
      : [],
    watchouts: Array.isArray(obj.watchouts)
      ? obj.watchouts.slice(0, 4).map((item) => safeText(item, 220)).filter(Boolean)
      : [],
  };
}

function readOpenAiText(json: unknown): string {
  const response = json as {
    output_text?: string;
    output?: { content?: { type?: string; text?: string }[] }[];
  };
  if (typeof response.output_text === "string") return response.output_text;
  const parts: string[] = [];
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n").trim();
}

async function getCachedInsights(): Promise<CacheRow | null> {
  if (!isDbConfigured()) return null;
  return dbQueryOne<CacheRow>(
    "SELECT payload, generated_at, expires_at FROM cc_ai_insights WHERE id = $1 AND expires_at > NOW()",
    [CACHE_ID],
  );
}

async function saveCachedInsights(payload: InsightPayload, generatedAt: Date, expiresAt: Date) {
  if (!isDbConfigured()) return;
  await dbQuery(
    `INSERT INTO cc_ai_insights (id, subject, generated_at, expires_at, payload)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (id) DO UPDATE
     SET subject = EXCLUDED.subject,
         generated_at = EXCLUDED.generated_at,
         expires_at = EXCLUDED.expires_at,
         payload = EXCLUDED.payload`,
    [CACHE_ID, CACHE_SUBJECT, generatedAt.toISOString(), expiresAt.toISOString(), JSON.stringify(payload)],
  );
}

async function generateInsights(summary: SummaryResponse): Promise<InsightPayload> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) throw new Error("OpenAI API key is not configured");

  const input = compactSummary(summary);
  const instructions = [
    "You are OD1N, a concise executive analyst for an insurance command centre.",
    "Use only the JSON data provided. Do not invent names, numbers, causes, or trends.",
    "Write in plain British business English for a CEO/director.",
    "Focus on commercially useful patterns: advisor performance, weekday trends, insurer mix, margin, attachment rates, drops, and opportunities.",
    "Return strict JSON only with this shape:",
    '{"headline":"string","bullets":[{"title":"string","body":"string"}],"opportunities":["string"],"watchouts":["string"]}',
    "Keep bullets specific and number-led where possible.",
  ].join("\n");

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-5.1",
      instructions,
      input: [{
        role: "user",
        content: [{ type: "input_text", text: JSON.stringify(input) }],
      }],
      max_output_tokens: 900,
    }),
  });

  if (!res.ok) {
    const message = await res.text().catch(() => "");
    throw new Error(`OpenAI failed with ${res.status}${message ? `: ${message.slice(0, 160)}` : ""}`);
  }

  const json = await res.json();
  const text = readOpenAiText(json);
  const parsed = coerceInsights(JSON.parse(text));
  if (!parsed || parsed.bullets.length === 0) {
    throw new Error("OpenAI returned an invalid insight payload");
  }
  return parsed;
}

export async function POST(req: Request) {
  const access = await requireApiAccess(req, {
    section: "new-business",
    limit: { windowMs: 60_000, max: 12 },
  });
  if (access.response) return access.response;

  const body = await req.json().catch(() => null) as { summary?: SummaryResponse; force?: boolean } | null;
  if (!body?.summary || body.summary.period !== "ytd") {
    return Response.json({ ok: false, error: "YTD New Business summary is required" }, { status: 400 });
  }

  if (!body.force) {
    const cached = await getCachedInsights();
    if (cached) {
      return Response.json({
        ok: true,
        cached: true,
        generatedAt: cached.generated_at,
        expiresAt: cached.expires_at,
        insights: cached.payload,
      });
    }
  }

  try {
    const insights = await generateInsights(body.summary);
    const generatedAt = new Date();
    const expiresAt = new Date(generatedAt.getTime() + CACHE_MS);
    await saveCachedInsights(insights, generatedAt, expiresAt);
    return Response.json({
      ok: true,
      cached: false,
      generatedAt: generatedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      insights,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: safeText((error as Error).message, 220) },
      { status: 502 },
    );
  }
}
