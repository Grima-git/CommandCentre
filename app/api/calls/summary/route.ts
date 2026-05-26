import { fetchCallRecords, isPbxConfigured } from "@/lib/data/connectors/pbx-api";
import { requireApiAccess } from "@/lib/security";
import { cacheTtlForPeriod, getCached } from "@/lib/server-cache";

export const dynamic = "force-dynamic";

export type HourlyPoint = { hour: number; calls: number; avgWaitSec: number };

export type RecentCall = {
  callUuid: string;
  startStamp: string;
  callerIdName: string;
  billsec: number;
  waitsec: number;
  hasRecording: boolean;
};

export type CallsSummaryResponse = {
  ok: true;
  period: string;
  dateRange: string;
  totalCalls: number;
  avgWaitSec: number;
  avgDurationSec: number;
  withRecording: number;
  longestWaitSec: number;
  hourly: HourlyPoint[];
  recentCalls: RecentCall[];
};

const QUEUE = "New-Renewals";

function getDateRange(period: string): [Date, Date] {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  if (period === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return [start, end];
  }
  if (period === "yesterday") {
    const start = new Date(now);
    start.setDate(now.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    const endY = new Date(start);
    endY.setHours(23, 59, 59, 999);
    return [start, endY];
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
  const access = await requireApiAccess(req, { section: "calls", limit: { windowMs: 60_000, max: 60 } });
  if (access.response) return access.response;

  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") ?? "today";

  const [start, end] = getDateRange(period);

  if (!isPbxConfigured()) {
    const mock: CallsSummaryResponse = {
      ok: true,
      period,
      dateRange: formatDateRange(start, end),
      totalCalls: 47,
      avgWaitSec: 95,
      avgDurationSec: 480,
      withRecording: 41,
      longestWaitSec: 320,
      hourly: Array.from({ length: 9 }, (_, i) => ({
        hour: i + 9,
        calls: Math.floor(Math.random() * 8) + 1,
        avgWaitSec: Math.floor(Math.random() * 120) + 30,
      })),
      recentCalls: [],
    };
    return Response.json(mock);
  }

  const rows = await getCached(
    `calls:summary:${period}:${start.toISOString()}:${end.toISOString()}`,
    cacheTtlForPeriod(period),
    () => fetchCallRecords(start, end),
  );
  if (!rows) {
    return Response.json({ ok: false, error: "Could not reach PBX" }, { status: 502 });
  }

  const nr = rows.filter((r) => r.queueName === QUEUE);
  const n = nr.length;

  const avgWaitSec = n ? Math.round(nr.reduce((s, r) => s + r.waitsec, 0) / n) : 0;
  const avgDurationSec = n ? Math.round(nr.reduce((s, r) => s + r.billsec, 0) / n) : 0;
  const withRecording = nr.filter((r) => r.recordingFile).length;
  const longestWaitSec = nr.reduce((m, r) => Math.max(m, r.waitsec), 0);

  // Hourly breakdown
  const hourMap = new Map<number, { calls: number; totalWait: number }>();
  for (const r of nr) {
    const h = r.startHour;
    const e = hourMap.get(h) ?? { calls: 0, totalWait: 0 };
    e.calls++;
    e.totalWait += r.waitsec;
    hourMap.set(h, e);
  }
  const hourly: HourlyPoint[] = [...hourMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([hour, v]) => ({
      hour,
      calls: v.calls,
      avgWaitSec: v.calls ? Math.round(v.totalWait / v.calls) : 0,
    }));

  // Recent calls — last 50, most recent first
  const recentCalls: RecentCall[] = [...nr]
    .sort((a, b) => b.startStamp.localeCompare(a.startStamp))
    .slice(0, 50)
    .map((r) => ({
      callUuid: r.callUuid,
      startStamp: r.startStamp,
      callerIdName: r.callerIdName,
      billsec: r.billsec,
      waitsec: r.waitsec,
      hasRecording: !!r.recordingFile,
    }));

  const body: CallsSummaryResponse = {
    ok: true,
    period,
    dateRange: formatDateRange(start, end),
    totalCalls: n,
    avgWaitSec,
    avgDurationSec,
    withRecording,
    longestWaitSec,
    hourly,
    recentCalls,
  };

  return Response.json(body);
}
