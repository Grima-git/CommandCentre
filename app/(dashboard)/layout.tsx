import { auth } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { StatusBar } from "@/components/status-bar";
import { redirect } from "next/navigation";
import { canAccessPath, firstAccessiblePath, normalizeSections } from "@/lib/access-control";
import { getEnabledModules } from "@/lib/modules";
import { headers } from "next/headers";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const sections = normalizeSections(session.user.sections, session.user.appRole);
  // Fallback to all modules enabled if DB is unavailable — never crash the layout.
  const enabledModules = await getEnabledModules().catch(() => [
    "renewals", "calls", "hr", "email", "calendar", "teams",
  ] as const);
  const pathname = headers().get("x-pathname") ?? "";
  if (pathname.startsWith("/dashboard") && !canAccessPath(pathname, sections, session.user.appRole)) {
    redirect(firstAccessiblePath(sections));
  }

  // Derive display name from session — never fall back to DEV_USER so the
  // greeting always shows the actual logged-in person's name.
  const displayName =
    session.user.name ??
    session.user.email?.split("@")[0] ??
    "User";
  const displayTitle = session.user.title ?? "Team Member";

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex flex-1 min-h-0">
        <Sidebar
          user={{
            name: displayName,
            title: displayTitle,
            role: session.user.appRole,
            sections,
            email: session.user.email ?? "",
          }}
          enabledModules={enabledModules}
        />
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">{children}</main>
      </div>
      <StatusBar />
    </div>
  );
}
