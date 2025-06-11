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

// GET - Obtener todas las órdenes
export async function GET() {
  const client = await connectClient();
  
  try {
    const result = await client.query('SELECT * FROM TIENDA.ORDER ORDER BY id DESC');
    return new Response(JSON.stringify(result.rows), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error al obtener las órdenes:', error);
    return new Response(JSON.stringify({ error: 'Error al obtener las órdenes' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  } finally {
    await client.end();
  }
}

// DELETE - Eliminar una orden específica
export async function DELETE(request) {
  const client = await connectClient();
  
  try {
    // Obtener el ID de la URL o del body
    const url = new URL(request.url);
    const orderId = url.searchParams.get('id');
    
    if (!orderId) {
      return new Response(JSON.stringify({ error: 'ID de orden requerido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verificar si la orden existe
    const checkResult = await client.query('SELECT id FROM TIENDA.ORDER WHERE id = $1', [orderId]);
    
    if (checkResult.rows.length === 0) {
      return new Response(JSON.stringify({ error: 'Orden no encontrada' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Eliminar la orden
    await client.query('DELETE FROM TIENDA.ORDER WHERE id = $1', [orderId]);
    
    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Orden eliminada correctamente',
      deletedId: orderId 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error al eliminar la orden:', error);
    return new Response(JSON.stringify({ error: 'Error al eliminar la orden' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  } finally {
    await client.end();
  }
}