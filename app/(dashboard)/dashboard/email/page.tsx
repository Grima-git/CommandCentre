import { PlaceholderPage } from "@/components/placeholder-page";
import { auth } from "@/lib/auth";
import { findExecByEmail, DEV_USER } from "@/lib/users";

export default async function EmailPage() {
  const session = await auth();
  const user = findExecByEmail(session?.user?.email) ?? DEV_USER;
  return (
    <PlaceholderPage
      title="Email"
      subtitle="Outlook integration"
      description="Inbox triage, summaries, and AI-suggested replies. Ready for connection to Microsoft Graph using the same Entra ID login."
      user={{ name: user.name }}
    />
  );
}
