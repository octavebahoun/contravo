import 'dotenv/config';
import { db } from './drizzle';
import { webhookEndpoints } from './schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

async function main() {
  const url = 'https://n8n-itenet.duckdns.org/webhook/excellence-events';
  const kind = 'n8n_primary';

  // Check if it already exists
  const existing = await db
    .select()
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.kind, kind))
    .limit(1);

  if (existing.length > 0) {
    console.log('n8n_primary endpoint already exists. Updating URL...');
    await db
      .update(webhookEndpoints)
      .set({
        url,
        active: true,
        updatedAt: new Date(),
      })
      .where(eq(webhookEndpoints.kind, kind));
    console.log('Updated endpoint:', existing[0].id);
  } else {
    console.log('n8n_primary endpoint not found. Creating one...');
    const secret = 'whsec_' + crypto.randomBytes(24).toString('base64url');
    const [created] = await db
      .insert(webhookEndpoints)
      .values({
        kind,
        url,
        secret,
        events: ['*'],
        active: true,
      })
      .returning();
    console.log('Created endpoint:', created);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
