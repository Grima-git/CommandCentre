import { auth } from "@/lib/auth";
import { getChatMessages } from "@/lib/microsoft-graph";
import { jsonError } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return jsonError("Authentication required", 401);

  const { searchParams } = new URL(req.url);
  const chatId = searchParams.get("chatId");
  if (!chatId) return jsonError("chatId is required", 400);

  if (!session.user.msAccessToken) {
    return jsonError("Not signed in with Microsoft", 401);
  }

  try {
    const messages = await getChatMessages(session.user.msAccessToken, chatId);
    return Response.json({ ok: true, messages });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load messages";
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
