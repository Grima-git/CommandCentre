import { PlaceholderPage } from "@/components/placeholder-page";
import { auth } from "@/lib/auth";
import { findExecByEmail, DEV_USER } from "@/lib/users";

export default async function CalendarPage() {
  const session = await auth();
  const user = findExecByEmail(session?.user?.email) ?? DEV_USER;
  return (
    <PlaceholderPage
      title="Calendar"
      subtitle="Outlook calendar"
      description="Today's schedule, conflicts, and prep notes for upcoming meetings. Ready for connection to Microsoft Graph."
      user={{ name: user.name }}
    />
  );
}
