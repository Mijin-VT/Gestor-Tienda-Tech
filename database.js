const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

let pool = null;

// Cargar la configuración de la base de datos de forma dinámica
function getConfig() {
  const configPath = path.join(__dirname, 'db_config.json');
  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, '');
      return JSON.parse(raw);
    } catch (e) {
      console.error('Error al leer db_config.json:', e);
    }
  }
  // Valores por defecto
  return {
    user: 'postgres',
    host: 'localhost',
    database: 'TIENDA',
    password: 'admin123',
    port: 5432
  };
}

// Obtener o inicializar el pool de conexiones
function getPool() {
  if (pool) return pool;
  try {
    const config = getConfig();
    pool = new Pool(config);
    console.log('Conexión exitosa a PostgreSQL.');
    return pool;
  } catch (error) {
    console.error('Error al conectar con la base de datos PostgreSQL:', error);
    pool = null;
    throw error;
  }
}

// Ejecutar consulta parametrizada (con traducción de @param a $1 posicional)
async function query(sql, params = {}) {
  const pgPool = getPool();
  let pgSql = sql;
  const values = [];
  let counter = 1;

  // Ordenar parámetros por longitud descendente para evitar colisiones (ej: @nombre_completo vs @nombre)
  const sortedKeys = Object.keys(params).sort((a, b) => b.length - a.length);

  for (const key of sortedKeys) {
    const placeholder = `@${key}`;
    const regex = new RegExp(placeholder + '\\b', 'g');
    
    // Verificación manual de existencia antes de reemplazar para asegurar correlación de índices posicionales
    if (pgSql.includes(placeholder)) {
      pgSql = pgSql.replace(regex, `$${counter}`);
      let val = params[key];
      if (key === 'activo') {
        val = val === 1 || val === true || val === '1';
      }
      values.push(val);
      counter++;
    }
  }

  // Traducciones de compatibilidad SQL Server -> PostgreSQL en consultas comunes
  pgSql = pgSql
    .replace(/\bGETDATE\(\)/gi, 'CURRENT_TIMESTAMP')
    .replace(/\bISNULL\(/gi, 'COALESCE(')
    .replace(/\bactivo\s*=\s*1\b/gi, 'activo = TRUE')
    .replace(/\bactivo\s*=\s*0\b/gi, 'activo = FALSE');

  if (pgSql.toLowerCase().includes('output inserted.id')) {
    pgSql = pgSql.replace(/output\s+inserted\.id/gi, '') + ' RETURNING id';
  }

  try {
    const res = await pgPool.query(pgSql, values);
    return { recordset: res.rows };
  } catch (error) {
    console.error('Error en consulta PostgreSQL:', error);
    console.error('Query:', pgSql);
    console.error('Params:', values);
    throw error;
  }
}

module.exports = {
  getPool,
  query
};
