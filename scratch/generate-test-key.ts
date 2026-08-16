import 'dotenv/config';
import { db } from '../lib/db/drizzle';
import { organizations } from '../lib/db/schema';
import { eq } from 'drizzle-orm';
import { generateApiKey } from '../lib/api-keys';

async function main() {
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.slug, 'test-org'),
  });

  if (!org) {
    console.error('Test organization not found. Please run seed first.');
    process.exit(1);
  }

  console.log('Found organization:', org.name, 'ID:', org.id);

  const keyResult = await generateApiKey({
    name: 'Curl Test Key',
    organizationId: org.id,
    scopes: ['*'],
  });

  console.log('\n--- NEW API KEY GENERATED ---');
  console.log('ID:', keyResult.id);
  console.log('Secret (Use this in Authorization header):');
  console.log(keyResult.secret);
  console.log('-----------------------------\n');
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
