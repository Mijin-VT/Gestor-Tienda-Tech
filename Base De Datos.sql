-- ============================================================================
-- SCRIPT DE BASE DE DATOS: GESTIÓN DE REPARACIONES Y FACTURACIÓN (ELECTROFIX)
-- Motor objetivo: Microsoft SQL Server (T-SQL)
-- ============================================================================

-- Eliminar tablas si existen (orden inverso a relaciones)
IF OBJECT_ID('factura_detalles', 'U') IS NOT NULL DROP TABLE factura_detalles;
IF OBJECT_ID('facturas', 'U') IS NOT NULL DROP TABLE facturas;
IF OBJECT_ID('consultas_portal', 'U') IS NOT NULL DROP TABLE consultas_portal;
IF OBJECT_ID('reparacion_detalles', 'U') IS NOT NULL DROP TABLE reparacion_detalles;
IF OBJECT_ID('reparaciones', 'U') IS NOT NULL DROP TABLE reparaciones;
IF OBJECT_ID('clases_materias', 'U') IS NOT NULL DROP TABLE clases_materias;
IF OBJECT_ID('proyectos_electronica', 'U') IS NOT NULL DROP TABLE proyectos_electronica;
IF OBJECT_ID('inventario_movimientos', 'U') IS NOT NULL DROP TABLE inventario_movimientos;
IF OBJECT_ID('piezas', 'U') IS NOT NULL DROP TABLE piezas;
IF OBJECT_ID('productos', 'U') IS NOT NULL DROP TABLE productos;
IF OBJECT_ID('servicios', 'U') IS NOT NULL DROP TABLE servicios;
IF OBJECT_ID('tecnicos', 'U') IS NOT NULL DROP TABLE tecnicos;
IF OBJECT_ID('clientes', 'U') IS NOT NULL DROP TABLE clientes;
IF OBJECT_ID('usuarios', 'U') IS NOT NULL DROP TABLE usuarios;
IF OBJECT_ID('configuracion_sistema', 'U') IS NOT NULL DROP TABLE configuracion_sistema;

-- ----------------------------------------------------------------------------
-- 1. TABLA DE CONFIGURACIÓN DEL SISTEMA
-- ----------------------------------------------------------------------------
CREATE TABLE configuracion_sistema (
    clave NVARCHAR(100) PRIMARY KEY,
    valor NVARCHAR(MAX) NOT NULL,
    descripcion NVARCHAR(MAX),
    fecha_actualizacion DATETIME DEFAULT GETDATE()
);

-- ----------------------------------------------------------------------------
-- 2. TABLA DE USUARIOS
-- ----------------------------------------------------------------------------
CREATE TABLE usuarios (
    id INT IDENTITY(1,1) PRIMARY KEY,
    nombre_usuario NVARCHAR(50) UNIQUE NOT NULL,
    nombre_completo NVARCHAR(100) NOT NULL,
    correo NVARCHAR(100) UNIQUE NOT NULL,
    contrasena_hash NVARCHAR(255) NOT NULL, -- Almacenar hash bcrypt/argon2
    rol NVARCHAR(20) NOT NULL CHECK (rol IN ('Administrador', 'Staff')),
    activo BIT DEFAULT 1,
    fecha_creacion DATETIME DEFAULT GETDATE()
);

-- ----------------------------------------------------------------------------
-- 3. TABLA DE CLIENTES
-- ----------------------------------------------------------------------------
CREATE TABLE clientes (
    id INT IDENTITY(1,1) PRIMARY KEY,
    nombre_completo NVARCHAR(100) NOT NULL,
    documento_identidad NVARCHAR(30) UNIQUE,
    telefono NVARCHAR(20),
    correo NVARCHAR(100),
    direccion NVARCHAR(MAX),
    fecha_registro DATETIME DEFAULT GETDATE()
);

