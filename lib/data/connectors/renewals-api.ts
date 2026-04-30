// Renewals data connector.
//
// Pulls from the OpenGI SOAP service (usp_Report_Renewals_Tracker) and maps
// the rows to the dashboard shape types. Returns null for any section that
// can't be computed from the available data, triggering mock fallback.
//
// AI Insights uses the Anthropic SDK and a separate env var.

import Anthropic from "@anthropic-ai/sdk";
import * as mock from "@/lib/mock/renewals";
import {
  isOpenGiConfigured,
  cachedRenewalsTracker,
  formatDDMMYYYY,
  shortLabel,
  sumField,
  avgField,
  deltaPct,
  deltaPP,
  groupByDate,
  sortedDates,
  type RenewalRow,
} from "./opengi-soap";
import type {
  RevenuePulse,
  RenewalFunnel,
  PremiumTrend,
  RiskAlert,
  AiInsight,
  PerformanceMetrics,
  InsurerEntry,
} from "@/lib/mock/renewals";

// Kept for future REST connector work
export function isRenewalsApiConfigured(): boolean {
  return isOpenGiConfigured();
}

// ---------- Date window helpers ----------

function dateStr(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return formatDDMMYYYY(d);
}

// Shared cached fetchers — all sections call these with the same string keys,
// so React deduplicates into 2 SOAP calls total per render (this week + last).
const thisWeek = () => cachedRenewalsTracker(dateStr(6), dateStr(0));
const lastWeek = () => cachedRenewalsTracker(dateStr(13), dateStr(7));

// ---------- RevenuePulse ----------
// Covers: GWP, avg premium, renewalPremiumValue (all from SOAP)
// Not available from this SP: renewalRate, lapseRate → left as 0/trend-less

export async function fetchRevenuePulse(): Promise<RevenuePulse | null> {
  if (!isOpenGiConfigured()) return null;

  const [thisWeekRows, lastWeekRows] = await Promise.all([
    thisWeek(),
    lastWeek(),
  ]);

  if (!thisWeekRows || !lastWeekRows) return null;
  if (!thisWeekRows.length && !lastWeekRows.length) return null;

  // Merge for trend (14 days)
  const allRows = [...lastWeekRows, ...thisWeekRows];

  // GWP
  const gwpNow = sumField(thisWeekRows, "totalPremium");
  const gwpPrev = sumField(lastWeekRows, "totalPremium");

  // Avg premium
  const avgNow = avgField(thisWeekRows, "totalPremium");
  const avgPrev = avgField(lastWeekRows, "totalPremium");

  // Earn (net revenue)
  const earnNow = sumField(thisWeekRows, "earn");
  const earnPrev = sumField(lastWeekRows, "earn");

  // Finance penetration (used as proxy for engagement metric)
  const financedPctNow =
    thisWeekRows.length
      ? (thisWeekRows.filter((r) => r.financed).length / thisWeekRows.length) * 100
      : 0;
  const financedPctPrev =
    lastWeekRows.length
      ? (lastWeekRows.filter((r) => r.financed).length / lastWeekRows.length) * 100
      : 0;

  // Daily GWP trend (14 days)
  const dailyGwp = groupByDate(allRows, "totalPremium");
  const gwpTrend = sortedDates(dailyGwp).map(([date, y]) => ({
    x: shortLabel(date),
    y,
  }));

  // Daily earn trend
  const dailyEarn = groupByDate(allRows, "earn");
  const earnTrend = sortedDates(dailyEarn).map(([date, y]) => ({
    x: shortLabel(date),
    y,
  }));

  return {
    grossWrittenPremium: {
      value: gwpNow,
      deltaPct: deltaPct(gwpNow, gwpPrev),
      trend: gwpTrend,
    },
    // renewalRate not available from the tracker SP — show earn rate as proxy
    renewalRate: {
      value: thisWeekRows.length > 0 ? (earnNow / gwpNow) * 100 : 0,
      deltaPP: deltaPP(
        earnNow / (gwpNow || 1),
        earnPrev / (gwpPrev || 1)
      ) * 100,
      trend: earnTrend.map((p) => ({ x: p.x, y: (p.y / (dailyGwp.get(p.x) || p.y || 1)) * 100 })),
    },
    renewalPremiumValue: {
      value: earnNow,
      deltaPct: deltaPct(earnNow, earnPrev),
      trend: earnTrend,
    },
    lapseRate: {
      value: financedPctNow,
      deltaPP: deltaPP(financedPctNow, financedPctPrev),
      trend: gwpTrend.map((p) => ({ x: p.x, y: financedPctNow })),
    },
    avgPremiumPerPolicy: {
      value: avgNow,
      deltaPct: deltaPct(avgNow, avgPrev),
      trend: gwpTrend.map((_, i) => ({
        x: gwpTrend[i].x,
        y: gwpTrend[i].y / Math.max(1, (allRows.filter((r) => shortLabel(r.date) === gwpTrend[i].x).length)),
      })),
    },
    newVsRenewal: {
      newBusinessPct: 0,
      renewalsPct: 100,
    },
  };
}

