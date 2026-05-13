import { findContactByName } from "@/lib/contacts";
import { fetchRenewalsTracker } from "@/lib/data/connectors/opengi-soap";
import { fetchCallRecords, isPbxConfigured } from "@/lib/data/connectors/pbx-api";
import { requireApiAccess, safeText } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StatsKind = "renewals" | "calls" | "combined";
type StatsPeriod = "today" | "week" | "month" | "ytd";

type StatsMessageBody = {
  toName?: string;
  kind?: StatsKind;
  period?: StatsPeriod;
};

const QUEUE = "New-Renewals";

function getDateRange(period: StatsPeriod): [Date, Date] {
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
  const start = new Date(now.getFullYear(), 0, 1);
  return [start, end];
}

function periodLabel(period: StatsPeriod): string {
  if (period === "today") return "today";
  if (period === "week") return "this week";
  if (period === "month") return "this month";
  return "YTD";
}

function fmtCurrency(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

function fmtSec(s: number): string {
  if (s <= 0) return "0s";
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

async function buildRenewalsMessage(period: StatsPeriod): Promise<string | null> {
  const [start, end] = getDateRange(period);
  const rows = await fetchRenewalsTracker(start, end);
  if (!rows) return null;

  const renewedRows = rows.filter((row) => row.totalPremium > 0 || row.earn > 0);
  const renewed = renewedRows.length;
  const gwp = rows.reduce((sum, row) => sum + row.totalPremium, 0);
  const earn = rows.reduce((sum, row) => sum + row.earn, 0);
  const financePen = renewed ? Math.round((renewedRows.filter((row) => row.financed).length / renewed) * 100) : 0;
  const legalAttach = renewed ? Math.round((renewedRows.filter((row) => row.legalSold !== "").length / renewed) * 100) : 0;

  return `Renewals ${periodLabel(period)}: ${renewed} renewed, GWP ${fmtCurrency(gwp)}, net earn ${fmtCurrency(earn)}, finance pen ${financePen}%, legal ${legalAttach}%.`;
}

async function buildCallsMessage(period: StatsPeriod): Promise<string | null> {
  const [start, end] = getDateRange(period);
  if (!isPbxConfigured()) return "Call stats are not available because PBX is not configured.";

  const rows = await fetchCallRecords(start, end);
  if (!rows) return null;

  const calls = rows.filter((row) => row.queueName === QUEUE);
  const total = calls.length;
  const avgWait = total ? Math.round(calls.reduce((sum, row) => sum + row.waitsec, 0) / total) : 0;
  const avgDuration = total ? Math.round(calls.reduce((sum, row) => sum + row.billsec, 0) / total) : 0;
  const recordings = calls.filter((row) => row.recordingFile).length;
  const longestWait = calls.reduce((max, row) => Math.max(max, row.waitsec), 0);

  return `Calls ${periodLabel(period)}: ${total} New-Renewals calls, avg wait ${fmtSec(avgWait)}, avg duration ${fmtSec(avgDuration)}, recordings ${recordings}, longest wait ${fmtSec(longestWait)}.`;
}

async function buildCombinedMessage(period: StatsPeriod): Promise<string | null> {
  const [renewals, calls] = await Promise.all([
    buildRenewalsMessage(period),
    buildCallsMessage(period),
  ]);
  if (!renewals || !calls) return renewals ?? calls;
  return `${renewals} ${calls}`.slice(0, 612);
}

export async function POST(req: Request) {
  const access = await requireApiAccess(req, { section: "home", limit: { windowMs: 60_000, max: 20 } });
  if (access.response) return access.response;

  let body: StatsMessageBody;
  try {
    body = (await req.json()) as StatsMessageBody;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const toName = safeText(body.toName, 80);
  const kind = body.kind;
  const period = body.period ?? "today";

  if (!toName || !findContactByName(toName)) {
    return Response.json({ ok: false, error: "Recipient must be a known contact" }, { status: 400 });
  }
  if (kind !== "renewals" && kind !== "calls" && kind !== "combined") {
    return Response.json({ ok: false, error: "Stats type must be renewals, calls, or combined" }, { status: 400 });
  }

  const message = kind === "renewals"
    ? await buildRenewalsMessage(period)
    : kind === "combined"
    ? await buildCombinedMessage(period)
    : await buildCallsMessage(period);

  if (!message) {
    return Response.json({ ok: false, error: "Could not get stats" }, { status: 502 });
  }

  return Response.json({ ok: true, toName, message });
}
