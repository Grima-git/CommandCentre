"use client";

import { Card } from "@/components/ui/card";
import { cn, formatCurrency, formatPercent, formatPP } from "@/lib/utils";
import type { RevenuePulse } from "@/lib/mock/renewals";
import { Area, AreaChart, ResponsiveContainer, Cell, Pie, PieChart } from "recharts";
import { PoundSterling, RefreshCw, Lock, Shield, KeyRound, ArrowUp, ArrowDown } from "lucide-react";

type Props = { data: RevenuePulse };

export function RevenuePulseSection({ data }: Props) {
  return (
    <section>
      <div className="px-8 pt-6 pb-4 flex items-end justify-between">
        <div>
          <h2 className="text-base font-semibold uppercase tracking-tight">Revenue Pulse</h2>
          <p className="text-xs text-txt-muted mt-0.5">Key performance at a glance</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-1.5 rounded-lg bg-bg-card border border-bg-line text-xs text-txt-secondary">
            This Week ▾
          </button>
          <button className="px-3 py-1.5 rounded-lg bg-bg-card border border-bg-line text-xs text-txt-secondary">
            Filters ⚙
          </button>
        </div>
      </div>
      <div className="px-8 grid grid-cols-6 gap-4">
        <KpiCard
          label="Gross Written Premium"
          icon={<PoundSterling className="w-4 h-4 text-white" />}
          iconBg="bg-grad-purple"
          value={formatCurrency(data.grossWrittenPremium.value, { compact: true })}
          delta={data.grossWrittenPremium.deltaPct}
          deltaSuffix="%"
          deltaLabel="vs last week"
          trend={data.grossWrittenPremium.trend.map((t) => ({ y: t.y }))}
          trendColor="#8B5CF6"
        />
        <KpiCard
          label="Renewal Rate"
          icon={<RefreshCw className="w-4 h-4 text-white" />}
          iconBg="bg-grad-green"
          value={formatPercent(data.renewalRate.value)}
          delta={data.renewalRate.deltaPP}
          deltaSuffix="pp"
          deltaLabel="vs last week"
          trend={data.renewalRate.trend.map((t) => ({ y: t.y }))}
          trendColor="#10B981"
        />
        <KpiCard
          label="Renewal Premium Value"
          icon={<Lock className="w-4 h-4 text-white" />}
          iconBg="bg-grad-blue"
          value={formatCurrency(data.renewalPremiumValue.value, { compact: true })}
          delta={data.renewalPremiumValue.deltaPct}
          deltaSuffix="%"
          deltaLabel="vs last week"
          trend={data.renewalPremiumValue.trend.map((t) => ({ y: t.y }))}
          trendColor="#3B82F6"
        />
        <KpiCard
          label="Lapse Rate"
          icon={<Shield className="w-4 h-4 text-white" />}
          iconBg="bg-grad-red"
          value={formatPercent(data.lapseRate.value)}
          delta={data.lapseRate.deltaPP}
          deltaSuffix="pp"
          deltaLabel="vs last week"
          trend={data.lapseRate.trend.map((t) => ({ y: t.y }))}
          trendColor="#EF4444"
          invertDelta
        />
        <KpiCard
          label="Avg Premium per Policy"
          icon={<KeyRound className="w-4 h-4 text-white" />}
          iconBg="bg-grad-purple"
          value={formatCurrency(data.avgPremiumPerPolicy.value)}
          delta={data.avgPremiumPerPolicy.deltaPct}
          deltaSuffix="%"
          deltaLabel="vs last week"
          trend={data.avgPremiumPerPolicy.trend.map((t) => ({ y: t.y }))}
          trendColor="#A855F7"
        />
        <NewVsRenewalCard
          newPct={data.newVsRenewal.newBusinessPct}
          renewalsPct={data.newVsRenewal.renewalsPct}
        />
      </div>
    </section>
  );
}

function KpiCard({
  label,
  icon,
  iconBg,
  value,
  delta,
  deltaSuffix,
  deltaLabel,
  trend,
  trendColor,
  invertDelta = false,
}: {
  label: string;
  icon: React.ReactNode;
  iconBg: string;
  value: string;
  delta: number;
  deltaSuffix: string;
  deltaLabel: string;
  trend: { y: number }[];
  trendColor: string;
  invertDelta?: boolean;
}) {
  const isUp = delta >= 0;
  const positive = invertDelta ? !isUp : isUp;
  return (
    <Card className="p-4 flex flex-col">
      <div className="flex items-start justify-between mb-3">
        <div className="text-xs text-txt-muted leading-tight">{label}</div>
        <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", iconBg)}>
          {icon}
        </div>
      </div>
      <div className="text-2xl font-semibold tracking-tight">{value}</div>
      <div className="flex items-center gap-1 mt-1">
        {isUp ? (
          <ArrowUp className={cn("w-3 h-3", positive ? "text-brand-green" : "text-brand-red")} />
        ) : (
          <ArrowDown className={cn("w-3 h-3", positive ? "text-brand-green" : "text-brand-red")} />
        )}
        <span className={cn("text-xs font-medium", positive ? "text-brand-green" : "text-brand-red")}>
          {Math.abs(delta).toFixed(1)}{deltaSuffix}
        </span>
        <span className="text-xs text-txt-muted ml-1">{deltaLabel}</span>
      </div>
      <div className="mt-3 h-9 -mx-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trend}>
            <defs>
              <linearGradient id={`grad-${label.replace(/\s/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={trendColor} stopOpacity={0.5} />
                <stop offset="100%" stopColor={trendColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="y"
              stroke={trendColor}
              strokeWidth={1.5}
              fill={`url(#grad-${label.replace(/\s/g, "")})`}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function NewVsRenewalCard({ newPct, renewalsPct }: { newPct: number; renewalsPct: number }) {
  const data = [
    { name: "New Business", value: newPct, fill: "#3B82F6" },
    { name: "Renewals", value: renewalsPct, fill: "#10B981" },
  ];
  return (
    <Card className="p-4 flex flex-col">
      <div className="text-xs text-txt-muted mb-2">New vs Renewal Split</div>
      <div className="flex-1 relative h-[110px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              cx="50%"
              cy="50%"
              innerRadius={36}
              outerRadius={54}
              paddingAngle={2}
              startAngle={90}
              endAngle={-270}
              stroke="none"
            >
              {data.map((d, i) => (
                <Cell key={i} fill={d.fill} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-xl font-semibold">{newPct}%</div>
          <div className="text-[9px] text-txt-muted leading-tight">New Business</div>
          <div className="text-[10px] text-brand-green mt-0.5">{renewalsPct}% Renewals</div>
        </div>
      </div>
    </Card>
  );
}
