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

// On Netlify, process.cwd() is /var/task (read-only).
// Use /tmp for writable ephemeral storage in serverless environments.
const IS_SERVERLESS = process.cwd() === "/var/task" || process.env.NETLIFY === "true";
const DATA_DIR = IS_SERVERLESS ? path.join("/tmp", "cc-data") : path.join(process.cwd(), "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

function ensureStore() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(USERS_FILE)) writeFileSync(USERS_FILE, "[]\n", "utf8");
}

function readUsers(): StoredUser[] {
  ensureStore();
  try {
    const rows = JSON.parse(readFileSync(USERS_FILE, "utf8")) as StoredUser[];
    return rows.map((user) => ({
      ...user,
      email: user.email.toLowerCase(),
      role: normalizeRole(user.role, user.email),
      sections: normalizeSections(user.sections, normalizeRole(user.role, user.email)),
    }));
  } catch {
    return [];
  }
}

function writeUsers(users: StoredUser[]) {
  ensureStore();
  writeFileSync(USERS_FILE, `${JSON.stringify(users, null, 2)}\n`, "utf8");
}

function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  return {
    salt,
    passwordHash: scryptSync(password, salt, 64).toString("hex"),
  };
}

function verifyPassword(password: string, salt: string, passwordHash: string): boolean {
  const candidate = scryptSync(password, salt, 64);
  const stored = Buffer.from(passwordHash, "hex");
  return stored.length === candidate.length && timingSafeEqual(stored, candidate);
}

function normalizeRole(role: unknown, email: string): UserRole {
  if (email.toLowerCase() === GLOBAL_ADMIN_EMAIL) return "global_admin";
  return role === "global_admin" || role === "admin" || role === "user" ? role : "user";
}

function toPublicUser(user: StoredUser): PublicUser {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, salt, ...safe } = user;
  return safe;
}

export function getPublicUsers(): PublicUser[] {
  return readUsers()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(toPublicUser);
}

export function findUserByEmail(email: string | null | undefined): PublicUser | null {
  if (!email) return null;
  const user = readUsers().find((row) => row.email === email.toLowerCase());
  return user ? toPublicUser(user) : null;
}

export function authenticateLocalUser(email: string, password: string): PublicUser | null {
  const user = readUsers().find((row) => row.email === email.toLowerCase());
  if (!user || !verifyPassword(password, user.salt, user.passwordHash)) return null;
  return toPublicUser(user);
}

export function createLocalUser(input: {
  email: string;
  password: string;
  name: string;
  title?: string;
}): PublicUser {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const password = input.password;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address");
  if (password.length < 8) throw new Error("Password must be at least 8 characters");
  if (!name) throw new Error("Name is required");

  const users = readUsers();
  if (users.some((user) => user.email === email)) throw new Error("An account already exists for that email");

  const role: UserRole = email === GLOBAL_ADMIN_EMAIL ? "global_admin" : "user";
  const now = new Date().toISOString();
  const { salt, passwordHash } = hashPassword(password);
  const user: StoredUser = {
    id: randomBytes(12).toString("hex"),
    email,
    name,
    title: input.title?.trim() || (role === "global_admin" ? "Global Admin" : "Team Member"),
    role,
    sections: role === "global_admin" ? allSectionIds() : DEFAULT_USER_SECTIONS,
    passwordHash,
    salt,
    createdAt: now,
    updatedAt: now,
  };

  writeUsers([...users, user]);
  return toPublicUser(user);
}

export function updateLocalUser(email: string, patch: { role?: UserRole; sections?: SectionId[]; title?: string; name?: string }): PublicUser {
  const users = readUsers();
  const index = users.findIndex((user) => user.email === email.toLowerCase());
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
  writeUsers(users);
  return toPublicUser(updated);
}
