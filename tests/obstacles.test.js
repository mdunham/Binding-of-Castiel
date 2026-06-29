import { test, eq, ok } from './run.js';
import { generateObstacles, clearPoint } from '../game/src/obstacles.js';
import { makeRng } from '../game/src/floor.js';

export const NAME = 'obstacles & rocks';

const GEO = { x0: 60, y0: 96, x1: 840, y1: 580 };
const CX = (GEO.x0 + GEO.x1) / 2;
const CY = (GEO.y0 + GEO.y1) / 2;

export function run() {
  test('start and boss rooms have no rocks', () => {
    eq(generateObstacles(makeRng(1), 'start', GEO).length, 0, 'start');
    eq(generateObstacles(makeRng(1), 'boss', GEO).length, 0, 'boss');
  });

  test('normal rooms produce some rocks', () => {
    let total = 0;
    for (let s = 1; s <= 8; s++) total += generateObstacles(makeRng(s), 'normal', GEO).length;
    ok(total > 0, 'at least some rocks across seeds');
  });

  test('is deterministic for a fixed seed', () => {
    const a = generateObstacles(makeRng(42), 'normal', GEO);
    const b = generateObstacles(makeRng(42), 'normal', GEO);
    eq(a, b, 'same rocks');
  });

  test('rocks never block the room center (door lane)', () => {
    for (let s = 1; s <= 12; s++) {
      const rocks = generateObstacles(makeRng(s), 'normal', GEO);
      for (const rk of rocks) {
        const inX = CX >= rk.x && CX <= rk.x + rk.w;
        const inY = CY >= rk.y && CY <= rk.y + rk.h;
        ok(!(inX && inY), `seed ${s}: a rock covers the center`);
      }
    }
  });

  test('rocks stay inside the play area', () => {
    const rocks = generateObstacles(makeRng(7), 'normal', GEO);
    for (const rk of rocks) {
      ok(rk.x >= GEO.x0 && rk.x + rk.w <= GEO.x1, 'within x');
      ok(rk.y >= GEO.y0 && rk.y + rk.h <= GEO.y1, 'within y');
    }
  });

  test('clearPoint avoids rocks when possible', () => {
    const rocks = generateObstacles(makeRng(3), 'normal', GEO);
    const pt = clearPoint(makeRng(99), GEO, rocks, 13);
    const inside = rocks.some((rk) => pt.x > rk.x - 13 && pt.x < rk.x + rk.w + 13
      && pt.y > rk.y - 13 && pt.y < rk.y + rk.h + 13);
    ok(!inside, 'spawn point not on a rock');
  });
}
