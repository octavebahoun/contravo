/**
 * Issues the API key that n8n uses to call back into Contravo.
 *
 * The router workflow cannot verify the webhook HMAC itself — the n8n Code
 * sandbox has no `crypto` and no `process.env` — so it POSTs every event body
 * to `/api/v1/webhooks/verify`, which demands `webhooks:manage`. The healthcheck
 * workflow polls `/clients?limit=1`. Those two scopes, nothing more.
 *
 * This has to run **after** the first sign-up: `api_keys.organization_id` is NOT
 * NULL, so no key can exist before an organization does. Skipping it leaves the
 * router receiving events and being refused in 401 — with Contravo still marking
 * every delivery `success`, since n8n did answer 200 at the webhook node.
 *
 *   npx tsx lib/db/bootstrap-n8n-key.ts          # simulation
 *   npx tsx lib/db/bootstrap-n8n-key.ts --yes    # émet la clé
 */
import 'dotenv/config';
import { raw } from './drizzle';
import { generateApiKey } from '../api-keys';

const KEY_NAME = 'n8n — Router & Healthcheck';
const SCOPES = ['webhooks:manage', 'clients:read'];

const confirmed = process.argv.includes('--yes');

async function main() {
  // Une organisation sans membre est inatteignable : personne ne peut s'y
  // connecter, donc aucune clé émise pour elle ne servirait jamais. Le tri par
  // ancienneté seul avait retenu exactement cela — l'organisation abandonnée
  // par une suppression de compte, créée une minute avant la vraie.
  const orgs = await raw<{ id: string; name: string; created_at: string; owner: string }>(
    `select o.id, o.name, o.created_at, u.email as owner
       from organizations o
       join memberships m on m.organization_id = o.id and m.role = 'owner'
       join users u on u.id = m.user_id
      order by o.created_at`
  );

  if (orgs.length === 0) {
    console.error(
      '\nAucune organisation avec un propriétaire. S’inscrire sur l’application\n' +
        'd’abord : une clé API appartient forcément à une organisation.\n'
    );
    process.exitCode = 1;
    return;
  }

  // La plus ancienne : après une remise à zéro, c'est celle du compte
  // administrateur. La clé n'est pas cantonnée à ses données pour autant —
  // `/webhooks/verify` lit l'endpoint global, qui n'appartient à personne.
  const org = orgs[0];
  if (orgs.length > 1) {
    console.log(`${orgs.length} organisations — la plus ancienne est retenue.`);
  }
  console.log(`Organisation : ${org.name}  (propriétaire ${org.owner})`);

  const existing = await raw<{ id: string; prefix: string }>(
    'select id, prefix from api_keys where name = $1 and revoked_at is null',
    [KEY_NAME]
  );

  if (!confirmed) {
    console.log(`\nSimulation.`);
    if (existing.length > 0) {
      console.log(`${existing.length} clé(s) active(s) portant ce nom seraient révoquées :`);
      for (const k of existing) console.log(`  ${k.prefix}…`);
    }
    console.log(`Une clé « ${KEY_NAME} » serait émise (${SCOPES.join(', ')}).`);
    console.log('Relancer avec --yes.\n');
    return;
  }

  if (existing.length > 0) {
    // Révoquer plutôt que supprimer : la ligne garde sa trace d'audit, et une
    // clé compromise ne doit jamais pouvoir réapparaître.
    await raw('update api_keys set revoked_at = now() where name = $1 and revoked_at is null', [KEY_NAME]);
    console.log(`${existing.length} ancienne(s) clé(s) révoquée(s).`);
  }

  const key = await generateApiKey({ name: KEY_NAME, organizationId: org.id, scopes: SCOPES });

  console.log('\n=== Clé émise — affichée une seule fois ===\n');
  console.log(`  ${key.secret}\n`);
  console.log('À coller dans n8n → Credentials → EXCELLENCE_API_KEY → Value :\n');
  console.log(`  Bearer ${key.secret}\n`);
  console.log('Sans cette étape, le routeur reçoit les évènements et se fait refuser');
  console.log('la vérification de signature : aucun email ne part.\n');
}

main()
  .catch((error) => {
    console.error('\nÉchec :', (error as Error).message);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
