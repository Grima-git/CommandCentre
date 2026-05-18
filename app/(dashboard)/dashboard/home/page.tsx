import { OdinInterface } from "@/components/odin/odin";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await auth();
  // Use the real session name — never fall back to a hardcoded exec name.
  const userName =
    session?.user?.name ??
    session?.user?.email?.split("@")[0] ??
    "there";

  return (
    <div className="flex flex-col h-full">
      <OdinInterface userName={userName} />
    </div>
  );
}
