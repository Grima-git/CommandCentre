"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Shield,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SECTIONS, type SectionId, type UserRole } from "@/lib/access-control";

type NavItem = (typeof SECTIONS)[number];

export function Sidebar({ user }: { user: { name: string; title: string; role: UserRole; sections: SectionId[] } }) {
  const pathname = usePathname();
  const allowed = new Set(user.sections);
  const visibleSections = SECTIONS.filter((section) => {
    if (!allowed.has(section.id)) return false;
    if (section.adminOnly && user.role !== "global_admin" && user.role !== "admin") return false;
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
        <button
          onClick={() => void signOut({ callbackUrl: "/login" })}
          className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-bg-elev transition"
          title="Sign out"
        >
          <div className="w-8 h-8 rounded-full bg-grad-blue flex items-center justify-center text-xs font-semibold">
            {user.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1 text-left">
            <div className="text-sm font-medium leading-tight">{user.name}</div>
            <div className="text-[11px] text-txt-muted leading-tight">{user.title}</div>
          </div>
          <ChevronDown className="w-4 h-4 text-txt-muted" />
        </button>
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
