// designer.js — vanilla editor for content.json (characters/enemies + weapons).
// Reuses the game's validateContent so the editor and game agree on validity.

import { validateContent } from '../game/src/content.js';

const state = {
  tab: 'characters',
  data: { characters: [], weapons: [] },
  selectedId: null,
};

// ---- field schemas -------------------------------------------------------
const NUM = (label, min, max, step = 'any') => ({ type: 'number', label, min, max, step });
const charFields = (role) => ({
  id: { type: 'text', label: 'ID (unique, no spaces)' },
  name: { type: 'text', label: 'Name' },
  role: { type: 'select', label: 'Role', options: ['player', 'enemy', 'boss'] },
  maxHealth: NUM('Max Health (half-hearts)', 1, 999),
  moveSpeed: NUM('Move Speed', 0, 12),
  size: NUM('Size (radius px)', 4, 60),
  color: { type: 'color', label: 'Color' },
  weaponId: { type: 'weaponRef', label: 'Weapon' },
  ...(role === 'enemy' || role === 'boss'
    ? { ai: { type: 'select', label: 'AI', options: ['chase', 'wander', 'shooter'] },
        contactDamage: NUM('Contact Damage (half-hearts)', 0, 20) }
    : {}),
});
const weaponFields = {
  id: { type: 'text', label: 'ID (unique, no spaces)' },
  name: { type: 'text', label: 'Name' },
  damage: NUM('Damage', 0, 999),
  fireRate: NUM('Fire Rate (shots/sec)', 0.1, 20),
  projectileSpeed: NUM('Projectile Speed', 0.5, 20),
  range: NUM('Range (frames)', 5, 300),
  projectileSize: NUM('Projectile Size', 1, 30),
  color: { type: 'color', label: 'Color' },
  shotCount: NUM('Shot Count', 1, 12, 1),
  spread: NUM('Spread (deg between shots)', 0, 90),
  piercing: { type: 'bool', label: 'Piercing' },
};

const DEFAULT_CHAR = () => ({
  id: uniqueId('char'), name: 'New Character', role: 'player',
  maxHealth: 6, moveSpeed: 2.6, size: 13, color: '#e8d8b0', weaponId: firstWeaponId(),
});
const DEFAULT_ENEMY_EXTRA = { ai: 'chase', contactDamage: 1 };
const DEFAULT_WEAPON = () => ({
  id: uniqueId('weapon'), name: 'New Weapon', damage: 3, fireRate: 2, projectileSpeed: 5,
  range: 55, projectileSize: 6, color: '#9cd2ff', shotCount: 1, spread: 0, piercing: false,
});

// ---- DOM refs ------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const listItems = $('listItems');
const formWrap = $('formWrap');
const errorsEl = $('errors');

// ---- boot ----------------------------------------------------------------
reloadFromServer();

$('reloadBtn').onclick = reloadFromServer;
$('loadBtn').onclick = () => $('fileInput').click();
$('fileInput').onchange = onFilePicked;
$('saveBtn').onclick = onSave;
$('addBtn').onclick = onAdd;

document.querySelectorAll('.tab').forEach((t) => {
  t.onclick = () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
    t.classList.add('active');
    state.tab = t.dataset.tab;
    state.selectedId = null;
    renderAll();
  };
});

