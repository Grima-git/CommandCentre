import { PlaceholderPage } from "@/components/placeholder-page";
import { auth } from "@/lib/auth";
import { findExecByEmail, findExecByRole, DEV_USER } from "@/lib/users";

export default async function Exec5Page() {
  const session = await auth();
  const user = findExecByEmail(session?.user?.email) ?? DEV_USER;
  const slot = findExecByRole("exec-5");
  return (
    <PlaceholderPage
      title="C-Suite Slot 5"
      subtitle={`${slot.title} · pending`}
      description="Tell Claude who this exec is and what their key metrics should be — we'll build a tailored dashboard for them, just like George's renewals view."
      user={{ name: user.name }}
    />
  );
}
