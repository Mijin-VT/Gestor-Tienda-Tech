const db = require('./database.js');
async function setup() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS pedidos (
        id SERIAL PRIMARY KEY,
        cliente_nombre VARCHAR(255),
        numero_pedido VARCHAR(50),
        productos TEXT,
        estado VARCHAR(50),
        total DECIMAL(10,2),
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Tabla pedidos creada exitosamente');
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}
setup();
