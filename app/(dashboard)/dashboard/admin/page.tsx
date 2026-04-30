import { Topbar } from "@/components/topbar";
import { AdminUsersPanel } from "@/components/admin/users-panel";
import { auth } from "@/lib/auth";
import { findExecByEmail, DEV_USER } from "@/lib/users";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user || (session.user.appRole !== "global_admin" && session.user.appRole !== "admin")) {
    redirect("/dashboard/home");
  }
  const exec = findExecByEmail(session.user.email) ?? DEV_USER;

  return (
    <div className="flex flex-col h-full">
      <Topbar title="COMMAND CENTRE" subtitle="Young Driver Insurance · Admin" user={{ name: session.user.name ?? exec.name }} />
      <div className="flex-1 min-h-0 flex flex-col">
        <AdminUsersPanel currentUserEmail={session.user.email ?? ""} currentRole={session.user.appRole} />
      </div>
    </div>
  );
}
