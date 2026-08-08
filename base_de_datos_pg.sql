CREATE TABLE configuracion_sistema (
    clave VARCHAR(100) PRIMARY KEY,
    valor TEXT NOT NULL,
    descripcion TEXT,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE usuarios (
    id SERIAL PRIMARY KEY,
    nombre_usuario VARCHAR(50) UNIQUE NOT NULL,
    nombre_completo VARCHAR(100) NOT NULL,
    correo VARCHAR(100) UNIQUE NOT NULL,
    contrasena_hash VARCHAR(255) NOT NULL,
    rol VARCHAR(20) NOT NULL CHECK (rol IN ('Administrador', 'Staff')),
    activo BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE clientes (
    id SERIAL PRIMARY KEY,
    nombre_completo VARCHAR(100) NOT NULL,
    documento_identidad VARCHAR(30) UNIQUE,
    telefono VARCHAR(20),
    correo VARCHAR(100),
    direccion TEXT,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tecnicos (
    id SERIAL PRIMARY KEY,
    usuario_id INT UNIQUE REFERENCES usuarios(id) ON DELETE SET NULL,
    nombre_completo VARCHAR(100) NOT NULL,
    telefono VARCHAR(20),
    correo VARCHAR(100),
    especialidad VARCHAR(100),
    activo BOOLEAN DEFAULT TRUE,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE servicios (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT,
    precio_estandar DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    activo BOOLEAN DEFAULT TRUE
);

CREATE TABLE productos (
    id SERIAL PRIMARY KEY,
    codigo_barras VARCHAR(50) UNIQUE,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT,
    precio_compra DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    precio_venta DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    stock INT NOT NULL DEFAULT 0 CHECK (stock >= 0),
    stock_minimo INT NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
    activo BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE piezas (
    id SERIAL PRIMARY KEY,
    codigo_pieza VARCHAR(50) UNIQUE,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT,
    precio_compra DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    precio_venta DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    stock INT NOT NULL DEFAULT 0 CHECK (stock >= 0),
    stock_minimo INT NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
    compatibilidad_modelos TEXT,
    activo BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE inventario_movimientos (
    id SERIAL PRIMARY KEY,
    tipo_item VARCHAR(20) NOT NULL CHECK (tipo_item IN ('Producto', 'Pieza')),
    item_id INT NOT NULL,
    tipo_movimiento VARCHAR(20) NOT NULL CHECK (tipo_movimiento IN ('Entrada', 'Salida', 'Ajuste')),
    cantidad INT NOT NULL CHECK (cantidad > 0),
    descripcion TEXT,
    usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
    fecha_movimiento TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE proyectos_electronica (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT,
    presupuesto_estimado DECIMAL(10, 2) DEFAULT 0.00,
    costo_real DECIMAL(10, 2) DEFAULT 0.00,
    tecnico_responsable_id INT REFERENCES tecnicos(id) ON DELETE SET NULL,
    estado VARCHAR(20) NOT NULL CHECK (estado IN ('Planificado', 'En Proceso', 'En Pruebas', 'Completado', 'Cancelado')) DEFAULT 'Planificado',
    fecha_inicio DATE,
    fecha_fin DATE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE clases_materias (
    id SERIAL PRIMARY KEY,
    nombre_materia VARCHAR(100) NOT NULL,
    descripcion TEXT,
    instructor_id INT REFERENCES tecnicos(id) ON DELETE SET NULL,
    precio_matricula DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    horarios VARCHAR(100),
    cupo_maximo INT DEFAULT 20 CHECK (cupo_maximo > 0),
    activo BOOLEAN DEFAULT TRUE
);

CREATE TABLE reparaciones (
    id SERIAL PRIMARY KEY,
    cliente_id INT NOT NULL REFERENCES clientes(id),
    tecnico_id INT REFERENCES tecnicos(id) ON DELETE SET NULL,
    tipo_dispositivo VARCHAR(50) NOT NULL,
    marca VARCHAR(50) NOT NULL,
    modelo VARCHAR(50) NOT NULL,
    numero_serie VARCHAR(50),
    falla_reportada TEXT NOT NULL,
    diagnostico_tecnico TEXT,
    estado VARCHAR(30) NOT NULL CHECK (estado IN (
        'Recibido', 
        'En Diagnostico', 
        'Presupuestado', 
        'En Reparacion', 
        'Listo para Entrega', 
        'Entregado', 
        'Devuelto sin Reparar'
    )) DEFAULT 'Recibido',
    costo_estimado DECIMAL(10, 2) DEFAULT 0.00,
    abono DECIMAL(10, 2) DEFAULT 0.00 CHECK (abono >= 0.00),
    fecha_recepcion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_prometida TIMESTAMP,
    fecha_entrega TIMESTAMP
);

CREATE TABLE reparacion_detalles (
    id SERIAL PRIMARY KEY,
    reparacion_id INT NOT NULL REFERENCES reparaciones(id) ON DELETE CASCADE,
    tipo_detalle VARCHAR(20) NOT NULL CHECK (tipo_detalle IN ('Servicio', 'Pieza')),
    referencia_id INT NOT NULL,
    cantidad INT NOT NULL DEFAULT 1 CHECK (cantidad > 0),
    precio_unitario DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0.00
);

CREATE TABLE consultas_portal (
    id SERIAL PRIMARY KEY,
    cliente_nombre VARCHAR(100) NOT NULL,
    correo VARCHAR(100) NOT NULL,
    telefono VARCHAR(20),
    marca_modelo_dispositivo VARCHAR(100),
    consulta TEXT NOT NULL,
    estado VARCHAR(20) NOT NULL CHECK (estado IN ('Pendiente', 'Respondida', 'Cerrada')) DEFAULT 'Pendiente',
    respuesta TEXT,
    fecha_consulta TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_respuesta TIMESTAMP
);

CREATE TABLE facturas (
    id SERIAL PRIMARY KEY,
    numero_factura VARCHAR(50) UNIQUE NOT NULL,
    cliente_id INT NOT NULL REFERENCES clientes(id),
    usuario_id INT NOT NULL REFERENCES usuarios(id),
    reparacion_id INT UNIQUE REFERENCES reparaciones(id) ON DELETE SET NULL,
    subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    impuesto DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    descuento DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    total DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    metodo_pago VARCHAR(50) NOT NULL CHECK (metodo_pago IN ('Efectivo', 'Tarjeta Debito', 'Tarjeta Credito', 'Transferencia', 'Otro')),
    estado VARCHAR(20) NOT NULL CHECK (estado IN ('Pagada', 'Pendiente', 'Anulada')) DEFAULT 'Pagada',
    fecha_emision TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE factura_detalles (
    id SERIAL PRIMARY KEY,
    factura_id INT NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
    tipo_item VARCHAR(20) NOT NULL CHECK (tipo_item IN ('Producto', 'Pieza', 'Servicio', 'Clase')),
    item_id INT NOT NULL,
    descripcion VARCHAR(150) NOT NULL,
    cantidad INT NOT NULL DEFAULT 1 CHECK (cantidad > 0),
    precio_unitario DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0.00
);

CREATE OR REPLACE VIEW vista_reparaciones_pendientes AS
SELECT 
    r.id AS reparacion_id,
    c.nombre_completo AS cliente_nombre,
    c.telefono AS cliente_telefono,
    r.tipo_dispositivo,
    r.marca,
    r.modelo,
    r.numero_serie,
    r.estado,
    r.fecha_recepcion,
    r.fecha_prometida,
    t.nombre_completo AS tecnico_nombre
FROM reparaciones r
JOIN clientes c ON r.cliente_id = c.id
LEFT JOIN tecnicos t ON r.tecnico_id = t.id
WHERE r.estado NOT IN ('Entregado', 'Devuelto sin Reparar');

CREATE OR REPLACE VIEW vista_resumen_inventario_bajo AS
SELECT 
    'Producto' AS tipo,
    id,
    nombre,
    stock,
    stock_minimo,
    precio_venta
FROM productos
WHERE stock <= stock_minimo AND activo = TRUE
UNION ALL
SELECT 
    'Pieza' AS tipo,
    id,
    nombre,
    stock,
    stock_minimo,
    precio_venta
FROM piezas
WHERE stock <= stock_minimo AND activo = TRUE;

CREATE OR REPLACE VIEW vista_reporte_ventas_diarias AS
SELECT 
    CAST(fecha_emision AS DATE) AS fecha,
    metodo_pago,
    estado,
    COUNT(id) AS cantidad_facturas,
    SUM(subtotal) AS total_subtotal,
    SUM(impuesto) AS total_impuesto,
    SUM(descuento) AS total_descuento,
    SUM(total) AS total_recaudado
FROM facturas
GROUP BY CAST(fecha_emision AS DATE), metodo_pago, estado;

INSERT INTO configuracion_sistema (clave, valor, descripcion) VALUES
('empresa_nombre', 'ElectroFix - Centro de Reparaciones Especializado', 'Nombre comercial del negocio'),
('empresa_nombre_corto', 'ElectroFix', 'Nombre corto para visualización rápida'),
('contenido_bienvenida', '¡Bienvenido al panel de administración y facturación! Desde aquí puedes controlar el taller de reparaciones, repuestos y caja del día de manera eficiente.', 'Texto de bienvenida del dashboard'),
('empresa_nit', '900.123.456-7', 'Identificación tributaria oficial (NIT/RUT/RFC)'),
('empresa_direccion', 'Avenida Central #45-89, Ciudad Central', 'Dirección física principal'),
('empresa_telefono', '+57 300 123 4567', 'Número de contacto de soporte / Whatsapp'),
('empresa_correo', 'contacto@electrofix.com', 'Correo de contacto general'),
('empresa_logo', 'https://electrofix.com/assets/images/logo.png', 'URL del logotipo'),
('empresa_banner', 'https://electrofix.com/assets/images/banner.png', 'URL del banner'),
('impuesto_iva_porcentaje', '19', 'Porcentaje de IVA'),
('moneda_simbolo', '$', 'Símbolo de la divisa local'),
('moneda_codigo', 'COP', 'Código de la moneda');

INSERT INTO usuarios (nombre_usuario, nombre_completo, correo, contrasena_hash, rol, activo) VALUES
('admin', 'Administrador General', 'admin@electrofix.com', '.c9e4g7RzD.uI1uC75dFmP5gK6p9O/H2L3a5e/8J3Ry', 'Administrador', TRUE),
('staff_pedro', 'Pedro Martínez (Cajero/Soporte)', 'pedro.martinez@electrofix.com', '.0K3s0Z.Ouy9X5s4V2J.eK4rB3kE1nO4a5e/8J3Ry', 'Staff', TRUE);

INSERT INTO tecnicos (usuario_id, nombre_completo, telefono, correo, especialidad, activo) VALUES
(1, 'Administrador General (Ing. Electrónico)', '+57 300 987 6543', 'admin@electrofix.com', 'Microsoldadura y Reballing', TRUE),
(NULL, 'Ing. Carlos Mendoza (Técnico Móvil)', '+57 311 222 3344', 'carlos.mendoza@electrofix.com', 'Diagnóstico Apple iOS y Android', TRUE),
(NULL, 'Dra. Sofía Ortega (Hardware Laptops)', '+57 322 555 6677', 'sofia.ortega@electrofix.com', 'Reparación de Placas Base Laptops', TRUE);

INSERT INTO servicios (nombre, descripcion, precio_estandar, activo) VALUES
('Diagnóstico Básico', 'Revisión preliminar y detección de fallas', 15000.00, TRUE),
('Limpieza Ultrasónica', 'Limpieza profunda en tina química para placas', 50000.00, TRUE),
('Reballing Chip de Video', 'Reconstrucción de soldaduras de GPU', 180000.00, TRUE),
('Cambio de Puerto de Carga', 'Sustitución de conector USB soldado', 45000.00, TRUE),
('Instalación de S.O.', 'Instalación limpia y optimización de sistema operativo', 60000.00, TRUE);

INSERT INTO piezas (codigo_pieza, nombre, descripcion, precio_compra, precio_venta, stock, stock_minimo, compatibilidad_modelos) VALUES
('PZ-SCR-IP11', 'Pantalla Completa iPhone 11', 'Pantalla LCD incell compatible', 120000.00, 210000.00, 10, 3, 'iPhone 11'),
('PZ-BAT-IP11', 'Batería Homologada iPhone 11', 'Batería de repuesto 3110mAh', 45000.00, 85000.00, 15, 5, 'iPhone 11'),
('PZ-PORT-TYPC', 'Puerto Carga Tipo-C Universal', 'Conector USB Tipo-C hembra', 1500.00, 8000.00, 100, 20, 'Varios modelos Android'),
('PZ-SSD-512GB', 'Disco SSD NVMe 512GB', 'Unidad de estado sólido M.2 Kingston', 110000.00, 175000.00, 8, 2, 'Laptops y PCs con M.2');

INSERT INTO productos (codigo_barras, nombre, descripcion, precio_compra, precio_venta, stock, stock_minimo) VALUES
('7701234567890', 'Cargador Rápido Tipo-C 20W', 'Cargador pared compatible PD 3.0', 15000.00, 35000.00, 25, 5),
('7701234567891', 'Cable USB-C a Lightning 1.2m', 'Cable trenzado reforzado', 8000.00, 20000.00, 30, 8),
('7701234567892', 'Protector Pantalla Cerámico', 'Vidrio templado flexible', 3000.00, 15000.00, 50, 10);

INSERT INTO clases_materias (nombre_materia, descripcion, instructor_id, precio_matricula, horarios, cupo_maximo, activo) VALUES
('Curso de Microsoldadura Avanzada', 'Introducción al reballing y componentes SMD', 1, 450000.00, 'Sábados de 08:00 a 13:00', 10, TRUE);

INSERT INTO clientes (nombre_completo, documento_identidad, telefono, correo, direccion) VALUES
('María Paula Restrepo', '1.020.444.888', '+57 315 777 9900', 'maria.paula@gmail.com', 'Calle 10 # 5-20, Apto 402'),
('Juan Fernando Hoyos', '79.888.999', '+57 310 444 1122', 'juan.hoyos@outlook.com', 'Carrera 15 # 72-10, Oficina 304');
