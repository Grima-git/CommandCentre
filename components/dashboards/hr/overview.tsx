"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Briefcase,
  CalendarCheck,
  Clock3,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import type { HrEmployeeRow, HrLeaveRow, HrSummaryResponse, HrTeamRow } from "@/app/api/hr/summary/route";

function fmtDate(value: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function tenure(months: number): string {
  if (months < 12) return `${months}m`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem ? `${years}y ${rem}m` : `${years}y`;
}

const tooltipStyle = {
  contentStyle: { background: "#1C1F30", border: "1px solid #262A3D", borderRadius: 8, fontSize: 12 },
  labelStyle: { color: "#e2e8f0" },
  itemStyle: { color: "#94a3b8" },
};

function Kpi({
  label,
  value,
  sub,
  icon,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  accent: "purple" | "green" | "amber" | "cyan" | "blue";
}) {
  const accents = {
    purple: "text-brand-purple bg-brand-purple/10 border-brand-purple/20",
    green: "text-brand-green bg-brand-green/10 border-brand-green/20",
    amber: "text-brand-amber bg-brand-amber/10 border-brand-amber/20",
    cyan: "text-brand-cyan bg-brand-cyan/10 border-brand-cyan/20",
    blue: "text-brand-blue bg-brand-blue/10 border-brand-blue/20",
  };

  return (
    <div className="rounded-xl border border-bg-line bg-bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-txt-muted">{label}</p>
          <p className="mt-6 text-2xl font-semibold tracking-tight">{value}</p>
          {sub && <p className="mt-1 text-xs text-txt-muted">{sub}</p>}
        </div>
        <div className={cn("rounded-lg border p-2.5", accents[accent])}>{icon}</div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const lower = status.toLowerCase();
  const tone = lower.includes("approved")
    ? "bg-brand-green/10 text-brand-green"
    : lower.includes("declined") || lower.includes("cancel")
    ? "bg-brand-red/10 text-brand-red"
    : lower.includes("pending") || lower.includes("await")
    ? "bg-brand-amber/10 text-brand-amber"
    : "bg-bg-elev text-txt-secondary";
  return <span className={cn("rounded-full px-2 py-1 text-[11px] font-semibold", tone)}>{status}</span>;
}

function LeaveList({ rows, empty }: { rows: HrLeaveRow[]; empty: string }) {
  if (rows.length === 0) {
    return <div className="rounded-lg bg-bg-elev/40 px-4 py-8 text-center text-sm text-txt-muted">{empty}</div>;
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.id} className="rounded-lg border border-bg-line bg-bg-elev/30 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{row.employeeName}</p>
              <p className="mt-1 text-xs text-txt-muted">
                {row.policy} · {fmtDate(row.startDate)}
                {row.endDate && row.endDate !== row.startDate ? ` to ${fmtDate(row.endDate)}` : ""}
              </p>
            </div>
            <StatusPill status={row.status} />
          </div>
        </div>
      ))}
    </div>
  );
}

