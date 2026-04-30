import { cn } from "@/lib/utils";

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-bg-card border border-bg-line rounded-2xl shadow-card flex flex-col w-full",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("px-5 pt-4 pb-3 flex items-start justify-between gap-4", className)}>
      <div>
        <h2 className="text-sm font-semibold tracking-tight uppercase">{title}</h2>
        {subtitle && <p className="text-xs text-txt-muted mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
