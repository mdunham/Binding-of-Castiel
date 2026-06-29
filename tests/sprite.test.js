import { test, eq, ok } from './run.js';
import { parseSprite } from '../game/src/sprite.js';

export const NAME = 'sprite parsing';

export function run() {
  const sprite = {
    palette: ['#ff0000', '#00ff00'],
    rows: [
      '12.',
      '..1',
    ],
  };

  test('parses non-transparent cells with palette colors', () => {
    const p = parseSprite(sprite);
    eq(p.w, 3, 'width');
    eq(p.h, 2, 'height');
    eq(p.cells.length, 3, 'three painted cells');
  });

  test('maps palette indices correctly (1-based chars)', () => {
    const p = parseSprite(sprite);
    const at = (x, y) => p.cells.find((c) => c.x === x && c.y === y);
    eq(at(0, 0).color, '#ff0000', "char '1' -> palette[0]");
    eq(at(1, 0).color, '#00ff00', "char '2' -> palette[1]");
    eq(at(2, 1).color, '#ff0000', "char '1' on row 2");
  });

  test("'.' and spaces are transparent", () => {
    const p = parseSprite({ palette: ['#fff'], rows: ['. 1'] });
    eq(p.cells.length, 1, 'only the painted cell');
    eq(p.cells[0].x, 2, 'at the right column');
  });

  test('returns null for malformed sprites', () => {
    ok(parseSprite(null) === null, 'null input');
    ok(parseSprite({ palette: ['#fff'] }) === null, 'missing rows');
    ok(parseSprite({ rows: ['1'] }) === null, 'missing palette');
  });

  test('out-of-range palette index produces no cell', () => {
    const p = parseSprite({ palette: ['#fff'], rows: ['19'] }); // '9' -> index 8, absent
    eq(p.cells.length, 1, 'only the valid index renders');
  });
}
