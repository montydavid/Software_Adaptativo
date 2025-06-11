import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Configuración de la base de datos
const clientConfig = {
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
};

// Utilidad para crear respuestas JSON
function createResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}

// Utilidad para manejar errores de base de datos
function handleDatabaseError(error, operation) {
  console.error(`Error en ${operation}:`, {
    message: error.message,
    code: error.code,
    detail: error.detail,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
  });

  // Mapear códigos de error específicos de PostgreSQL
  const errorMap = {
    '23505': 'Registro duplicado',
    '23503': 'Referencia inválida',
    '23502': 'Campo requerido faltante',
    '23514': 'Violación de restricción',
    '42P01': 'Tabla no encontrada',
    '42703': 'Columna no encontrada',
    'ECONNREFUSED': 'No se puede conectar a la base de datos',
    'ENOTFOUND': 'Servidor de base de datos no encontrado',
  };

  const userMessage = errorMap[error.code] || `Error interno del servidor en ${operation}`;
  
  return createResponse({ 
    error: userMessage,
    timestamp: new Date().toISOString(),
    operation 
  }, 500);
}

// Utilidad para ejecutar consultas con manejo de conexión
async function executeQuery(query, params = []) {
  console.log('=== DATABASE QUERY DEBUG ===');
  console.log('Query:', query);
  console.log('Params:', params);
  
  const client = new Client(clientConfig);
  console.log('Client config:', {
    user: clientConfig.user,
    host: clientConfig.host,
    database: clientConfig.database,
    port: clientConfig.port,
    ssl: clientConfig.ssl
  });
  
  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('Connected successfully');
    
    console.log('Executing query...');
    const result = await client.query(query, params);
    console.log('Query executed successfully, rows:', result.rows.length);
    
    return result;
  } catch (error) {
    console.error('Database error:', error);
    throw error;
  } finally {
    try {
      console.log('Closing connection...');
      await client.end();
      console.log('Connection closed');
    } catch (endError) {
      console.warn('Error cerrando conexión:', endError.message);
    }
  }
}

// Validadores
function validateGastoData(data) {
  const { fecha, tipo, valor, forma_pago } = data;
  const errors = [];

  if (!fecha) {
    errors.push('La fecha es requerida');
  } else if (isNaN(Date.parse(fecha))) {
    errors.push('Formato de fecha inválido');
  }

  if (!tipo || typeof tipo !== 'string' || tipo.trim().length === 0) {
    errors.push('El tipo de gasto es requerido');
  } else if (tipo.length > 100) {
    errors.push('El tipo de gasto no puede exceder 100 caracteres');
  }

  if (valor === undefined || valor === null) {
    errors.push('El valor es requerido');
  } else if (typeof valor !== 'number' || isNaN(valor)) {
    errors.push('El valor debe ser un número válido');
  } else if (valor <= 0) {
    errors.push('El valor debe ser mayor a cero');
  } else if (valor > 999999999.99) {
    errors.push('El valor es demasiado grande');
  }

  if (!forma_pago || typeof forma_pago !== 'string' || forma_pago.trim().length === 0) {
    errors.push('La forma de pago es requerida');
  } else if (forma_pago.length > 50) {
    errors.push('La forma de pago no puede exceder 50 caracteres');
  }

  // Validar detalle si se proporciona
  if (data.detalle && data.detalle.length > 255) {
    errors.push('El detalle no puede exceder 255 caracteres');
  }

  // Validar usuario si se proporciona
  if (data.usuario && data.usuario.length > 50) {
    errors.push('El usuario no puede exceder 50 caracteres');
  }

  return errors;
}

function validateId(id) {
  if (!id) {
    return 'El ID es requerido';
  }
  
  const numId = parseInt(id);
  if (isNaN(numId) || numId <= 0) {
    return 'El ID debe ser un número positivo válido';
  }
  
  return null;
}



// Función para obtener el request de diferentes contextos de Astro
function getRequest(context) {
  // Diferentes formas de acceder al request según la versión de Astro
  if (context.request) {
    return context.request;
  }
  if (context.params && context.request) {
    return context.request;
  }
  // Para versiones más nuevas de Astro
  return context;
}

