import { db } from './drizzle';
import { sql } from 'drizzle-orm';

/**
 * Grants — or revokes — the platform super-admin flag on one account.
 *
 * `users.is_super_admin` is what opens `/admin` and what the middleware turns
 * into the `x-is-super-admin` header. Nothing in the product can set it: it is
 * deliberately outside the application, since an organization owner must not be
 * able to promote themselves to platform level. Until now that meant editing the
 * row by hand in a SQL console, and a full reset (`npm run db:reset`) leaves the
 * new first account without it — the Administration section simply never appears.
 *
 *   npx tsx lib/db/grant-super-admin.ts <email>
 *   npx tsx lib/db/grant-super-admin.ts <email> --revoke
 */
async function main() {
  const args = process.argv.slice(2);
  const email = args.find((arg) => !arg.startsWith('--'));
  const revoke = args.includes('--revoke');

  if (!email) {
    console.error('Usage: npx tsx lib/db/grant-super-admin.ts <email> [--revoke]');
    process.exit(1);
  }

  const result = (await db.execute(sql`
    update users
       set is_super_admin = ${!revoke}, updated_at = now()
     where lower(email) = lower(${email})
    returning email, full_name, is_super_admin
  `)) as unknown;

  const rows = Array.isArray(result)
    ? (result as any[])
    : ((result as { rows?: any[] })?.rows ?? []);

  if (rows.length === 0) {
    console.error(`Aucun compte avec l'adresse ${email}.`);
    process.exit(1);
  }

  const [user] = rows;
  console.log(
    `${user.full_name} <${user.email}> — super-admin : ${user.is_super_admin ? 'oui' : 'non'}`
  );
  console.log('Le changement prend effet au prochain chargement du tableau de bord.');
  process.exit(0);
}

main().catch((error) => {
  console.error('Échec:', error);
  process.exit(1);
});
