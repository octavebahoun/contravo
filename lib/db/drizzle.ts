import { drizzle as drizzlePostgresJs, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { drizzle as drizzleNeonWs } from 'drizzle-orm/neon-serverless';
import { Pool, neonConfig } from '@neondatabase/serverless';
import postgres from 'postgres';
import ws from 'ws';
import * as schema from './schema';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.POSTGRES_URL) {
  throw new Error('POSTGRES_URL environment variable is not set');
}

/**
 * How we reach Postgres.
 *
 * `postgres-js` (default) speaks the native protocol on **port 5432**. That is
 * the right choice and stays the production path — but some networks accept the
 * TCP connection on 5432 and then never forward it, so the server's very first
 * reply never arrives and every query dies on a connect timeout while the Neon
 * console, on 443, reports the project perfectly healthy.
 *
 * `neon-ws` is the escape hatch: the same database, reached over **WebSocket on
 * 443**, which such a network does let through. It is Neon's own driver and
 * supports interactive transactions, so `withOutbox` and every `db.transaction`
 * behave identically — unlike the HTTP driver, which cannot.
 *
 *   DB_DRIVER=neon-ws
 *
 * Only Neon-hosted URLs work with `neon-ws`; anything else must stay on the
 * default.
 *
 * Sous Next, `ws` et `@neondatabase/serverless` doivent rester **hors du
 * bundle** (`serverExternalPackages` dans `next.config.ts`). Empaqueté, `ws`
 * perd son accélérateur de masquage et la première trame meurt sur
 * `TypeError: b.mask is not a function` : toutes les pages rendues côté serveur
 * retournent 500, inscription comprise.
 */
const driver = process.env.DB_DRIVER === 'neon-ws' ? 'neon-ws' : 'postgres-js';

/**
 * Raw SQL, as the maintenance scripts need it and independent of the driver.
 *
 * `purge.ts` and `seed-demo.ts` issue statements the ORM cannot express —
 * `TRUNCATE`, `information_schema` lookups — and they must keep working whichever
 * driver is active. Parameters are always bound, never interpolated.
 */
export type RawQuery = <T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
) => Promise<T[]>;

let dbInstance: PostgresJsDatabase<typeof schema>;
let rawInstance: RawQuery;
let closeInstance: () => Promise<void>;

if (driver === 'neon-ws') {
  neonConfig.webSocketConstructor = ws;
  const pool = new Pool({ connectionString: process.env.POSTGRES_URL });

  // The two drizzle flavours differ only in the query-result type they carry;
  // every method this codebase calls — select, insert, query, transaction,
  // execute — is the same `PgDatabase` surface. Asserting one type here keeps a
  // single `db` type across the app instead of a union that would destroy
  // inference at several hundred call sites.
  dbInstance = drizzleNeonWs(pool, { schema }) as unknown as PostgresJsDatabase<typeof schema>;
  rawInstance = async <T>(text: string, params: unknown[] = []) =>
    (await pool.query(text, params as never[])).rows as T[];
  closeInstance = () => pool.end();
} else {
  const sql = postgres(process.env.POSTGRES_URL, {
    max: 20,
    idle_timeout: 30,
    connect_timeout: 20,
  });

  dbInstance = drizzlePostgresJs(sql, { schema });
  rawInstance = <T>(text: string, params: unknown[] = []) =>
    sql.unsafe(text, params as never[]) as unknown as Promise<T[]>;
  closeInstance = () => sql.end();
}

export const db = dbInstance;

/** Runs a statement the ORM cannot express. Maintenance scripts only. */
export const raw: RawQuery = rawInstance;

/** Closes the pool. Scripts should call it; the application never does. */
export const closeDb = closeInstance;

/** Which driver is actually in use — worth printing at the top of a script run. */
export const dbDriver = driver;
