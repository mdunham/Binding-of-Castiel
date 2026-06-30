// input.js — keyboard, gamepad (Xbox / standard mapping), and shared vectors.

const DEADZONE = 0.18;
const GP_STORAGE_KEY = 'isaaclike-gamepad';

// Standard Gamepad button indices (Xbox layout in most browsers).
export const GP = {
  BACK: 8, START: 9, DPAD_UP: 12, DPAD_DOWN: 13, DPAD_LEFT: 14, DPAD_RIGHT: 15,
};

function applyDeadzone(v) {
  const a = Math.abs(v);
  if (a < DEADZONE) return 0;
  return Math.sign(v) * ((a - DEADZONE) / (1 - DEADZONE));
}

function stickFromAxes(x, y) {
  x = applyDeadzone(x);
  y = applyDeadzone(y);
  const len = Math.hypot(x, y);
  if (len < 0.05) return { x: 0, y: 0 };
  if (len > 1) return { x: x / len, y: y / len };
  return { x, y };
}

function activeGamepad() {
  const pads = navigator.getGamepads?.() || [];
  for (const gp of pads) {
    if (gp?.connected) return gp;
  }
  return null;
}

export function createInput(target = window) {
  const keys = new Set();
  let gamepadEnabled = localStorage.getItem(GP_STORAGE_KEY) === '1';
  let pad = null;
  let prevButtons = [];

  const onDown = (e) => {
    keys.add(e.key.toLowerCase());
    if (MOVEMENT_KEYS.has(e.key)) e.preventDefault();
  };
  const onUp = (e) => keys.delete(e.key.toLowerCase());
  target.addEventListener('keydown', onDown);
  target.addEventListener('keyup', onUp);

  const onPadConnected = () => { pad = activeGamepad(); };
  const onPadDisconnected = () => { pad = activeGamepad(); prevButtons = []; };
  window.addEventListener('gamepadconnected', onPadConnected);
  window.addEventListener('gamepaddisconnected', onPadDisconnected);

  function keyboardMove() {
    let x = 0, y = 0;
    if (keys.has('a')) x -= 1;
    if (keys.has('d')) x += 1;
    if (keys.has('w')) y -= 1;
    if (keys.has('s')) y += 1;
    return { x, y };
  }

  function keyboardAim() {
    let x = 0, y = 0;
    if (keys.has('arrowleft')) x -= 1;
    if (keys.has('arrowright')) x += 1;
    if (keys.has('arrowup')) y -= 1;
    if (keys.has('arrowdown')) y += 1;
    return { x, y };
  }

  return {
    keys,

    isGamepadEnabled() { return gamepadEnabled; },
    setGamepadEnabled(on) {
      gamepadEnabled = !!on;
      localStorage.setItem(GP_STORAGE_KEY, gamepadEnabled ? '1' : '0');
      if (!gamepadEnabled) prevButtons = [];
    },

    /** Call once per frame before reading vectors or button edges. */
    poll() {
      pad = gamepadEnabled ? activeGamepad() : null;
    },

    gamepadConnected() { return !!pad; },
    gamepadLabel() { return pad?.id || ''; },

    /** Movement vector from WASD or left stick, components in [-1,1]. */
    moveVector() {
      const kb = keyboardMove();
      if (kb.x || kb.y) return kb;
      if (!pad) return { x: 0, y: 0 };
      return stickFromAxes(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
    },

    /** Aim vector from arrow keys or right stick. */
    aimVector() {
      const kb = keyboardAim();
      if (kb.x || kb.y) return kb;
      if (!pad) return { x: 0, y: 0 };
      return stickFromAxes(pad.axes[2] ?? 0, pad.axes[3] ?? 0);
    },

    /** True only on the frame a gamepad button was first pressed. */
    buttonJustPressed(index) {
      if (!pad) return false;
      const pressed = !!pad.buttons[index]?.pressed;
      const was = !!prevButtons[index];
      return pressed && !was;
    },

    /** Advance button edge tracking — call once per frame after reading justPressed. */
    endPoll() {
      if (!pad) { prevButtons = []; return; }
      prevButtons = pad.buttons.map((b) => b.pressed);
    },

    pressed(k) { return keys.has(k.toLowerCase()); },

    destroy() {
      target.removeEventListener('keydown', onDown);
      target.removeEventListener('keyup', onUp);
      window.removeEventListener('gamepadconnected', onPadConnected);
      window.removeEventListener('gamepaddisconnected', onPadDisconnected);
    },
  };
}

const MOVEMENT_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ',
]);
