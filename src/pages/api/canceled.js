// src/pages/api/canceled.js
import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const clientConfig = {
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
};

async function connectClient() {
  const client = new Client(clientConfig);
  await client.connect();
  return client;
}

export async function GET({ url }) {
  const client = await connectClient();
  try {
    const date = url.searchParams.get("date");

    const result = await client.query(`
      SELECT 
        id,
        date,
        total,
        cancelled_at,
        reason
      FROM TIENDA.ORDER_CANCELLED
      WHERE ($1::date IS NULL OR date = $1::date)
      ORDER BY cancelled_at DESC
      LIMIT 100
    `, [date || null]);

    return new Response(JSON.stringify(result.rows), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: 'Error al obtener anulaciones' }), {
      status: 500,
    });
  } finally {
    await client.end();
  }
}
