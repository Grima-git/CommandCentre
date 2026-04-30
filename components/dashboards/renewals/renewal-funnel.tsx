import { Card, CardHeader } from "@/components/ui/card";
import { cn, formatNumber } from "@/lib/utils";
import type { RenewalFunnel } from "@/lib/mock/renewals";
import { FileText, Eye, CheckCircle2, ShieldCheck } from "lucide-react";

export function RenewalFunnelSection({ data }: { data: RenewalFunnel }) {
  const stages = [
    { label: "Quotes Generated", icon: FileText, count: data.quotesGenerated, conv: 100, delta: null, width: 100 },
    {
      label: "Quotes Viewed",
      icon: Eye,
      count: data.quotesViewed.count,
      conv: data.quotesViewed.conversionPct,
      delta: data.quotesViewed.deltaPP,
      width: 78,
    },
    {
      label: "Quotes Accepted",
      icon: CheckCircle2,
      count: data.quotesAccepted.count,
      conv: data.quotesAccepted.conversionPct,
      delta: data.quotesAccepted.deltaPP,
      width: 56,
    },
    {
      label: "Policies Renewed",
      icon: ShieldCheck,
      count: data.policiesRenewed.count,
      conv: data.policiesRenewed.conversionPct,
      delta: data.policiesRenewed.deltaPP,
      width: 36,
    },
  ];

  return (
    <Card>
      <CardHeader title="Renewal Funnel" subtitle="Track conversion through the renewal journey" />
      <div className="px-5 pb-4 space-y-2.5 flex-1">
        {stages.map((stage) => {
          const Icon = stage.icon;
          const isPositive = (stage.delta ?? 0) >= 0;
          return (
            <div key={stage.label} className="grid grid-cols-[150px_1fr_72px] items-center gap-3">
              <div className="flex items-center gap-2 text-xs text-txt-secondary">
                <Icon className="w-3.5 h-3.5 text-txt-muted" />
                <span className="truncate">{stage.label}</span>
              </div>
              <div className="relative h-7">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-grad-blue flex items-center pl-3 text-xs font-semibold tabular-nums"
                  style={{ width: `${stage.width}%` }}
                >
                  {formatNumber(stage.count)}
                </div>
              </div>
              <div className="text-right tabular-nums">
                <div className="text-sm font-semibold leading-tight">{stage.conv.toFixed(1)}%</div>
                {stage.delta !== null && (
                  <div className={cn("text-[10px] leading-tight", isPositive ? "text-brand-green" : "text-brand-red")}>
                    {isPositive ? "▲" : "▼"} {Math.abs(stage.delta).toFixed(1)}pp
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-auto border-t border-bg-line grid grid-cols-2 divide-x divide-bg-line">
        <div className="px-5 py-3.5">
          <div className="text-[11px] text-txt-muted">Overall Conversion Rate</div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-lg font-semibold tabular-nums">{data.overallConversionPct.toFixed(1)}%</span>
            <span className="text-[11px] text-brand-green">▲ {data.overallConversionDeltaPP.toFixed(1)}pp</span>
          </div>
        </div>
        <div className="px-5 py-3.5">
          <div className="text-[11px] text-txt-muted">Renewal Rate (by count)</div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-lg font-semibold tabular-nums">{data.renewalRateByCount.toFixed(1)}%</span>
            <span className="text-[11px] text-brand-green">▲ {data.renewalRateByCountDeltaPP.toFixed(1)}pp</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
