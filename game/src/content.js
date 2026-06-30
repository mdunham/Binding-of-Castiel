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
const AIS = ['chase', 'wander', 'shooter', 'spawner'];

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
  const items = Array.isArray(data.items) ? data.items : (data.items == null ? [] : null);
  if (!characters) errors.push('characters must be an array');
  if (!weapons) errors.push('weapons must be an array');
  if (items === null) errors.push('items must be an array (or omitted)');
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
    errors.push(...spriteErrors(`weapon "${w.id}"`, w.sprite));
  });

  const itemIds = new Set();
  items.forEach((it, i) => {
    if (!it || typeof it.id !== 'string' || !it.id) {
      errors.push(`items[${i}] missing string id`);
      return;
    }
    if (itemIds.has(it.id)) errors.push(`duplicate item id "${it.id}"`);
    itemIds.add(it.id);
    if (typeof it.name !== 'string') errors.push(`item "${it.id}" needs a name`);
    if (it.effects != null && typeof it.effects !== 'object') {
      errors.push(`item "${it.id}" effects must be an object`);
    } else if (it.effects) {
      for (const [k, v] of Object.entries(it.effects)) {
        if (typeof v !== 'number') errors.push(`item "${it.id}" effect ${k} must be a number`);
      }
    }
    errors.push(...spriteErrors(`item "${it.id}"`, it.sprite));
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
    errors.push(...spriteErrors(`character "${c.id}"`, c.sprite));
  });

  // spawnId refs validated after the full id set is known (may point forward).
  for (const c of characters) {
    if (c && c.spawnId != null && !charIds.has(c.spawnId)) {
      errors.push(`character "${c.id}" spawnId "${c.spawnId}" not found`);
    }
  }

  if (!hasPlayer) errors.push('content needs at least one role:"player" character');

  return errors.length ? { ok: false, errors } : { ok: true, errors: [], data };
}

/** Validate an optional sprite object. Lenient: only structural checks. */
function spriteErrors(label, sprite) {
  if (sprite == null) return [];
  const errs = [];
  if (typeof sprite !== 'object') { errs.push(`${label} sprite must be an object`); return errs; }
  if (!Array.isArray(sprite.palette)) errs.push(`${label} sprite needs a palette array`);
  if (!Array.isArray(sprite.rows)) errs.push(`${label} sprite needs a rows array`);
  return errs;
}

/** Build quick lookup maps from validated content. */
export function indexContent(data) {
  const weapons = new Map(data.weapons.map((w) => [w.id, w]));
  const characters = new Map(data.characters.map((c) => [c.id, c]));
  const items = data.items || [];
  return {
    weapons,
    characters,
    items,
    itemsById: new Map(items.map((it) => [it.id, it])),
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
