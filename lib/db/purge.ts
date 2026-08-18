/**
 * Wipes every trace of the test/dev data out of the database (and R2).
 *
 * Everything accumulated while building the product — 17 organizations, half of
 * them named `"<someone>'s Organization"`, invoices numbered from failed test
 * runs, 118 audit rows, 105 webhook deliveries — is noise. It is unusable for a
 * demo and it hides real problems behind fixtures. This script empties the
 * whole public schema, then `seed-demo.ts` puts back one coherent dataset.
 *
 * Two things are deliberately *not* destroyed:
 *
 *  - **`users`**: password hashes cannot be regenerated, so wiping the table
 *    would lock the real accounts out. Only accounts matching the test patterns
 *    below are removed; the rest keep their credentials and get re-attached to
 *    the demo organization by the seed.
 *  - **the migration journal** (`drizzle` schema): it lives outside `public`, so
 *    `drizzle-kit migrate` still considers the schema up to date afterwards.
 *
 * Dry run by default — pass `--yes` to actually delete.
 *
 *   npx tsx lib/db/purge.ts            # shows what would go
 *   npx tsx lib/db/purge.ts --yes      # does it
 *   npx tsx lib/db/purge.ts --yes --skip-r2
 */
import 'dotenv/config';
import { raw, dbDriver } from './drizzle';

/** Tables whose contents survive the purge. */
const KEEP_TABLES = new Set(['users']);

type PlatformEndpoint = {
  organization_id: string | null;
  kind: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
};

/**
 * Accounts created by tests or by the demo seed itself. Everything else in
 * `users` is assumed to be a real person and is left alone.
 */
const DISPOSABLE_USER_PATTERNS = [
  '%@example.com',
  '%@studiobaobab.ci', // recreated by seed-demo.ts
  'test@test.com',
];

const args = new Set(process.argv.slice(2));
const confirmed = args.has('--yes');
const skipR2 = args.has('--skip-r2');

async function listPublicTables(): Promise<string[]> {
  const rows = await raw<{ table_name: string }>(`
    select table_name
      from information_schema.tables
     where table_schema = 'public'
       and table_type = 'BASE TABLE'
     order by table_name
  `);
  return rows.map((r) => r.table_name);
}

async function countRows(table: string): Promise<number> {
  const [row] = await raw<{ count: number }>(`select count(*)::int as count from "${table}"`);
  return row.count;
}

/**
 * Removes the R2 objects backing the rows about to be deleted.
 *
 * Truncating `files` on its own would leave every generated PDF orphaned in the
 * bucket forever: nothing references those keys anymore, so nothing will ever
 * clean them up, and they keep counting against storage. Failures are reported
 * but do not abort — a missing object is exactly the state we want anyway.
 */
async function purgeR2(): Promise<void> {
  const rows = await raw<{ r2_key: string }>('select r2_key from files');
  if (rows.length === 0) {
    console.log('R2  · aucun objet à supprimer');
    return;
  }

  // Imported here rather than at the top: `lib/storage/r2-client` throws on load
  // when the R2 variables are absent, which would make `--skip-r2` unusable on a
  // machine that only has database access.
  const { deleteFileFromR2 } = await import('../storage/upload-service');

  let deleted = 0;
  const failures: string[] = [];
  for (const { r2_key } of rows) {
    try {
      await deleteFileFromR2(r2_key);
      deleted += 1;
    } catch (error) {
      failures.push(`${r2_key} — ${(error as Error).message}`);
    }
  }

  console.log(`R2  · ${deleted}/${rows.length} objets supprimés`);
  for (const failure of failures) console.warn(`     ⚠ ${failure}`);
}

