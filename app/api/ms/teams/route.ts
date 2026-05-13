import { requireApiAccess } from "@/lib/security";
import { auth } from "@/lib/auth";
import { getTeamsChats } from "@/lib/microsoft-graph";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const access = await requireApiAccess(req, {
    section: "home",
    limit: { windowMs: 60_000, max: 30 },
  });
  if (access.response) return access.response;

  const session = await auth();
  const msAccessToken = (session?.user as { msAccessToken?: string } | null)?.msAccessToken;
  if (!msAccessToken) {
    return Response.json({ ok: false, error: "Not signed in with Microsoft" }, { status: 401 });
  }

  try {
    const chats = await getTeamsChats(msAccessToken);
    return Response.json({ ok: true, chats });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ ok: false, error: msg }, { status: 502 });
  }
}
