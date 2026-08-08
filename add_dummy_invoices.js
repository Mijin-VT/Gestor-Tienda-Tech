const db = require('D:/Desktop/AGENTES/GESTION_ELECTRONICA/database');

async function run() {
  try {
    console.log('Connecting to database...');
    
    // Get valid client, user, and service
    const clientRes = await db.query('SELECT id FROM clientes LIMIT 1');
    const userRes = await db.query('SELECT id FROM usuarios LIMIT 1');
    const serviceRes = await db.query('SELECT id FROM servicios LIMIT 1');
    
    const clientRecords = clientRes.recordset || clientRes.rows;
    const userRecords = userRes.recordset || userRes.rows;
    const serviceRecords = serviceRes.recordset || serviceRes.rows;
    
    if (!clientRecords || clientRecords.length === 0) {
      console.log('No hay clientes. Crea uno primero.');
      process.exit(1);
    }
    if (!userRecords || userRecords.length === 0) {
      console.log('No hay usuarios. Crea uno primero.');
      process.exit(1);
    }
    if (!serviceRecords || serviceRecords.length === 0) {
      console.log('No hay servicios. Crea uno primero.');
      process.exit(1);
    }
    
    const clienteId = clientRecords[0].id;
    const usuarioId = userRecords[0].id;
    const servicioId = serviceRecords[0].id;

    for (let i = 1; i <= 10; i++) {
      const subtotal = Math.floor(Math.random() * 500) + 100;
      const impuesto = subtotal * 0.15;
      const total = subtotal + impuesto;
      
      const numFactura = `001-001-${String(2000 + i).padStart(9, '0')}`;
      const claveAcceso = `012345678901234567890123456789012345678912345679${i}`;
      
      const invoice = {
        numero_factura: numFactura,
        cliente_id: clienteId,
        usuario_id: usuarioId,
        reparacion_id: null,
        subtotal: subtotal,
        impuesto: impuesto,
        descuento: 0,
        total: total,
        metodo_pago: i % 2 === 0 ? 'Efectivo' : 'Transferencia',
        clave_acceso: claveAcceso
      };
      
      const res = await db.query(
        `INSERT INTO facturas (numero_factura, cliente_id, usuario_id, reparacion_id, subtotal, impuesto, descuento, total, metodo_pago, estado, clave_acceso) 
         VALUES (@numero_factura, @cliente_id, @usuario_id, @reparacion_id, @subtotal, @impuesto, @descuento, @total, @metodo_pago, 'Pagada', @clave_acceso)
         RETURNING id`,
        invoice
      );
      
      let facturaId = null;
      if (res.recordset && res.recordset.length > 0) {
        facturaId = res.recordset[0].id;
      } else if (res.rows && res.rows.length > 0) {
        facturaId = res.rows[0].id;
      }
      
      // Insert detail if we got an ID
      if (facturaId) {
        const detail = {
          factura_id: facturaId,
          tipo_item: 'Servicio',
          item_id: servicioId,
          descripcion: `Servicio de Prueba ${i}`,
          cantidad: 1,
          precio_unitario: subtotal,
          subtotal: subtotal
        };
        await db.query(
          `INSERT INTO factura_detalles (factura_id, tipo_item, item_id, descripcion, cantidad, precio_unitario, subtotal)
           VALUES (@factura_id, @tipo_item, @item_id, @descripcion, @cantidad, @precio_unitario, @subtotal)`,
          detail
        );
      }
      
      console.log(`Inserted invoice ${i}`);
    }
    console.log('Done!');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

run();
