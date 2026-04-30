import { Topbar } from "@/components/topbar";
import { HrOverview } from "@/components/dashboards/hr/overview";
import { auth } from "@/lib/auth";
import { findExecByEmail, DEV_USER } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function HrPage() {
  const session = await auth();
  const exec = findExecByEmail(session?.user?.email) ?? DEV_USER;
  return (
    <div className="flex flex-col h-full">
      <Topbar title="COMMAND CENTRE" subtitle="Young Driver Insurance · HR" user={{ name: exec.name }} />
      <div className="flex-1 min-h-0 flex flex-col">
        <HrOverview />
      </div>
    </div>
  );
}
