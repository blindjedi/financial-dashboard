import { Client } from 'pg';
import dotenv from 'dotenv';
import logger from './logger';
import {
  CustomerField,
  CustomersTableType,
  InvoiceForm,
  InvoicesTable,
  LatestInvoiceRaw,
  User,
  Revenue,
} from './definitions';
import { formatCurrency } from './utils';
import { unstable_noStore as noStore } from 'next/cache';


// Load environment variables only in non-production environments
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: '.env.local' });
} else {
  dotenv.config();
}

logger.info('NODE_ENV:', process.env.NODE_ENV);

// Determine the appropriate connection string
let connectionString = process.env.POSTGRES_URL;

if (process.env.NODE_ENV === 'production') {
  logger.info('Using connection string:', process.env.POSTGRES_URL_NON_POOLING);
  connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;

}


// Initialize client configuration using environment variables
const clientConfig = {
  connectionString,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
};

async function connectClient() {
  if (connectionString?.includes('localhost')) {
    logger.info('Using local database');
  }
  else {
    logger.info('Using production database');
    logger.info('Database connection string:', connectionString);
  }

  const client = new Client(clientConfig);
  await client.connect();
  return client;
}

export async function fetchRevenue() {
  const client = await connectClient();
  noStore();

  try {
    // Simulate a 3 second delay
    // console.log('Fetching revenue data...');
    // await new Promise((resolve) => setTimeout(resolve, 3000));

    const res = await client.query<Revenue>('SELECT * FROM revenue');
    // console.log('Data fetch completed after 3 seconds.');

    return res.rows;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch revenue data.');
  } finally {
    await client.end();
  }
}

export async function fetchLatestInvoices() {
  const client = await connectClient();
  noStore();

  try {
      // Simulate a 3 second delay
  // console.log('Fetching invoice data...');
  // await new Promise((resolve) => setTimeout(resolve, 3000));

    const res = await client.query<LatestInvoiceRaw>(`
      SELECT invoices.amount, customers.name, customers.image_url, customers.email, invoices.id
      FROM invoices
      JOIN customers ON invoices.customer_id = customers.id
      ORDER BY invoices.date DESC
      LIMIT 5
    `);
    console.log('Data fetch completed after 3 seconds.');

    const latestInvoices = res.rows.map((invoice) => ({
      ...invoice,
      amount: formatCurrency(invoice.amount),
    }));
    return latestInvoices;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch the latest invoices.');
  } finally {
    await client.end();
  }
}

export async function fetchCardData() {
  const client = await connectClient();
  noStore();

  try {
    const invoiceCountPromise = client.query('SELECT COUNT(*) FROM invoices');
    const customerCountPromise = client.query('SELECT COUNT(*) FROM customers');
    const invoiceStatusPromise = client.query(`
      SELECT
        SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) AS "paid",
        SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) AS "pending"
      FROM invoices
    `);

    const [invoiceCountRes, customerCountRes, invoiceStatusRes] = await Promise.all([
      invoiceCountPromise,
      customerCountPromise,
      invoiceStatusPromise,
    ]);

    const numberOfInvoices = Number(invoiceCountRes.rows[0].count ?? '0');
    const numberOfCustomers = Number(customerCountRes.rows[0].count ?? '0');
    const totalPaidInvoices = formatCurrency(invoiceStatusRes.rows[0].paid ?? '0');
    const totalPendingInvoices = formatCurrency(invoiceStatusRes.rows[0].pending ?? '0');

    return {
      numberOfCustomers,
      numberOfInvoices,
      totalPaidInvoices,
      totalPendingInvoices,
    };
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch card data.');
  } finally {
    await client.end();
  }
}

const ITEMS_PER_PAGE = 6;
export async function fetchFilteredInvoices(query: string, currentPage: number) {
  const client = await connectClient();
  noStore();

  const offset = (currentPage - 1) * ITEMS_PER_PAGE;

  try {
    const res = await client.query<InvoicesTable>(`
      SELECT
        invoices.id,
        invoices.amount,
        invoices.date,
        invoices.status,
        customers.name,
        customers.email,
        customers.image_url
      FROM invoices
      JOIN customers ON invoices.customer_id = customers.id
      WHERE
        customers.name ILIKE $1 OR
        customers.email ILIKE $1 OR
        invoices.amount::text ILIKE $1 OR
        invoices.date::text ILIKE $1 OR
        invoices.status ILIKE $1
      ORDER BY invoices.date DESC
      LIMIT $2 OFFSET $3
    `, [`%${query}%`, ITEMS_PER_PAGE, offset]);

    return res.rows;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch invoices.');
  } finally {
    await client.end();
  }
}

export async function fetchInvoicesPages(query: string) {
  const client = await connectClient();
  noStore();

  try {
    const res = await client.query(`
      SELECT COUNT(*)
      FROM invoices
      JOIN customers ON invoices.customer_id = customers.id
      WHERE
        customers.name ILIKE $1 OR
        customers.email ILIKE $1 OR
        invoices.amount::text ILIKE $1 OR
        invoices.date::text ILIKE $1 OR
        invoices.status ILIKE $1
    `, [`%${query}%`]);

    const totalPages = Math.ceil(Number(res.rows[0].count) / ITEMS_PER_PAGE);
    return totalPages;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch total number of invoices.');
  } finally {
    await client.end();
  }
}

export async function fetchInvoiceById(id: string) {
  const client = await connectClient();
  noStore();

  try {
    const res = await client.query<InvoiceForm>(`
      SELECT
        invoices.id,
        invoices.customer_id,
        invoices.amount,
        invoices.status
      FROM invoices
      WHERE invoices.id = $1;
    `, [id]);

    const invoice = res.rows.map((invoice) => ({
      ...invoice,
      amount: invoice.amount / 100, // Convert amount from cents to dollars
    }));

    return invoice[0];
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch invoice.');
  } finally {
    await client.end();
  }
}

export async function fetchCustomers() {
  const client = await connectClient();
  noStore();

  try {
    const res = await client.query<CustomerField>(`
      SELECT
        id,
        name
      FROM customers
      ORDER BY name ASC
    `);

    return res.rows;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch all customers.');
  } finally {
    await client.end();
  }
}

export async function fetchFilteredCustomers(query: string) {
  const client = await connectClient();
  noStore();

  try {
    const res = await client.query<CustomersTableType>(`
      SELECT
        customers.id,
        customers.name,
        customers.email,
        customers.image_url,
        COUNT(invoices.id) AS total_invoices,
        SUM(CASE WHEN invoices.status = 'pending' THEN invoices.amount ELSE 0 END) AS total_pending,
        SUM(CASE WHEN invoices.status = 'paid' THEN invoices.amount ELSE 0 END) AS total_paid
      FROM customers
      LEFT JOIN invoices ON customers.id = invoices.customer_id
      WHERE
        customers.name ILIKE $1 OR
        customers.email ILIKE $1
      GROUP BY customers.id, customers.name, customers.email, customers.image_url
      ORDER BY customers.name ASC
    `, [`%${query}%`]);

    const customers = res.rows.map((customer) => ({
      ...customer,
      total_pending: formatCurrency(customer.total_pending),
      total_paid: formatCurrency(customer.total_paid),
    }));

    return customers;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch customer table.');
  } finally {
    await client.end();
  }
}

export async function getUser(email: string) {
  const client = await connectClient();
  noStore();

  try {
    const res = await client.query('SELECT * FROM users WHERE email = $1', [email]);
    return res.rows[0] as User;
  } catch (error) {
    console.error('Failed to fetch user:', error);
    throw new Error('Failed to fetch user.');
  } finally {
    await client.end();
  }
}
