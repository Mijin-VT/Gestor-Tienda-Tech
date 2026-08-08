const db = require('./database');

async function fixDB() {
  try {
    // 1. Drop the view
    await db.query(`DROP VIEW IF EXISTS vista_resumen_inventario_bajo`);
    
    // 2. Alter productos
    await db.query(`ALTER TABLE productos ALTER COLUMN stock TYPE numeric(10,2) USING stock::numeric`);
    await db.query(`ALTER TABLE productos ALTER COLUMN stock_minimo TYPE numeric(10,2) USING stock_minimo::numeric`);
    
    // 3. Alter piezas
    await db.query(`ALTER TABLE piezas ALTER COLUMN stock TYPE numeric(10,2) USING stock::numeric`);
    await db.query(`ALTER TABLE piezas ALTER COLUMN stock_minimo TYPE numeric(10,2) USING stock_minimo::numeric`);
    
    // 4. Recreate the view
    await db.query(`
      CREATE VIEW vista_resumen_inventario_bajo AS
      SELECT 'Producto'::text AS tipo,
          productos.id,
          productos.nombre,
          productos.stock,
          productos.stock_minimo,
          productos.precio_venta
        FROM productos
        WHERE ((productos.stock <= productos.stock_minimo) AND (productos.activo = true))
      UNION ALL
      SELECT 'Pieza'::text AS tipo,
          piezas.id,
          piezas.nombre,
          piezas.stock,
          piezas.stock_minimo,
          piezas.precio_venta
        FROM piezas
        WHERE ((piezas.stock <= piezas.stock_minimo) AND (piezas.activo = true));
    `);
    console.log("DB Fixed!");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

fixDB();