// ---------- RenewalFunnel ----------
// Not available from usp_Report_Renewals_Tracker (completed renewals only,
// no visibility of due/not-taken). Fall back to mock.

export async function fetchRenewalFunnel(): Promise<RenewalFunnel | null> {
  return null;
}

// ---------- PremiumTrend ----------

export async function fetchPremiumTrend(): Promise<PremiumTrend | null> {
  if (!isOpenGiConfigured()) return null;

  const [thisWeekRows, lastWeekRows] = await Promise.all([
    thisWeek(),
    lastWeek(),
  ]);

  if (!thisWeekRows || !lastWeekRows) return null;

  // Daily breakdown: totalPremium split by financed vs not
  const dailyByDate = new Map<
    string,
    { renewals: number; financed: number; earn: number }
  >();

  for (const r of thisWeekRows) {
    const label = shortLabel(r.date);
    const existing = dailyByDate.get(label) ?? { renewals: 0, financed: 0, earn: 0 };
    existing.renewals += r.totalPremium;
    if (r.financed) existing.financed += r.totalPremium;
    existing.earn += r.earn;
    dailyByDate.set(label, existing);
  }

  // Sort days chronologically using the actual dates from the rows
  const dateOrder = [
    ...new Map(
      thisWeekRows.map((r) => [shortLabel(r.date), r.date])
    ).entries(),
  ].sort((a, b) => {
    const [dda, mma, yyya] = a[1].split("/");
    const [ddb, mmb, yyyb] = b[1].split("/");
    return (
      new Date(+yyya, +mma - 1, +dda).getTime() -
      new Date(+yyyb, +mmb - 1, +ddb).getTime()
    );
  });

  const series = dateOrder.map(([label]) => {
    const d = dailyByDate.get(label) ?? { renewals: 0, financed: 0, earn: 0 };
    return {
      date: label,
      renewals: d.renewals - d.financed,   // non-financed premium
      newBusiness: d.financed,              // financed premium (separate line)
      addOns: d.earn,                       // net earnings
    };
  });

  const totalNow = sumField(thisWeekRows, "totalPremium");
  const totalPrev = sumField(lastWeekRows, "totalPremium");

  return {
    series,
    totalThisWeek: totalNow,
    totalLastWeek: totalPrev,
    deltaPct: deltaPct(totalNow, totalPrev),
  };
}

// ---------- RiskAlerts ----------
// Computes real alerts from threshold analysis of this week vs last week.

