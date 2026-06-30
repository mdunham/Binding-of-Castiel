// seed-trails.mjs — append the default damaging trails to content.json without
// touching existing entries. Idempotent. Run: node tools/seed-trails.mjs

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const TRAILS = [
  { id: 'electric', name: 'Electric Trail', style: 'electric', color: '#8ad8ff',
    damage: 2, tickInterval: 12, lifetime: 26, width: 14, dropInterval: 4 },
  { id: 'blood', name: 'Blood Trail', style: 'blood', color: '#b5202a',
    damage: 1.2, tickInterval: 20, lifetime: 70, width: 17, dropInterval: 6 },
  { id: 'poison', name: 'Poison Trail', style: 'poison', color: '#6cc04a',
    damage: 0.8, tickInterval: 14, lifetime: 95, width: 15, dropInterval: 6 },
];

const path = fileURLToPath(new URL('../content.json', import.meta.url));
const data = JSON.parse(await readFile(path, 'utf8'));
data.trails = data.trails || [];
const have = new Set(data.trails.map((t) => t.id));

let added = 0;
for (const t of TRAILS) { if (!have.has(t.id)) { data.trails.push(t); added++; } }
await writeFile(path, JSON.stringify(data, null, 2) + '\n');
console.log(`Added ${added} trail(s); total ${data.trails.length}.`);
