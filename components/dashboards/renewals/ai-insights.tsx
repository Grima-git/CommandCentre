import { Card, CardHeader } from "@/components/ui/card";
import type { AiInsight } from "@/lib/mock/renewals";
import { BarChart3, Users, Lightbulb, Sparkles } from "lucide-react";

const iconMap = {
  chart: BarChart3,
  cohort: Users,
  forecast: Lightbulb,
};

export function AiInsightsSection({ data }: { data: AiInsight[] }) {
  return (
    <Card>
      <CardHeader
        title="AI Insights"
        subtitle="Intelligent insights and predictions"
        action={
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-elev border border-bg-line text-xs text-txt-secondary">
            <Sparkles className="w-3.5 h-3.5 text-brand-purple" />
            Ask AI a question
          </button>
        }
      />
      <div className="px-5 pb-5 space-y-2.5 flex-1 flex flex-col">
        {data.map((insight) => {
          const Icon = iconMap[insight.icon];
          return (
            <div
              key={insight.id}
              className="flex items-center gap-3 p-3 rounded-lg bg-bg-elev/40 border border-bg-line flex-1"
            >
              <div className="w-9 h-9 rounded-lg bg-brand-purple/15 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-brand-purple" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium leading-tight">{insight.title}</div>
                <div className="text-xs text-txt-muted leading-relaxed mt-1">{insight.body}</div>
              </div>
              <button className="shrink-0 px-3 py-1.5 rounded-md bg-bg-card border border-bg-line text-xs text-txt-secondary hover:bg-bg-line">
                {insight.cta}
              </button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
