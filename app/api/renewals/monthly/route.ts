import {
  fetchRenewalsDue,
  fetchRenewalsTracker,
  parseDDMMYYYY,
} from "@/lib/data/connectors/opengi-soap";
import type { RenewalDueRow, RenewalRow } from "@/lib/data/connectors/opengi-soap";
import { requireApiAccess } from "@/lib/security";

export const dynamic = "force-dynamic";

export type MonthStats = {
  label: string;
  totalDue: number;
  renewed: number;
  available: number;
  retentionPct: number;
  daysRemaining: number;
  daysInMonth: number;
};

export type MonthlyResponse = {
  ok: true;
  currentMonth: MonthStats;
  nextMonth: MonthStats;
};

function policyKey(policyRef: string): string {
  return policyRef.trim().toLowerCase();
}

function inMonth(dateStr: string, year: number, month: number): boolean {
  if (!dateStr) return false;
  try {
    const d = parseDDMMYYYY(dateStr);
    return d.getFullYear() === year && d.getMonth() === month;
  } catch {
    return false;
  }
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  try {
    const d = parseDDMMYYYY(dateStr);
    if (Number.isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
  } catch {
    return null;
  }
}

function computeStats(
  dueRows: RenewalDueRow[],
  trackerRows: RenewalRow[],
  year: number,
  month: number,
  today: Date,
): MonthStats {
  const todayStart = new Date(today);
  todayStart.setHours(0, 0, 0, 0);
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  const monthDueRows = dueRows.filter((r) => inMonth(r.renewalDate, year, month));
  const availableRows = monthDueRows.filter((r) => {
    const renewalDate = parseDate(r.renewalDate);
    if (!renewalDate) return false;
    return !isCurrentMonth || renewalDate >= todayStart;
  });
  const renewedRows = trackerRows.filter((r) => inMonth(r.inceptionDate, year, month));
  const renewedRefs = new Set(renewedRows.map((r) => policyKey(r.policyRef)));

  const available = availableRows.filter((r) => !renewedRefs.has(policyKey(r.policyRef))).length;
  const renewed = renewedRows.length;
  const totalDue = monthDueRows.length;
  const retentionPct = totalDue > 0 ? (renewed / totalDue) * 100 : 0;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysRemaining = isCurrentMonth
    ? Math.max(0, daysInMonth - today.getDate() + 1)
    : daysInMonth;

  return {
    label: new Date(year, month, 1).toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
    }),
    totalDue,
    renewed,
    available,
    retentionPct,
    daysRemaining,
    daysInMonth,
  };
}

export async function GET(req: Request) {
  const access = await requireApiAccess(req, { section: "renewals", limit: { windowMs: 60_000, max: 60 } });
  if (access.response) return access.response;

  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth();
  const nxtM = curM === 11 ? 0 : curM + 1;
  const nxtY = curM === 11 ? curY + 1 : curY;

  const dueStart = new Date(curY, curM, 1);
  const dueEnd = new Date(nxtY, nxtM + 1, 0, 23, 59, 59, 999);

  // Look back slightly for advance-processed next-month renewals while keeping
  // usage low: one Due call and one Tracker call for the two-month dashboard.
  const trackerStart = new Date(curY, curM, 1);
  trackerStart.setDate(trackerStart.getDate() - 30);

  const [dueRows, trackerRows] = await Promise.all([
    fetchRenewalsDue(dueStart, dueEnd),
    fetchRenewalsTracker(trackerStart, dueEnd),
  ]);

  if (!dueRows || !trackerRows) {
    return Response.json({ ok: false, error: "Could not reach data source" }, { status: 502 });
  }

  const body: MonthlyResponse = {
    ok: true,
    currentMonth: computeStats(dueRows, trackerRows, curY, curM, now),
    nextMonth: computeStats(dueRows, trackerRows, nxtY, nxtM, now),
  };

  return Response.json(body);
}
