"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Phone, Clock, Mic, Timer, TrendingUp, RefreshCw, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CallsSummaryResponse } from "@/app/api/calls/summary/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtSec(s: number): string {
  if (s <= 0) return "0s";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.round(s % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function fmtTime(stamp: string): string {
  // "2026-04-23 19:09:53" → "19:09"
  return stamp.length >= 16 ? stamp.substring(11, 16) : stamp;
}

function fmtCaller(s: string): string {
  if (/^447\d{9}$/.test(s)) return "0" + s.slice(2);
  if (/^\+447\d{9}$/.test(s)) return "0" + s.slice(3);
  return s;
}

// ---------------------------------------------------------------------------
// useCountUp
// ---------------------------------------------------------------------------

function useCountUp(target: number, duration = 700): number {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);

  useEffect(() => {
    fromRef.current = display;
    startRef.current = null;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

    const step = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const progress = Math.min((ts - startRef.current) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(fromRef.current + (target - fromRef.current) * eased));
      if (progress < 1) rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return display;
}

// ---------------------------------------------------------------------------
// KpiCard
// ---------------------------------------------------------------------------

type KpiAccent = "purple" | "green" | "amber" | "cyan" | "blue";

type KpiCardProps = {
  label: string;
  value: number;
  format?: "number" | "seconds";
  icon: React.ReactNode;
  accent: KpiAccent;
  sub?: string;
};

const accentMap: Record<KpiAccent, { icon: string; border: string; glow: string }> = {
  purple: { icon: "text-brand-purple", border: "border-brand-purple/20", glow: "bg-brand-purple/10" },
  green:  { icon: "text-brand-green",  border: "border-brand-green/20",  glow: "bg-brand-green/10" },
  amber:  { icon: "text-brand-amber",  border: "border-brand-amber/20",  glow: "bg-brand-amber/10" },
  cyan:   { icon: "text-brand-cyan",   border: "border-brand-cyan/20",   glow: "bg-brand-cyan/10" },
  blue:   { icon: "text-brand-blue",   border: "border-brand-blue/20",   glow: "bg-brand-blue/10" },
};

function KpiCard({ label, value, format = "number", icon, accent, sub }: KpiCardProps) {
  const animated = useCountUp(value);
  const a = accentMap[accent];
  const display = format === "seconds" ? fmtSec(animated) : String(animated);

  return (
    <div className={cn("rounded-xl border bg-bg-card p-5 flex gap-4 items-start", a.border)}>
      <div className={cn("rounded-lg p-2.5 shrink-0", a.glow)}>
        <span className={cn("w-5 h-5", a.icon)}>{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-xs text-txt-muted uppercase tracking-wider mb-1">{label}</p>
        <p className="text-2xl font-semibold tracking-tight">{display}</p>
        {sub && <p className="text-xs text-txt-muted mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tooltip styles (shared)
// ---------------------------------------------------------------------------

const tooltipStyle = {
  contentStyle: { background: "#1C1F30", border: "1px solid #262A3D", borderRadius: 8, fontSize: 12 },
  labelStyle: { color: "#e2e8f0" },
  itemStyle: { color: "#94a3b8" },
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type Period = "today" | "yesterday" | "week" | "month";

export function CallsOverview({ userName }: { userName: string }) {
  const [period, setPeriod] = useState<Period>("today");
  const [data, setData] = useState<CallsSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(60);

  const fetchData = useCallback(async (p: Period) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/calls/summary?period=${p}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      setData((await res.json()) as CallsSummaryResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
      setCountdown(60);
    }
  }, []);

  useEffect(() => {
    void fetchData(period);
  }, [period, fetchData]);

  useEffect(() => {
    if (period !== "today") return;
    const tick = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { void fetchData("today"); return 60; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [period, fetchData]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Call Centre</h2>
          <p className="text-sm text-txt-muted mt-0.5">
            New-Renewals queue
            {data && !loading && (
              <span className="ml-2 text-txt-dim">· {data.dateRange}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg overflow-hidden border border-bg-line">
            {(["today", "yesterday", "week", "month"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium transition-colors",
                  period === p
                    ? "bg-brand-purple text-white"
                    : "text-txt-muted hover:text-txt-primary hover:bg-bg-elev"
                )}
              >
                {p === "today" ? "Today" : p === "yesterday" ? "Yesterday" : p === "week" ? "This Week" : "This Month"}
              </button>
            ))}
          </div>

          {period === "today" && !loading && (
            <span className="text-xs text-txt-muted flex items-center gap-1">
              <RefreshCw className="w-3 h-3" />
              {countdown}s
            </span>
          )}

          <button
            onClick={() => void fetchData(period)}
            disabled={loading}
            className="p-1.5 rounded-lg hover:bg-bg-elev text-txt-muted hover:text-txt-primary transition-colors disabled:opacity-40"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && !loading && (
        <div className="rounded-xl border border-brand-red/30 bg-brand-red/5 p-6 flex flex-col items-center gap-3">
          <AlertTriangle className="w-8 h-8 text-brand-red" />
          <p className="text-sm text-txt-secondary">{error}</p>
          <button
            onClick={() => void fetchData(period)}
            className="px-4 py-1.5 rounded-lg bg-brand-red/20 text-brand-red text-sm hover:bg-brand-red/30 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && !data && (
        <div className="flex justify-center py-20">
          <RefreshCw className="w-8 h-8 text-txt-muted animate-spin" />
        </div>
      )}

      {/* Content */}
      {!error && data && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-5 gap-4">
            <KpiCard
              label="Total Calls"
              value={data.totalCalls}
              icon={<Phone className="w-5 h-5" />}
              accent="purple"
            />
            <KpiCard
              label="Avg Wait"
              value={data.avgWaitSec}
              format="seconds"
              icon={<Clock className="w-5 h-5" />}
              accent="amber"
            />
            <KpiCard
              label="Avg Duration"
              value={data.avgDurationSec}
              format="seconds"
              icon={<TrendingUp className="w-5 h-5" />}
              accent="cyan"
            />
            <KpiCard
              label="Recordings"
              value={data.withRecording}
              icon={<Mic className="w-5 h-5" />}
              accent="green"
              sub={data.totalCalls > 0 ? `${Math.round((data.withRecording / data.totalCalls) * 100)}% of calls` : undefined}
            />
            <KpiCard
              label="Longest Wait"
              value={data.longestWaitSec}
              format="seconds"
              icon={<Timer className="w-5 h-5" />}
              accent="blue"
            />
          </div>

          {/* Empty state */}
          {data.totalCalls === 0 && (
            <div className="rounded-xl border border-bg-line bg-bg-card p-12 flex flex-col items-center gap-3">
              <Phone className="w-10 h-10 text-txt-muted" />
              <p className="text-txt-muted text-sm">No New-Renewals calls in this period.</p>
            </div>
          )}

          {/* Charts */}
          {data.hourly.length > 0 && (
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-bg-line bg-bg-card p-5">
                <h3 className="text-sm font-semibold mb-4">Calls per Hour</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.hourly} margin={{ top: 0, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#262A3D" vertical={false} />
                    <XAxis
                      dataKey="hour"
                      tickFormatter={(h: number) => `${h}:00`}
                      tick={{ fontSize: 11, fill: "#6B7280" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#6B7280" }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      {...tooltipStyle}
                      formatter={(v: number) => [v, "Calls"]}
                      labelFormatter={(h: number) => `${h}:00`}
                    />
                    <Bar dataKey="calls" name="Calls" fill="#7C3AED" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="rounded-xl border border-bg-line bg-bg-card p-5">
                <h3 className="text-sm font-semibold mb-4">Avg Wait per Hour</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.hourly} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#262A3D" vertical={false} />
                    <XAxis
                      dataKey="hour"
                      tickFormatter={(h: number) => `${h}:00`}
                      tick={{ fontSize: 11, fill: "#6B7280" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(v: number) => `${v}s`}
                      tick={{ fontSize: 11, fill: "#6B7280" }}
                      axisLine={false}
                      tickLine={false}
                      width={40}
                    />
                    <Tooltip
                      {...tooltipStyle}
                      formatter={(v: number) => [fmtSec(v), "Avg Wait"]}
                      labelFormatter={(h: number) => `${h}:00`}
                    />
                    <Bar dataKey="avgWaitSec" name="Avg Wait" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Recent calls table */}
          {data.recentCalls.length > 0 && (
            <div className="rounded-xl border border-bg-line bg-bg-card overflow-hidden">
              <div className="px-5 py-4 border-b border-bg-line flex items-center justify-between">
                <h3 className="text-sm font-semibold">Recent Calls</h3>
                <span className="text-xs text-txt-muted">{data.recentCalls.length} most recent</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-bg-line">
                      {["Time", "Caller", "Duration", "Wait", "Rec"].map((h) => (
                        <th key={h} className="px-5 py-3 text-left text-xs font-medium text-txt-muted">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentCalls.map((call) => {
                      const waitColor =
                        call.waitsec > 180
                          ? "text-brand-red"
                          : call.waitsec > 60
                          ? "text-brand-amber"
                          : "text-txt-secondary";
                      return (
                        <tr
                          key={call.callUuid}
                          className="border-b border-bg-line/50 last:border-0 hover:bg-bg-elev/50 transition-colors"
                        >
                          <td className="px-5 py-2.5 tabular-nums text-txt-muted text-xs">
                            {fmtTime(call.startStamp)}
                          </td>
                          <td className="px-5 py-2.5 font-medium tabular-nums">
                            {fmtCaller(call.callerIdName)}
                          </td>
                          <td className="px-5 py-2.5 tabular-nums text-txt-secondary">
                            {fmtSec(call.billsec)}
                          </td>
                          <td className={cn("px-5 py-2.5 tabular-nums", waitColor)}>
                            {fmtSec(call.waitsec)}
                          </td>
                          <td className="px-5 py-2.5">
                            {call.hasRecording ? (
                              <Mic className="w-3.5 h-3.5 text-brand-green" />
                            ) : (
                              <span className="text-txt-dim">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
