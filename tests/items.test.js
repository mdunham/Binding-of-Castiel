import { test, eq, ok, approx } from './run.js';
import { emptyMods, applyItem, effectiveWeapon, effectiveMoveSpeed, luckBonus } from '../game/src/items.js';

export const NAME = 'item effects';

function makePlayer() {
  return {
    def: { moveSpeed: 2.6 },
    weapon: { damage: 3.5, fireRate: 2.6, projectileSpeed: 5, range: 60, spread: 0, shotCount: 1 },
    maxHealth: 6, health: 4,
    mods: emptyMods(),
    items: [],
    bombs: 1, keys: 0,
  };
}

export function run() {
  test('emptyMods is all zeros', () => {
    const m = emptyMods();
    ok(Object.values(m).every((v) => v === 0), 'all zero');
  });

  test('applyItem accumulates stat deltas', () => {
    const p = makePlayer();
    applyItem(p, { id: 'onion', effects: { fireRate: 0.8 } });
    applyItem(p, { id: 'cricket', effects: { damage: 1.6 } });
    approx(p.mods.fireRate, 0.8, 1e-9);
    approx(p.mods.damage, 1.6, 1e-9);
    eq(p.items, ['onion', 'cricket'], 'item ids recorded');
  });

  test('maxHealth item raises cap and heals by the same amount', () => {
    const p = makePlayer(); // health 4 / max 6
    applyItem(p, { id: 'breakfast', effects: { maxHealth: 2 } });
    eq(p.maxHealth, 8, 'cap raised');
    eq(p.health, 6, 'healed by +2');
  });

  test('healing never exceeds the (new) cap', () => {
    const p = makePlayer(); p.health = 6; // already full
    applyItem(p, { id: 'breakfast', effects: { maxHealth: 2 } });
    eq(p.health, 8, 'clamped to new max');
  });

  test('effectiveWeapon merges mods over base weapon', () => {
    const p = makePlayer();
    applyItem(p, { id: 'inner-eye', effects: { shotCount: 2, fireRate: -0.5 } });
    applyItem(p, { id: 'cricket', effects: { damage: 1.6 } });
    const w = effectiveWeapon(p);
    eq(w.shotCount, 3, '1 + 2');
    approx(w.fireRate, 2.1, 1e-9, '2.6 - 0.5');
    approx(w.damage, 5.1, 1e-9, '3.5 + 1.6');
  });

  test('effectiveWeapon clamps to sane floors', () => {
    const p = makePlayer();
    applyItem(p, { id: 'nerf', effects: { fireRate: -100, shotCount: -100 } });
    const w = effectiveWeapon(p);
    ok(w.fireRate >= 0.2, 'fireRate floored');
    ok(w.shotCount >= 1, 'shotCount floored');
  });

  test('effectiveMoveSpeed adds mods to base', () => {
    const p = makePlayer();
    applyItem(p, { id: 'speed', effects: { moveSpeed: 0.55 } });
    approx(effectiveMoveSpeed(p), 3.15, 1e-9);
  });

  test('effectiveWeapon is null when unarmed', () => {
    const p = makePlayer(); p.weapon = null;
    ok(effectiveWeapon(p) === null);
  });

  test('damageMult multiplies (base + additive) damage', () => {
    const p = makePlayer();
    applyItem(p, { id: 'steroids', effects: { damageMult: 0.5 } });
    approx(effectiveWeapon(p).damage, 3.5 * 1.5, 1e-9, '+50%');
    applyItem(p, { id: 'cricket', effects: { damage: 1.5 } });
    approx(effectiveWeapon(p).damage, (3.5 + 1.5) * 1.5, 1e-9, 'additive then ×');
  });

  test('piercing and homing flags switch on via items', () => {
    const p = makePlayer();
    ok(!effectiveWeapon(p).piercing, 'off by default');
    ok(!effectiveWeapon(p).homing, 'off by default');
    applyItem(p, { id: 'cupid', effects: { piercing: 1 } });
    applyItem(p, { id: 'spoon', effects: { homing: 1 } });
    ok(effectiveWeapon(p).piercing, 'piercing on');
    ok(effectiveWeapon(p).homing, 'homing on');
  });

  test('one-time bomb/key grants add to resource counts', () => {
    const p = makePlayer(); // bombs 1, keys 0
    applyItem(p, { id: 'boom', effects: { bombs: 5 } });
    applyItem(p, { id: 'ring', effects: { keys: 5 } });
    eq(p.bombs, 6, 'bombs granted');
    eq(p.keys, 5, 'keys granted');
  });

  test('luckBonus scales with the luck mod and caps', () => {
    const p = makePlayer();
    eq(luckBonus(p), 0, 'no luck -> no bonus');
    applyItem(p, { id: 'foot', effects: { luck: 2 } });
    approx(luckBonus(p), 0.16, 1e-9, '2 luck -> +0.16');
    applyItem(p, { id: 'foot2', effects: { luck: 100 } });
    ok(luckBonus(p) <= 0.45, 'capped');
  });
}
