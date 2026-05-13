import { Topbar } from "@/components/topbar";
import EmailOverview from "@/components/dashboards/email/overview";
import { auth } from "@/lib/auth";
import { findExecByEmail, DEV_USER } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function EmailPage() {
  const session = await auth();
  const exec = findExecByEmail(session?.user?.email) ?? DEV_USER;
  return (
    <div className="flex flex-col h-full">
      <Topbar title="Email" subtitle="Outlook inbox" user={{ name: exec.name }} />
      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        <EmailOverview userName={exec.name} />
      </div>
    </div>
  );
}
