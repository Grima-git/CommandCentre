import { Topbar } from "@/components/topbar";
import TeamsOverview from "@/components/dashboards/teams/overview";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function TeamsPage() {
  const session = await auth();
  const userName = session?.user?.name ?? session?.user?.email?.split("@")[0] ?? "User";
  return (
    <div className="flex flex-col h-full">
      <Topbar title="Teams" subtitle="Microsoft Teams" user={{ name: userName }} />
      <TeamsOverview userName={userName} />
    </div>
  );
}
