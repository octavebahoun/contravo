import dotenv from 'dotenv';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

dotenv.config();
neonConfig.webSocketConstructor = ws;

async function setupSuperAdmin() {
  const pool = new Pool({ connectionString: process.env.POSTGRES_URL });
  const client = await pool.connect();
  
  console.log('Adding is_super_admin column to users table...');
  await client.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT FALSE;
  `);
  
  console.log('Setting octavebahoun@gmail.com as super admin...');
  const result = await client.query(`
    UPDATE users SET is_super_admin = TRUE WHERE email = 'octavebahoun@gmail.com' RETURNING id, email, is_super_admin;
  `);
  console.log('Update result:', result.rows);

  client.release();
  await pool.end();
}

setupSuperAdmin();
