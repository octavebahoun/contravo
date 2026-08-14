import 'dotenv/config';
import { db } from './drizzle';
import { users, organizations, memberships } from './schema';
import { hashPassword } from '../auth/session';

async function seed() {
  const email = 'test@test.com';
  const password = 'admin123';
  const passwordHash = await hashPassword(password);

  const [user] = await db
    .insert(users)
    .values([
      {
        email: email,
        passwordHash: passwordHash,
        fullName: 'Test User',
      },
    ])
    .returning();

  console.log('Initial user created.');

  const [org] = await db
    .insert(organizations)
    .values({
      name: 'Test Organization',
      slug: 'test-org',
    })
    .returning();

  await db.insert(memberships).values({
    organizationId: org.id,
    userId: user.id,
    role: 'owner',
  });

}

seed()
  .catch((error) => {
    console.error('Seed process failed:', error);
    process.exit(1);
  })
  .finally(() => {
    console.log('Seed process finished. Exiting...');
    process.exit(0);
  });
