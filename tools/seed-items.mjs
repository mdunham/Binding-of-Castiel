// seed-items.mjs — append a curated set of items with interesting effects to
// content.json, WITHOUT touching existing entries. Idempotent: skips ids that
// already exist. Run: node tools/seed-items.mjs   (then node tools/gen-sprites.mjs)

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Effect keys understood by the game:
//   damage, damageMult(×), fireRate, moveSpeed, maxHealth, shotCount,
//   projectileSpeed, range, spread, piercing(1=on), homing(1=on), luck,
//   bombs(one-time), keys(one-time)
const ITEMS = [
  { id: 'polyphemus', name: 'Polyphemus', color: '#d8e0e8',
    description: 'Giant tears — huge damage, much slower fire.',
    effects: { damage: 6, fireRate: -1.2, projectileSpeed: 0.4 } },
  { id: 'spoon-bender', name: 'Spoon Bender', color: '#b07ad8',
    description: 'Your shots home in on enemies.',
    effects: { homing: 1 } },
  { id: 'cupids-arrow', name: "Cupid's Arrow", color: '#e89ab8',
    description: 'Piercing shots pass through enemies.',
    effects: { piercing: 1, projectileSpeed: 0.6 } },
  { id: 'magic-mushroom', name: 'Magic Mushroom', color: '#d85a6a',
    description: 'Everything goes up a little.',
    effects: { damage: 1, maxHealth: 2, moveSpeed: 0.3, fireRate: 0.2, range: 8 } },
  { id: 'soy-milk', name: 'Soy Milk', color: '#eef0f5',
    description: 'Tiny tears, machine-gun fire rate.',
    effects: { damage: -2.6, fireRate: 5, projectileSpeed: 0.8 } },
  { id: 'twenty-twenty', name: '20/20', color: '#8ad0e0',
    description: 'Fire two tears at once.',
    effects: { shotCount: 1, spread: 6 } },
  { id: 'lucky-foot', name: 'Lucky Foot', color: '#c8a85a',
    description: 'Luck up — more hearts, bombs and keys drop.',
    effects: { luck: 2 } },
  { id: 'sacred-heart', name: 'Sacred Heart', color: '#f0d86a',
    description: 'Powerful homing shots and an extra heart.',
    effects: { damage: 4, homing: 1, fireRate: -0.7, maxHealth: 2 } },
  { id: 'steroids', name: 'Steroids', color: '#c0392b',
    description: '+50% damage (a multiplier on your damage).',
    effects: { damageMult: 0.5 } },
  { id: 'tech-x', name: 'Tech X', color: '#7ad0a0',
    description: 'Piercing AND homing shots.',
    effects: { piercing: 1, homing: 1, fireRate: -0.3 } },
  { id: 'boom-bag', name: 'Boom Bag', color: '#444a3a',
    description: 'A sack of bombs (+5).',
    effects: { bombs: 5 } },
  { id: 'skeleton-key', name: 'Skeleton Key', color: '#d8c84a',
    description: 'A ring of keys (+5).',
    effects: { keys: 5 } },
];

const path = fileURLToPath(new URL('../content.json', import.meta.url));
const data = JSON.parse(await readFile(path, 'utf8'));
data.items = data.items || [];
const have = new Set(data.items.map((it) => it.id));

let added = 0;
for (const it of ITEMS) {
  if (have.has(it.id)) continue;
  data.items.push(it);
  added++;
}
await writeFile(path, JSON.stringify(data, null, 2) + '\n');
console.log(`Added ${added} new items (total ${data.items.length}). Run gen-sprites next.`);
