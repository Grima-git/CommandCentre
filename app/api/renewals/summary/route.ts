import { fetchRenewalsTracker, formatDDMMYYYY, shortLabel } from "@/lib/data/connectors/opengi-soap";
import { requireApiAccess } from "@/lib/security";

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

function getDateRange(period: string): [Date, Date] {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  if (period === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return [start, end];
  }
  if (period === "week") {
    const start = new Date(now);
    const day = now.getDay();
    const diffToMon = day === 0 ? -6 : 1 - day;
    start.setDate(now.getDate() + diffToMon);
    start.setHours(0, 0, 0, 0);
    return [start, end];
  }
  if (period === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return [start, end];
  }
  if (period === "ytd") {
    const start = new Date(now.getFullYear(), 0, 1);
    return [start, end];
  }
  // default: today
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return [start, end];
}

function formatDateRange(start: Date, end: Date): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  if (fmt(start) === fmt(end)) return fmt(start);
  return `${fmt(start)} – ${fmt(end)}`;
}

export async function GET(req: Request) {
  const access = await requireApiAccess(req, { section: "renewals", limit: { windowMs: 60_000, max: 60 } });
  if (access.response) return access.response;

  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") ?? "today";

  const [start, end] = getDateRange(period);
  const rows = await fetchRenewalsTracker(start, end);

  if (!rows) {
    return Response.json({ ok: false, error: "Could not reach data source" }, { status: 502 });
  }

  const n = rows.length;
  const renewedRows = rows.filter((r) => r.totalPremium > 0 || r.earn > 0);
  const renewedN = renewedRows.length;
  const gwp = rows.reduce((s, r) => s + r.totalPremium, 0);
  const earn = rows.reduce((s, r) => s + r.earn, 0);
  const totalFees = rows.reduce((s, r) => s + r.fees, 0);
  const totalCommission = rows.reduce((s, r) => s + r.commission, 0);
  const totalFinanceFees = rows.reduce((s, r) => s + r.financeFees, 0);

  // Trend: group by date
  const trendMap = new Map<string, { policies: number; gwp: number; earn: number }>();
  for (const r of rows) {
    const label = shortLabel(r.date);
    const e = trendMap.get(label) ?? { policies: 0, gwp: 0, earn: 0 };
    e.policies++;
    e.gwp += r.totalPremium;
    e.earn += r.earn;
    trendMap.set(label, e);
  }
  const trend: TrendPoint[] = [...trendMap.entries()]
    .sort((a, b) => {
      const rowA = rows.find((r) => shortLabel(r.date) === a[0]);
      const rowB = rows.find((r) => shortLabel(r.date) === b[0]);
      if (!rowA || !rowB) return 0;
      const [da, ma, ya] = rowA.date.split("/");
      const [db, mb, yb] = rowB.date.split("/");
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

  const body: SummaryResponse = {
    ok: true,
    period,
    dateRange: formatDateRange(start, end),
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
    policies: rows.map((r) => ({
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
    })),
  };

  return Response.json(body);
}
