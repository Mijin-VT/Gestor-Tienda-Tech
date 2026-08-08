const db = require('./database');
db.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'facturas'").then(res => {
  console.log(res.recordset);
  process.exit(0);
});
