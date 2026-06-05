import {
  fetchRenewalsTracker,
  formatDDMMYYYY,
  parseDDMMYYYY,
  shortLabel,
} from "@/lib/data/connectors/opengi-soap";
import type { RenewalRow } from "@/lib/data/connectors/opengi-soap";
import { requireApiAccess } from "@/lib/security";
import { cacheTtlForPeriod, getCached } from "@/lib/server-cache";

export const dynamic = "force-dynamic";

export type TrendPoint = { date: string; policies: number; gwp: number; earn: number };
export type AdvisorRow = { name: string; policies: number; gwp: number; earn: number };
export type InsurerRow = {
  insurer: string;
  count: number;
  renewedCount: number;
  gwp: number;
  avgGwp: number;
  pct: number;
};
export type PolicyRow = {
  policyRef: string;
  clientName: string;
  insurer: string;
  totalPremium: number;
  financeFees: number;
  fees: number;
  commission: number;
  earn: number;
  financed: boolean;
  legalSold: string;
  breakdownSold: string;
  advisor: string;
  inceptionDate: string;
  daysInAdv: number;
};

export type SummaryResponse = {
  ok: true;
  period: string;
  dateRange: string;
  totalPolicies: number;
  renewedPolicies: number;
  gwp: number;
  netEarn: number;
  avgPremium: number;
  totalFees: number;
  totalCommission: number;
  totalFinanceFees: number;
  financePenPct: number;
  legalAddonPct: number;
  breakdownPct: number;
  trend: TrendPoint[];
  advisors: AdvisorRow[];
  insurers: InsurerRow[];
  policies: PolicyRow[];
};

