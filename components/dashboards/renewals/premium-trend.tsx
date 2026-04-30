"use client";

import { Card, CardHeader } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { PremiumTrend } from "@/lib/mock/renewals";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

export function PremiumTrendSection({ data }: { data: PremiumTrend }) {
  return (
    <Card>
      <CardHeader
        title="Premium Income Trend"
        subtitle="Daily premium income (by type)"
        action={
          <div className="flex items-center gap-2">
            <button className="px-2.5 py-1 rounded-md bg-bg-elev border border-bg-line text-xs text-txt-secondary">
              Daily ▾
            </button>
            <button className="p-1.5 rounded-md hover:bg-bg-elev text-txt-muted">⋮</button>
          </div>
        }
      />
      <div className="px-2 flex-1 min-h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data.series} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="rev-renewals" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10B981" stopOpacity={0.6} />
                <stop offset="100%" stopColor="#10B981" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="rev-new" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.6} />
                <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="rev-addons" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.6} />
                <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#1C1F30" vertical={false} />
            <XAxis
              dataKey="date"
              stroke="#6B7088"
              tickLine={false}
              axisLine={false}
              fontSize={11}
            />
            <YAxis
              stroke="#6B7088"
              tickLine={false}
              axisLine={false}
              fontSize={11}
              tickFormatter={(v) => formatCurrency(v, { compact: true })}
            />
            <Tooltip
              contentStyle={{ background: "#161827", border: "1px solid #262A3D", borderRadius: 8 }}
              labelStyle={{ color: "#A8ADC2" }}
              formatter={(v: number, name: string) => [formatCurrency(v, { compact: true }), name]}
            />
            <Area
              type="monotone"
              dataKey="addOns"
              stackId="1"
              stroke="#8B5CF6"
              fill="url(#rev-addons)"
              strokeWidth={1.5}
              name="Add-ons"
            />
            <Area
              type="monotone"
              dataKey="newBusiness"
              stackId="1"
              stroke="#3B82F6"
              fill="url(#rev-new)"
              strokeWidth={1.5}
              name="Financed"
            />
            <Area
              type="monotone"
              dataKey="renewals"
              stackId="1"
              stroke="#10B981"
              fill="url(#rev-renewals)"
              strokeWidth={1.5}
              name="Upfront"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="px-5 py-2 flex items-center gap-4 text-xs">
        <LegendDot color="#10B981" label="Upfront" />
        <LegendDot color="#3B82F6" label="Financed" />
        <LegendDot color="#8B5CF6" label="Net Earn" />
      </div>
      <div className="mt-auto border-t border-bg-line grid grid-cols-2 divide-x divide-bg-line">
        <div className="px-5 py-3.5">
          <div className="text-[11px] text-txt-muted">Total Income (This Week)</div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-lg font-semibold tabular-nums">
              {formatCurrency(data.totalThisWeek, { compact: true })}
            </span>
            <span className="text-[11px] text-brand-green">▲ {data.deltaPct.toFixed(1)}%</span>
          </div>
        </div>
        <div className="px-5 py-3.5">
          <div className="text-[11px] text-txt-muted">vs Last Week</div>
          <div className="text-lg font-semibold mt-0.5 tabular-nums">
            {formatCurrency(data.totalLastWeek, { compact: true })}
          </div>
        </div>
      </div>
    </Card>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-txt-secondary">
      <span className="w-2 h-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