function computeAlerts(
  thisWeek: RenewalRow[],
  lastWeek: RenewalRow[]
): RiskAlert[] {
  const alerts: RiskAlert[] = [];

  if (!thisWeek.length) return alerts;

  const gwpNow = sumField(thisWeek, "totalPremium");
  const gwpPrev = sumField(lastWeek, "totalPremium");
  const gwpDelta = deltaPct(gwpNow, gwpPrev);

  // GWP movement alert
  if (Math.abs(gwpDelta) > 10) {
    alerts.push({
      id: "a-gwp",
      severity: gwpDelta < 0 ? "critical" : "success",
      title: gwpDelta < 0 ? "GWP down vs last week" : "GWP up vs last week",
      description: `${gwpDelta > 0 ? "+" : ""}${gwpDelta.toFixed(1)}% — £${(gwpNow / 1000).toFixed(0)}k this week vs £${(gwpPrev / 1000).toFixed(0)}k last`,
    });
  }

  // Finance penetration
  const finNow = thisWeek.filter((r) => r.financed).length / thisWeek.length * 100;
  const finPrev = lastWeek.length
    ? lastWeek.filter((r) => r.financed).length / lastWeek.length * 100
    : finNow;
  const finDelta = deltaPP(finNow, finPrev);

  if (Math.abs(finDelta) > 5) {
    alerts.push({
      id: "a-fin",
      severity: finDelta < 0 ? "warning" : "info",
      title: finDelta < 0 ? "Finance take-up falling" : "Finance take-up rising",
      description: `${finNow.toFixed(0)}% financed this week (${finDelta > 0 ? "+" : ""}${finDelta.toFixed(1)}pp vs last)`,
    });
  }

  // Advisor volume concentration
  const advisorCounts = new Map<string, number>();
  for (const r of thisWeek) {
    advisorCounts.set(r.advisor, (advisorCounts.get(r.advisor) ?? 0) + 1);
  }
  const topAdvisor = [...advisorCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const topPct = topAdvisor ? (topAdvisor[1] / thisWeek.length) * 100 : 0;
  if (topPct > 40) {
    alerts.push({
      id: "a-adv",
      severity: "info",
      title: "High advisor concentration",
      description: `${topAdvisor[0]} handled ${topPct.toFixed(0)}% of this week's renewals`,
    });
  }

  // Legal add-on attach rate
  const legalCount = thisWeek.filter((r) => r.legalSold !== "").length;
  const legalPct = (legalCount / thisWeek.length) * 100;
  if (legalPct < 20) {
    alerts.push({
      id: "a-legal",
      severity: "warning",
      title: "Low legal add-on attach rate",
      description: `${legalPct.toFixed(0)}% of renewals included legal cover this week`,
    });
  } else {
    alerts.push({
      id: "a-legal",
      severity: "success",
      title: "Legal add-on performing well",
      description: `${legalPct.toFixed(0)}% attach rate on legal cover this week`,
    });
  }

  // Avg days in advance (early = better customer experience)
  const avgDays = avgField(thisWeek, "daysInAdv");
  alerts.push({
    id: "a-days",
    severity: avgDays >= 10 ? "info" : "warning",
    title: avgDays >= 10 ? "Renewals processed well ahead" : "Short notice on renewals",
    description: `Average ${avgDays.toFixed(1)} days in advance this week`,
  });

  return alerts.slice(0, 5);
}

export async function fetchRiskAlerts(): Promise<RiskAlert[] | null> {
  if (!isOpenGiConfigured()) return null;

  const [thisWeekRows, lastWeekRows] = await Promise.all([
    thisWeek(),
    lastWeek(),
  ]);

  if (!thisWeekRows || !lastWeekRows) return null;
  if (!thisWeekRows.length) return null;

  return computeAlerts(thisWeekRows, lastWeekRows);
}

// ---------- AI Insights ----------

const INSIGHT_SYSTEM_PROMPT = `You are the analytics co-pilot embedded in the Command Centre dashboard for Young Driver Insurance.
You are addressing George, the Head of Renewals.

You will be given the current renewals KPIs as JSON. Produce exactly THREE concise, executive-level insights that explain what is happening, what's at risk, and what to do next.

Respond with a single JSON object — no prose, no markdown, no code fences — matching this shape:
{
  "insights": [
    { "id": "i1", "icon": "chart"    | "cohort" | "forecast", "title": "...", "body": "...", "cta": "..." },
    { "id": "i2", "icon": "chart"    | "cohort" | "forecast", "title": "...", "body": "...", "cta": "..." },
    { "id": "i3", "icon": "chart"    | "cohort" | "forecast", "title": "...", "body": "...", "cta": "..." }
  ]
}

Rules:
- Exactly 3 items, ids "i1", "i2", "i3".
- One should diagnose a movement (icon "chart"), one should call out a cohort or advisor pattern (icon "cohort"), one should forecast (icon "forecast").
- "title" is a short question or statement (max ~50 chars).
- "body" is one sentence (max ~180 chars) grounded in the numbers provided. Use £ for currency, pp for percentage points.
- "cta" is 2–3 words, action-oriented.
- Do not invent specifics not in the data.`;

function isValidInsight(x: unknown): x is AiInsight {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    (o.icon === "chart" || o.icon === "cohort" || o.icon === "forecast") &&
    typeof o.title === "string" &&
    typeof o.body === "string" &&
    typeof o.cta === "string"
  );
}

