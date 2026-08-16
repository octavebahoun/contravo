import 'dotenv/config';
import { db } from '../db/drizzle';
import { webhookEndpoints } from '../db/schema';

async function main() {
  const allEndpoints = await db.select().from(webhookEndpoints);
  console.log('--- Webhook Endpoints in Database ---');
  console.dir(allEndpoints, { depth: null });
}

main().catch(console.error);
