import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  DEFAULT_USER_SECTIONS,
  GLOBAL_ADMIN_EMAIL,
  allSectionIds,
  normalizeSections,
  type SectionId,
  type UserRole,
} from "@/lib/access-control";
import { isDbConfigured, dbQuery, dbQueryOne } from "@/lib/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StoredUser = {
  id: string;
  email: string;
  name: string;
  title: string;
  role: UserRole;
  sections: SectionId[];
  passwordHash: string;
  salt: string;
  createdAt: string;
  updatedAt: string;
};

export type PublicUser = Omit<StoredUser, "passwordHash" | "salt">;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  return { salt, passwordHash: scryptSync(password, salt, 64).toString("hex") };
}

function verifyPassword(password: string, salt: string, passwordHash: string): boolean {
  const candidate = scryptSync(password, salt, 64);
  const stored = Buffer.from(passwordHash, "hex");
  return stored.length === candidate.length && timingSafeEqual(stored, candidate);
}

function normalizeRole(role: unknown, email: string): UserRole {
  if (email.toLowerCase() === GLOBAL_ADMIN_EMAIL.toLowerCase()) return "global_admin";
  return role === "global_admin" || role === "admin" || role === "user" ? role : "user";
}

function toPublicUser(row: StoredUser): PublicUser {
  const { passwordHash: _ph, salt: _s, ...safe } = row;
  void _ph; void _s;
  return safe;
}

// ---------------------------------------------------------------------------
// Database row → StoredUser mapper
// ---------------------------------------------------------------------------

type DbRow = {
  id: string;
  email: string;
  name: string;
  title: string;
  role: string;
  sections: SectionId[] | string;
  password_hash: string;
  salt: string;
  created_at: string | Date;
  updated_at: string | Date;
};