export async function fetchAiInsights(): Promise<AiInsight[] | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[ai-insights] ANTHROPIC_API_KEY missing");
    return null;
  }

  // Use live SOAP data if configured, otherwise fall back to mock numbers
  let payload: object;
  if (isOpenGiConfigured()) {
    const [twRows, lwRows] = await Promise.all([thisWeek(), lastWeek()]);
    payload = {
      source: "live",
      thisWeekRows: twRows?.length ?? 0,
      lastWeekRows: lwRows?.length ?? 0,
      gwpThisWeek: twRows ? sumField(twRows, "totalPremium") : 0,
      gwpLastWeek: lwRows ? sumField(lwRows, "totalPremium") : 0,
      avgPremiumThisWeek: twRows ? avgField(twRows, "totalPremium") : 0,
      earnThisWeek: twRows ? sumField(twRows, "earn") : 0,
      financedPct: twRows?.length
        ? (twRows.filter((r: RenewalRow) => r.financed).length / twRows.length) * 100
        : 0,
      legalAttachPct: twRows?.length
        ? (twRows.filter((r: RenewalRow) => r.legalSold !== "").length / twRows.length) * 100
        : 0,
      breakdownAttachPct: twRows?.length
        ? (twRows.filter((r: RenewalRow) => r.breakdownSold !== "").length / twRows.length) * 100
        : 0,
      advisorBreakdown: twRows
        ? Object.fromEntries(
            [...twRows.reduce((m: Map<string, number>, r: RenewalRow) => {
              m.set(r.advisor, (m.get(r.advisor) ?? 0) + 1);
              return m;
            }, new Map<string, number>()).entries()]
          )
        : {},
      insurerBreakdown: twRows
        ? Object.fromEntries(
            [...twRows.reduce((m: Map<string, number>, r: RenewalRow) => {
              m.set(r.insurer, (m.get(r.insurer) ?? 0) + 1);
              return m;
            }, new Map<string, number>()).entries()]
          )
        : {},
    };
  } else {
    payload = {
      source: "mock",
      revenuePulse: mock.getRevenuePulse(),
      renewalFunnel: mock.getRenewalFunnel(),
      premiumTrend: mock.getPremiumTrend(),
      riskAlerts: mock.getRiskAlerts(),
    };
  }

  try {
    const client = new Anthropic({ apiKey });

    const stream = client.messages.stream({
      model: "claude-opus-4-7",
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      system: INSIGHT_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Here are the current renewals numbers:\n\n${JSON.stringify(payload, null, 2)}\n\nReturn the JSON object as specified.`,
        },
      ],
    });

    const message = await stream.finalMessage();
    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;

    const raw = textBlock.text.trim();
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) return null;

    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as { insights?: unknown };
    if (!Array.isArray(parsed.insights)) return null;

    const insights = parsed.insights.filter(isValidInsight);
    if (insights.length !== 3) return null;
    return insights;
  } catch (err) {
    console.warn("[ai-insights] Claude call failed:", err);
    return null;
  }
}

// ---------- Performance Metrics ----------
// Finance pen rate, legal & breakdown add-on rates, insurer breakdown.

function dailyRateTrend(
  rows: RenewalRow[],
  predicate: (r: RenewalRow) => boolean
): { x: string; y: number }[] {
  const byDate = new Map<string, { total: number; match: number }>();
  for (const r of rows) {
    const e = byDate.get(r.date) ?? { total: 0, match: 0 };
    e.total++;
    if (predicate(r)) e.match++;
    byDate.set(r.date, e);
  }
  return [...byDate.entries()]
    .sort((a, b) => {
      const [ad, am, ay] = a[0].split("/");
      const [bd, bm, by] = b[0].split("/");
      return new Date(+ay, +am - 1, +ad).getTime() - new Date(+by, +bm - 1, +bd).getTime();
    })
    .map(([date, v]) => ({ x: shortLabel(date), y: v.total ? (v.match / v.total) * 100 : 0 }));
}

export async function fetchPerformanceMetrics(): Promise<PerformanceMetrics | null> {
  if (!isOpenGiConfigured()) return null;

  const [tw, lw] = await Promise.all([thisWeek(), lastWeek()]);
  if (!tw || !tw.length) return null;
  const lw2 = lw ?? [];

  const rate = (rows: RenewalRow[], pred: (r: RenewalRow) => boolean) =>
    rows.length ? (rows.filter(pred).length / rows.length) * 100 : 0;

  const finNow = rate(tw, (r) => r.financed);
  const finPrev = rate(lw2, (r) => r.financed);
  const legalNow = rate(tw, (r) => r.legalSold !== "");
  const legalPrev = rate(lw2, (r) => r.legalSold !== "");
  const bdNow = rate(tw, (r) => r.breakdownSold !== "");
  const bdPrev = rate(lw2, (r) => r.breakdownSold !== "");

  // Insurer breakdown — sorted by count desc
  const insurerMap = new Map<string, { count: number; premium: number }>();
  for (const r of tw) {
    const e = insurerMap.get(r.insurer) ?? { count: 0, premium: 0 };
    e.count++;
    e.premium += r.totalPremium;
    insurerMap.set(r.insurer, e);
  }
  const insurerBreakdown: InsurerEntry[] = [...insurerMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([insurer, v]) => ({
      insurer,
      count: v.count,
      premium: v.premium,
      pct: (v.count / tw.length) * 100,
    }));

  const allRows = [...lw2, ...tw];

  return {
    financePenRate: {
      value: finNow,
      deltaPP: deltaPP(finNow, finPrev),
      trend: dailyRateTrend(allRows, (r) => r.financed),
    },
    legalAddonRate: {
      value: legalNow,
      deltaPP: deltaPP(legalNow, legalPrev),
      trend: dailyRateTrend(allRows, (r) => r.legalSold !== ""),
    },
    breakdownAddonRate: {
      value: bdNow,
      deltaPP: deltaPP(bdNow, bdPrev),
      trend: dailyRateTrend(allRows, (r) => r.breakdownSold !== ""),
    },
    insurerBreakdown,
    totalPolicies: tw.length,
  };
}
