import 'dotenv/config';
import { db } from './drizzle';
import { users, organizations, memberships } from './schema';
import { hashPassword } from '../auth/session';
import { eq, and } from 'drizzle-orm';

async function seed() {
  const email = 'test@test.com';
  const password = 'admin123';
  const passwordHash = await hashPassword(password);

  // Check if user exists
  let user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!user) {
    const [createdUser] = await db
      .insert(users)
      .values([
        {
          email: email,
          passwordHash: passwordHash,
          fullName: 'Test User',
        },
      ])
      .returning();
    user = createdUser;
    console.log('Initial user created.');
  } else {
    console.log('User already exists, skipping creation.');
  }

  // Check if organization exists
  let org = await db.query.organizations.findFirst({
    where: eq(organizations.slug, 'test-org'),
  });

  if (!org) {
    const [createdOrg] = await db
      .insert(organizations)
      .values({
        name: 'Test Organization',
        slug: 'test-org',
      })
      .returning();
    org = createdOrg;
    console.log('Test Organization created.');
  } else {
    console.log('Test Organization already exists, skipping creation.');
  }

  // Check if membership exists
  const existingMembership = await db.query.memberships.findFirst({
    where: and(
      eq(memberships.organizationId, org.id),
      eq(memberships.userId, user.id)
    ),
  });

  if (!existingMembership) {
    await db.insert(memberships).values({
      organizationId: org.id,
      userId: user.id,
      role: 'owner',
    });
    console.log('Membership created.');
  } else {
    console.log('Membership already exists, skipping creation.');
  }
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

