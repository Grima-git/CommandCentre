"use client";

import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { PerformanceMetrics } from "@/lib/mock/renewals";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { ArrowUp, ArrowDown, CreditCard, Gavel, Wrench } from "lucide-react";

export function PerformanceMetricsSection({ data }: { data: PerformanceMetrics }) {
  return (
    <div className="px-8 py-4 grid grid-cols-12 gap-4">
      <div className="col-span-7 grid grid-cols-3 gap-4">
        <RateCard
          label="Finance Pen Rate"
          value={data.financePenRate.value}
          deltaPP={data.financePenRate.deltaPP}
          trend={data.financePenRate.trend}
          color="#3B82F6"
          icon={<CreditCard className="w-4 h-4 text-white" />}
          iconBg="bg-grad-blue"
        />
        <RateCard
          label="Legal Add-on Rate"
          value={data.legalAddonRate.value}
          deltaPP={data.legalAddonRate.deltaPP}
          trend={data.legalAddonRate.trend}
          color="#10B981"
          icon={<Gavel className="w-4 h-4 text-white" />}
          iconBg="bg-grad-green"
        />
        <RateCard
          label="Breakdown Rate"
          value={data.breakdownAddonRate.value}
          deltaPP={data.breakdownAddonRate.deltaPP}
          trend={data.breakdownAddonRate.trend}
          color="#8B5CF6"
          icon={<Wrench className="w-4 h-4 text-white" />}
          iconBg="bg-grad-purple"
        />
      </div>
      <div className="col-span-5 flex">
        <InsurerCard data={data} />
      </div>
    </div>
  );
}

function RateCard({
  label,
  value,
  deltaPP,
  trend,
  color,
  icon,
  iconBg,
}: {
  label: string;
  value: number;
  deltaPP: number;
  trend: { x: string; y: number }[];
  color: string;
  icon: React.ReactNode;
  iconBg: string;
}) {
  const isUp = deltaPP >= 0;
  return (
    <Card className="p-4 flex flex-col">
      <div className="flex items-start justify-between mb-3">
        <div className="text-xs text-txt-muted leading-tight">{label}</div>
        <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0", iconBg)}>
          {icon}
        </div>
      </div>
      <div className="text-2xl font-semibold tracking-tight">{value.toFixed(0)}%</div>
      <div className="flex items-center gap-1 mt-1">
        {isUp ? (
          <ArrowUp className="w-3 h-3 text-brand-green" />
        ) : (
          <ArrowDown className="w-3 h-3 text-brand-red" />
        )}
        <span className={cn("text-xs font-medium", isUp ? "text-brand-green" : "text-brand-red")}>
          {Math.abs(deltaPP).toFixed(1)}pp
        </span>
        <span className="text-xs text-txt-muted ml-1">vs last week</span>
      </div>
      {/* Progress bar */}
      <div className="mt-3 h-1.5 rounded-full bg-bg-elev overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(100, value)}%`, background: color }}
        />
      </div>
      {/* Sparkline */}
      <div className="mt-2 h-8 -mx-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trend.map((t) => ({ y: t.y }))}>
            <defs>
              <linearGradient id={`rate-grad-${label.replace(/\s/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="y"
              stroke={color}
              strokeWidth={1.5}
              fill={`url(#rate-grad-${label.replace(/\s/g, "")})`}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function InsurerCard({ data }: { data: PerformanceMetrics }) {
  const max = data.insurerBreakdown[0]?.count ?? 1;
  return (
    <Card className="flex flex-col w-full">
      <CardHeader
        title="Insurer Distribution"
        subtitle={`${data.totalPolicies} policies this week`}
      />
      <div className="px-5 flex-1 flex flex-col justify-center gap-3 pb-4">
        {data.insurerBreakdown.map((row) => (
          <div key={row.insurer} className="flex items-center gap-3">
            <div className="w-36 text-xs text-txt-secondary truncate flex-shrink-0">
              {row.insurer}
            </div>
            <div className="flex-1 h-1.5 rounded-full bg-bg-elev overflow-hidden">
              <div
                className="h-full rounded-full bg-brand-blue"
                style={{ width: `${(row.count / max) * 100}%` }}
              />
            </div>
            <div className="text-xs tabular-nums text-txt-muted w-14 text-right flex-shrink-0">
              {row.count} · {row.pct.toFixed(0)}%
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