function TeamTable({ teams }: { teams: HrTeamRow[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-bg-line bg-bg-card">
      <div className="border-b border-bg-line px-5 py-4">
        <h3 className="text-sm font-semibold">Team Cover</h3>
        <p className="mt-0.5 text-xs text-txt-muted">Headcount, absence today and pending leave</p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-bg-line text-xs text-txt-muted">
            <th className="px-5 py-3 text-left font-medium">Team</th>
            <th className="px-5 py-3 text-right font-medium">People</th>
            <th className="px-5 py-3 text-right font-medium">Off</th>
            <th className="px-5 py-3 text-right font-medium">Pending</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((team) => (
            <tr key={team.team} className="border-b border-bg-line/50 last:border-0">
              <td className="px-5 py-3 font-medium">{team.team}</td>
              <td className="px-5 py-3 text-right tabular-nums">{team.headcount}</td>
              <td className={cn("px-5 py-3 text-right tabular-nums", team.offToday > 0 && "text-brand-amber")}>
                {team.offToday}
              </td>
              <td className={cn("px-5 py-3 text-right tabular-nums", team.pendingLeave > 0 && "text-brand-blue")}>
                {team.pendingLeave}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmployeeTable({ employees }: { employees: HrEmployeeRow[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-bg-line bg-bg-card">
      <div className="border-b border-bg-line px-5 py-4">
        <h3 className="text-sm font-semibold">People Directory</h3>
        <p className="mt-0.5 text-xs text-txt-muted">{employees.length} matching employees</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bg-line text-xs text-txt-muted">
              {["Name", "Team", "Position", "Status", "Started", "Tenure"].map((h) => (
                <th key={h} className="px-5 py-3 text-left font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.slice(0, 70).map((e) => (
              <tr key={e.id} className="border-b border-bg-line/50 last:border-0 hover:bg-bg-elev/40">
                <td className="px-5 py-3">
                  <div className="font-medium">{e.name}</div>
                  <div className="text-xs text-txt-muted">{e.email}</div>
                </td>
                <td className="px-5 py-3 text-txt-secondary">{e.team}</td>
                <td className="px-5 py-3 text-txt-secondary">{e.position}</td>
                <td className="px-5 py-3">
                  <span className="rounded-full bg-brand-green/10 px-2 py-1 text-[11px] font-semibold text-brand-green">
                    {e.status}
                  </span>
                </td>
                <td className="px-5 py-3 text-txt-muted tabular-nums">{fmtDate(e.startDate)}</td>
                <td className="px-5 py-3 text-txt-secondary tabular-nums">{tenure(e.tenureMonths)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function HrOverview() {
  const [data, setData] = useState<HrSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/hr/summary");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      setData((await res.json()) as HrSummaryResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const filteredEmployees = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!data || !q) return data?.employees ?? [];
    return data.employees.filter((e) =>
      [e.name, e.email, e.team, e.position, e.status].some((value) => value.toLowerCase().includes(q)),
    );
  }, [data, query]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">HR</h2>
          <p className="mt-0.5 text-sm text-txt-muted">
            Sage HR live people view
            {data && <span className="ml-2 text-txt-dim">· {data.source === "sage" ? "Connected" : "Demo data"}</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-txt-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people..."
              className="h-9 w-64 rounded-lg border border-bg-line bg-bg-card pl-9 pr-3 text-sm outline-none transition focus:border-brand-purple/60"
            />
          </div>
          <button
            onClick={() => void fetchData()}
            disabled={loading}
            className="rounded-lg border border-bg-line bg-bg-card p-2 text-txt-muted transition hover:text-txt-primary disabled:opacity-50"
            aria-label="Refresh HR data"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {error && !loading && (
        <div className="rounded-xl border border-brand-red/30 bg-brand-red/5 p-6 flex items-center gap-3">
          <AlertTriangle className="h-6 w-6 text-brand-red" />
          <div>
            <p className="font-medium text-brand-red">Sage HR could not be reached</p>
            <p className="text-sm text-txt-muted">{error}</p>
          </div>
        </div>
      )}

      {loading && !data && (
        <div className="flex justify-center py-20">
          <RefreshCw className="h-8 w-8 animate-spin text-txt-muted" />
        </div>
      )}

      {data && !error && (
        <>
          <div className="grid grid-cols-5 gap-4">
            <Kpi label="Headcount" value={data.headcount} sub="Active employee records" icon={<Users className="h-5 w-5" />} accent="purple" />
            <Kpi label="Out Today" value={data.offToday} sub="Approved absence today" icon={<CalendarCheck className="h-5 w-5" />} accent="amber" />
            <Kpi label="Pending Leave" value={data.pendingLeave} sub="Awaiting review" icon={<Clock3 className="h-5 w-5" />} accent="blue" />
            <Kpi label="Upcoming Leave" value={data.approvedUpcoming} sub="Next 30 days" icon={<Briefcase className="h-5 w-5" />} accent="cyan" />
            <Kpi label="New Starters" value={data.startersThisMonth} sub="This month" icon={<UserCheck className="h-5 w-5" />} accent="green" />
          </div>

          <div className="grid grid-cols-[1.15fr_0.85fr] gap-4">
            <TeamTable teams={data.teams} />
            <div className="rounded-xl border border-bg-line bg-bg-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Employment Mix</h3>
                  <p className="mt-0.5 text-xs text-txt-muted">Current Sage HR status</p>
                </div>
                <ShieldCheck className="h-5 w-5 text-brand-green" />
              </div>
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={data.statusBreakdown} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262A3D" vertical={false} />
                  <XAxis dataKey="status" tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip {...tooltipStyle} formatter={(v: number) => [v, "People"]} />
                  <Bar dataKey="count" fill="#10B981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-bg-line bg-bg-card p-5">
              <h3 className="text-sm font-semibold">Out Of Office Today</h3>
              <p className="mb-4 mt-0.5 text-xs text-txt-muted">{fmtDate(data.date)}</p>
              <LeaveList rows={data.outToday} empty="Everyone is showing as available today." />
            </div>
            <div className="rounded-xl border border-bg-line bg-bg-card p-5">
              <h3 className="text-sm font-semibold">Upcoming Leave</h3>
              <p className="mb-4 mt-0.5 text-xs text-txt-muted">Approved leave in the next 30 days</p>
              <LeaveList rows={data.upcomingLeave} empty="No approved upcoming leave found." />
            </div>
            <div className="rounded-xl border border-bg-line bg-bg-card p-5">
              <h3 className="text-sm font-semibold">Recent Requests</h3>
              <p className="mb-4 mt-0.5 text-xs text-txt-muted">Latest leave request records</p>
              <LeaveList rows={data.recentRequests} empty="No leave requests returned." />
            </div>
          </div>

          <EmployeeTable employees={filteredEmployees} />
        </>
      )}
    </div>
  );
}