// ---------------------------------------------------------------------------
// For large date ranges (month / ytd), chunk into months and fetch in parallel.
// Each monthly SOAP call is small and fast; parallel execution beats one slow
// big query that risks the Netlify 26 s timeout.
// ---------------------------------------------------------------------------
async function fetchTrackerForPeriod(
  start: Date,
  end: Date,
): Promise<RenewalRow[] | null> {
  const daysDiff = (end.getTime() - start.getTime()) / 86_400_000;

  // Small ranges: single call, no chunking needed
  if (daysDiff <= 62) {
    return fetchRenewalsTracker(start, end);
  }

  // Build monthly chunks covering [start, end]
  const chunks: [Date, Date][] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= end) {
    const chunkStart = new Date(Math.max(cursor.getTime(), start.getTime()));
    const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);
    const chunkEnd = lastDay < end ? lastDay : new Date(end);
    chunks.push([chunkStart, chunkEnd]);
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const results = await Promise.all(chunks.map(([s, e]) => fetchRenewalsTracker(s, e)));
  if (results.some((r) => r === null)) return null;

  // Deduplicate by policyRef + inceptionDate (advance renewals can appear in
  // the lookback window AND the main month window)
  const seen = new Set<string>();
  const merged: RenewalRow[] = [];
  for (const chunk of results) {
    for (const row of chunk!) {
      const key = `${row.policyRef.trim().toLowerCase()}|${row.inceptionDate}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(row);
      }
    }
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Date range helpers
// ---------------------------------------------------------------------------

type DateWindow = {
  queryStart: Date; // what we ask the SOAP proc for (may look back for advances)
  queryEnd: Date;
  displayStart: Date; // what we show in the UI date label
  displayEnd: Date;
};

function getDateWindow(period: string, now: Date): DateWindow {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  if (period === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { queryStart: start, queryEnd: end, displayStart: start, displayEnd: end };
  }

  if (period === "week") {
    const start = new Date(now);
    const day = now.getDay();
    start.setDate(now.getDate() + (day === 0 ? -6 : 1 - day));
    start.setHours(0, 0, 0, 0);
    return { queryStart: start, queryEnd: end, displayStart: start, displayEnd: end };
  }

  if (period === "month") {
    const displayStart = new Date(now.getFullYear(), now.getMonth(), 1);
    // Look back 30 days so advance renewals (processed before month start but
    // with an inception date this month) are included — matches the pipeline.
    const queryStart = new Date(displayStart);
    queryStart.setDate(queryStart.getDate() - 30);
    return { queryStart, queryEnd: end, displayStart, displayEnd: end };
  }

  if (period === "ytd") {
    const displayStart = new Date(now.getFullYear(), 0, 1);
    const queryStart = new Date(displayStart);
    queryStart.setDate(queryStart.getDate() - 30);
    return { queryStart, queryEnd: end, displayStart, displayEnd: end };
  }

  // fallback: today
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return { queryStart: start, queryEnd: end, displayStart: start, displayEnd: end };
}

function parseIsoDateParam(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [yyyy, mm, dd] = value.split("-").map(Number);
  const date = new Date(yyyy, mm - 1, dd);
  if (
    date.getFullYear() !== yyyy ||
    date.getMonth() !== mm - 1 ||
    date.getDate() !== dd
  ) {
    return null;
  }
  return date;
}

function formatDateRange(start: Date, end: Date): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  if (fmt(start) === fmt(end)) return fmt(start);
  return `${fmt(start)} – ${fmt(end)}`;
}

// For month / ytd we filter the raw rows down to those whose inceptionDate
// falls within the display window — this is what the pipeline uses too.
function filterByInceptionDate(
  rows: RenewalRow[],
  start: Date,
  end: Date,
): RenewalRow[] {
  const s = new Date(start); s.setHours(0, 0, 0, 0);
  const e = new Date(end);   e.setHours(23, 59, 59, 999);
  return rows.filter((r) => {
    if (!r.inceptionDate) return false;
    try {
      const d = parseDDMMYYYY(r.inceptionDate);
      return d >= s && d <= e;
    } catch {
      return false;
    }
  });
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  const access = await requireApiAccess(req, {
    section: "renewals",
    limit: { windowMs: 60_000, max: 60 },
  });
  if (access.response) return access.response;

  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") ?? "today";
  const now = new Date();

  let { queryStart, queryEnd, displayStart, displayEnd } = getDateWindow(period, now);
  if (period === "custom") {
    const from = parseIsoDateParam(searchParams.get("from"));
    const to = parseIsoDateParam(searchParams.get("to"));
    if (!from || !to) {
      return Response.json({ ok: false, error: "Invalid custom date range" }, { status: 400 });
    }
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);
    if (from > to) {
      return Response.json({ ok: false, error: "From date must be before To date" }, { status: 400 });
    }
    queryStart = from;
    queryEnd = to;
    displayStart = from;
    displayEnd = to;
  }

  const rawRows = await getCached(
    `renewals:summary:tracker:${period}:${formatDDMMYYYY(queryStart)}:${formatDDMMYYYY(queryEnd)}`,
    cacheTtlForPeriod(period),
    () => fetchTrackerForPeriod(queryStart, queryEnd),
  );
  if (!rawRows) {
    return Response.json({ ok: false, error: "Could not reach data source" }, { status: 502 });
  }

  // For month/ytd, narrow to policies whose inception date falls in the display
  // window — this aligns with the pipeline's "344 renewed in May" count.
  const rows =
    period === "month" || period === "ytd"
      ? filterByInceptionDate(rawRows, displayStart, displayEnd)
      : rawRows;

  const n = rows.length;
  const renewedRows = rows.filter((r) => r.totalPremium > 0 || r.earn > 0);
  const renewedN = renewedRows.length;
  const gwp = rows.reduce((s, r) => s + r.totalPremium, 0);
  const earn = rows.reduce((s, r) => s + r.earn, 0);
  const totalFees = rows.reduce((s, r) => s + r.fees, 0);
  const totalCommission = rows.reduce((s, r) => s + r.commission, 0);
  const totalFinanceFees = rows.reduce((s, r) => s + r.financeFees, 0);

  // Trend: for month/ytd group by inception date; for today/week by processed date
  const dateField: keyof RenewalRow = period === "month" || period === "ytd" ? "inceptionDate" : "date";
  const trendMap = new Map<string, { policies: number; gwp: number; earn: number }>();
  for (const r of rows) {
    const rawDate = (r[dateField] as string) || r.date;
    if (!rawDate) continue;
    const label = shortLabel(rawDate);
    const e = trendMap.get(label) ?? { policies: 0, gwp: 0, earn: 0 };
    e.policies++;
    e.gwp += r.totalPremium;
    e.earn += r.earn;
    trendMap.set(label, e);
  }
  const trend: TrendPoint[] = [...trendMap.entries()]
    .sort((a, b) => {
      const rowA = rows.find((r) => {
        const d = (r[dateField] as string) || r.date;
        return d && shortLabel(d) === a[0];
      });
      const rowB = rows.find((r) => {
        const d = (r[dateField] as string) || r.date;
        return d && shortLabel(d) === b[0];
      });
      if (!rowA || !rowB) return 0;
      const dA = (rowA[dateField] as string) || rowA.date;
      const dB = (rowB[dateField] as string) || rowB.date;
      const [da, ma, ya] = dA.split("/");
      const [db, mb, yb] = dB.split("/");
      return new Date(+ya, +ma - 1, +da).getTime() - new Date(+yb, +mb - 1, +db).getTime();
    })
    .map(([date, v]) => ({ date, ...v }));

  // Advisors
  const advMap = new Map<string, { policies: number; gwp: number; earn: number }>();
  for (const r of rows) {
    if (!r.advisor) continue;
    const e = advMap.get(r.advisor) ?? { policies: 0, gwp: 0, earn: 0 };
    e.policies++;
    e.gwp += r.totalPremium;
    e.earn += r.earn;
    advMap.set(r.advisor, e);
  }
  const advisors: AdvisorRow[] = [...advMap.entries()]
    .sort((a, b) => b[1].policies - a[1].policies)
    .map(([name, v]) => ({ name, ...v }));

  // Insurers
  const insMap = new Map<string, { count: number; renewedCount: number; gwp: number }>();
  for (const r of rows) {
    const ins = r.insurer || "Unknown";
    const e = insMap.get(ins) ?? { count: 0, renewedCount: 0, gwp: 0 };
    e.count++;
    if (r.totalPremium > 0 || r.earn > 0) e.renewedCount++;
    e.gwp += r.totalPremium;
    insMap.set(ins, e);
  }
  const insurers: InsurerRow[] = [...insMap.entries()]
    .sort((a, b) => b[1].gwp - a[1].gwp)
    .map(([insurer, v]) => ({
      insurer,
      count: v.count,
      renewedCount: v.renewedCount,
      gwp: v.gwp,
      avgGwp: v.renewedCount > 0 ? v.gwp / v.renewedCount : 0,
      pct: gwp > 0 ? (v.gwp / gwp) * 100 : 0,
    }));

  const includePolicies =
    displayStart.getFullYear() === displayEnd.getFullYear() &&
    displayStart.getMonth() === displayEnd.getMonth() &&
    displayStart.getDate() === displayEnd.getDate();

  const body: SummaryResponse = {
    ok: true,
    period,
    dateRange: formatDateRange(displayStart, displayEnd),
    totalPolicies: n,
    renewedPolicies: renewedN,
    gwp,
    netEarn: earn,
    avgPremium: renewedN ? gwp / renewedN : 0,
    totalFees,
    totalCommission,
    totalFinanceFees,
    financePenPct: renewedN ? (renewedRows.filter((r) => r.financed).length / renewedN) * 100 : 0,
    legalAddonPct: renewedN ? (renewedRows.filter((r) => r.legalSold !== "").length / renewedN) * 100 : 0,
    breakdownPct: renewedN ? (renewedRows.filter((r) => r.breakdownSold !== "").length / renewedN) * 100 : 0,
    trend,
    advisors,
    insurers,
    policies: includePolicies
      ? rows.map((r) => ({
          policyRef: r.policyRef,
          clientName: r.clientName,
          insurer: r.insurer,
          totalPremium: r.totalPremium,
          financeFees: r.financeFees,
          fees: r.fees,
          commission: r.commission,
          earn: r.earn,
          financed: r.financed,
          legalSold: r.legalSold,
          breakdownSold: r.breakdownSold,
          advisor: r.advisor,
          inceptionDate: r.inceptionDate,
          daysInAdv: r.daysInAdv,
        }))
      : [],
  };

  return Response.json(body);
}
