const db = require('D:/Desktop/AGENTES/GESTION_ELECTRONICA/database');

async function run() {
  try {
    console.log('Connecting to database...');
    for (let i = 2; i <= 10; i++) {
      const user = {
        nombre_usuario: `usuario_ficticio_${i}`,
        nombre_completo: `Usuario Ficticio ${i}`,
        correo: `usuario${i}@ficticio.com`,
        contrasena_hash: 'hash_ficticio_123',
        rol: i % 2 === 0 ? 'Staff' : 'Administrador',
        activo: true
      };
      
      await db.query(
        `INSERT INTO usuarios (nombre_usuario, nombre_completo, correo, contrasena_hash, rol, activo) 
         VALUES (@nombre_usuario, @nombre_completo, @correo, @contrasena_hash, @rol, @activo)`,
        user
      );
      console.log(`Inserted user ${i}`);
    }
    console.log('Done!');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

run();
