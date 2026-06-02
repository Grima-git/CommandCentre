import { Topbar } from "@/components/topbar";
import { NewBusinessOverview } from "@/components/dashboards/new-business/overview";
import { auth } from "@/lib/auth";
import { findExecByEmail, DEV_USER } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function NewBusinessDashboardPage() {
  const session = await auth();
  const exec = findExecByEmail(session?.user?.email) ?? DEV_USER;

  return (
    <div className="flex flex-col h-full">
      <Topbar
        title="COMMAND CENTRE"
        subtitle="Young Driver Insurance - New Business"
        user={{ name: exec.name }}
      />
      <div className="flex-1 min-h-0 flex flex-col">
        <NewBusinessOverview userName={exec.name} />
      </div>
    </div>
  );
}
