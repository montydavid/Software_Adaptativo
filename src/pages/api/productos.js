// src/pages/api/productos.js
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

export async function GET() {
  const client = await connectClient();
  
  try {
    const result = await client.query('SELECT * FROM TIENDA.PRODUCT');
    return new Response(JSON.stringify(result.rows), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: 'Error al obtener productos' }), {
      status: 500,
    });
  } finally {
    await client.end();
  }
}

export async function POST(request) {
  const client = await connectClient();
  
  try {
    const { product_id, product_name, product_price, product_description, offer_id, regular_id } = await request.json();
    
    const query = `
      INSERT INTO TIENDA.PRODUCT (product_id, product_name, product_price, product_description, offer_id, regular_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`;
    
    const values = [product_id, product_name, product_price, product_description, offer_id, regular_id];
    
    const result = await client.query(query, values);
    
    return new Response(JSON.stringify(result.rows[0]), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: 'Error al crear producto' }), {
      status: 500,
    });
  } finally {
    await client.end();
  }
}

export async function PUT(request, { params }) {
  const client = await connectClient();
  const { id } = params;
  
  try {
    const { product_name, product_price, product_description, offer_id, regular_id } = await request.json();
    
    const query = `
      UPDATE TIENDA.PRODUCT 
      SET product_name = $1, 
          product_price = $2, 
          product_description = $3, 
          offer_id = $4, 
          regular_id = $5
      WHERE product_id = $6
      RETURNING *`;
    
    const values = [product_name, product_price, product_description, offer_id, regular_id, id];
    
    const result = await client.query(query, values);
    
    if (result.rowCount === 0) {
      return new Response(JSON.stringify({ error: 'Producto no encontrado' }), {
        status: 404,
      });
    }
    
    return new Response(JSON.stringify(result.rows[0]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: 'Error al actualizar producto' }), {
      status: 500,
    });
  } finally {
    await client.end();
  }
}

export async function DELETE(request, { params }) {
  const client = await connectClient();
  const { id } = params;
  
  try {
    const query = 'DELETE FROM TIENDA.PRODUCT WHERE product_id = $1 RETURNING *';
    const result = await client.query(query, [id]);
    
    if (result.rowCount === 0) {
      return new Response(JSON.stringify({ error: 'Producto no encontrado' }), {
        status: 404,
      });
    }
    
    return new Response(JSON.stringify({ message: 'Producto eliminado correctamente' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: 'Error al eliminar producto' }), {
      status: 500,
    });
  } finally {
    await client.end();
  }
}