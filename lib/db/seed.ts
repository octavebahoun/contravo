import 'dotenv/config';
import { stripe } from '../payments/stripe';
import { db } from './drizzle';
import { users, organizations, memberships } from './schema';
import { hashPassword } from '../auth/session';

async function createStripeProducts() {
  console.log('Creating Stripe products and prices...');
  try {
    const baseProduct = await stripe.products.create({
      name: 'Base',
      description: 'Base subscription plan',
    });

    await stripe.prices.create({
      product: baseProduct.id,
      unit_amount: 800, // $8 in cents
      currency: 'usd',
      recurring: {
        interval: 'month',
        trial_period_days: 7,
      },
    });

    const plusProduct = await stripe.products.create({
      name: 'Plus',
      description: 'Plus subscription plan',
    });

    await stripe.prices.create({
      product: plusProduct.id,
      unit_amount: 1200, // $12 in cents
      currency: 'usd',
      recurring: {
        interval: 'month',
        trial_period_days: 7,
      },
    });

    console.log('Stripe products and prices created successfully.');
  } catch (err: any) {
    console.warn('Skipping Stripe product creation: Stripe credentials might not be configured.', err.message);
  }
}

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

  await createStripeProducts();
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
