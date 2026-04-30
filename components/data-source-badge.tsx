import { cn } from "@/lib/utils";
import type { DataSource } from "@/lib/data/renewals";

type Section = { label: string; source: DataSource };

export function DataSourceBadge({ sections }: { sections: Section[] }) {
  const liveCount = sections.filter((s) => s.source === "live").length;
  const total = sections.length;
  const allLive = liveCount === total;
  const allMock = liveCount === 0;

  const dot = allLive ? "bg-brand-green" : allMock ? "bg-brand-amber" : "bg-brand-blue";
  const label = allLive
    ? "Live data"
    : allMock
      ? "Mock data"
      : `${liveCount}/${total} live`;

  return (
    <div
      className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-bg-card border border-bg-line text-[11px] text-txt-secondary"
      title={sections.map((s) => `${s.label}: ${s.source}`).join("\n")}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", dot)} />
      {label}
    </div>
  );
}
