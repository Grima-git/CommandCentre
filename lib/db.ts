// PostgreSQL connection pool (Supabase).
// Falls back to a no-op when DATABASE_URL is not set so local dev without
// a DB still works (file-based storage is used as fallback in local-users.ts
// and modules.ts).

import { Pool } from "pg";

let _pool: Pool | null = null;
let _schemaReady = false;

export function isDbConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}

function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 8_000,
    });
  }
  return _pool;
}

async function ensureSchema(): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS cc_users (
        id           TEXT        PRIMARY KEY,
        email        TEXT        UNIQUE NOT NULL,
        name         TEXT        NOT NULL,
        title        TEXT        NOT NULL DEFAULT 'Team Member',
        role         TEXT        NOT NULL DEFAULT 'user',
        sections     JSONB       NOT NULL DEFAULT '[]'::jsonb,
        password_hash TEXT       NOT NULL DEFAULT '',
        salt         TEXT        NOT NULL DEFAULT '',
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS cc_modules (
        id              INTEGER     PRIMARY KEY DEFAULT 1,
        enabled_modules JSONB       NOT NULL DEFAULT '["renewals","calls","hr","email","calendar","teams"]'::jsonb,
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT single_row CHECK (id = 1)
      );

      INSERT INTO cc_modules (id, enabled_modules)
      VALUES (1, '["renewals","calls","hr","email","calendar","teams"]'::jsonb)
      ON CONFLICT (id) DO NOTHING;
    `);
  } finally {
    client.release();
  }
}

/**
 * Run a parameterised SQL query and return all rows.
 * Automatically ensures the schema exists on first call per process.
 */
export async function dbQuery<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  if (!_schemaReady) {
    await ensureSchema();
    _schemaReady = true;
  }
  const client = await getPool().connect();
  try {
    const result = await client.query(text, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

/** Run a query and return the first row, or null. */
export async function dbQueryOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await dbQuery<T>(text, params);
  return rows[0] ?? null;
}
