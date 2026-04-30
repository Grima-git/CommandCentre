import { getContacts, upsertContact } from "@/lib/contacts";
import { requireApiAccess, safeText } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isUkMobile(phone: string): boolean {
  const normalized = phone.trim().replace(/\s+/g, "");
  return /^07\d{9}$/.test(normalized) || /^447\d{9}$/.test(normalized);
}

export async function GET(req: Request) {
  const access = await requireApiAccess(req, { section: "home", limit: { windowMs: 60_000, max: 120 } });
  if (access.response) return access.response;
  return Response.json({ ok: true, contacts: getContacts() });
}

export async function POST(req: Request) {
  const access = await requireApiAccess(req, { section: "home", limit: { windowMs: 60_000, max: 20 } });
  if (access.response) return access.response;

  let body: { name?: string; phone?: string };
  try {
    body = (await req.json()) as { name?: string; phone?: string };
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const name = safeText(body.name, 80);
  const phone = safeText(body.phone, 20);

  if (!name) return Response.json({ ok: false, error: "Contact name is required" }, { status: 400 });
  if (!isUkMobile(phone)) {
    return Response.json({ ok: false, error: "Contact phone must be a UK mobile number" }, { status: 400 });
  }

  const contact = upsertContact({ name, phone });
  return Response.json({ ok: true, contact });
}
