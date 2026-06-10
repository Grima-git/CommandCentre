import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { TOGGLEABLE_MODULES, type SectionId } from "@/lib/access-control";
import { isDbConfigured, dbQueryOne } from "@/lib/db";

export { TOGGLEABLE_MODULES };

const DEFAULT_ENABLED: SectionId[] = ["renewals", "new-business", "policy-search", "calls", "hr", "email", "calendar", "teams"];

// ---------------------------------------------------------------------------
// PostgreSQL implementation
// ---------------------------------------------------------------------------

async function getEnabledModulesDb(): Promise<SectionId[]> {
  const row = await dbQueryOne<{ enabled_modules: SectionId[] }>(
    "SELECT enabled_modules FROM cc_modules WHERE id = 1",
  );
  return row?.enabled_modules ?? DEFAULT_ENABLED;
}

async function setEnabledModulesDb(modules: SectionId[]): Promise<void> {
  const valid = modules.filter((m) => TOGGLEABLE_MODULES.includes(m));
  await dbQueryOne(
    `INSERT INTO cc_modules (id, enabled_modules, updated_at)
     VALUES (1, $1::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE SET enabled_modules = $1::jsonb, updated_at = NOW()`,
    [JSON.stringify(valid)],
  );
}

// ---------------------------------------------------------------------------
// File fallback (when DATABASE_URL is not set)
// ---------------------------------------------------------------------------

const IS_SERVERLESS = process.cwd() === "/var/task" || process.env.NETLIFY === "true";
const DATA_DIR = IS_SERVERLESS ? path.join("/tmp", "cc-data") : path.join(process.cwd(), "data");
const MODULES_FILE = path.join(DATA_DIR, "modules.json");

function ensureFileStore() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(MODULES_FILE)) {
    writeFileSync(MODULES_FILE, `${JSON.stringify({ enabledModules: DEFAULT_ENABLED }, null, 2)}\n`, "utf8");
  }
}

function getEnabledModulesFile(): SectionId[] {
  ensureFileStore();
  try {
    const config = JSON.parse(readFileSync(MODULES_FILE, "utf8")) as { enabledModules: SectionId[] };
    return Array.isArray(config.enabledModules) ? config.enabledModules : DEFAULT_ENABLED;
  } catch { return DEFAULT_ENABLED; }
}

function setEnabledModulesFile(modules: SectionId[]): void {
  ensureFileStore();
  const valid = modules.filter((m) => TOGGLEABLE_MODULES.includes(m));
  writeFileSync(MODULES_FILE, `${JSON.stringify({ enabledModules: valid }, null, 2)}\n`, "utf8");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getEnabledModules(): Promise<SectionId[]> {
  if (isDbConfigured()) return getEnabledModulesDb();
  return Promise.resolve(getEnabledModulesFile());
}

export async function setEnabledModules(modules: SectionId[]): Promise<void> {
  if (isDbConfigured()) return setEnabledModulesDb(modules);
  setEnabledModulesFile(modules);
}
