import { getEnabledModules, setEnabledModules, TOGGLEABLE_MODULES } from "@/lib/modules";
import { requireApiAccess, jsonError } from "@/lib/security";
import type { SectionId } from "@/lib/access-control";

export async function GET(req: Request) {
  const { response } = await requireApiAccess(req, { role: "admin", csrf: false });
  if (response) return response;
  return Response.json({
    ok: true,
    enabledModules: getEnabledModules(),
    toggleableModules: TOGGLEABLE_MODULES,
  });
}

export async function PATCH(req: Request) {
  const { response } = await requireApiAccess(req, { role: "global_admin" });
  if (response) return response;

  let body: { enabledModules?: unknown };
  try {
    body = (await req.json()) as { enabledModules?: unknown };
  } catch {
    return jsonError("Invalid JSON");
  }

  if (!Array.isArray(body.enabledModules)) {
    return jsonError("enabledModules must be an array");
  }

  setEnabledModules(body.enabledModules as SectionId[]);
  return Response.json({ ok: true, enabledModules: getEnabledModules() });
}
