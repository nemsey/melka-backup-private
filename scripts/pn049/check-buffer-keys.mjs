import fs from 'fs';
const rows = JSON.parse(fs.readFileSync('upload/.runtime/pn049-filings-buffer.json', 'utf8'));
console.log('rows:', rows.length);
const keys = new Set();
for (const r of rows.slice(0, 200)) for (const k of Object.keys(r)) keys.add(k);
console.log('filing row keys:', [...keys].sort().join(', '));
const sample = rows.find(r => r.ownerName || r.phone) ?? rows[0];
console.log('sample row:', JSON.stringify(sample).slice(0, 400));