function rowToStoredUser(row: DbRow): StoredUser {
  const email = row.email.toLowerCase();
  const role = normalizeRole(row.role, email);
  const rawSections: SectionId[] = Array.isArray(row.sections)
    ? (row.sections as SectionId[])
    : (JSON.parse(row.sections as string) as SectionId[]);
  return {
    id: row.id,
    email,
    name: row.name,
    title: row.title,
    role,
    sections: normalizeSections(rawSections, role),
    passwordHash: row.password_hash,
    salt: row.salt,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

// ---------------------------------------------------------------------------
// PostgreSQL implementation
// ---------------------------------------------------------------------------

async function getPublicUsersDb(): Promise<PublicUser[]> {
  const rows = await dbQuery<DbRow>("SELECT * FROM cc_users ORDER BY name");
  return rows.map(rowToStoredUser).map(toPublicUser);
}

async function findUserByEmailDb(email: string): Promise<PublicUser | null> {
  const row = await dbQueryOne<DbRow>(
    "SELECT * FROM cc_users WHERE email = $1",
    [email.toLowerCase()],
  );
  if (!row) return null;
  return toPublicUser(rowToStoredUser(row));
}

async function authenticateLocalUserDb(email: string, password: string): Promise<PublicUser | null> {
  const row = await dbQueryOne<DbRow>(
    "SELECT * FROM cc_users WHERE email = $1",
    [email.toLowerCase()],
  );
  if (!row) return null;
  if (!verifyPassword(password, row.salt, row.password_hash)) return null;
  return toPublicUser(rowToStoredUser(row));
}

async function createLocalUserDb(input: {
  email: string;
  password: string;
  name: string;
  title?: string;
}): Promise<PublicUser> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address");
  if (input.password.length < 8) throw new Error("Password must be at least 8 characters");
  if (!name) throw new Error("Name is required");

  const existing = await dbQueryOne("SELECT id FROM cc_users WHERE email = $1", [email]);
  if (existing) throw new Error("An account already exists for that email");

  const role: UserRole = email === GLOBAL_ADMIN_EMAIL.toLowerCase() ? "global_admin" : "user";
  const { salt, passwordHash } = hashPassword(input.password);
  const id = randomBytes(12).toString("hex");
  const title = input.title?.trim() || (role === "global_admin" ? "Global Admin" : "Team Member");
  const sections = role === "global_admin" ? allSectionIds() : DEFAULT_USER_SECTIONS;

  const row = await dbQueryOne<DbRow>(
    `INSERT INTO cc_users (id, email, name, title, role, sections, password_hash, salt)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
     RETURNING *`,
    [id, email, name, title, role, JSON.stringify(sections), passwordHash, salt],
  );
  if (!row) throw new Error("Failed to create user");
  return toPublicUser(rowToStoredUser(row));
}

async function updateLocalUserDb(
  email: string,
  patch: { role?: UserRole; sections?: SectionId[]; title?: string; name?: string },
): Promise<PublicUser> {
  const row = await dbQueryOne<DbRow>(
    "SELECT * FROM cc_users WHERE email = $1",
    [email.toLowerCase()],
  );
  if (!row) throw new Error("User not found");

  const existing = rowToStoredUser(row);
  const role = normalizeRole(patch.role ?? existing.role, existing.email);
  const sections = normalizeSections(patch.sections ?? existing.sections, role);
  const name = patch.name?.trim() || existing.name;
  const title = patch.title?.trim() ?? existing.title;

  const updated = await dbQueryOne<DbRow>(
    `UPDATE cc_users SET name=$1, title=$2, role=$3, sections=$4::jsonb, updated_at=NOW()
     WHERE email=$5 RETURNING *`,
    [name, title, role, JSON.stringify(sections), email.toLowerCase()],
  );
  if (!updated) throw new Error("User not found");
  return toPublicUser(rowToStoredUser(updated));
}

// ---------------------------------------------------------------------------
// File-based fallback (used when DATABASE_URL is not set)
// ---------------------------------------------------------------------------

const IS_SERVERLESS = process.cwd() === "/var/task" || process.env.NETLIFY === "true";
const DATA_DIR = IS_SERVERLESS ? path.join("/tmp", "cc-data") : path.join(process.cwd(), "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

function ensureFileStore() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(USERS_FILE)) writeFileSync(USERS_FILE, "[]\n", "utf8");
}

function readUsersFile(): StoredUser[] {
  ensureFileStore();
  try {
    const rows = JSON.parse(readFileSync(USERS_FILE, "utf8")) as StoredUser[];
    return rows.map((user) => ({
      ...user,
      email: user.email.toLowerCase(),
      role: normalizeRole(user.role, user.email),
      sections: normalizeSections(user.sections, normalizeRole(user.role, user.email)),
    }));
  } catch { return []; }
}

function writeUsersFile(users: StoredUser[]) {
  ensureFileStore();
  writeFileSync(USERS_FILE, `${JSON.stringify(users, null, 2)}\n`, "utf8");
}

function getPublicUsersFile(): PublicUser[] {
  return readUsersFile().sort((a, b) => a.name.localeCompare(b.name)).map(toPublicUser);
}

function findUserByEmailFile(email: string): PublicUser | null {
  const user = readUsersFile().find((u) => u.email === email.toLowerCase());
  return user ? toPublicUser(user) : null;
}

function createLocalUserFile(input: {
  email: string; password: string; name: string; title?: string;
}): PublicUser {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address");
  if (input.password.length < 8) throw new Error("Password must be at least 8 characters");
  if (!name) throw new Error("Name is required");
  const users = readUsersFile();
  if (users.some((u) => u.email === email)) throw new Error("An account already exists for that email");
  const role: UserRole = email === GLOBAL_ADMIN_EMAIL.toLowerCase() ? "global_admin" : "user";
  const now = new Date().toISOString();
  const { salt, passwordHash } = hashPassword(input.password);
  const user: StoredUser = {
    id: randomBytes(12).toString("hex"),
    email, name,
    title: input.title?.trim() || (role === "global_admin" ? "Global Admin" : "Team Member"),
    role,
    sections: role === "global_admin" ? allSectionIds() : DEFAULT_USER_SECTIONS,
    passwordHash, salt, createdAt: now, updatedAt: now,
  };
  writeUsersFile([...users, user]);
  return toPublicUser(user);
}

