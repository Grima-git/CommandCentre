// PostgreSQL connection (Supabase) using the `postgres` package.
// Pure-JS driver — no native bindings, fully esbuild-compatible.

import postgres from "postgres";

let _sql: ReturnType<typeof postgres> | null = null;
let _schemaReady = false;

export function isDbConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}

function getSql(): ReturnType<typeof postgres> {
  if (!_sql) {
    _sql = postgres(process.env.DATABASE_URL!, {
      ssl: "require",
      max: 3,
      idle_timeout: 20,
      connect_timeout: 10,
      // Required for PgBouncer transaction-mode pooler (Supabase default)
      prepare: false,
    });
  }
  return _sql;
}

async function ensureSchema(): Promise<void> {
  const sql = getSql();
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS cc_users (
      id            TEXT        PRIMARY KEY,
      email         TEXT        UNIQUE NOT NULL,
      name          TEXT        NOT NULL,
      title         TEXT        NOT NULL DEFAULT 'Team Member',
      role          TEXT        NOT NULL DEFAULT 'user',
      sections      JSONB       NOT NULL DEFAULT '[]'::jsonb,
      password_hash TEXT        NOT NULL DEFAULT '',
      salt          TEXT        NOT NULL DEFAULT '',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS cc_modules (
      id              INTEGER     PRIMARY KEY DEFAULT 1,
      enabled_modules JSONB       NOT NULL DEFAULT '["renewals","new-business","calls","hr","email","calendar","teams"]'::jsonb,
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT single_row CHECK (id = 1)
    );

    INSERT INTO cc_modules (id, enabled_modules)
    VALUES (1, '["renewals","new-business","calls","hr","email","calendar","teams"]'::jsonb)
    ON CONFLICT (id) DO NOTHING;

    UPDATE cc_modules
    SET enabled_modules = enabled_modules || '["new-business"]'::jsonb,
        updated_at = NOW()
    WHERE id = 1
      AND NOT (enabled_modules ? 'new-business');
  `);
}

/**
 * Run a parameterised SQL query and return all rows.
 * Automatically ensures the schema exists on first call per process.
 */
export async function dbQuery<T extends Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  if (!_schemaReady) {
    await ensureSchema();
    _schemaReady = true;
  }
  const sql = getSql();
  const rows = await sql.unsafe(text, params as Parameters<typeof sql.unsafe>[1]);
  return rows as unknown as T[];
}

/** Run a query and return the first row, or null. */
export async function dbQueryOne<T extends Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await dbQuery<T>(text, params);
  return rows[0] ?? null;
}
