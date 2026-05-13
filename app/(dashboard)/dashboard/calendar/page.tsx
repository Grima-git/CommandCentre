import { Topbar } from "@/components/topbar";
import CalendarOverview from "@/components/dashboards/calendar/overview";
import { auth } from "@/lib/auth";
import { findExecByEmail, DEV_USER } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const session = await auth();
  const exec = findExecByEmail(session?.user?.email) ?? DEV_USER;
  return (
    <div className="flex flex-col h-full">
      <Topbar title="Calendar" subtitle="Outlook calendar" user={{ name: exec.name }} />
      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        <CalendarOverview userName={exec.name} />
      </div>
    </div>
  );
}
