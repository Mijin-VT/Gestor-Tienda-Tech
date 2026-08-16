const { Client, Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

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
  return {
    user: 'postgres',
    host: 'localhost',
    database: 'TIENDA',
    password: 'admin123',
    port: 5432
  };
}

async function ensureDatabaseExists(config) {
  // Conectar a la base de datos de administración 'postgres'
  const adminClient = new Client({
    user: config.user,
    host: config.host,
    password: config.password,
    port: config.port,
    database: 'postgres'
  });

  try {
    await adminClient.connect();
    const res = await adminClient.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [config.database]
    );

    if (res.rows.length === 0) {
      console.log(`Creando base de datos "${config.database}"...`);
      // CREATE DATABASE no admite parámetros posicionales directos para el identificador
      await adminClient.query(`CREATE DATABASE "${config.database}"`);
      console.log(`Base de datos "${config.database}" creada exitosamente.`);
    } else {
      console.log(`La base de datos "${config.database}" ya existe.`);
    }
  } catch (err) {
    console.error('Error al verificar/crear la base de datos:', err.message);
    throw err;
  } finally {
    await adminClient.end();
  }
}

async function initializeTablesAndSeed(config) {
  const pool = new Pool(config);

  try {
    console.log('Creando tablas y esquemas...');

    // 1. Tablas principales
    await pool.query(`
      CREATE TABLE IF NOT EXISTS configuracion_sistema (
        clave VARCHAR(100) PRIMARY KEY,
        valor TEXT NOT NULL,
        descripcion TEXT,
        fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        nombre_usuario VARCHAR(50) UNIQUE NOT NULL,
        nombre_completo VARCHAR(100) NOT NULL,
        correo VARCHAR(100) UNIQUE NOT NULL,
        contrasena_hash VARCHAR(255) NOT NULL,
        rol VARCHAR(20) NOT NULL CHECK (rol IN ('Administrador', 'Staff')),
        activo BOOLEAN DEFAULT TRUE,
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS clientes (
        id SERIAL PRIMARY KEY,
        nombre_completo VARCHAR(100) NOT NULL,
        documento_identidad VARCHAR(30) UNIQUE,
        telefono VARCHAR(20),
        correo VARCHAR(100),
        direccion TEXT,
        fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS tecnicos (
        id SERIAL PRIMARY KEY,
        usuario_id INT UNIQUE REFERENCES usuarios(id) ON DELETE SET NULL,
        nombre_completo VARCHAR(100) NOT NULL,
        telefono VARCHAR(20),
        correo VARCHAR(100),
        especialidad VARCHAR(100),
        activo BOOLEAN DEFAULT TRUE,
        fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS servicios (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        descripcion TEXT,
        precio_estandar DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        activo BOOLEAN DEFAULT TRUE
      );

      CREATE TABLE IF NOT EXISTS productos (
        id SERIAL PRIMARY KEY,
        codigo_barras VARCHAR(50) UNIQUE,
        nombre VARCHAR(100) NOT NULL,
        descripcion TEXT,
        precio_compra DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        precio_venta DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        stock NUMERIC(10, 2) NOT NULL DEFAULT 0,
        stock_minimo NUMERIC(10, 2) NOT NULL DEFAULT 5,
        activo BOOLEAN DEFAULT TRUE
      );

      CREATE TABLE IF NOT EXISTS piezas (
        id SERIAL PRIMARY KEY,
        codigo_pieza VARCHAR(50) UNIQUE,
        nombre VARCHAR(100) NOT NULL,
        descripcion TEXT,
        precio_compra DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        precio_venta DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        stock NUMERIC(10, 2) NOT NULL DEFAULT 0,
        stock_minimo NUMERIC(10, 2) NOT NULL DEFAULT 2,
        compatibilidad_modelos TEXT,
        activo BOOLEAN DEFAULT TRUE
      );

      CREATE TABLE IF NOT EXISTS inventario_movimientos (
        id SERIAL PRIMARY KEY,
        tipo_item VARCHAR(20) NOT NULL CHECK (tipo_item IN ('Producto', 'Pieza')),
        item_id INT NOT NULL,
        tipo_movimiento VARCHAR(20) NOT NULL CHECK (tipo_movimiento IN ('Entrada', 'Salida', 'Ajuste')),
        cantidad NUMERIC(10, 2) NOT NULL,
        motivo TEXT,
        usuario_id INT REFERENCES usuarios(id),
        fecha_movimiento TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS proyectos_electronica (
        id SERIAL PRIMARY KEY,
        nombre_proyecto VARCHAR(100) NOT NULL,
        descripcion TEXT,
        cliente_id INT REFERENCES clientes(id) ON DELETE SET NULL,
        tecnico_id INT REFERENCES tecnicos(id) ON DELETE SET NULL,
        estado VARCHAR(20) DEFAULT 'Planificacion' CHECK (estado IN ('Planificacion', 'En Desarrollo', 'En Pruebas', 'Completado', 'Cancelado')),
        presupuesto_estimado DECIMAL(10, 2) DEFAULT 0.00,
        fecha_inicio DATE DEFAULT CURRENT_DATE,
        fecha_fin_estimada DATE,
        observaciones TEXT
      );

      CREATE TABLE IF NOT EXISTS clases_materias (
        id SERIAL PRIMARY KEY,
        nombre_materia VARCHAR(100) NOT NULL,
        descripcion TEXT,
        instructor_id INT REFERENCES tecnicos(id) ON DELETE SET NULL,
        precio_matricula DECIMAL(10, 2) DEFAULT 0.00,
        horarios VARCHAR(100),
        cupo_maximo INT DEFAULT 15,
        activo BOOLEAN DEFAULT TRUE
      );

      CREATE TABLE IF NOT EXISTS reparaciones (
        id SERIAL PRIMARY KEY,
        cliente_id INT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
        tipo_dispositivo VARCHAR(50) NOT NULL,
        marca VARCHAR(50) NOT NULL,
        modelo VARCHAR(50) NOT NULL,
        numero_serie VARCHAR(50),
        falla_reportada TEXT NOT NULL,
        diagnostico_tecnico TEXT,
        tecnico_id INT REFERENCES tecnicos(id) ON DELETE SET NULL,
        estado VARCHAR(30) DEFAULT 'Recibido' CHECK (estado IN ('Recibido', 'En Diagnostico', 'Esperando Repuestos', 'En Reparacion', 'Listo para Entrega', 'Entregado', 'Sin Reparacion', 'Cancelado')),
        costo_estimado DECIMAL(10, 2) DEFAULT 0.00,
        abono DECIMAL(10, 2) DEFAULT 0.00,
        fecha_recepcion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        fecha_prometida TIMESTAMP,
        fecha_entrega TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS reparacion_detalles (
        id SERIAL PRIMARY KEY,
        reparacion_id INT NOT NULL REFERENCES reparaciones(id) ON DELETE CASCADE,
        tipo_item VARCHAR(20) NOT NULL CHECK (tipo_item IN ('Servicio', 'Pieza', 'Producto')),
        item_id INT NOT NULL,
        cantidad INT NOT NULL DEFAULT 1,
        precio_unitario DECIMAL(10, 2) NOT NULL,
        subtotal DECIMAL(10, 2) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS consultas_portal (
        id SERIAL PRIMARY KEY,
        cliente_nombre VARCHAR(100),
        correo VARCHAR(100),
        telefono VARCHAR(20),
        marca_modelo_dispositivo VARCHAR(100),
        consulta TEXT,
        estado VARCHAR(20) DEFAULT 'Pendiente',
        respuesta TEXT,
        canal_origen VARCHAR(20) DEFAULT 'Web',
        telegram_chat_id VARCHAR(50),
        fecha_consulta TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        fecha_respuesta TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS facturas (
        id SERIAL PRIMARY KEY,
        numero_factura VARCHAR(50) UNIQUE NOT NULL,
        cliente_id INT REFERENCES clientes(id) ON DELETE SET NULL,
        usuario_id INT NOT NULL REFERENCES usuarios(id),
        reparacion_id INT REFERENCES reparaciones(id) ON DELETE SET NULL,
        subtotal DECIMAL(10, 2) NOT NULL,
        impuesto DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        descuento DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        total DECIMAL(10, 2) NOT NULL,
        metodo_pago VARCHAR(50) DEFAULT 'Efectivo',
        estado VARCHAR(20) DEFAULT 'Pagada',
        clave_acceso VARCHAR(100),
        observaciones TEXT,
        fecha_emision TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS factura_detalles (
        id SERIAL PRIMARY KEY,
        factura_id INT NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
        tipo_item VARCHAR(20) NOT NULL CHECK (tipo_item IN ('Producto', 'Servicio', 'Reparacion', 'Pieza')),
        item_id INT,
        descripcion VARCHAR(255),
        cantidad INT NOT NULL DEFAULT 1,
        precio_unitario DECIMAL(10, 2) NOT NULL,
        subtotal DECIMAL(10, 2) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pedidos (
        id SERIAL PRIMARY KEY,
        cliente_nombre VARCHAR(255),
        numero_pedido VARCHAR(50),
        productos TEXT,
        estado VARCHAR(50),
        total DECIMAL(10,2),
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS historial_importaciones (
        id SERIAL PRIMARY KEY,
        nombre_archivo VARCHAR(255),
        total_filas INT,
        tipo VARCHAR(50),
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS mensajes_whatsapp (
        id SERIAL PRIMARY KEY,
        remote_jid VARCHAR(100) NOT NULL,
        push_name VARCHAR(100),
        from_me BOOLEAN DEFAULT FALSE,
        message_text TEXT,
        media_type VARCHAR(50),
        media_path TEXT,
        timestamp BIGINT NOT NULL,
        status VARCHAR(20) DEFAULT 'RECEIVED',
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS notas (
        id SERIAL PRIMARY KEY,
        titulo VARCHAR(100) NOT NULL,
        contenido TEXT NOT NULL,
        color VARCHAR(20) DEFAULT 'yellow',
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Vistas
    await pool.query(`
      DROP VIEW IF EXISTS vista_reparaciones_pendientes CASCADE;
      CREATE VIEW vista_reparaciones_pendientes AS
      SELECT r.id, r.tipo_dispositivo, r.marca, r.modelo, r.falla_reportada, r.estado,
             r.costo_estimado, r.fecha_recepcion, r.fecha_prometida,
             c.nombre_completo AS cliente_nombre, c.telefono AS cliente_telefono,
             t.nombre_completo AS tecnico_nombre
      FROM reparaciones r
      JOIN clientes c ON r.cliente_id = c.id
      LEFT JOIN tecnicos t ON r.tecnico_id = t.id
      WHERE r.estado NOT IN ('Entregado', 'Cancelado', 'Sin Reparacion');

      DROP VIEW IF EXISTS vista_reporte_ventas_diarias CASCADE;
      CREATE VIEW vista_reporte_ventas_diarias AS
      SELECT DATE(fecha_emision) AS fecha, COUNT(id) AS total_facturas,
             SUM(subtotal) AS subtotal_dia, SUM(impuesto) AS total_iva_dia, SUM(total) AS total_ventas_dia
      FROM facturas
      WHERE estado = 'Pagada'
      GROUP BY DATE(fecha_emision);

      DROP VIEW IF EXISTS vista_resumen_inventario_bajo CASCADE;
      CREATE VIEW vista_resumen_inventario_bajo AS
      SELECT 'Producto'::text AS tipo, productos.id, productos.nombre, productos.stock, productos.stock_minimo, productos.precio_venta
      FROM productos
      WHERE (productos.stock <= productos.stock_minimo) AND (productos.activo = true)
      UNION ALL
      SELECT 'Pieza'::text AS tipo, piezas.id, piezas.nombre, piezas.stock, piezas.stock_minimo, piezas.precio_venta
      FROM piezas
      WHERE (piezas.stock <= piezas.stock_minimo) AND (piezas.activo = true);
    `);

    // 3. Datos iniciales de configuración
    const configData = [
      ['empresa_nombre', 'Gestor Tienda Tech', 'Nombre comercial del negocio'],
      ['empresa_nombre_corto', 'Tienda Tech', 'Nombre corto para visualización rápida'],
      ['contenido_bienvenida', '¡Bienvenido al panel de administración y facturación!', 'Texto de bienvenida del dashboard'],
      ['empresa_nit', '000000000-0', 'Identificación tributaria oficial (NIT/RUT/RFC)'],
      ['empresa_direccion', 'Dirección Principal', 'Dirección física principal'],
      ['empresa_telefono', '+00 000 000 0000', 'Número de contacto de soporte / Whatsapp'],
      ['empresa_correo', 'contacto@tiendatech.com', 'Correo de contacto general'],
      ['empresa_logo', '', 'URL del logotipo'],
      ['empresa_banner', '', 'URL del banner'],
      ['impuesto_iva_porcentaje', '15', 'Porcentaje de IVA'],
      ['moneda_simbolo', '$', 'Símbolo de la divisa local'],
      ['moneda_codigo', 'USD', 'Código de la moneda'],
      ['telegram_bot_token', '', 'Token de bot Telegram'],
      ['telegram_chat_id', '', 'Chat ID de Telegram'],
      ['gmail_user', '', 'Usuario de Gmail'],
      ['gmail_app_password', '', 'Contraseña de aplicación Gmail']
    ];

    for (const [clave, valor, desc] of configData) {
      await pool.query(
        `INSERT INTO configuracion_sistema (clave, valor, descripcion)
         VALUES ($1, $2, $3)
         ON CONFLICT (clave) DO NOTHING`,
        [clave, valor, desc]
      );
    }

    // 4. Usuario Administrador por defecto si no existe ningún usuario
    const userCheck = await pool.query('SELECT COUNT(*) AS total FROM usuarios');
    if (parseInt(userCheck.rows[0].total, 10) === 0) {
      console.log('Creando usuario administrador por defecto (admin / admin123)...');
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync('admin123', salt);
      await pool.query(`
        INSERT INTO usuarios (nombre_usuario, nombre_completo, correo, contrasena_hash, rol, activo)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, ['admin', 'Administrador General', 'admin@tiendatech.com', hash, 'Administrador', true]);
      console.log('Usuario admin creado.');
    }

    console.log('Base de datos inicializada con éxito.');
  } catch (err) {
    console.error('Error al inicializar tablas y datos:', err);
    throw err;
  } finally {
    await pool.end();
  }
}

async function initDB() {
  const config = getConfig();
  console.log(`Iniciando aprovisionamiento para PostgreSQL (${config.host}:${config.port}, BD: ${config.database})...`);
  await ensureDatabaseExists(config);
  await initializeTablesAndSeed(config);
}

if (require.main === module) {
  initDB()
    .then(() => {
      console.log('Aprovisionamiento completado exitosamente.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fallo en el aprovisionamiento de base de datos:', err);
      process.exit(1);
    });
}

module.exports = { initDB };