// Manejar OPTIONS para CORS
export async function OPTIONS() {
  return createResponse({}, 200);
}

// GET - Obtener todos los gastos
export async function GET() {
  try {
    const result = await executeQuery(`
      SELECT 
        id,
        fecha,
        tipo,
        valor,
        detalle,
        forma_pago,
        usuario,
        created_at
      FROM TIENDA.GASTO 
      ORDER BY fecha DESC, created_at DESC
      LIMIT 1000
    `);

    // Formatear los datos para el frontend
    const gastos = result.rows.map(gasto => ({
      ...gasto,
      valor: parseFloat(gasto.valor), // Asegurar que el valor sea numérico
      fecha: gasto.fecha.toISOString().split('T')[0], // Formato YYYY-MM-DD
    }));

    return createResponse({
      success: true,
      data: gastos,
      count: gastos.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return handleDatabaseError(error, 'obtener gastos');
  }
}

// POST - Crear nuevo gasto
// POST - Crear nuevo gasto
export async function POST(context) {
  console.log('=== POST REQUEST DEBUG ===');
  
  try {
    // Obtener el request del contexto
    const request = getRequest(context);
    
    // --- CORRECCIÓN CLAVE ---
    // Usar el método .json() directamente, es más robusto y estándar.
    // Esto resuelve el problema del "cuerpo vacío".
    const body = await request.json();
    console.log('Parsed body using request.json():', body);
    
    // Validar datos de entrada
    const validationErrors = validateGastoData(body);
    if (validationErrors.length > 0) {
      return createResponse({
        error: 'Datos de entrada inválidos',
        details: validationErrors,
        timestamp: new Date().toISOString()
      }, 400);
    }

    const { fecha, tipo, valor, detalle, forma_pago, usuario } = body;

    // Limpiar y preparar datos
    const cleanData = {
      fecha: new Date(fecha).toISOString().split('T')[0],
      tipo: tipo.trim(),
      valor: parseFloat(valor),
      detalle: detalle ? detalle.trim() : null,
      forma_pago: forma_pago.trim(),
      usuario: usuario ? usuario.trim() : 'admin'
    };

    // Insertar en la base de datos
    const result = await executeQuery(`
      INSERT INTO TIENDA.GASTO (fecha, tipo, valor, detalle, forma_pago, usuario, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING id, fecha, tipo, valor, detalle, forma_pago, usuario, created_at
    `, [
      cleanData.fecha,
      cleanData.tipo,
      cleanData.valor,
      cleanData.detalle,
      cleanData.forma_pago,
      cleanData.usuario
    ]);

    const nuevoGasto = result.rows[0];

    return createResponse({
      success: true,
      message: 'Gasto creado exitosamente',
      data: {
        ...nuevoGasto,
        valor: parseFloat(nuevoGasto.valor),
        fecha: nuevoGasto.fecha.toISOString().split('T')[0]
      },
      timestamp: new Date().toISOString()
    }, 201);

  } catch (error) {
    // Este catch ahora también manejará errores si el body no es un JSON válido
    if (error instanceof SyntaxError) {
        return createResponse({ error: 'El cuerpo de la petición contiene JSON inválido.' }, 400);
    }
    return handleDatabaseError(error, 'crear gasto');
  }
}

// DELETE - Eliminar gasto
export async function DELETE(context) {
  console.log('=== DELETE REQUEST DEBUG ===');
  
  try {
    // Obtener el request del contexto
    const request = getRequest(context);
    
    // Verificar si el ID viene en la URL o en el body
    let id;
    
    // Intentar obtener ID de la URL primero
    if (context.params && context.params.id) {
      id = context.params.id;
      console.log('ID from URL params:', id);
    } else if (context.url) {
      // Intentar obtener de query parameters
      const url = new URL(context.url);
      id = url.searchParams.get('id');
      console.log('ID from query params:', id);
    }
    
    // Si no hay ID en URL, intentar del body
    if (!id) {
      try {
        const body = await parseRequestBody(request);
        id = body.id;
        console.log('ID from body:', id);
      } catch (error) {
        console.log('No body or invalid JSON, trying URL');
      }
    }

    // Validar ID
    const idError = validateId(id);
    if (idError) {
      return createResponse({
        error: idError,
        timestamp: new Date().toISOString()
      }, 400);
    }

    const numId = parseInt(id);
    console.log('Parsed ID:', numId);

    // Verificar si el gasto existe antes de eliminar
    const existsResult = await executeQuery(`
      SELECT id, tipo, valor FROM TIENDA.GASTO WHERE id = $1
    `, [numId]);

    if (existsResult.rows.length === 0) {
      return createResponse({
        error: 'Gasto no encontrado',
        timestamp: new Date().toISOString()
      }, 404);
    }

    const gastoExistente = existsResult.rows[0];

    // Eliminar el gasto
    await executeQuery(`
      DELETE FROM TIENDA.GASTO WHERE id = $1
    `, [numId]);

    return createResponse({
      success: true,
      message: 'Gasto eliminado exitosamente',
      data: {
        id: numId,
        tipo: gastoExistente.tipo,
        valor: parseFloat(gastoExistente.valor)
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error en DELETE:', error);
    
    // Manejar errores de JSON inválido
    if (error.message.includes('JSON inválido')) {
      return createResponse({
        error: error.message,
        timestamp: new Date().toISOString()
      }, 400);
    }
    
    return handleDatabaseError(error, 'eliminar gasto');
  }
}

// PUT - Actualizar gasto
export async function PUT(context) {
  console.log('=== PUT REQUEST DEBUG ===');
  
  try {
    const request = getRequest(context);
    
    // --- CORRECCIÓN CLAVE ---
    const body = await request.json();
    const { id, ...updateData } = body;

    // Validar ID
    const idError = validateId(id);
    if (idError) {
      return createResponse({ error: idError }, 400);
    }


    // Validar datos de actualización
    const validationErrors = validateGastoData(updateData);
    if (validationErrors.length > 0) {
      return createResponse({
        error: 'Datos de entrada inválidos',
        details: validationErrors,
        timestamp: new Date().toISOString()
      }, 400);
    }

    const numId = parseInt(id);
    const { fecha, tipo, valor, detalle, forma_pago, usuario } = updateData;

    // Limpiar datos
    const cleanData = {
      fecha: new Date(fecha).toISOString().split('T')[0],
      tipo: tipo.trim(),
      valor: parseFloat(valor),
      detalle: detalle ? detalle.trim() : null,
      forma_pago: forma_pago.trim(),
      usuario: usuario ? usuario.trim() : 'admin'
    };

    // Actualizar en la base de datos
    const result = await executeQuery(`
      UPDATE TIENDA.GASTO 
      SET fecha = $1, tipo = $2, valor = $3, detalle = $4, forma_pago = $5, usuario = $6, updated_at = NOW()
      WHERE id = $7
      RETURNING id, fecha, tipo, valor, detalle, forma_pago, usuario, created_at, updated_at
    `, [
      cleanData.fecha,
      cleanData.tipo,
      cleanData.valor,
      cleanData.detalle,
      cleanData.forma_pago,
      cleanData.usuario,
      numId
    ]);

    if (result.rows.length === 0) {
      return createResponse({
        error: 'Gasto no encontrado',
        timestamp: new Date().toISOString()
      }, 404);
    }

    const gastoActualizado = result.rows[0];

    return createResponse({
      success: true,
      message: 'Gasto actualizado exitosamente',
      data: {
        ...gastoActualizado,
        valor: parseFloat(gastoActualizado.valor),
        fecha: gastoActualizado.fecha.toISOString().split('T')[0]
      },
      timestamp: new Date().toISOString()
    });

   } catch (error) {
    if (error instanceof SyntaxError) {
        return createResponse({ error: 'El cuerpo de la petición contiene JSON inválido.' }, 400);
    }
    return handleDatabaseError(error, 'actualizar gasto');
  }
}