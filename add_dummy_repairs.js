const db = require('D:/Desktop/AGENTES/GESTION_ELECTRONICA/database');

async function run() {
  try {
    console.log('Connecting to database...');
    const clientRes = await db.query('SELECT id FROM clientes LIMIT 1');
    const records = clientRes.recordset || clientRes.rows;
    if (!records || records.length === 0) {
      console.log('No hay clientes en la base de datos para asignar reparaciones.');
      process.exit(1);
    }
    const clienteId = records[0].id;

    for (let i = 1; i <= 10; i++) {
      const repair = {
        cliente_id: clienteId,
        tipo_dispositivo: `Dispositivo Ficticio ${i}`,
        marca: `Marca ${i}`,
        modelo: `Modelo ${i}`,
        numero_serie: `SN-000${i}`,
        falla_reportada: `Falla simulada ${i}`,
        diagnostico_tecnico: null,
        tecnico_id: null,
        estado: 'Recibido',
        costo_estimado: Math.floor(Math.random() * 500) + 50,
        abono: 0,
        fecha_prometida: new Date().toISOString(),
        fecha_entrega: null
      };
      
      await db.query(
        `INSERT INTO reparaciones (cliente_id, tipo_dispositivo, marca, modelo, numero_serie, falla_reportada, diagnostico_tecnico, tecnico_id, estado, costo_estimado, abono, fecha_prometida, fecha_entrega) 
         VALUES (@cliente_id, @tipo_dispositivo, @marca, @modelo, @numero_serie, @falla_reportada, @diagnostico_tecnico, @tecnico_id, @estado, @costo_estimado, @abono, @fecha_prometida, @fecha_entrega)`,
        repair
      );
      console.log(`Inserted repair ${i}`);
    }
    console.log('Done!');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

run();
