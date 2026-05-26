import {
  fetchSageEmployees,
  fetchSageLeaveRequests,
  fetchSageOutOfOffice,
  isSageHrConfigured,
  type SageEmployee,
  type SageLeaveEntry,
} from "@/lib/data/connectors/sage-hr";
import { requireApiAccess } from "@/lib/security";
import { getCached } from "@/lib/server-cache";

export const dynamic = "force-dynamic";

export type HrTeamRow = { team: string; headcount: number; offToday: number; pendingLeave: number };
export type HrEmployeeRow = {
  id: number;
  name: string;
  email: string;
  team: string;
  position: string;
  status: string;
  startDate: string;
  tenureMonths: number;
};
export type HrLeaveRow = {
  id: string;
  employeeId: number | null;
  employeeName: string;
  policy: string;
  status: string;
  startDate: string;
  endDate: string;
  hours: number;
  details: string;
};
export type HrSummaryResponse = {
  ok: true;
  source: "sage" | "mock";
  date: string;
  headcount: number;
  offToday: number;
  pendingLeave: number;
  approvedUpcoming: number;
  startersThisMonth: number;
  teams: HrTeamRow[];
  statusBreakdown: { status: string; count: number }[];
  outToday: HrLeaveRow[];
  upcomingLeave: HrLeaveRow[];
  recentRequests: HrLeaveRow[];
  employees: HrEmployeeRow[];
};

function fullName(e: SageEmployee): string {
  return [e.first_name, e.last_name].filter(Boolean).join(" ").trim() || e.email || `Employee ${e.id}`;
}

function employeeNameFromLeave(row: SageLeaveEntry, employees: Map<number, HrEmployeeRow>): string {
  if (row.employee_id && employees.has(row.employee_id)) return employees.get(row.employee_id)!.name;
  if (typeof row.employee === "string") return row.employee;
  if (row.employee?.name) return row.employee.name;
  const fromObject = [row.employee?.first_name, row.employee?.last_name].filter(Boolean).join(" ").trim();
  return fromObject || "Unknown";
}

function textFromUnknown(value: unknown, fallback: string): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && "name" in value) {
    const name = (value as { name?: unknown }).name;
    if (typeof name === "string" && name.trim()) return name;
  }
  return fallback;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateOnly(value: string | null | undefined): string {
  const d = parseDate(value);
  return d ? d.toISOString().slice(0, 10) : "";
}

