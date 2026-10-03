const fs = require('fs');
const path = require('path');
const p = path.resolve('src/app/staff/page.tsx');
let text = fs.readFileSync(p, 'utf8');

text = text.replace('ShieldAlert,', 'ShieldAlert,\n  CalendarCheck,');

fs.writeFileSync(p, text, 'utf8');
