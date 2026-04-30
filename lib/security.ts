import { auth } from "@/lib/auth";
import { canAccessPath, normalizeSections, type SectionId, type UserRole } from "@/lib/access-control";

type LimitBucket = { count: number; resetAt: number };

const buckets = new Map<string, LimitBucket>();
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export type SecurityOptions = {
  section?: SectionId;
  role?: "admin" | "global_admin";
  limit?: { windowMs: number; max: number; key?: string };
  csrf?: boolean;
};

export function jsonError(message: string, status = 400): Response {
  return Response.json({ ok: false, error: message }, { status });
}

export function getClientKey(req: Request, suffix = "global"): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = req.headers.get("x-real-ip")?.trim();
  return `${forwarded || realIp || "local"}:${suffix}`;
}

export function checkRateLimit(key: string, windowMs: number, max: number): boolean {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= max) return false;
  current.count++;
  return true;
}

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const host = req.headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function validateCsrf(req: Request): Response | null {
  if (!UNSAFE_METHODS.has(req.method)) return null;
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return jsonError("Cross-site request blocked", 403);
  if (!sameOrigin(req)) return jsonError("Invalid request origin", 403);
  return null;
}

export async function requireApiAccess(req: Request, options: SecurityOptions = {}) {
  if (options.csrf !== false) {
    const csrf = validateCsrf(req);
    if (csrf) return { response: csrf, session: null };
  }

  if (options.limit) {
    const key = options.limit.key ?? getClientKey(req, new URL(req.url).pathname);
    if (!checkRateLimit(key, options.limit.windowMs, options.limit.max)) {
      return { response: jsonError("Too many requests", 429), session: null };
    }
  }

  const session = await auth();
  if (!session?.user) return { response: jsonError("Authentication required", 401), session: null };

  const role = session.user.appRole;
  if (options.role === "global_admin" && role !== "global_admin") {
    return { response: jsonError("Forbidden", 403), session: null };
  }
  if (options.role === "admin" && role !== "global_admin" && role !== "admin") {
    return { response: jsonError("Forbidden", 403), session: null };
  }

  if (options.section) {
    const sections = normalizeSections(session.user.sections, role);
    if (!canAccessPath(`/dashboard/${options.section === "renewals" ? "stats" : options.section}`, sections, role)) {
      return { response: jsonError("Forbidden", 403), session: null };
    }
  }

  return { response: null, session };
}

export function assertAllowedUrl(rawUrl: string, allowedHosts: string[]): string {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") throw new Error("Only HTTPS upstream URLs are allowed");
  if (!allowedHosts.includes(url.hostname.toLowerCase())) throw new Error("Upstream host is not allowed");
  return url.toString().replace(/\/$/, "");
}

export function safeText(value: unknown, maxLength: number): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}
