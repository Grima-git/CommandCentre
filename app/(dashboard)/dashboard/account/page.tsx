import { auth } from "@/lib/auth";
import { Topbar } from "@/components/topbar";
import { AccountOverview } from "@/components/account/overview";
import { normalizeSections } from "@/lib/access-control";
import { redirect } from "next/navigation";

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const sections = normalizeSections(session.user.sections, session.user.appRole);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Topbar
        title="Account"
        subtitle="Your profile and access."
        user={{ name: session.user.name ?? "You" }}
      />
      <AccountOverview
        name={session.user.name ?? "Unknown"}
        email={session.user.email ?? ""}
        title={session.user.title ?? "Team Member"}
        role={session.user.appRole}
        sections={sections}
        msConnected={!!session.user.msAccessToken}
      />
    </div>
  );
}
