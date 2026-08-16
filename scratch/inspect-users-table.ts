import dotenv from 'dotenv';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

dotenv.config();
neonConfig.webSocketConstructor = ws;

async function inspect() {
  const pool = new Pool({ connectionString: process.env.POSTGRES_URL });
  const client = await pool.connect();
  
  // Inspect users table columns
  const cols = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'users'
  `);
  console.log('Columns of users table:', cols.rows);

  // Check if there is any user that is already considered super admin
  const users = await client.query('SELECT id, email, full_name FROM users LIMIT 5');
  console.log('Sample users:', users.rows);

  client.release();
  await pool.end();
}

inspect();
