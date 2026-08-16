import dotenv from 'dotenv';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

dotenv.config();
neonConfig.webSocketConstructor = ws;

async function testWebSocketConnection() {
  const url = process.env.POSTGRES_URL;
  if (!url) {
    console.error('POSTGRES_URL is not defined in env');
    return;
  }
  console.log('Testing WebSocket connection to Neon...');
  try {
    const pool = new Pool({ connectionString: url });
    const client = await pool.connect();
    const result = await client.query('SELECT 1 + 1 AS sum');
    console.log('WebSocket connection successful! Result:', result.rows);
    client.release();
    await pool.end();
  } catch (err) {
    console.error('WebSocket connection failed:', err);
  }
}

testWebSocketConnection();
