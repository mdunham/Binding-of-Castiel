// content.js — load and validate the shared content.json.
// validateContent() is pure (no DOM/fetch) so it can be unit-tested in Node.

const WEAPON_FIELDS = {
  damage: 'number', fireRate: 'number', projectileSpeed: 'number',
  range: 'number', projectileSize: 'number', shotCount: 'number',
  spread: 'number', color: 'string',
};

const CHAR_FIELDS = {
  name: 'string', role: 'string', maxHealth: 'number',
  moveSpeed: 'number', size: 'number', color: 'string',
};

const ROLES = ['player', 'enemy', 'boss'];
const AIS = ['chase', 'wander', 'shooter'];

/**
 * Validate a parsed content object.
 * @returns {{ ok: boolean, errors: string[], data?: object }}
 */
export function validateContent(data) {
  const errors = [];
  if (!data || typeof data !== 'object') {
    return { ok: false, errors: ['content is not an object'] };
  }
  const characters = Array.isArray(data.characters) ? data.characters : null;
  const weapons = Array.isArray(data.weapons) ? data.weapons : null;
  if (!characters) errors.push('characters must be an array');
  if (!weapons) errors.push('weapons must be an array');
  if (errors.length) return { ok: false, errors };

  const weaponIds = new Set();
  weapons.forEach((w, i) => {
    if (!w || typeof w.id !== 'string' || !w.id) {
      errors.push(`weapons[${i}] missing string id`);
      return;
    }
    if (weaponIds.has(w.id)) errors.push(`duplicate weapon id "${w.id}"`);
    weaponIds.add(w.id);
    for (const [field, type] of Object.entries(WEAPON_FIELDS)) {
      if (typeof w[field] !== type) {
        errors.push(`weapon "${w.id}" field ${field} must be ${type}`);
      }
    }
    if (w.shotCount < 1) errors.push(`weapon "${w.id}" shotCount must be >= 1`);
  });

  const charIds = new Set();
  let hasPlayer = false;
  characters.forEach((c, i) => {
    if (!c || typeof c.id !== 'string' || !c.id) {
      errors.push(`characters[${i}] missing string id`);
      return;
    }
    if (charIds.has(c.id)) errors.push(`duplicate character id "${c.id}"`);
    charIds.add(c.id);
    for (const [field, type] of Object.entries(CHAR_FIELDS)) {
      if (typeof c[field] !== type) {
        errors.push(`character "${c.id}" field ${field} must be ${type}`);
      }
    }
    if (!ROLES.includes(c.role)) {
      errors.push(`character "${c.id}" role must be one of ${ROLES.join('/')}`);
    }
    if (c.role === 'player') hasPlayer = true;
    if (c.role === 'enemy' || c.role === 'boss') {
      if (!AIS.includes(c.ai)) {
        errors.push(`character "${c.id}" ai must be one of ${AIS.join('/')}`);
      }
      if (typeof c.contactDamage !== 'number') {
        errors.push(`character "${c.id}" needs numeric contactDamage`);
      }
    }
    // weaponId is required for players and shooter enemies.
    const needsWeapon = c.role === 'player' || c.ai === 'shooter';
    if (needsWeapon) {
      if (typeof c.weaponId !== 'string' || !weaponIds.has(c.weaponId)) {
        errors.push(`character "${c.id}" weaponId "${c.weaponId}" not found`);
      }
    }
  });

  if (!hasPlayer) errors.push('content needs at least one role:"player" character');

  return errors.length ? { ok: false, errors } : { ok: true, errors: [], data };
}

/** Build quick lookup maps from validated content. */
export function indexContent(data) {
  const weapons = new Map(data.weapons.map((w) => [w.id, w]));
  const characters = new Map(data.characters.map((c) => [c.id, c]));
  return {
    weapons,
    characters,
    players: data.characters.filter((c) => c.role === 'player'),
    enemies: data.characters.filter((c) => c.role === 'enemy'),
    bosses: data.characters.filter((c) => c.role === 'boss'),
  };
}

/** Browser-only: fetch + validate. Throws on failure. */
export async function loadContent(url = '../content.json') {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`failed to load ${url}: HTTP ${res.status}`);
  const json = await res.json();
  const result = validateContent(json);
  if (!result.ok) {
    throw new Error('content.json is invalid:\n- ' + result.errors.join('\n- '));
  }
  return indexContent(json);
}
