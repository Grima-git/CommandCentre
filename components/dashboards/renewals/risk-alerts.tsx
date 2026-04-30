import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { RiskAlert } from "@/lib/mock/renewals";
import { AlertCircle, AlertTriangle, Info, CheckCircle2, ArrowRight } from "lucide-react";

const severityConfig = {
  critical: { Icon: AlertCircle, fg: "text-brand-red", bg: "bg-brand-red/15" },
  warning: { Icon: AlertTriangle, fg: "text-brand-amber", bg: "bg-brand-amber/15" },
  info: { Icon: Info, fg: "text-brand-blue", bg: "bg-brand-blue/15" },
  success: { Icon: CheckCircle2, fg: "text-brand-green", bg: "bg-brand-green/15" },
};

export function RiskAlertsSection({ data }: { data: RiskAlert[] }) {
  return (
    <Card>
      <CardHeader title="Risk & Alerts" subtitle="Important alerts requiring attention" />
      <div className="px-5 pb-3 space-y-2 flex-1">
        {data.map((alert) => {
          const cfg = severityConfig[alert.severity];
          const Icon = cfg.Icon;
          return (
            <div
              key={alert.id}
              className="flex items-center gap-3 p-2.5 rounded-lg bg-bg-elev/40 border border-bg-line"
            >
              <div className={cn("w-7 h-7 rounded-md flex items-center justify-center shrink-0", cfg.bg)}>
                <Icon className={cn("w-4 h-4", cfg.fg)} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium leading-tight truncate">{alert.title}</div>
                <div className="text-xs text-txt-muted leading-tight mt-0.5 truncate">
                  {alert.description}
                </div>
              </div>
              <button className="px-3 py-1 rounded-md bg-bg-card border border-bg-line text-xs text-txt-secondary hover:bg-bg-line">
                View
              </button>
            </div>
          );
        })}
      </div>
      <div className="mt-auto border-t border-bg-line p-3">
        <button className="w-full flex items-center justify-center gap-2 py-1.5 rounded-lg hover:bg-bg-elev text-sm text-txt-secondary">
          View all alerts
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </Card>
  );
}
