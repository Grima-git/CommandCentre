"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  AreaChart, Area, CartesianGrid,
} from "recharts";
import { cn, formatCurrency } from "@/lib/utils";
import {
  AlertCircle, RefreshCw, PoundSterling, TrendingUp, Calculator,
  CreditCard, Scale, Wrench, FileText, Crown, Zap, Clock,
  ChevronUp, ChevronDown, ChevronsUpDown, ArrowUpRight, ArrowDownRight,
  Banknote, BadgePercent, Landmark,
} from "lucide-react";
import type { SummaryResponse, PolicyRow } from "@/app/api/new-business/summary/route";

type Period = "today" | "week" | "month" | "ytd";
const PERIODS: { key: Period; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "ytd", label: "Year to Date" },
];

// ── Animated counter hook ──────────────────────────────────────────────────
function useCountUp(target: number, duration = 700) {
  const [val, setVal] = useState(0);
  const raf = useRef<number>(0);
  useEffect(() => {
    let start: number | null = null;
    const from = 0;
    const step = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(from + (target - from) * eased);
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);
  return val;
}

// ── Main component ─────────────────────────────────────────────────────────
export function NewBusinessOverview({ userName }: { userName: string }) {
  const [period, setPeriod] = useState<Period>("today");
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  const load = useCallback(async (p: Period) => {
    setVisible(false);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/new-business/summary?period=${p}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Unknown error");
      setData(json as SummaryResponse);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } catch (e) {
      setError((e as Error).message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(period); }, [period, load]);

  return (
    <div className="flex-1 overflow-y-auto min-h-0">
      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-10 bg-bg-base/90 backdrop-blur-sm px-8 pt-6 pb-4 flex items-center justify-between border-b border-bg-line">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">New Business</h1>
          <p className="text-sm text-txt-muted mt-0.5">
            {loading ? "Loading…" : data?.dateRange ?? "—"}
          </p>
        </div>
        <div className="flex items-center gap-1 bg-bg-elev rounded-xl p-1 border border-bg-line">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={cn(
                "px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200",
                period === p.key
                  ? "bg-brand-purple text-white shadow-glow"
                  : "text-txt-muted hover:text-txt-secondary hover:bg-bg-card"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── States ── */}
      {loading && (
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-6 h-6 text-txt-muted animate-spin" />
        </div>
      )}
      {error && !loading && (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <AlertCircle className="w-8 h-8 text-brand-red" />
          <p className="text-sm text-txt-muted">{error}</p>
          <button
            onClick={() => load(period)}
            className="px-4 py-2 rounded-lg bg-bg-card border border-bg-line text-sm hover:bg-bg-elev transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Data ── */}
      {data && !loading && (
        <div
          className="px-8 py-5 space-y-4"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(8px)",
            transition: "opacity 0.35s ease-out, transform 0.35s ease-out",
          }}
        >
          {/* KPI — row 1: headline revenue */}
          <div className="grid grid-cols-4 gap-3">
            <KpiCard
              label="New Business"
              value={data.totalPolicies}
              format={(v) => Math.round(v).toString()}
              icon={<FileText className="w-4 h-4" />}
              accent="#8B5CF6"
              sub={`${data.renewedPolicies} written`}
            />
            <KpiCard
              label="Gross Written Premium"
              value={data.gwp}
              format={(v) => formatCurrency(v)}
              icon={<PoundSterling className="w-4 h-4" />}
              accent="#3B82F6"
            />
            <KpiCard
              label="Net Earn"
              value={data.netEarn}
              format={(v) => formatCurrency(v)}
              icon={<TrendingUp className="w-4 h-4" />}
              accent="#10B981"
              sub={data.gwp > 0 ? `${((data.netEarn / data.gwp) * 100).toFixed(0)}% margin` : undefined}
            />
            <KpiCard
              label="Avg Premium"
              value={data.avgPremium}
              format={(v) => formatCurrency(v)}
              icon={<Calculator className="w-4 h-4" />}
              accent="#06B6D4"
            />
          </div>

          {/* KPI — row 2: income breakdown + attachment rates */}
          <div className="grid grid-cols-6 gap-3">
            <KpiCard
              label="Finance Fees"
              value={data.totalFinanceFees}
              format={(v) => formatCurrency(v)}
              icon={<CreditCard className="w-4 h-4" />}
              accent="#3B82F6"
              sub={data.gwp > 0 ? `${((data.totalFinanceFees / data.gwp) * 100).toFixed(1)}% of GWP` : undefined}
            />
            <KpiCard
              label="Fees"
              value={data.totalFees}
              format={(v) => formatCurrency(v)}
              icon={<Banknote className="w-4 h-4" />}
              accent="#F59E0B"
              sub={data.totalPolicies > 0 ? `£${(data.totalFees / data.totalPolicies).toFixed(0)} avg` : undefined}
            />
            <KpiCard
              label="Commission"
              value={data.totalCommission}
              format={(v) => formatCurrency(v)}
              icon={<BadgePercent className="w-4 h-4" />}
              accent="#EC4899"
              sub={data.gwp > 0 ? `${((data.totalCommission / data.gwp) * 100).toFixed(1)}% of GWP` : undefined}
            />
            <RateCard label="Finance Pen" value={data.financePenPct} color="#3B82F6" icon={<Landmark className="w-4 h-4" />} />
            <RateCard label="Legal Add-on" value={data.legalAddonPct} color="#10B981" icon={<Scale className="w-4 h-4" />} />
            <RateCard label="Breakdown" value={data.breakdownPct} color="#8B5CF6" icon={<Wrench className="w-4 h-4" />} />
          </div>

          {data.totalPolicies === 0 ? (
            <div className="flex items-center justify-center h-40 bg-bg-card border border-bg-line rounded-2xl text-txt-muted text-sm">
              No New Business in this period
            </div>
          ) : (
            <>
              {/* Insight highlights */}
              <InsightBar data={data} period={period} />

              {/* Main content */}
              {period === "today" ? (
                <PolicyTable policies={data.policies} />
              ) : (
                <ChartsSection data={data} />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── KPI card ───────────────────────────────────────────────────────────────
function KpiCard({
  label, value, format, icon, accent, sub,
}: {
  label: string; value: number; format: (v: number) => string;
  icon: React.ReactNode; accent: string; sub?: string;
}) {
  const animated = useCountUp(value);
  return (
    <div
      className="relative bg-bg-card border border-bg-line rounded-2xl p-4 overflow-hidden group hover:border-opacity-80 transition-all duration-200"
      style={{ boxShadow: "0 1px 0 rgba(255,255,255,0.03) inset" }}
    >
      {/* Subtle glow on hover */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl pointer-events-none"
        style={{ background: `radial-gradient(ellipse at top left, ${accent}18 0%, transparent 60%)` }}
      />
      <div className="flex items-start justify-between mb-2.5">
        <div className="text-[11px] text-txt-muted leading-tight font-medium">{label}</div>
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `${accent}22`, color: accent }}
        >
          {icon}
        </div>
      </div>
      <div className="text-2xl font-bold tabular-nums tracking-tight">{format(animated)}</div>
      {sub && <div className="text-[11px] text-txt-muted mt-1">{sub}</div>}
      {/* Bottom accent line */}
      <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, ${accent}60, transparent)` }} />
    </div>
  );
}

// ── Rate card ──────────────────────────────────────────────────────────────
function RateCard({
  label, value, color, icon,
}: {
  label: string; value: number; color: string; icon: React.ReactNode;
}) {
  const animated = useCountUp(value);
  return (
    <div
      className="relative bg-bg-card border border-bg-line rounded-2xl p-4 overflow-hidden group hover:border-opacity-80 transition-all duration-200"
    >
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl pointer-events-none"
        style={{ background: `radial-gradient(ellipse at top left, ${color}18 0%, transparent 60%)` }}
      />
      <div className="flex items-start justify-between mb-2">
        <div className="text-[11px] text-txt-muted font-medium">{label}</div>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${color}22`, color }}>
          {icon}
        </div>
      </div>
      <div className="text-2xl font-bold tabular-nums">{animated.toFixed(0)}%</div>
      <div className="mt-2.5 h-1.5 rounded-full bg-bg-elev overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${Math.min(100, value)}%`, background: color }}
        />
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, ${color}60, transparent)` }} />
    </div>
  );
}

// ── Insight highlights bar ─────────────────────────────────────────────────
function InsightBar({ data, period }: { data: SummaryResponse; period: Period }) {
  const topAdvisor = data.advisors[0];
  const urgentCount = period === "today"
    ? data.policies.filter((p) => p.daysInAdv <= 3).length
    : 0;
  const highestEarnPolicy = period === "today"
    ? [...data.policies].sort((a, b) => b.earn - a.earn)[0]
    : null;
  const marginPct = data.gwp > 0 ? (data.netEarn / data.gwp) * 100 : 0;

  const chips: { icon: React.ReactNode; text: string; color: string }[] = [];

  if (topAdvisor) {
    chips.push({
      icon: <Crown className="w-3.5 h-3.5" />,
      text: `${topAdvisor.name} leads · ${topAdvisor.policies} policies · ${formatCurrency(topAdvisor.earn)} earn`,
      color: "#F59E0B",
    });
  }
  if (highestEarnPolicy) {
    chips.push({
      icon: <Zap className="w-3.5 h-3.5" />,
      text: `Top earner: ${highestEarnPolicy.clientName} · ${formatCurrency(highestEarnPolicy.earn)} · ${highestEarnPolicy.insurer}`,
      color: "#10B981",
    });
  } else if (!highestEarnPolicy) {
    chips.push({
      icon: <TrendingUp className="w-3.5 h-3.5" />,
      text: `${marginPct.toFixed(0)}% avg margin · ${formatCurrency(data.netEarn)} net earn on ${formatCurrency(data.gwp)} GWP`,
      color: "#10B981",
    });
  }
  if (urgentCount > 0) {
    chips.push({
      icon: <Clock className="w-3.5 h-3.5" />,
      text: `${urgentCount} ${urgentCount === 1 ? "policy" : "policies"} starting within 3 days`,
      color: "#EF4444",
    });
  } else if (period !== "today") {
    chips.push({
      icon: <ArrowUpRight className="w-3.5 h-3.5" />,
      text: `${data.totalPolicies} policies · ${data.insurers.length} insurers · ${data.advisors.length} advisors`,
      color: "#8B5CF6",
    });
  }

  return (
    <div className="flex items-stretch gap-3">
      {chips.slice(0, 3).map((c, i) => (
        <div
          key={i}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-bg-card border border-bg-line text-xs font-medium flex-1 animate-fade-up"
          style={{ animationDelay: `${i * 60}ms`, color: c.color }}
        >
          {c.icon}
          <span className="text-txt-secondary font-normal">{c.text}</span>
        </div>
      ))}
    </div>
  );
}

// ── Sort state ─────────────────────────────────────────────────────────────
type SortKey = keyof PolicyRow | "margin";
type SortDir = "asc" | "desc";

function sortPolicies(rows: PolicyRow[], key: SortKey, dir: SortDir): PolicyRow[] {
  return [...rows].sort((a, b) => {
    let va: number | string;
    let vb: number | string;
    if (key === "margin") {
      va = a.totalPremium > 0 ? a.earn / a.totalPremium : 0;
      vb = b.totalPremium > 0 ? b.earn / b.totalPremium : 0;
    } else {
      va = a[key] as number | string;
      vb = b[key] as number | string;
    }
    if (typeof va === "string") return dir === "asc" ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
    return dir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
  });
}

// ── Policy table ───────────────────────────────────────────────────────────
function PolicyTable({ policies }: { policies: PolicyRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("totalPremium");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const sorted = sortPolicies(policies, sortKey, sortDir);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ChevronsUpDown className="w-3 h-3 opacity-30 ml-1 inline" />;
    return sortDir === "asc"
      ? <ChevronUp className="w-3 h-3 ml-1 inline text-brand-purple" />
      : <ChevronDown className="w-3 h-3 ml-1 inline text-brand-purple" />;
  }

  const headers: { label: string; key: SortKey; align?: string }[] = [
    { label: "Client", key: "clientName" },
    { label: "Ref", key: "policyRef" },
    { label: "Insurer", key: "insurer" },
    { label: "Premium", key: "totalPremium", align: "right" },
    { label: "Finance Fee", key: "financeFees", align: "right" },
    { label: "Our Fee", key: "fees", align: "right" },
    { label: "Commission", key: "commission", align: "right" },
    { label: "Finance", key: "financed" },
    { label: "Legal", key: "legalSold" },
    { label: "Breakdown", key: "breakdownSold" },
    { label: "Advisor", key: "advisor" },
    { label: "Days Adv", key: "daysInAdv", align: "center" },
  ];

  return (
    <div className="bg-bg-card border border-bg-line rounded-2xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-bg-line flex items-center justify-between">
        <span className="text-sm font-semibold">Today&apos;s New Business</span>
        <span className="text-xs text-txt-muted">{policies.length} policies</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bg-line bg-bg-elev/40">
              {headers.map((h) => (
                <th
                  key={h.key}
                  onClick={() => handleSort(h.key)}
                  className={cn(
                    "px-4 py-2.5 text-[11px] font-medium text-txt-muted whitespace-nowrap cursor-pointer select-none hover:text-txt-secondary transition-colors",
                    h.align === "right" ? "text-right" : h.align === "center" ? "text-center" : "text-left"
                  )}
                >
                  {h.label}
                  <SortIcon k={h.key} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => {
              const daysColor =
                p.daysInAdv >= 14 ? "text-brand-green" :
                p.daysInAdv >= 7  ? "text-brand-amber" :
                                    "text-brand-red";
              return (
                <tr
                  key={p.policyRef}
                  className="border-b border-bg-line/50 hover:bg-bg-elev/40 transition-colors opacity-0 animate-fade-up"
                  style={{ animationDelay: `${i * 45}ms` }}
                >
                  <td className="px-4 py-3 font-medium whitespace-nowrap">{p.clientName}</td>
                  <td className="px-4 py-3 text-txt-muted font-mono text-xs">{p.policyRef}</td>
                  <td className="px-4 py-3 text-txt-secondary whitespace-nowrap text-xs">{p.insurer}</td>
                  <td className="px-4 py-3 tabular-nums text-right font-medium">{formatCurrency(p.totalPremium, { decimals: 2 })}</td>
                  <td className="px-4 py-3 tabular-nums text-right text-brand-blue">{formatCurrency(p.financeFees, { decimals: 2 })}</td>
                  <td className="px-4 py-3 tabular-nums text-right text-brand-amber">{formatCurrency(p.fees, { decimals: 2 })}</td>
                  <td className="px-4 py-3 tabular-nums text-right text-brand-green">{formatCurrency(p.commission, { decimals: 2 })}</td>
                  <td className="px-4 py-3">
                    <span className={cn("text-xs font-medium", p.financed ? "text-brand-blue" : "text-txt-muted")}>
                      {p.financed ? "Yes" : "No"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {p.legalSold === "Yes" && <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-brand-green/15 text-brand-green">Paid</span>}
                    {p.legalSold === "Free" && <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-brand-blue/15 text-brand-blue">Free</span>}
                    {p.legalSold === "" && <span className="text-xs text-txt-muted">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {p.breakdownSold !== "" ? (
                      <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-brand-purple/15 text-brand-purple">Yes</span>
                    ) : (
                      <span className="text-xs text-txt-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-txt-secondary whitespace-nowrap text-sm">{p.advisor}</td>
                  <td className={cn("px-4 py-3 tabular-nums text-center font-semibold text-sm", daysColor)}>
                    {p.daysInAdv}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Charts section (week / month / ytd) ───────────────────────────────────
function ChartsSection({ data }: { data: SummaryResponse }) {
  const maxAdvisor = data.advisors[0]?.policies ?? 1;

  return (
    <div className="space-y-4">
      {/* GWP bar chart */}
      <div className="bg-bg-card border border-bg-line rounded-2xl p-5 animate-fade-up" style={{ animationDelay: "0ms" }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm font-semibold">Premium Income</div>
            <div className="text-xs text-txt-muted mt-0.5">{data.trend.length} day{data.trend.length !== 1 ? "s" : ""} · {formatCurrency(data.gwp)} total</div>
          </div>
        </div>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
              <CartesianGrid stroke="#1C1F30" vertical={false} />
              <XAxis dataKey="date" stroke="#6B7088" tickLine={false} axisLine={false} fontSize={11} interval="preserveStartEnd" />
              <YAxis stroke="#6B7088" tickLine={false} axisLine={false} fontSize={11} tickFormatter={(v) => formatCurrency(v)} width={80} />
              <Tooltip
                contentStyle={{ background: "#161827", border: "1px solid #262A3D", borderRadius: 10, fontSize: 12 }}
                formatter={(v: number, name: string) => [formatCurrency(v), name]}
                labelStyle={{ color: "#A8ADC2", marginBottom: 4 }}
                cursor={{ fill: "rgba(139,92,246,0.06)" }}
              />
              <Bar dataKey="gwp" name="GWP" radius={[5, 5, 0, 0]} maxBarSize={36}>
                {data.trend.map((_, i) => (
                  <Cell key={i} fill={i === data.trend.length - 1 ? "#8B5CF6" : "#3B82F6"} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex gap-4 mt-2 text-xs text-txt-muted">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-brand-blue inline-block" />Daily GWP</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-brand-purple inline-block" />Most recent</span>
        </div>
      </div>

      {/* Advisor + Insurer */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-bg-card border border-bg-line rounded-2xl p-5 animate-fade-up" style={{ animationDelay: "80ms" }}>
          <div className="text-sm font-semibold mb-1">Advisor Performance</div>
          <div className="text-xs text-txt-muted mb-4">{data.totalPolicies} policies across {data.advisors.length} advisors</div>
          <div className="space-y-3.5">
            {data.advisors.map((a, i) => (
              <div key={a.name} className="flex items-center gap-3 animate-fade-up" style={{ animationDelay: `${120 + i * 50}ms` }}>
                <div className="w-5 text-xs text-txt-muted tabular-nums font-medium">{i + 1}</div>
                <div className="w-32 text-sm truncate flex-shrink-0">{a.name}</div>
                <div className="flex-1 h-2 rounded-full bg-bg-elev overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(a.policies / maxAdvisor) * 100}%`,
                      background: `linear-gradient(90deg, #3B82F6, #8B5CF6)`,
                      transition: "width 0.6s ease-out",
                    }}
                  />
                </div>
                <div className="text-xs tabular-nums text-right flex-shrink-0 w-32">
                  <span className="text-txt-primary font-semibold">{a.policies}</span>
                  <span className="text-txt-muted mx-1">·</span>
                  <span className="text-brand-green">{formatCurrency(a.earn)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-bg-card border border-bg-line rounded-2xl p-5 animate-fade-up" style={{ animationDelay: "120ms" }}>
          <div className="text-sm font-semibold mb-1">Insurer GWP Breakdown</div>
          <div className="text-xs text-txt-muted mb-4">{data.insurers.length} insurers · {formatCurrency(data.gwp)} total GWP</div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-bg-line">
                {["Insurer", "Written / Total", "GWP Share", "Total GWP", "Avg GWP"].map((h) => (
                  <th key={h} className="pb-2 text-left text-[10px] font-medium text-txt-muted first:pl-0 px-2">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.insurers.map((ins, i) => (
                <tr
                  key={ins.insurer}
                  className="border-b border-bg-line/40 last:border-0 animate-fade-up"
                  style={{ animationDelay: `${120 + i * 40}ms` }}
                >
                  <td className="py-2 first:pl-0 px-2 text-txt-secondary font-medium">{ins.insurer}</td>
                  <td className="py-2 px-2 tabular-nums text-txt-primary">{ins.renewedCount} / {ins.count}</td>
                  <td className="py-2 px-2">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-1.5 rounded-full bg-bg-elev overflow-hidden">
                        <div className="h-full rounded-full bg-brand-purple transition-all duration-700" style={{ width: `${ins.pct}%` }} />
                      </div>
                      <span className="tabular-nums text-txt-muted">{ins.pct.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="py-2 px-2 tabular-nums text-brand-blue font-medium">{formatCurrency(ins.gwp)}</td>
                  <td className="py-2 px-2 tabular-nums text-txt-secondary">{formatCurrency(ins.avgGwp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

