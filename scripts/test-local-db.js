const { Client } = require('pg');
const path = require('path');
const dotenv = require('dotenv');

const envPath = path.resolve(__dirname, '../.env.local');
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.error('Error loading .env.local file:', result.error);
} else {
  console.log('.env.local file loaded successfully');
  console.log('DATABASE_URL:', process.env.POSTGRES_URL);
}

async function testConnection() {
  const client = new Client({ connectionString: process.env.POSTGRES_URL });

  try {
    await client.connect();
    console.log('Connected to the database successfully.');

    const res = await client.query('SELECT current_database()');
    console.log('Current database:', res.rows[0].current_database);

    const tables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `);

    if (tables.rows.length === 0) {
      console.log('No tables found in the database.');
    } else {
      console.log('Tables found in the database:', tables.rows.map(row => row.table_name));
    }

    await client.end();
  } catch (err) {
    console.error('Database connection error:', err.stack);
  }
}

testConnection();
