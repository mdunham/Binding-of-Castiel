// input.js — keyboard state for movement (WASD) and shooting (arrows).

export function createInput(target = window) {
  const keys = new Set();
  const onDown = (e) => {
    keys.add(e.key.toLowerCase());
    if (MOVEMENT_KEYS.has(e.key)) e.preventDefault();
  };
  const onUp = (e) => keys.delete(e.key.toLowerCase());
  target.addEventListener('keydown', onDown);
  target.addEventListener('keyup', onUp);

  return {
    keys,
    /** Movement vector from WASD, components in [-1,1]. */
    moveVector() {
      let x = 0, y = 0;
      if (keys.has('a')) x -= 1;
      if (keys.has('d')) x += 1;
      if (keys.has('w')) y -= 1;
      if (keys.has('s')) y += 1;
      return { x, y };
    },
    /** Aim vector from arrow keys (twin-stick). {x:0,y:0} when not shooting. */
    aimVector() {
      let x = 0, y = 0;
      if (keys.has('arrowleft')) x -= 1;
      if (keys.has('arrowright')) x += 1;
      if (keys.has('arrowup')) y -= 1;
      if (keys.has('arrowdown')) y += 1;
      return { x, y };
    },
    pressed(k) { return keys.has(k.toLowerCase()); },
    destroy() {
      target.removeEventListener('keydown', onDown);
      target.removeEventListener('keyup', onUp);
    },
  };
}

const MOVEMENT_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ',
]);