async function reloadFromServer() {
  try {
    const res = await fetch('../content.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.data = await res.json();
    if (!Array.isArray(state.data.characters)) state.data.characters = [];
    if (!Array.isArray(state.data.weapons)) state.data.weapons = [];
    state.selectedId = null;
    renderAll();
  } catch (e) {
    errorsEl.textContent = `Could not load content.json from server (${e.message}). `
      + `Use “Load content.json…” or run via: node serve.js`;
  }
}

function onFilePicked(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      state.data = {
        characters: parsed.characters || [],
        weapons: parsed.weapons || [],
      };
      state.selectedId = null;
      renderAll();
      toast('Loaded');
    } catch (err) { errorsEl.textContent = `Invalid JSON: ${err.message}`; }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// ---- collections ---------------------------------------------------------
const collection = () => (state.tab === 'characters' ? state.data.characters : state.data.weapons);
const selected = () => collection().find((x) => x.id === state.selectedId) || null;

function onAdd() {
  const item = state.tab === 'characters' ? DEFAULT_CHAR() : DEFAULT_WEAPON();
  collection().push(item);
  state.selectedId = item.id;
  renderAll();
}

function onDuplicate() {
  const cur = selected();
  if (!cur) return;
  const copy = JSON.parse(JSON.stringify(cur));
  copy.id = uniqueId(cur.id + '-copy');
  copy.name = cur.name + ' (copy)';
  collection().push(copy);
  state.selectedId = copy.id;
  renderAll();
}

function onDelete() {
  const arr = collection();
  const i = arr.findIndex((x) => x.id === state.selectedId);
  if (i >= 0) arr.splice(i, 1);
  state.selectedId = null;
  renderAll();
}

// ---- save ----------------------------------------------------------------
function onSave() {
  const result = validateContent(state.data);
  if (!result.ok) {
    errorsEl.textContent = 'Cannot save — fix these first:\n• ' + result.errors.join('\n• ');
    return;
  }
  errorsEl.textContent = '';
  const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'content.json';
  a.click();
  URL.revokeObjectURL(url);
  toast('Saved content.json — drop it in the project root');
}

// ---- rendering -----------------------------------------------------------
function renderAll() {
  renderList();
  renderForm();
  liveValidate();
}

function renderList() {
  listItems.innerHTML = '';
  for (const item of collection()) {
    const div = document.createElement('div');
    div.className = 'item' + (item.id === state.selectedId ? ' active' : '');
    const sw = document.createElement('div');
    sw.className = 'swatch';
    sw.style.background = item.color || '#888';
    div.appendChild(sw);
    const label = document.createElement('span');
    label.textContent = item.name || item.id;
    div.appendChild(label);
    if (state.tab === 'characters') {
      const tag = document.createElement('span');
      tag.className = 'role-tag';
      tag.textContent = item.role;
      div.appendChild(tag);
    }
    div.onclick = () => { state.selectedId = item.id; renderAll(); };
    listItems.appendChild(div);
  }
}

function renderForm() {
  const item = selected();
  if (!item) {
    formWrap.innerHTML = '<div class="empty">Select an item, or click “+ New”.</div>';
    return;
  }
  const fields = state.tab === 'characters' ? charFields(item.role) : weaponFields;

  formWrap.innerHTML = '';
  const h2 = document.createElement('h2');
  h2.textContent = state.tab === 'characters' ? 'Edit Character' : 'Edit Weapon';
  formWrap.appendChild(h2);

  const grid = document.createElement('div');
  grid.className = 'grid2';
  formWrap.appendChild(grid);

  for (const [name, spec] of Object.entries(fields)) {
    grid.appendChild(buildField(item, name, spec));
  }

  const actions = document.createElement('div');
  actions.className = 'row-actions';
  actions.innerHTML = '';
  const dup = mkButton('Duplicate', '', onDuplicate);
  const del = mkButton('Delete', 'danger', onDelete);
  actions.appendChild(dup);
  actions.appendChild(del);
  formWrap.appendChild(actions);
}

function buildField(item, name, spec) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  if ((name === 'id' || name === 'name') === false) {
    // keep id/name on their own full-width-ish rows by default grid; fine as is
  }
  const label = document.createElement('label');
  label.textContent = spec.label;
  wrap.appendChild(label);

  let el;
  if (spec.type === 'select') {
    el = document.createElement('select');
    for (const opt of spec.options) {
      const o = document.createElement('option');
      o.value = opt; o.textContent = opt;
      if (item[name] === opt) o.selected = true;
      el.appendChild(o);
    }
    el.onchange = () => {
      item[name] = el.value;
      if (name === 'role') ensureRoleFields(item);
      renderAll();
    };
  } else if (spec.type === 'weaponRef') {
    el = document.createElement('select');
    const none = document.createElement('option');
    none.value = ''; none.textContent = '(none)';
    el.appendChild(none);
    for (const w of state.data.weapons) {
      const o = document.createElement('option');
      o.value = w.id; o.textContent = w.name || w.id;
      if (item[name] === w.id) o.selected = true;
      el.appendChild(o);
    }
    el.onchange = () => { item[name] = el.value || undefined; liveValidate(); };
  } else if (spec.type === 'bool') {
    el = document.createElement('input');
    el.type = 'checkbox';
    el.checked = !!item[name];
    el.onchange = () => { item[name] = el.checked; };
  } else if (spec.type === 'color') {
    el = document.createElement('input');
    el.type = 'color';
    el.value = item[name] || '#888888';
    el.oninput = () => { item[name] = el.value; renderList(); };
  } else {
    el = document.createElement('input');
    el.type = spec.type;
    el.value = item[name] ?? '';
    if (spec.min != null) el.min = spec.min;
    if (spec.max != null) el.max = spec.max;
    if (spec.step != null) el.step = spec.step;
    el.oninput = () => {
      let v = spec.type === 'number' ? parseFloat(el.value) : el.value;
      if (spec.type === 'number' && Number.isNaN(v)) v = 0;
      const prevId = item.id;
      item[name] = v;
      if (name === 'id' && state.selectedId === prevId) state.selectedId = v;
      if (name === 'name' || name === 'id') renderList();
      liveValidate();
    };
  }
  wrap.appendChild(el);
  return wrap;
}

