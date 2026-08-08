const db = require('D:/Desktop/AGENTES/GESTION_ELECTRONICA/database');

async function run() {
  try {
    console.log('Connecting to database...');
    for (let i = 1; i <= 10; i++) {
      const service = {
        nombre: `Servicio Ficticio ${i}`,
        descripcion: `Descripción detallada del servicio de prueba número ${i}. Incluye revisión y limpieza general.`,
        precio_estandar: Math.floor(Math.random() * 200) + 20, // Random price between 20 and 220
        activo: true
      };
      
      await db.query(
        `INSERT INTO servicios (nombre, descripcion, precio_estandar, activo) 
         VALUES (@nombre, @descripcion, @precio_estandar, @activo)`,
        service
      );
      console.log(`Inserted service ${i}`);
    }
    console.log('Done!');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

run();
