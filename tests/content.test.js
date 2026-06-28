import { test, eq, ok } from './run.js';
import { validateContent, indexContent } from '../game/src/content.js';

export const NAME = 'content validation';

const goodWeapon = {
  id: 'tears', name: 'Tears', damage: 3, fireRate: 2, projectileSpeed: 5,
  range: 55, projectileSize: 6, color: '#fff', shotCount: 1, spread: 0, piercing: false,
};
const goodPlayer = {
  id: 'isaac', name: 'Isaac', role: 'player', maxHealth: 6,
  moveSpeed: 2.6, size: 13, color: '#eee', weaponId: 'tears',
};

export function run() {
  test('valid minimal content passes', () => {
    const r = validateContent({ characters: [goodPlayer], weapons: [goodWeapon] });
    ok(r.ok, r.errors.join('; '));
  });

  test('rejects missing player', () => {
    const enemy = { ...goodPlayer, id: 'e', role: 'enemy', ai: 'chase', contactDamage: 1, weaponId: undefined };
    const r = validateContent({ characters: [enemy], weapons: [goodWeapon] });
    ok(!r.ok);
    ok(r.errors.some((e) => e.includes('player')), 'should mention player requirement');
  });

  test('rejects duplicate ids', () => {
    const r = validateContent({ characters: [goodPlayer, goodPlayer], weapons: [goodWeapon] });
    ok(!r.ok);
    ok(r.errors.some((e) => e.includes('duplicate')), 'should flag duplicate');
  });

  test('rejects unresolved weaponId', () => {
    const r = validateContent({ characters: [{ ...goodPlayer, weaponId: 'nope' }], weapons: [goodWeapon] });
    ok(!r.ok);
    ok(r.errors.some((e) => e.includes('weaponId')), 'should flag bad weapon ref');
  });

  test('shooter enemy needs a weapon', () => {
    const shooter = { id: 'p', name: 'P', role: 'enemy', maxHealth: 5, moveSpeed: 1,
      size: 10, color: '#000', ai: 'shooter', contactDamage: 1 };
    const r = validateContent({ characters: [goodPlayer, shooter], weapons: [goodWeapon] });
    ok(!r.ok);
    ok(r.errors.some((e) => e.includes('weaponId')), 'shooter without weapon should fail');
  });

  test('chase enemy does NOT need a weapon', () => {
    const chaser = { id: 'c', name: 'C', role: 'enemy', maxHealth: 5, moveSpeed: 1,
      size: 10, color: '#000', ai: 'chase', contactDamage: 1 };
    const r = validateContent({ characters: [goodPlayer, chaser], weapons: [goodWeapon] });
    ok(r.ok, r.errors.join('; '));
  });

  test('indexContent splits by role', () => {
    const enemy = { id: 'e', name: 'E', role: 'enemy', maxHealth: 5, moveSpeed: 1,
      size: 10, color: '#000', ai: 'chase', contactDamage: 1 };
    const boss = { id: 'b', name: 'B', role: 'boss', maxHealth: 50, moveSpeed: 1,
      size: 30, color: '#f00', ai: 'chase', contactDamage: 2 };
    const idx = indexContent({ characters: [goodPlayer, enemy, boss], weapons: [goodWeapon] });
    eq(idx.players.length, 1, 'players');
    eq(idx.enemies.length, 1, 'enemies');
    eq(idx.bosses.length, 1, 'bosses');
    ok(idx.weapons.get('tears'), 'weapon map');
  });
}
