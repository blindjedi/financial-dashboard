import { Client } from 'pg';
import dotenv from 'dotenv';

// Load environment variables
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: '.env.local' });
} else {
  dotenv.config();
}

// Initialize the client
const client = new Client({ connectionString: process.env.DATABASE_URL });
let isConnected = false;

async function connectClient() {
  if (!isConnected) {
    try {
      await client.connect();
      isConnected = true;
    } catch (err) {
      console.error('Failed to connect to the database:', err);
      throw err;
    }
  }
}

export { client, connectClient };
