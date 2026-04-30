import { auth } from "@/lib/auth";
import { findExecByEmail, DEV_USER } from "@/lib/users";
import { Sidebar } from "@/components/sidebar";
import { StatusBar } from "@/components/status-bar";
import { redirect } from "next/navigation";
import { canAccessPath, firstAccessiblePath, normalizeSections } from "@/lib/access-control";
import { headers } from "next/headers";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const exec = findExecByEmail(session.user.email) ?? DEV_USER;
  const sections = normalizeSections(session.user.sections, session.user.appRole);
  const pathname = headers().get("x-pathname") ?? "";
  if (pathname.startsWith("/dashboard") && !canAccessPath(pathname, sections, session.user.appRole)) {
    redirect(firstAccessiblePath(sections));
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex flex-1 min-h-0">
        <Sidebar
          user={{
            name: session.user.name ?? exec.name,
            title: session.user.title ?? exec.title,
            role: session.user.appRole,
            sections,
          }}
        />
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">{children}</main>
      </div>
      <StatusBar />
    </div>
  );
}
