import {
  BarChart3,
  Bell,
  BriefcaseBusiness,
  Calendar,
  Home,
  Mail,
  Phone,
  Settings,
  ShieldCheck,
  Sparkles,
  User,
  Users,
  Users2,
  type LucideIcon,
} from "lucide-react";

export type UserRole = "global_admin" | "admin" | "user";
export type SectionId =
  | "home"
  | "renewals"
  | "new-business"
  | "calls"
  | "hr"
  | "ai-query"
  | "email"
  | "teams"
  | "calendar"
  | "notifications"
  | "settings"
  | "admin"
  | "account";

export type SectionDefinition = {
  id: SectionId;
  label: string;
  href: string;
  icon: LucideIcon;
  placement: "top" | "bottom";
  adminOnly?: boolean;
};

export const GLOBAL_ADMIN_EMAIL = "t.wilson@myfirst.com";

export const SECTIONS: SectionDefinition[] = [
  { id: "home", label: "Home", href: "/dashboard/home", icon: Home, placement: "top" },
  { id: "renewals", label: "Renewals", href: "/dashboard/stats", icon: BarChart3, placement: "top" },
  { id: "new-business", label: "New Business", href: "/dashboard/new-business", icon: BriefcaseBusiness, placement: "top" },
  { id: "calls", label: "Calls", href: "/dashboard/calls", icon: Phone, placement: "top" },
  { id: "hr", label: "HR", href: "/dashboard/hr", icon: Users, placement: "top" },
  { id: "ai-query", label: "AI Query", href: "/dashboard/ai-query", icon: Sparkles, placement: "top" },
  { id: "email", label: "Email", href: "/dashboard/email", icon: Mail, placement: "top" },
  { id: "teams", label: "Teams", href: "/dashboard/teams", icon: Users2, placement: "top" },
  { id: "calendar", label: "Calendar", href: "/dashboard/calendar", icon: Calendar, placement: "top" },
  { id: "admin", label: "Admin", href: "/dashboard/admin", icon: ShieldCheck, placement: "bottom", adminOnly: true },
  { id: "notifications", label: "Notifications", href: "/dashboard/notifications", icon: Bell, placement: "bottom" },
  { id: "settings", label: "Settings", href: "/dashboard/settings", icon: Settings, placement: "bottom" },
  { id: "account", label: "Account", href: "/dashboard/account", icon: User, placement: "bottom" },
];

export const DEFAULT_USER_SECTIONS: SectionId[] = ["home", "renewals", "new-business", "calls", "hr"];

// Sections that a global admin can toggle on/off app-wide.
export const TOGGLEABLE_MODULES: SectionId[] = ["renewals", "new-business", "calls", "hr", "email", "calendar", "teams"];

export function allSectionIds(): SectionId[] {
  return SECTIONS.map((section) => section.id);
}

export function normalizeSections(sections: unknown, role: UserRole): SectionId[] {
  const valid = new Set(allSectionIds());
  const source = Array.isArray(sections) ? sections : DEFAULT_USER_SECTIONS;
  const result = source.filter((section): section is SectionId => typeof section === "string" && valid.has(section as SectionId));
  const withHome: SectionId[] = result.includes("home") ? result : ["home", ...result];
  // account is always visible to everyone
  const withAccount: SectionId[] = withHome.includes("account") ? withHome : [...withHome, "account"];
  if (role === "global_admin" || role === "admin") {
    return Array.from(new Set<SectionId>([...withAccount, "admin"]));
  }
  return withAccount.filter((section) => section !== "admin");
}

export function canAccessPath(pathname: string, sections: SectionId[], role: UserRole): boolean {
  if (role === "global_admin") return true;
  if (pathname.startsWith("/dashboard/renewals")) return sections.includes("renewals");
  if (pathname.startsWith("/dashboard/new-business")) return sections.includes("new-business");
  const section = SECTIONS.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  if (!section) return true;
  if (section.adminOnly && role !== "admin") return false;
  return sections.includes(section.id);
}

export function firstAccessiblePath(sections: SectionId[]): string {
  const first = SECTIONS.find((section) => sections.includes(section.id) && !section.adminOnly);
  return first?.href ?? "/dashboard/home";
}
