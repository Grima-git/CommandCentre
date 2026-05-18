"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SECTIONS, TOGGLEABLE_MODULES, type SectionId, type UserRole } from "@/lib/access-control";

type NavItem = (typeof SECTIONS)[number];

export function Sidebar({
  user,
  enabledModules,
}: {
  user: { name: string; email: string; title: string; role: UserRole; sections: SectionId[] };
  enabledModules: SectionId[];
}) {
  const pathname = usePathname();
  const allowed = new Set(user.sections);

  const visibleSections = SECTIONS.filter((section) => {
    if (!allowed.has(section.id)) return false;
    if (section.adminOnly && user.role !== "global_admin" && user.role !== "admin") return false;
    // Hide globally disabled modules (toggleable modules that are switched off)
    if (TOGGLEABLE_MODULES.includes(section.id) && !enabledModules.includes(section.id)) return false;
    return true;
  });

  const topNav = visibleSections.filter((section) => section.placement === "top");
  const bottomNav = visibleSections.filter((section) => section.placement === "bottom");

  return (
    <aside className="w-[220px] shrink-0 bg-bg-panel border-r border-bg-line flex flex-col">
      <div className="p-5 border-b border-bg-line">
        <div className="w-10 h-10 rounded-lg bg-grad-purple flex items-center justify-center">
          <Shield className="w-5 h-5 text-white" />
        </div>
      </div>

      <nav className="flex-1 py-4 px-3 flex flex-col gap-1">
        {topNav.map((item) => (
          <NavLink key={item.href} item={item} active={pathname.startsWith(item.href)} />
        ))}
      </nav>

      <div className="px-3 pb-3 flex flex-col gap-1">
        {bottomNav.map((item) => (
          <NavLink key={item.href} item={item} active={pathname.startsWith(item.href)} />
        ))}
      </div>

      <div className="p-3 border-t border-bg-line">
        <Link
          href="/dashboard/account"
          className={cn(
            "w-full flex items-center gap-3 px-2 py-2 rounded-lg transition",
            pathname.startsWith("/dashboard/account")
              ? "bg-bg-elev border border-bg-line"
              : "hover:bg-bg-elev",
          )}
        >
          <div className="w-8 h-8 rounded-full bg-grad-blue flex items-center justify-center text-xs font-semibold shrink-0">
            {user.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1 text-left min-w-0">
            <div className="text-sm font-medium leading-tight truncate">{user.name}</div>
            <div className="text-[11px] text-txt-muted leading-tight truncate">{user.title}</div>
          </div>
        </Link>
      </div>
    </aside>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition",
        active
          ? "bg-bg-elev text-txt-primary border border-bg-line"
          : "text-txt-secondary hover:bg-bg-elev hover:text-txt-primary",
      )}
    >
      <Icon className="w-4 h-4" />
      {item.label}
    </Link>
  );
}