-- ----------------------------------------------------------------------------
-- 4. TABLA DE TÉCNICOS
-- ----------------------------------------------------------------------------
CREATE TABLE tecnicos (
    id INT IDENTITY(1,1) PRIMARY KEY,
    usuario_id INT UNIQUE REFERENCES usuarios(id) ON DELETE SET NULL,
    nombre_completo NVARCHAR(100) NOT NULL,
    telefono NVARCHAR(20),
    correo NVARCHAR(100),
    especialidad NVARCHAR(100),
    activo BIT DEFAULT 1,
    fecha_registro DATETIME DEFAULT GETDATE()
);

-- ----------------------------------------------------------------------------
-- 5. TABLA DE SERVICIOS (MANO DE OBRA)
-- ----------------------------------------------------------------------------
CREATE TABLE servicios (
    id INT IDENTITY(1,1) PRIMARY KEY,
    nombre NVARCHAR(100) NOT NULL,
    descripcion NVARCHAR(MAX),
    precio_estandar DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    activo BIT DEFAULT 1
);

-- ----------------------------------------------------------------------------
-- 6. TABLA DE PRODUCTOS (VENTA DIRECTA)
-- ----------------------------------------------------------------------------
CREATE TABLE productos (
    id INT IDENTITY(1,1) PRIMARY KEY,
    codigo_barras NVARCHAR(50) UNIQUE,
    nombre NVARCHAR(100) NOT NULL,
    descripcion NVARCHAR(MAX),
    precio_compra DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    precio_venta DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    stock INT NOT NULL DEFAULT 0 CHECK (stock >= 0),
    stock_minimo INT NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
    activo BIT DEFAULT 1,
    fecha_creacion DATETIME DEFAULT GETDATE()
);

-- ----------------------------------------------------------------------------
-- 7. TABLA DE PIEZAS / REPUESTOS (PARA REPARACIONES)
-- ----------------------------------------------------------------------------
CREATE TABLE piezas (
    id INT IDENTITY(1,1) PRIMARY KEY,
    codigo_pieza NVARCHAR(50) UNIQUE,
    nombre NVARCHAR(100) NOT NULL,
    descripcion NVARCHAR(MAX),
    precio_compra DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    precio_venta DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    stock INT NOT NULL DEFAULT 0 CHECK (stock >= 0),
    stock_minimo INT NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
    compatibilidad_modelos NVARCHAR(MAX), -- Ej: "iPhone 11, iPhone XR"
    activo BIT DEFAULT 1,
    fecha_creacion DATETIME DEFAULT GETDATE()
);

-- ----------------------------------------------------------------------------
-- 8. REGISTRO DE MOVIMIENTOS DE INVENTARIO
-- ----------------------------------------------------------------------------
CREATE TABLE inventario_movimientos (
    id INT IDENTITY(1,1) PRIMARY KEY,
    tipo_item NVARCHAR(20) NOT NULL CHECK (tipo_item IN ('Producto', 'Pieza')),
    item_id INT NOT NULL,
    tipo_movimiento NVARCHAR(20) NOT NULL CHECK (tipo_movimiento IN ('Entrada', 'Salida', 'Ajuste')),
    cantidad INT NOT NULL CHECK (cantidad > 0),
    descripcion NVARCHAR(MAX),
    usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
    fecha_movimiento DATETIME DEFAULT GETDATE()
);

-- ----------------------------------------------------------------------------
-- 9. PROYECTOS DE ELECTRÓNICA (PROTOTIPOS, TRABAJO INTERNO)
-- ----------------------------------------------------------------------------
CREATE TABLE proyectos_electronica (
    id INT IDENTITY(1,1) PRIMARY KEY,
    nombre NVARCHAR(100) NOT NULL,
    descripcion NVARCHAR(MAX),
    presupuesto_estimado DECIMAL(10, 2) DEFAULT 0.00,
    costo_real DECIMAL(10, 2) DEFAULT 0.00,
    tecnico_responsable_id INT REFERENCES tecnicos(id) ON DELETE SET NULL,
    estado NVARCHAR(20) NOT NULL CHECK (estado IN ('Planificado', 'En Proceso', 'En Pruebas', 'Completado', 'Cancelado')) DEFAULT 'Planificado',
    fecha_inicio DATE,
    fecha_fin DATE,
    fecha_creacion DATETIME DEFAULT GETDATE()
);