function monthsBetween(start: Date | null, end: Date): number {
  if (!start) return 0;
  return Math.max(0, (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth());
}

function isPending(status: string): boolean {
  const s = status.toLowerCase();
  return s.includes("pending") || s.includes("awaiting") || s.includes("requested");
}

function isApproved(status: string): boolean {
  return status.toLowerCase().includes("approved");
}

function toLeaveRow(row: SageLeaveEntry, employees: Map<number, HrEmployeeRow>): HrLeaveRow {
  return {
    id: String(row.id ?? `${row.employee_id ?? "unknown"}-${row.start_date ?? ""}-${row.end_date ?? ""}`),
    employeeId: row.employee_id ?? null,
    employeeName: employeeNameFromLeave(row, employees),
    policy: textFromUnknown(row.policy, "Leave"),
    status: textFromUnknown(row.status ?? row.status_code, "Unknown"),
    startDate: dateOnly(row.start_date),
    endDate: dateOnly(row.end_date) || dateOnly(row.start_date),
    hours: Number(row.hours ?? 0),
    details: row.details ?? "",
  };
}

function makeMock(now: Date): HrSummaryResponse {
  const employees: HrEmployeeRow[] = [
    { id: 1, name: "George Leslie", email: "george@example.com", team: "Renewals", position: "Head of Renewals", status: "Full-time", startDate: "2022-03-01", tenureMonths: 49 },
    { id: 2, name: "Sarah Gill", email: "sarah@example.com", team: "Renewals", position: "Renewals Advisor", status: "Full-time", startDate: "2024-01-15", tenureMonths: 27 },
    { id: 3, name: "Thomas Wilson", email: "thomas@example.com", team: "Operations", position: "Systems", status: "Full-time", startDate: "2023-08-10", tenureMonths: 32 },
  ];
  return {
    ok: true,
    source: "mock",
    date: now.toISOString().slice(0, 10),
    headcount: employees.length,
    offToday: 1,
    pendingLeave: 2,
    approvedUpcoming: 3,
    startersThisMonth: 0,
    teams: [
      { team: "Renewals", headcount: 2, offToday: 1, pendingLeave: 1 },
      { team: "Operations", headcount: 1, offToday: 0, pendingLeave: 1 },
    ],
    statusBreakdown: [{ status: "Full-time", count: 3 }],
    outToday: [{ id: "mock-1", employeeId: 2, employeeName: "Sarah Gill", policy: "Holiday", status: "Approved", startDate: "2026-04-30", endDate: "2026-04-30", hours: 7.5, details: "" }],
    upcomingLeave: [],
    recentRequests: [],
    employees,
  };
}

export async function GET(req: Request) {
  const access = await requireApiAccess(req, { section: "hr", limit: { windowMs: 60_000, max: 60 } });
  if (access.response) return access.response;

  const now = new Date();
  if (!isSageHrConfigured()) return Response.json(makeMock(now));

  const dateKey = now.toISOString().slice(0, 10);
  const [sageEmployees, leaveRequests, outOfOffice] = await Promise.all([
    getCached("hr:employees", 300_000, () => fetchSageEmployees()),
    getCached("hr:leave-requests", 180_000, () => fetchSageLeaveRequests()),
    getCached(`hr:out-of-office:${dateKey}`, 120_000, () => fetchSageOutOfOffice(now)),
  ]);

  if (!sageEmployees || !leaveRequests || !outOfOffice) {
    return Response.json({ ok: false, error: "Could not reach Sage HR" }, { status: 502 });
  }

  const employees: HrEmployeeRow[] = sageEmployees
    .map((e) => ({
      id: e.id,
      name: fullName(e),
      email: e.email ?? "",
      team: e.team ?? "Unassigned",
      position: e.position ?? "Unassigned",
      status: e.employment_status ?? "Unknown",
      startDate: dateOnly(e.employment_start_date),
      tenureMonths: monthsBetween(parseDate(e.employment_start_date), now),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const employeeMap = new Map(employees.map((e) => [e.id, e]));
  const leaveRows = leaveRequests.map((r) => toLeaveRow(r, employeeMap));
  const outToday = outOfOffice.map((r) => toLeaveRow(r, employeeMap));

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const inThirtyDays = new Date(today);
  inThirtyDays.setDate(today.getDate() + 30);

  const upcomingLeave = leaveRows
    .filter((r) => {
      const start = parseDate(r.startDate);
      return start && start >= today && start <= inThirtyDays && isApproved(r.status);
    })
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 12);

  const recentRequests = leaveRows
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
    .slice(0, 12);

  const teamMap = new Map<string, HrTeamRow>();
  for (const e of employees) {
    const row = teamMap.get(e.team) ?? { team: e.team, headcount: 0, offToday: 0, pendingLeave: 0 };
    row.headcount++;
    teamMap.set(e.team, row);
  }
  for (const l of outToday) {
    const team = l.employeeId ? employeeMap.get(l.employeeId)?.team ?? "Unassigned" : "Unassigned";
    const row = teamMap.get(team) ?? { team, headcount: 0, offToday: 0, pendingLeave: 0 };
    row.offToday++;
    teamMap.set(team, row);
  }
  for (const l of leaveRows.filter((r) => isPending(r.status))) {
    const team = l.employeeId ? employeeMap.get(l.employeeId)?.team ?? "Unassigned" : "Unassigned";
    const row = teamMap.get(team) ?? { team, headcount: 0, offToday: 0, pendingLeave: 0 };
    row.pendingLeave++;
    teamMap.set(team, row);
  }

  const statusBreakdown = [...employees.reduce((map, e) => {
    map.set(e.status, (map.get(e.status) ?? 0) + 1);
    return map;
  }, new Map<string, number>()).entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => ({ status, count }));

  const body: HrSummaryResponse = {
    ok: true,
    source: "sage",
    date: now.toISOString().slice(0, 10),
    headcount: employees.length,
    offToday: outToday.length,
    pendingLeave: leaveRows.filter((r) => isPending(r.status)).length,
    approvedUpcoming: upcomingLeave.length,
    startersThisMonth: employees.filter((e) => {
      const start = parseDate(e.startDate);
      return start && start.getFullYear() === now.getFullYear() && start.getMonth() === now.getMonth();
    }).length,
    teams: [...teamMap.values()].sort((a, b) => b.headcount - a.headcount),
    statusBreakdown,
    outToday,
    upcomingLeave,
    recentRequests,
    employees,
  };

  return Response.json(body);
}
