import { PlaceholderPage } from "@/components/placeholder-page";
import { auth } from "@/lib/auth";
import { findExecByEmail, DEV_USER } from "@/lib/users";

export default async function TeamsPage() {
  const session = await auth();
  const user = findExecByEmail(session?.user?.email) ?? DEV_USER;
  return (
    <PlaceholderPage
      title="Teams"
      subtitle="Microsoft Teams chat & meetings"
      description="Recent chats, meeting summaries, action items. Ready for connection to Microsoft Graph."
      user={{ name: user.name }}
    />
  );
}
