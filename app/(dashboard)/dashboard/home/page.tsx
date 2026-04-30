import { OdinInterface } from "@/components/odin/odin";
import { auth } from "@/lib/auth";
import { findExecByEmail, DEV_USER } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await auth();
  const exec = findExecByEmail(session?.user?.email) ?? DEV_USER;

  return (
    <div className="flex flex-col h-full">
      <OdinInterface userName={exec.name} />
    </div>
  );
}