function updateLocalUserFile(
  email: string,
  patch: { role?: UserRole; sections?: SectionId[]; title?: string; name?: string },
): PublicUser {
  const users = readUsersFile();
  const index = users.findIndex((u) => u.email === email.toLowerCase());
  if (index === -1) throw new Error("User not found");
  const existing = users[index];
  const role = normalizeRole(patch.role ?? existing.role, existing.email);
  const updated: StoredUser = {
    ...existing,
    name: patch.name?.trim() || existing.name,
    title: patch.title?.trim() ?? existing.title,
    role,
    sections: normalizeSections(patch.sections ?? existing.sections, role),
    updatedAt: new Date().toISOString(),
  };
  users[index] = updated;
  writeUsersFile(users);
  return toPublicUser(updated);
}

// ---------------------------------------------------------------------------
// Upsert on login — called from auth.ts on every sign-in so every user
// who authenticates (SSO or credentials) gets a row in cc_users.
// ---------------------------------------------------------------------------

export async function upsertUserFromLogin(input: {
  email: string;
  name: string;
}): Promise<void> {
  if (!isDbConfigured()) return; // file store: users must self-register
  const email = input.email.trim().toLowerCase();
  const name = (input.name.trim()) || email.split("@")[0];
  const role: UserRole =
    email === GLOBAL_ADMIN_EMAIL.toLowerCase() ? "global_admin" : "user";
  const sections = JSON.stringify(
    role === "global_admin" ? allSectionIds() : DEFAULT_USER_SECTIONS,
  );
  const title = role === "global_admin" ? "Global Admin" : "Team Member";
  const id = randomBytes(12).toString("hex");

  // INSERT the user the first time; on subsequent logins just refresh their
  // display name (and updated_at) but leave role/title/sections alone so
  // admin edits are preserved.
  await dbQuery(
    `INSERT INTO cc_users (id, email, name, title, role, sections, password_hash, salt)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, '', '')
     ON CONFLICT (email) DO UPDATE
       SET name       = EXCLUDED.name,
           updated_at = NOW()`,
    [id, email, name, title, role, sections],
  );
}

// ---------------------------------------------------------------------------
// Public API — automatically routes to DB or file based on DATABASE_URL
// ---------------------------------------------------------------------------

export async function getPublicUsers(): Promise<PublicUser[]> {
  if (isDbConfigured()) return getPublicUsersDb();
  return Promise.resolve(getPublicUsersFile());
}

export async function findUserByEmail(email: string | null | undefined): Promise<PublicUser | null> {
  if (!email) return null;
  if (isDbConfigured()) return findUserByEmailDb(email);
  return Promise.resolve(findUserByEmailFile(email));
}

export async function authenticateLocalUser(email: string, password: string): Promise<PublicUser | null> {
  if (isDbConfigured()) return authenticateLocalUserDb(email, password);
  const user = readUsersFile().find((u) => u.email === email.toLowerCase());
  if (!user || !verifyPassword(password, user.salt, user.passwordHash)) return null;
  return Promise.resolve(toPublicUser(user));
}

export async function createLocalUser(input: {
  email: string; password: string; name: string; title?: string;
}): Promise<PublicUser> {
  if (isDbConfigured()) return createLocalUserDb(input);
  return Promise.resolve(createLocalUserFile(input));
}

export async function updateLocalUser(
  email: string,
  patch: { role?: UserRole; sections?: SectionId[]; title?: string; name?: string },
): Promise<PublicUser> {
  if (isDbConfigured()) return updateLocalUserDb(email, patch);
  return Promise.resolve(updateLocalUserFile(email, patch));
}
