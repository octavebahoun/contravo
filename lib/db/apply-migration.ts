import { readFileSync } from 'fs';
import { db } from './drizzle';
import { sql } from 'drizzle-orm';

/**
 * Applies one hand-written migration file, statement by statement.
 *
 * `drizzle-kit migrate` is not usable here: its snapshot diverged from the
 * production database several migrations ago, so regenerating from the schema
 * would replay changes that are already in place. Since 0008 the migrations are
 * written by hand and made idempotent — this runner is what actually plays them,
 * and until now that was a copy-paste into a SQL console with no record of what
 * ran.
 *
 *   npx tsx lib/db/apply-migration.ts lib/db/migrations/0010_xxx.sql
 *
 * Splits on drizzle's `--> statement-breakpoint` marker so a `DO $$ ... $$`
 * block, which contains its own semicolons, stays in one piece.
 */
async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: npx tsx lib/db/apply-migration.ts <fichier.sql>');
    process.exit(1);
  }

  const statements = readFileSync(file, 'utf8')
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean);

  console.log(`${file} — ${statements.length} instruction(s)`);

  for (const [index, statement] of statements.entries()) {
    const preview = statement.split('\n').filter((l) => !l.startsWith('--'))[0] ?? '';
    process.stdout.write(`  [${index + 1}/${statements.length}] ${preview.slice(0, 70)} … `);
    await db.execute(sql.raw(statement));
    console.log('ok');
  }

  console.log('Migration appliquée.');
  process.exit(0);
}

main().catch((error) => {
  console.error('\nMigration interrompue:', error);
  process.exit(1);
});
