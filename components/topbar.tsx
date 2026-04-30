import { Bell, HelpCircle, ChevronDown } from "lucide-react";

export function Topbar({
  title,
  subtitle,
  user,
  rightSlot,
}: {
  title: string;
  subtitle: string;
  user: { name: string };
  rightSlot?: React.ReactNode;
}) {
  const today = new Date();
  const dateStr = today.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const timeStr = today.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const hour = today.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <header className="px-8 py-5 flex items-center justify-between border-b border-bg-line">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-txt-muted mt-0.5">{subtitle}</p>
        </div>
        {rightSlot}
      </div>
      <div className="flex items-center gap-5">
        <div className="text-right">
          <div className="text-sm font-medium">
            {greeting}, {user.name}
          </div>
          <div className="text-xs text-txt-muted">
            {dateStr} · {timeStr}
          </div>
        </div>
        <button className="flex items-center gap-2 px-1 py-1 rounded-lg hover:bg-bg-elev">
          <div className="w-9 h-9 rounded-full bg-grad-blue flex items-center justify-center text-sm font-semibold">
            {user.name.slice(0, 1).toUpperCase()}
          </div>
          <ChevronDown className="w-4 h-4 text-txt-muted" />
        </button>
        <button className="relative p-2 rounded-lg hover:bg-bg-elev">
          <Bell className="w-5 h-5 text-txt-secondary" />
          <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-brand-blue text-[10px] flex items-center justify-center font-semibold">
            3
          </span>
        </button>
        <button className="p-2 rounded-lg hover:bg-bg-elev">
          <HelpCircle className="w-5 h-5 text-txt-secondary" />
        </button>
      </div>
    </header>
  );
}
