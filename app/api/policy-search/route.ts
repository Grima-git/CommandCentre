import { fetchPolicyInfo } from "@/lib/data/connectors/opengi-soap";
import { requireApiAccess, safeText } from "@/lib/security";
import { getCached } from "@/lib/server-cache";

export const dynamic = "force-dynamic";

const POLICY_REF_RE = /^[A-Z0-9/-]{3,40}$/i;

function normalisePolicyRef(value: string | null): string | null {
  const ref = safeText(value, 40).toUpperCase();
  if (!POLICY_REF_RE.test(ref)) return null;
  return ref;
}

export async function GET(req: Request) {
  const access = await requireApiAccess(req, {
    section: "policy-search",
    limit: { windowMs: 60_000, max: 40 },
  });
  if (access.response) return access.response;

  const { searchParams } = new URL(req.url);
  const policyRef = normalisePolicyRef(searchParams.get("policyRef"));
  if (!policyRef) {
    return Response.json({ ok: false, error: "Enter a valid policy reference" }, { status: 400 });
  }

  const rows = await getCached(
    `policy-search:${policyRef}`,
    120_000,
    () => fetchPolicyInfo(policyRef),
  );

  if (!rows) {
    return Response.json({ ok: false, error: "Could not reach OpenGI" }, { status: 502 });
  }

  return Response.json({
    ok: true,
    policyRef,
    count: rows.length,
    results: rows,
  });
}
