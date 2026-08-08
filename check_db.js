const db = require('./database');
db.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'").then(res => {
  console.log(res.recordset.map(r => r.table_name));
  process.exit(0);
});
