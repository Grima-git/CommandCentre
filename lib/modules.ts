// Global module enable/disable config.
// Lets a global admin hide entire sections (Renewals, Calls, HR) app-wide
// regardless of per-user section assignments.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { TOGGLEABLE_MODULES, type SectionId } from "@/lib/access-control";

export { TOGGLEABLE_MODULES };

const IS_SERVERLESS = process.cwd() === "/var/task" || process.env.NETLIFY === "true";
const DATA_DIR = IS_SERVERLESS ? path.join("/tmp", "cc-data") : path.join(process.cwd(), "data");
const MODULES_FILE = path.join(DATA_DIR, "modules.json");

type ModulesConfig = { enabledModules: SectionId[] };

// All toggleable modules are on by default.
const DEFAULT_CONFIG: ModulesConfig = { enabledModules: ["renewals", "calls", "hr"] };

function ensureStore() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(MODULES_FILE)) {
    writeFileSync(MODULES_FILE, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, "utf8");
  }
}

export function getEnabledModules(): SectionId[] {
  ensureStore();
  try {
    const config = JSON.parse(readFileSync(MODULES_FILE, "utf8")) as ModulesConfig;
    return Array.isArray(config.enabledModules) ? config.enabledModules : DEFAULT_CONFIG.enabledModules;
  } catch {
    return DEFAULT_CONFIG.enabledModules;
  }
}

export function setEnabledModules(modules: SectionId[]): void {
  ensureStore();
  const valid = modules.filter((m) => TOGGLEABLE_MODULES.includes(m));
  writeFileSync(MODULES_FILE, `${JSON.stringify({ enabledModules: valid }, null, 2)}\n`, "utf8");
}
