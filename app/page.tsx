import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { findExecByEmail } from "@/lib/users";
import { firstAccessiblePath, normalizeSections } from "@/lib/access-control";

export default async function RootPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const exec = findExecByEmail(session.user.email);
  const sections = normalizeSections(session.user.sections, session.user.appRole);
  redirect(exec?.homePath ?? firstAccessiblePath(sections));
}
