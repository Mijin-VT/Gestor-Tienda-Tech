const fs = require('fs');
const lines = fs.readFileSync('main.js', 'utf8').split('\n');
lines.forEach((l, i) => { if (l.includes('app:create-invoice')) console.log(i + 1, l); });