function ensureRoleFields(item) {
  if (item.role === 'enemy' || item.role === 'boss') {
    if (item.ai == null) item.ai = DEFAULT_ENEMY_EXTRA.ai;
    if (item.contactDamage == null) item.contactDamage = DEFAULT_ENEMY_EXTRA.contactDamage;
  }
}

function liveValidate() {
  const result = validateContent(state.data);
  errorsEl.textContent = result.ok ? '' : '⚠ ' + result.errors.join('  •  ');
}

// ---- preview animation ---------------------------------------------------
const pcanvas = $('previewCanvas');
const pctx = pcanvas.getContext('2d');
let shots = [];
let frameCount = 0;

function previewLoop() {
  frameCount++;
  pctx.fillStyle = '#2a2333';
  pctx.fillRect(0, 0, pcanvas.width, pcanvas.height);
  const item = selected();
  const cx = pcanvas.width / 2;
  const cy = pcanvas.height / 2;

  if (item && state.tab === 'characters') {
    drawBlob(item.color, item.size, cx, cy);
    if (item.weaponId) {
      const w = state.data.weapons.find((x) => x.id === item.weaponId);
      if (w) animateWeapon(w, cx, cy);
    }
  } else if (item && state.tab === 'weapons') {
    drawBlob('#e8d8b0', 13, cx, cy);
    animateWeapon(item, cx, cy);
  }
  requestAnimationFrame(previewLoop);
}

function drawBlob(color, size, cx, cy) {
  pctx.beginPath();
  pctx.arc(cx, cy, size, 0, Math.PI * 2);
  pctx.fillStyle = color;
  pctx.fill();
  pctx.fillStyle = 'rgba(0,0,0,0.55)';
  pctx.beginPath(); pctx.arc(cx - size * 0.3, cy - size * 0.15, 2.2, 0, 7); pctx.fill();
  pctx.beginPath(); pctx.arc(cx + size * 0.3, cy - size * 0.15, 2.2, 0, 7); pctx.fill();
}

function animateWeapon(w, cx, cy) {
  const period = Math.max(6, Math.round(60 / Math.max(0.1, w.fireRate || 1)));
  if (frameCount % period === 0) {
    const count = Math.max(1, w.shotCount | 0);
    const spreadRad = (w.spread || 0) * Math.PI / 180;
    const base = -Math.PI / 2; // upward
    const start = base - spreadRad * (count - 1) / 2;
    for (let i = 0; i < count; i++) {
      const a = start + spreadRad * i;
      shots.push({
        x: cx, y: cy,
        vx: Math.cos(a) * (w.projectileSpeed || 5),
        vy: Math.sin(a) * (w.projectileSpeed || 5),
        r: w.projectileSize || 6, color: w.color || '#9cd2ff', life: 50,
      });
    }
  }
  shots = shots.filter((s) => s.life-- > 0 && s.y > -10);
  for (const s of shots) {
    s.x += s.vx; s.y += s.vy;
    pctx.beginPath();
    pctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    pctx.fillStyle = s.color;
    pctx.fill();
  }
}

// ---- helpers -------------------------------------------------------------
function mkButton(text, cls, fn) {
  const b = document.createElement('button');
  b.textContent = text;
  if (cls) b.className = cls;
  b.onclick = fn;
  return b;
}
function uniqueId(base) {
  const ids = new Set([...(state.data.characters || []), ...(state.data.weapons || [])].map((x) => x.id));
  let id = base, n = 1;
  while (ids.has(id)) id = `${base}-${n++}`;
  return id;
}
function firstWeaponId() {
  return state.data.weapons[0] ? state.data.weapons[0].id : undefined;
}
let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

requestAnimationFrame(previewLoop);
