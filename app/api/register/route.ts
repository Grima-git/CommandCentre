import { createLocalUser, getPublicUsers } from "@/lib/local-users";
import { GLOBAL_ADMIN_EMAIL } from "@/lib/access-control";
import { getClientKey, checkRateLimit, jsonError, safeText, validateCsrf } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const csrf = validateCsrf(req);
  if (csrf) return csrf;
  if (!checkRateLimit(getClientKey(req, "register"), 60_000, 5)) return jsonError("Too many requests", 429);

  let body: { email?: string; password?: string; name?: string; title?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const email = safeText(body.email, 254).toLowerCase();
    const existingUsers = await getPublicUsers();
    const publicRegistration = process.env.ENABLE_PUBLIC_REGISTRATION === "1";
    if (!publicRegistration && (existingUsers.length > 0 || email !== GLOBAL_ADMIN_EMAIL)) {
      return Response.json({ ok: false, error: "Registration is closed. Ask an admin to grant access." }, { status: 403 });
    }
    const user = await createLocalUser({
      email,
      password: body.password ?? "",
      name: safeText(body.name, 120),
      title: safeText(body.title, 120),
    });
    return Response.json({ ok: true, user });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Could not create account" }, { status: 400 });
  }
}