async function main() {
  const tables = await listPublicTables();
  const toTruncate = tables.filter((t) => !KEEP_TABLES.has(t));

  const counts = new Map<string, number>();
  for (const table of tables) counts.set(table, await countRows(table));

  const nonEmpty = toTruncate.filter((t) => (counts.get(t) ?? 0) > 0);
  const totalRows = nonEmpty.reduce((sum, t) => sum + (counts.get(t) ?? 0), 0);

  const disposableUsers = await raw<{ id: string; email: string }>(
    'select id, email from users where email ilike any($1::text[]) order by email',
    [DISPOSABLE_USER_PATTERNS]
  );

  // Le tuyau n8n n'appartient à aucune organisation et ne se reconstruit pas
  // depuis un seed. Le vider a coupé tous les emails de l'instance sans que
  // rien ne le signale : les livraisons partaient vers un endpoint absent, et
  // le routeur n8n se voyait refuser l'appel de vérification faute de clé.
  const n8nEndpoints = await raw<PlatformEndpoint>(
    `select organization_id, kind, url, secret, events, active
     from webhook_endpoints where kind = 'n8n_primary'`
  );
  const integrationKeys = await raw<{ name: string; prefix: string }>(
    `select name, prefix from api_keys
     where revoked_at is null and scopes @> array['webhooks:manage']::text[]`
  );

  console.log(`\nDriver : ${dbDriver}`);
  console.log(`\n${nonEmpty.length} tables non vides, ${totalRows} lignes :`);
  for (const table of nonEmpty) {
    console.log(`  ${String(counts.get(table)).padStart(6)}  ${table}`);
  }

  console.log(`\nusers conservés : ${(counts.get('users') ?? 0) - disposableUsers.length}`);
  if (disposableUsers.length > 0) {
    console.log(`users supprimés : ${disposableUsers.length}`);
    for (const u of disposableUsers) console.log(`          ${u.email}`);
  }

  if (n8nEndpoints.length > 0) {
    console.log(`\nendpoint n8n global : ${n8nEndpoints.length} — réinséré après la purge`);
  }
  if (integrationKeys.length > 0) {
    console.log(`\nATTENTION — ${integrationKeys.length} clé(s) API portant « webhooks:manage » vont être détruites.`);
    for (const k of integrationKeys) console.log(`          ${k.prefix}…  ${k.name}`);
    console.log('          Le secret d’une clé ne se relit pas : il faudra en émettre une nouvelle');
    console.log('          et la recoller dans la credential n8n, sans quoi le routeur reçoit');
    console.log('          les évènements mais se fait refuser /api/v1/webhooks/verify (401).');
  }

  if (!confirmed) {
    console.log('\nSimulation — rien n’a été supprimé. Relancer avec --yes.\n');
    return;
  }

  if (skipR2) {
    console.log('\nR2  · ignoré (--skip-r2) — les objets deviennent orphelins');
  } else {
    console.log('');
    await purgeR2();
  }

  // A single TRUNCATE handles the whole graph at once. Deleting table by table
  // would trip the RESTRICT foreign keys (`invoice_payments.invoice_id`,
  // `signatures.signed_pdf_file_id`, …) unless the order were exactly right;
  // CASCADE here only reaches tables that are in the list anyway.
  const quoted = toTruncate.map((t) => `"${t}"`).join(', ');
  await raw(`truncate table ${quoted} restart identity cascade`);
  console.log(`DB  · ${toTruncate.length} tables vidées`);

  if (disposableUsers.length > 0) {
    await raw('delete from users where id = any($1::uuid[])', [disposableUsers.map((u) => u.id)]);
    console.log(`DB  · ${disposableUsers.length} comptes de test supprimés`);
  }

  for (const e of n8nEndpoints) {
    await raw(
      `insert into webhook_endpoints (organization_id, kind, url, secret, events, active)
       values ($1, $2, $3, $4, $5, $6)`,
      [e.organization_id, e.kind, e.url, e.secret, e.events, e.active]
    );
  }
  if (n8nEndpoints.length > 0) {
    console.log(`DB  · ${n8nEndpoints.length} endpoint(s) n8n réinséré(s), secret inchangé`);
  }

  const remaining = await countRows('users');
  console.log(`\nBase vide. ${remaining} comptes conservés.`);
  console.log('Suite : npx tsx lib/db/seed-demo.ts\n');
}

main()
  .catch((error) => {
    console.error('\nPurge interrompue :', error);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
