import { PlaceholderPage } from "@/components/placeholder-page";
import { auth } from "@/lib/auth";
import { findExecByEmail, DEV_USER } from "@/lib/users";

export default async function NotificationsPage() {
  const session = await auth();
  const user = findExecByEmail(session?.user?.email) ?? DEV_USER;
  return (
    <PlaceholderPage
      title="Notifications"
      subtitle="Alerts and updates"
      description="System alerts, threshold breaches, and AI-flagged anomalies across all dashboards."
      user={{ name: user.name }}
    />
  );
}
