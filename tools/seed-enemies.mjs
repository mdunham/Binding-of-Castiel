// seed-enemies.mjs — append new enemies to content.json without touching existing
// entries. Idempotent. Run: node tools/seed-enemies.mjs  (then node tools/gen-sprites.mjs)

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ENEMIES = [
  {
    id: 'broodmother', name: 'Brood Mother', role: 'enemy',
    maxHealth: 45, moveSpeed: 1.0, size: 22, color: '#3a4a35',
    ai: 'spawner', spawnId: 'spider', spawnInterval: 2.4, spawnCount: 2,
    contactDamage: 1,
  },
];

const path = fileURLToPath(new URL('../content.json', import.meta.url));
const data = JSON.parse(await readFile(path, 'utf8'));
data.characters = data.characters || [];
const have = new Set(data.characters.map((c) => c.id));

let added = 0;
for (const e of ENEMIES) {
  if (have.has(e.id)) continue;
  // Insert before any boss so it reads naturally in the list.
  const bossIdx = data.characters.findIndex((c) => c.role === 'boss');
  if (bossIdx >= 0) data.characters.splice(bossIdx, 0, e);
  else data.characters.push(e);
  added++;
}
await writeFile(path, JSON.stringify(data, null, 2) + '\n');
console.log(`Added ${added} enemy(ies). Run gen-sprites next.`);
