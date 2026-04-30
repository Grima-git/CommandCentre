import { findContactByName } from "@/lib/contacts";
import { requireApiAccess, safeText } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SendSmsBody = {
  to?: string;
  toName?: string;
  message?: string;
};

function normalizeUkPhone(phone: string): string {
  const trimmed = phone.trim().replace(/\s+/g, "");
  if (/^07\d{9}$/.test(trimmed)) return trimmed;
  if (/^447\d{9}$/.test(trimmed)) return trimmed;
  return trimmed;
}

function validateSenderId(sender: string): boolean {
  return /^[A-Za-z0-9]{3,11}$/.test(sender);
}

export async function POST(req: Request) {
  const access = await requireApiAccess(req, { section: "home", limit: { windowMs: 60_000, max: 8 } });
  if (access.response) return access.response;

  const apiKey = process.env.FIRETEXT_API_KEY;
  const sender = process.env.FIRETEXT_SENDER_ID ?? "OD1N";

  if (!apiKey) {
    return Response.json({ ok: false, error: "FireText API key is not configured" }, { status: 500 });
  }
  if (!validateSenderId(sender)) {
    return Response.json({ ok: false, error: "FireText sender ID must be 3-11 alphanumeric characters" }, { status: 500 });
  }

  let body: SendSmsBody;
  try {
    body = (await req.json()) as SendSmsBody;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const message = safeText(body.message, 612);
  if (!message) {
    return Response.json({ ok: false, error: "Message is required" }, { status: 400 });
  }
  if (message.length > 612) {
    return Response.json({ ok: false, error: "Message must be 612 characters or fewer" }, { status: 400 });
  }

  const toName = safeText(body.toName, 80);
  const rawTo = safeText(body.to, 20);
  const contact = toName ? findContactByName(toName) : null;
  const rawRecipient = contact?.phone ?? rawTo ?? toName ?? "";
  const to = normalizeUkPhone(rawRecipient);
  if (!/^07\d{9}$/.test(to) && !/^447\d{9}$/.test(to)) {
    return Response.json({ ok: false, error: "Recipient must be a UK mobile number or known contact" }, { status: 400 });
  }

  const params = new URLSearchParams({
    apiKey,
    message,
    from: sender,
    to,
    unicode: "2",
    reference: `odin-${Date.now()}`,
  });

  try {
    const res = await fetch("https://www.firetext.co.uk/api/sendsms", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
      cache: "no-store",
    });
    const text = await res.text();

    if (!res.ok || /\berror\b/i.test(text)) {
      return Response.json({ ok: false, error: "FireText rejected the message" }, { status: 502 });
    }

    return Response.json({
      ok: true,
      recipient: contact?.name ?? to,
    });
  } catch {
    return Response.json({ ok: false, error: "Could not reach FireText" }, { status: 502 });
  }
}
