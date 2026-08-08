const db = require('D:/Desktop/AGENTES/GESTION_ELECTRONICA/database');

async function run() {
  try {
    console.log('Connecting to database...');
    for (let i = 1; i <= 10; i++) {
      const client = {
        nombre_completo: `Cliente Ficticio ${i}`,
        documento_identidad: `500000${i}`,
        telefono: `+57 300 111 000${i}`,
        correo: `ficticio${i}@prueba.com`,
        direccion: `Avenida Falsa ${i}`
      };
      await db.query(
        'INSERT INTO clientes (nombre_completo, documento_identidad, telefono, correo, direccion) VALUES (@nombre_completo, @documento_identidad, @telefono, @correo, @direccion)',
        client
      );
      console.log(`Inserted client ${i}`);
    }
    console.log('Done!');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

run();
