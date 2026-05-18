import { auth } from "@/lib/auth";
import { allSectionIds, normalizeSections, type SectionId, type UserRole } from "@/lib/access-control";
import { getPublicUsers, updateLocalUser } from "@/lib/local-users";
import { requireApiAccess, safeText } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAdmin(role: UserRole | undefined) {
  return role === "global_admin" || role === "admin";
}

export async function GET(req: Request) {
  const access = await requireApiAccess(req, {
    role: "admin",
    csrf: false,
    limit: { windowMs: 60_000, max: 60 },
  });
  if (access.response) return access.response;
  const session = access.session;
  if (!isAdmin(session?.user.appRole)) return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
  const users = await getPublicUsers();
  return Response.json({ ok: true, users, sections: allSectionIds() });
}

export async function PATCH(req: Request) {
  const access = await requireApiAccess(req, { role: "admin", limit: { windowMs: 60_000, max: 30 } });
  if (access.response) return access.response;
  const session = access.session;
  if (!isAdmin(session?.user.appRole)) return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });

  let body: { email?: string; role?: UserRole; sections?: SectionId[]; title?: string; name?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const email = safeText(body.email, 254).toLowerCase();
  if (!email) return Response.json({ ok: false, error: "Email is required" }, { status: 400 });

  try {
    const user = await updateLocalUser(email, {
      role: body.role,
      sections: body.sections ? normalizeSections(body.sections, body.role ?? "user") : undefined,
      title: body.title,
      name: body.name,
    });
    return Response.json({ ok: true, user });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Could not update user" }, { status: 400 });
  }
}