-- ----------------------------------------------------------------------------
-- 10. CLASES / MATERIAS / CURSOS
-- ----------------------------------------------------------------------------
CREATE TABLE clases_materias (
    id INT IDENTITY(1,1) PRIMARY KEY,
    nombre_materia NVARCHAR(100) NOT NULL,
    descripcion NVARCHAR(MAX),
    instructor_id INT REFERENCES tecnicos(id) ON DELETE SET NULL,
    precio_matricula DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    horarios NVARCHAR(100),
    cupo_maximo INT DEFAULT 20 CHECK (cupo_maximo > 0),
    activo BIT DEFAULT 1
);

-- ----------------------------------------------------------------------------
-- 11. TABLA DE REPARACIONES (ÓRDENES DE TRABAJO)
-- ----------------------------------------------------------------------------
CREATE TABLE reparaciones (
    id INT IDENTITY(1,1) PRIMARY KEY,
    cliente_id INT NOT NULL REFERENCES clientes(id),
    tecnico_id INT REFERENCES tecnicos(id) ON DELETE SET NULL,
    tipo_dispositivo NVARCHAR(50) NOT NULL,
    marca NVARCHAR(50) NOT NULL,
    modelo NVARCHAR(50) NOT NULL,
    numero_serie NVARCHAR(50),
    falla_reportada NVARCHAR(MAX) NOT NULL,
    diagnostico_tecnico NVARCHAR(MAX),
    estado NVARCHAR(30) NOT NULL CHECK (estado IN (
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
    fecha_recepcion DATETIME DEFAULT GETDATE(),
    fecha_prometida DATETIME,
    fecha_entrega DATETIME
);

-- ----------------------------------------------------------------------------
-- 12. DETALLE DE REPARACIONES
-- ----------------------------------------------------------------------------
CREATE TABLE reparacion_detalles (
    id INT IDENTITY(1,1) PRIMARY KEY,
    reparacion_id INT NOT NULL REFERENCES reparaciones(id) ON DELETE CASCADE,
    tipo_detalle NVARCHAR(20) NOT NULL CHECK (tipo_detalle IN ('Servicio', 'Pieza')),
    referencia_id INT NOT NULL,
    cantidad INT NOT NULL DEFAULT 1 CHECK (cantidad > 0),
    precio_unitario DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0.00
);

-- ----------------------------------------------------------------------------
-- 13. CONSULTAS DEL PORTAL PÚBLICO
-- ----------------------------------------------------------------------------
CREATE TABLE consultas_portal (
    id INT IDENTITY(1,1) PRIMARY KEY,
    cliente_nombre NVARCHAR(100) NOT NULL,
    correo NVARCHAR(100) NOT NULL,
    telefono NVARCHAR(20),
    marca_modelo_dispositivo NVARCHAR(100),
    consulta NVARCHAR(MAX) NOT NULL,
    estado NVARCHAR(20) NOT NULL CHECK (estado IN ('Pendiente', 'Respondida', 'Cerrada')) DEFAULT 'Pendiente',
    respuesta NVARCHAR(MAX),
    fecha_consulta DATETIME DEFAULT GETDATE(),
    fecha_respuesta DATETIME
);

-- ----------------------------------------------------------------------------
-- 14. TABLA DE FACTURAS (CABECERA)
-- ----------------------------------------------------------------------------
CREATE TABLE facturas (
    id INT IDENTITY(1,1) PRIMARY KEY,
    numero_factura NVARCHAR(50) UNIQUE NOT NULL,
    cliente_id INT NOT NULL REFERENCES clientes(id),
    usuario_id INT NOT NULL REFERENCES usuarios(id),
    reparacion_id INT UNIQUE REFERENCES reparaciones(id) ON DELETE SET NULL,
    subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    impuesto DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    descuento DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    total DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    metodo_pago NVARCHAR(50) NOT NULL CHECK (metodo_pago IN ('Efectivo', 'Tarjeta Debito', 'Tarjeta Credito', 'Transferencia', 'Otro')),
    estado NVARCHAR(20) NOT NULL CHECK (estado IN ('Pagada', 'Pendiente', 'Anulada')) DEFAULT 'Pagada',
    fecha_emision DATETIME DEFAULT GETDATE()
);

-- ----------------------------------------------------------------------------
-- 15. DETALLE DE FACTURAS
-- ----------------------------------------------------------------------------
CREATE TABLE factura_detalles (
    id INT IDENTITY(1,1) PRIMARY KEY,
    factura_id INT NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
    tipo_item NVARCHAR(20) NOT NULL CHECK (tipo_item IN ('Producto', 'Pieza', 'Servicio', 'Clase')),
    item_id INT NOT NULL,
    descripcion NVARCHAR(150) NOT NULL,
    cantidad INT NOT NULL DEFAULT 1 CHECK (cantidad > 0),
    precio_unitario DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0.00
);
GO

-- ============================================================================
-- ÍNDICES PARA OPTIMIZACIÓN
-- ============================================================================
CREATE INDEX idx_usuarios_username ON usuarios(nombre_usuario);
CREATE INDEX idx_clientes_nombre ON clientes(nombre_completo);
CREATE INDEX idx_clientes_documento ON clientes(documento_identidad);
CREATE INDEX idx_tecnicos_usuario ON tecnicos(usuario_id);
CREATE INDEX idx_reparaciones_cliente ON reparaciones(cliente_id);
CREATE INDEX idx_reparaciones_tecnico ON reparaciones(tecnico_id);
CREATE INDEX idx_reparaciones_estado ON reparaciones(estado);
CREATE INDEX idx_reparaciones_serie ON reparaciones(numero_serie);
CREATE INDEX idx_productos_codigo ON productos(codigo_barras);
CREATE INDEX idx_piezas_codigo ON piezas(codigo_pieza);
CREATE INDEX idx_facturas_numero ON facturas(numero_factura);
CREATE INDEX idx_facturas_cliente ON facturas(cliente_id);
GO

-- ============================================================================
-- VISTAS
-- ============================================================================

-- 1. Vista de reparaciones pendientes
CREATE VIEW vista_reparaciones_pendientes AS
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
GO

-- 2. Vista de stock bajo
CREATE VIEW vista_resumen_inventario_bajo AS
SELECT 
    'Producto' AS tipo,
    id,
    nombre,
    stock,
    stock_minimo,
    precio_venta
FROM productos
WHERE stock <= stock_minimo AND activo = 1
UNION ALL
SELECT 
    'Pieza' AS tipo,
    id,
    nombre,
    stock,
    stock_minimo,
    precio_venta
FROM piezas
WHERE stock <= stock_minimo AND activo = 1;
GO

-- 3. Vista de reporte de ventas diarias
CREATE VIEW vista_reporte_ventas_diarias AS
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
GO

-- ============================================================================
-- PROCEDIMIENTOS ALMACENADOS
-- ============================================================================

-- 1. Registrar movimiento de inventario y actualizar el stock
CREATE PROCEDURE registrar_movimiento_inventario
    @tipo_item NVARCHAR(20),
    @item_id INT,
    @tipo_movimiento NVARCHAR(20),
    @cantidad INT,
    @descripcion NVARCHAR(MAX),
    @usuario_id INT
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRANSACTION;
    BEGIN TRY
        -- Insertar registro de movimiento
        INSERT INTO inventario_movimientos (tipo_item, item_id, tipo_movimiento, cantidad, descripcion, usuario_id)
        VALUES (@tipo_item, @item_id, @tipo_movimiento, @cantidad, @descripcion, @usuario_id);

        -- Ajustar stock
        IF @tipo_item = 'Producto'
        BEGIN
            IF @tipo_movimiento = 'Entrada'
                UPDATE productos SET stock = stock + @cantidad WHERE id = @item_id;
            ELSE IF @tipo_movimiento = 'Salida'
                UPDATE productos SET stock = stock - @cantidad WHERE id = @item_id;
            ELSE IF @tipo_movimiento = 'Ajuste'
                UPDATE productos SET stock = @cantidad WHERE id = @item_id;
        END
        ELSE IF @tipo_item = 'Pieza'
        BEGIN
            IF @tipo_movimiento = 'Entrada'
                UPDATE piezas SET stock = stock + @cantidad WHERE id = @item_id;
            ELSE IF @tipo_movimiento = 'Salida'
                UPDATE piezas SET stock = stock - @cantidad WHERE id = @item_id;
            ELSE IF @tipo_movimiento = 'Ajuste'
                UPDATE piezas SET stock = @cantidad WHERE id = @item_id;
        END

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO

-- 2. Facturar reparación
CREATE PROCEDURE facturar_reparacion
    @reparacion_id INT,
    @usuario_id INT,
    @numero_factura NVARCHAR(50),
    @metodo_pago NVARCHAR(50),
    @descuento DECIMAL(10, 2),
    @factura_id INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @cliente_id INT;
    DECLARE @subtotal DECIMAL(10, 2) = 0.00;
    DECLARE @impuesto DECIMAL(10, 2) = 0.00;
    DECLARE @iva_porcentaje DECIMAL(5, 2) = 0.19; -- IVA por defecto
    DECLARE @total DECIMAL(10, 2) = 0.00;
    DECLARE @valor_config NVARCHAR(MAX);

    SELECT @cliente_id = cliente_id 
    FROM reparaciones 
    WHERE id = @reparacion_id;
    
    IF @cliente_id IS NULL
    BEGIN
        THROW 50001, 'Reparación no encontrada.', 1;
    END;

    SELECT @valor_config = valor FROM configuracion_sistema WHERE clave = 'impuesto_iva_porcentaje';
    IF @@ROWCOUNT > 0
    BEGIN
        SET @iva_porcentaje = CAST(@valor_config AS DECIMAL(10,2)) / 100.00;
    END;

    SELECT @subtotal = COALESCE(SUM(subtotal), 0)
    FROM reparacion_detalles
    WHERE reparacion_id = @reparacion_id;

    SET @impuesto = @subtotal * @iva_porcentaje;
    SET @total = @subtotal + @impuesto - @descuento;
    IF @total < 0 SET @total = 0;

    BEGIN TRANSACTION;
    BEGIN TRY
        INSERT INTO facturas (numero_factura, cliente_id, usuario_id, reparacion_id, subtotal, impuesto, descuento, total, metodo_pago, estado)
        VALUES (@numero_factura, @cliente_id, @usuario_id, @reparacion_id, @subtotal, @impuesto, @descuento, @total, @metodo_pago, 'Pagada');
        
        SET @factura_id = SCOPE_IDENTITY();

        DECLARE @tipo_detalle NVARCHAR(20);
        DECLARE @referencia_id INT;
        DECLARE @cantidad INT;
        DECLARE @precio_unitario DECIMAL(10,2);
        DECLARE @subtotal_det DECIMAL(10,2);
        
        DECLARE detalle_cursor CURSOR LOCAL FOR
        SELECT tipo_detalle, referencia_id, cantidad, precio_unitario, subtotal
        FROM reparacion_detalles
        WHERE reparacion_id = @reparacion_id;
        
        OPEN detalle_cursor;
        FETCH NEXT FROM detalle_cursor INTO @tipo_detalle, @referencia_id, @cantidad, @precio_unitario, @subtotal_det;
        
        WHILE @@FETCH_STATUS = 0
        BEGIN
            IF @tipo_detalle = 'Pieza'
            BEGIN
                DECLARE @nombre_pieza NVARCHAR(100);
                SELECT @nombre_pieza = nombre FROM piezas WHERE id = @referencia_id;
                
                INSERT INTO factura_detalles (factura_id, tipo_item, item_id, descripcion, cantidad, precio_unitario, subtotal)
                VALUES (@factura_id, 'Pieza', @referencia_id, N'Repuesto: ' + @nombre_pieza, @cantidad, @precio_unitario, @subtotal_det);
                
                EXEC registrar_movimiento_inventario 
                    @tipo_item = 'Pieza', 
                    @item_id = @referencia_id, 
                    @tipo_movimiento = 'Salida', 
                    @cantidad = @cantidad, 
                    @descripcion = N'Salida automática por facturación de reparación ID: ' + CAST(@reparacion_id AS NVARCHAR(10)), 
                    @usuario_id = @usuario_id;
            END
            ELSE IF @tipo_detalle = 'Servicio'
            BEGIN
                DECLARE @nombre_servicio NVARCHAR(100);
                SELECT @nombre_servicio = nombre FROM servicios WHERE id = @referencia_id;
                
                INSERT INTO factura_detalles (factura_id, tipo_item, item_id, descripcion, cantidad, precio_unitario, subtotal)
                VALUES (@factura_id, 'Servicio', @referencia_id, N'Servicio de Mano de Obra: ' + @nombre_servicio, @cantidad, @precio_unitario, @subtotal_det);
            END;
            
            FETCH NEXT FROM detalle_cursor INTO @tipo_detalle, @referencia_id, @cantidad, @precio_unitario, @subtotal_det;
        END;
        
        CLOSE detalle_cursor;
        DEALLOCATE detalle_cursor;

        UPDATE reparaciones 
        SET estado = 'Entregado', fecha_entrega = GETDATE() 
        WHERE id = @reparacion_id;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO

-- 3. Búsqueda inteligente de reparaciones
CREATE PROCEDURE buscar_reparaciones
    @termino NVARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT 
        r.id AS reparacion_id,
        c.nombre_completo AS cliente_nombre,
        r.tipo_dispositivo,
        r.marca,
        r.modelo,
        r.numero_serie,
        r.estado,
        r.fecha_recepcion
    FROM reparaciones r
    JOIN clientes c ON r.cliente_id = c.id
    WHERE r.marca LIKE '%' + @termino + '%'
       OR r.modelo LIKE '%' + @termino + '%'
       OR r.numero_serie LIKE '%' + @termino + '%'
       OR c.nombre_completo LIKE '%' + @termino + '%'
       OR c.documento_identidad LIKE '%' + @termino + '%';
END;
GO

-- ============================================================================
-- DATOS INICIALES (SEMILLA)
-- ============================================================================

-- 1. Configuraciones iniciales
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

-- 2. Usuarios Base
-- Contrasenas en texto plano para el hasher de la app: admin -> "admin123", staff_pedro -> "staff123"
-- Hashes pregenerados con bcrypt (12 rondas):
-- admin123 -> $2b$12$Z0H98q3x1w.c9e4g7RzD.uI1uC75dFmP5gK6p9O/H2L3a5e/8J3Ry
-- staff123 -> $2b$12$V7GZc3F5Y4nN.0K3s0Z.Ouy9X5s4V2J.eK4rB3kE1nO4a5e/8J3Ry (ejemplo representativo)
INSERT INTO usuarios (nombre_usuario, nombre_completo, correo, contrasena_hash, rol, activo) VALUES
('admin', 'Administrador General', 'admin@electrofix.com', '$2b$12$Z0H98q3x1w.c9e4g7RzD.uI1uC75dFmP5gK6p9O/H2L3a5e/8J3Ry', 'Administrador', 1),
('staff_pedro', 'Pedro Martínez (Cajero/Soporte)', 'pedro.martinez@electrofix.com', '$2b$12$V7GZc3F5Y4nN.0K3s0Z.Ouy9X5s4V2J.eK4rB3kE1nO4a5e/8J3Ry', 'Staff', 1);

-- 3. Técnicos base
SET IDENTITY_INSERT tecnicos ON;
INSERT INTO tecnicos (id, usuario_id, nombre_completo, telefono, correo, especialidad, activo) VALUES
(1, 1, 'Administrador General (Ing. Electrónico)', '+57 300 987 6543', 'admin@electrofix.com', 'Microsoldadura y Reballing', 1);
SET IDENTITY_INSERT tecnicos OFF;

INSERT INTO tecnicos (nombre_completo, telefono, correo, especialidad, activo) VALUES
('Ing. Carlos Mendoza (Técnico Móvil)', '+57 311 222 3344', 'carlos.mendoza@electrofix.com', 'Diagnóstico Apple iOS y Android', 1),
('Dra. Sofía Ortega (Hardware Laptops)', '+57 322 555 6677', 'sofia.ortega@electrofix.com', 'Reparación de Placas Base Laptops', 1);

-- 4. Servicios
INSERT INTO servicios (nombre, descripcion, precio_estandar, activo) VALUES
('Diagnóstico Básico', 'Revisión preliminar y detección de fallas', 15000.00, 1),
('Limpieza Ultrasónica', 'Limpieza profunda en tina química para placas', 50000.00, 1),
('Reballing Chip de Video', 'Reconstrucción de soldaduras de GPU', 180000.00, 1),
('Cambio de Puerto de Carga', 'Sustitución de conector USB soldado', 45000.00, 1),
('Instalación de S.O.', 'Instalación limpia y optimización de sistema operativo', 60000.00, 1);

-- 5. Piezas
INSERT INTO piezas (codigo_pieza, nombre, descripcion, precio_compra, precio_venta, stock, stock_minimo, compatibilidad_modelos) VALUES
('PZ-SCR-IP11', 'Pantalla Completa iPhone 11', 'Pantalla LCD incell compatible', 120000.00, 210000.00, 10, 3, 'iPhone 11'),
('PZ-BAT-IP11', 'Batería Homologada iPhone 11', 'Batería de repuesto 3110mAh', 45000.00, 85000.00, 15, 5, 'iPhone 11'),
('PZ-PORT-TYPC', 'Puerto Carga Tipo-C Universal', 'Conector USB Tipo-C hembra', 1500.00, 8000.00, 100, 20, 'Varios modelos Android'),
('PZ-SSD-512GB', 'Disco SSD NVMe 512GB', 'Unidad de estado sólido M.2 Kingston', 110000.00, 175000.00, 8, 2, 'Laptops y PCs con M.2');

-- 6. Productos
INSERT INTO productos (codigo_barras, nombre, descripcion, precio_compra, precio_venta, stock, stock_minimo) VALUES
('7701234567890', 'Cargador Rápido Tipo-C 20W', 'Cargador pared compatible PD 3.0', 15000.00, 35000.00, 25, 5),
('7701234567891', 'Cable USB-C a Lightning 1.2m', 'Cable trenzado reforzado', 8000.00, 20000.00, 30, 8),
('7701234567892', 'Protector Pantalla Cerámico', 'Vidrio templado flexible', 3000.00, 15000.00, 50, 10);

-- 7. Clases
SET IDENTITY_INSERT clases_materias ON;
INSERT INTO clases_materias (id, nombre_materia, descripcion, instructor_id, precio_matricula, horarios, cupo_maximo, activo) VALUES
(1, 'Curso de Microsoldadura Avanzada', 'Introducción al reballing y componentes SMD', 1, 450000.00, 'Sábados de 08:00 a 13:00', 10, 1);
SET IDENTITY_INSERT clases_materias OFF;

-- 8. Clientes
INSERT INTO clientes (nombre_completo, documento_identidad, telefono, correo, direccion) VALUES
('María Paula Restrepo', '1.020.444.888', '+57 315 777 9900', 'maria.paula@gmail.com', 'Calle 10 # 5-20, Apto 402'),
('Juan Fernando Hoyos', '79.888.999', '+57 310 444 1122', 'juan.hoyos@outlook.com', 'Carrera 15 # 72-10, Oficina 304');
GO
