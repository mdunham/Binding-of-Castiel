// designer.js — vanilla editor for content.json (characters/enemies, weapons, items)
// with a built-in 16x16 pixel-art sprite editor. Reuses the game's validateContent
// and parseSprite so the editor and game agree on format + validity.

import { validateContent } from '../game/src/content.js';
import { parseSprite } from '../game/src/sprite.js';

const state = {
  tab: 'characters',
  data: { characters: [], weapons: [], items: [] },
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
  color: { type: 'color', label: 'Color (fallback if no sprite)' },
  weaponId: { type: 'weaponRef', label: 'Weapon' },
  trailId: { type: 'trailRef', label: 'Trail (player leaves it)' },
  ...(role === 'enemy' || role === 'boss'
    ? { ai: { type: 'select', label: 'AI', options: ['chase', 'wander', 'shooter', 'spawner'] },
        contactDamage: NUM('Contact Damage (half-hearts)', 0, 20),
        flying: { type: 'bool', label: 'Flying (ignores rocks)' },
        spawnId: { type: 'charRef', label: 'Spawns (spawner AI)' },
        spawnInterval: NUM('Spawn interval (sec)', 0.3, 20),
        spawnCount: NUM('Spawn count', 1, 8, 1) }
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
  color: { type: 'color', label: 'Color (fallback if no sprite)' },
  shotCount: NUM('Shot Count', 1, 12, 1),
  spread: NUM('Spread (deg between shots)', 0, 90),
  piercing: { type: 'bool', label: 'Piercing' },
};
const EFFECTS = [
  ['damage', '+ Damage'], ['damageMult', '× Damage bonus (0.5 = +50%)'],
  ['fireRate', '+ Fire rate'], ['moveSpeed', '+ Move speed'],
  ['maxHealth', '+ Max HP (half-hearts)'], ['shotCount', '+ Shots'],
  ['projectileSpeed', '+ Shot speed'], ['range', '+ Range'], ['spread', '+ Spread'],
  ['piercing', 'Piercing (1 = on)'], ['homing', 'Homing (1 = on)'], ['luck', '+ Luck (more drops)'],
  ['bombs', '+ Bombs (one-time)'], ['keys', '+ Keys (one-time)'],
];
function itemFields() {
  const f = {
    id: { type: 'text', label: 'ID (unique, no spaces)' },
    name: { type: 'text', label: 'Name' },
    color: { type: 'color', label: 'Color (fallback if no sprite)' },
    description: { type: 'text', label: 'Description' },
    trailId: { type: 'trailRef', label: 'Grants trail (optional)' },
  };
  for (const [key, label] of EFFECTS) {
    f['eff_' + key] = { type: 'number', label, group: 'effects', key, step: 'any' };
  }
  return f;
}
const trailFields = {
  id: { type: 'text', label: 'ID (unique, no spaces)' },
  name: { type: 'text', label: 'Name' },
  style: { type: 'select', label: 'Style', options: ['electric', 'blood', 'poison'] },
  color: { type: 'color', label: 'Color' },
  damage: NUM('Damage per tick', 0, 99),
  tickInterval: NUM('Tick interval (frames between hits)', 1, 120, 1),
  lifetime: NUM('Segment lifetime (frames)', 5, 300, 1),
  width: NUM('Width / radius (px)', 2, 60),
  dropInterval: NUM('Drop spacing (frames)', 1, 30, 1),
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
const DEFAULT_ITEM = () => ({
  id: uniqueId('item'), name: 'New Item', color: '#d8c84a', description: '', effects: {},
});
const DEFAULT_TRAIL = () => ({
  id: uniqueId('trail'), name: 'New Trail', style: 'electric', color: '#8ad8ff',
  damage: 1.5, tickInterval: 14, lifetime: 45, width: 14, dropInterval: 5,
});

// ---- DOM refs ------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const listItems = $('listItems');
const formWrap = $('formWrap');
const errorsEl = $('errors');

// ---- boot ----------------------------------------------------------------
// setupSpriteEditor() is called at the bottom, after the pixel-editor `let`
// bindings are initialized (avoids a temporal-dead-zone on gctx).
reloadFromServer();

$('reloadBtn').onclick = reloadFromServer;
$('loadBtn').onclick = () => $('fileInput').click();
$('fileInput').onchange = onFilePicked;
$('saveBtn').onclick = onSave;
$('downloadBtn').onclick = () => {
  const result = validateContent(state.data);
  if (!result.ok) { errorsEl.textContent = 'Fix before downloading:\n• ' + result.errors.join('\n• '); return; }
  const clean = JSON.parse(JSON.stringify(state.data, (k, v) => (k === '__parsed' ? undefined : v)));
  downloadJson(JSON.stringify(clean, null, 2));
  toast('Downloaded content.json');
};
$('addBtn').onclick = onAdd;

document.querySelectorAll('.tab').forEach((t) => {
  t.onclick = () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
    t.classList.add('active');
    state.tab = t.dataset.tab;
    selectedRef = null; state.selectedId = null;
    renderAll();
  };
});

async function reloadFromServer() {
  try {
    const res = await fetch('../content.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.data = normalize(await res.json());
    selectedRef = null; state.selectedId = null;
    renderAll();
  } catch (e) {
    errorsEl.textContent = `Could not load content.json from server (${e.message}). `
      + `Use “Load content.json…” or run via: node serve.js`;
  }
}

function normalize(d) {
  return {
    characters: Array.isArray(d.characters) ? d.characters : [],
    weapons: Array.isArray(d.weapons) ? d.weapons : [],
    items: Array.isArray(d.items) ? d.items : [],
    trails: Array.isArray(d.trails) ? d.trails : [],
  };
}

function onFilePicked(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      state.data = normalize(JSON.parse(reader.result));
      selectedRef = null; state.selectedId = null;
      renderAll();
      toast('Loaded');
    } catch (err) { errorsEl.textContent = `Invalid JSON: ${err.message}`; }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// ---- collections ---------------------------------------------------------
function collection() {
  if (state.tab === 'weapons') return state.data.weapons;
  if (state.tab === 'items') return state.data.items;
  if (state.tab === 'trails') return state.data.trails;
  return state.data.characters;
}
// Selection tracks the object directly so editing an item's id (or a duplicate
// id existing elsewhere) never breaks the link the sprite editor writes through.
let selectedRef = null;
function selectItem(item) { selectedRef = item; state.selectedId = item ? item.id : null; renderAll(); }
function selected() {
  if (selectedRef && collection().includes(selectedRef)) return selectedRef;
  selectedRef = collection().find((x) => x.id === state.selectedId) || null;
  return selectedRef;
}

function onAdd() {
  const item = state.tab === 'characters' ? DEFAULT_CHAR()
    : state.tab === 'weapons' ? DEFAULT_WEAPON()
      : state.tab === 'trails' ? DEFAULT_TRAIL() : DEFAULT_ITEM();
  collection().push(item);
  selectItem(item);
}

function onDuplicate() {
  const cur = selected();
  if (!cur) return;
  const copy = JSON.parse(JSON.stringify(cur));
  copy.id = uniqueId(cur.id + '-copy');
  copy.name = (cur.name || cur.id) + ' (copy)';
  collection().push(copy);
  selectItem(copy);
}

function onDelete() {
  const arr = collection();
  const i = arr.findIndex((x) => x.id === state.selectedId);
  if (i >= 0) arr.splice(i, 1);
  selectItem(null);
}

// ---- save ----------------------------------------------------------------
async function onSave() {
  const result = validateContent(state.data);
  if (!result.ok) {
    errorsEl.textContent = 'Cannot save — fix these first:\n• ' + result.errors.join('\n• ');
    return;
  }
  errorsEl.textContent = '';
  // strip the parse cache the game adds at runtime
  const clean = JSON.parse(JSON.stringify(state.data, (k, v) => (k === '__parsed' ? undefined : v)));
  const json = JSON.stringify(clean, null, 2);

  // Prefer writing straight to the server's content.json (when run via serve.js).
  try {
    const res = await fetch('/api/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: json,
    });
    if (res.ok) { toast('Saved to server ✓ content.json updated'); return; }
    const info = await res.json().catch(() => ({}));
    throw new Error(info.error || `HTTP ${res.status}`);
  } catch (err) {
    // Fall back to a download (e.g. opened from file:// or a static server).
    downloadJson(json);
    toast(`Server save unavailable (${err.message}) — downloaded instead`);
  }
}

function downloadJson(json) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'content.json'; a.click();
  URL.revokeObjectURL(url);
}

// ---- rendering -----------------------------------------------------------
function renderAll() {
  renderList();
  renderForm();
  loadSpriteToGrid(selected());
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
    div.onclick = () => selectItem(item);
    listItems.appendChild(div);
  }
}

function fieldsFor(item) {
  if (state.tab === 'weapons') return weaponFields;
  if (state.tab === 'items') return itemFields();
  if (state.tab === 'trails') return trailFields;
  return charFields(item.role);
}

function renderForm() {
  const item = selected();
  if (!item) {
    formWrap.innerHTML = '<div class="empty">Select an item, or click “+ New”.</div>';
    return;
  }
  const fields = fieldsFor(item);
  formWrap.innerHTML = '';
  const h2 = document.createElement('h2');
  h2.textContent = state.tab === 'weapons' ? 'Edit Weapon'
    : state.tab === 'items' ? 'Edit Item'
      : state.tab === 'trails' ? 'Edit Trail' : 'Edit Character';
  formWrap.appendChild(h2);

  const grid = document.createElement('div');
  grid.className = 'grid2';
  formWrap.appendChild(grid);
  for (const [name, spec] of Object.entries(fields)) {
    grid.appendChild(buildField(item, name, spec));
  }

  const actions = document.createElement('div');
  actions.className = 'row-actions';
  actions.appendChild(mkButton('Duplicate', '', onDuplicate));
  actions.appendChild(mkButton('Delete', 'danger', onDelete));
  formWrap.appendChild(actions);
}

function buildField(item, name, spec) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const label = document.createElement('label');
  label.textContent = spec.label;
  wrap.appendChild(label);

  const getVal = () => (spec.group ? (item[spec.group] || {})[spec.key] : item[name]);
  const setVal = (v) => {
    if (spec.group) {
      if (!item[spec.group]) item[spec.group] = {};
      if (v === 0 || v === '' || v == null) delete item[spec.group][spec.key];
      else item[spec.group][spec.key] = v;
    } else {
      item[name] = v;
    }
  };

  let el;
  if (spec.type === 'select') {
    el = document.createElement('select');
    for (const opt of spec.options) {
      const o = document.createElement('option');
      o.value = opt; o.textContent = opt;
      if (item[name] === opt) o.selected = true;
      el.appendChild(o);
    }
    el.onchange = () => { item[name] = el.value; if (name === 'role') ensureRoleFields(item); renderAll(); };
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
  } else if (spec.type === 'charRef') {
    el = document.createElement('select');
    const none = document.createElement('option');
    none.value = ''; none.textContent = '(none)';
    el.appendChild(none);
    for (const ch of state.data.characters.filter((c) => c.role === 'enemy' || c.role === 'boss')) {
      if (ch.id === item.id) continue; // don't spawn yourself
      const o = document.createElement('option');
      o.value = ch.id; o.textContent = ch.name || ch.id;
      if (item[name] === ch.id) o.selected = true;
      el.appendChild(o);
    }
    el.onchange = () => { item[name] = el.value || undefined; liveValidate(); };
  } else if (spec.type === 'trailRef') {
    el = document.createElement('select');
    const none = document.createElement('option');
    none.value = ''; none.textContent = '(none)';
    el.appendChild(none);
    for (const tr of state.data.trails) {
      const o = document.createElement('option');
      o.value = tr.id; o.textContent = tr.name || tr.id;
      if (item[name] === tr.id) o.selected = true;
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
    const v0 = getVal();
    el.value = v0 ?? '';
    if (spec.min != null) el.min = spec.min;
    if (spec.max != null) el.max = spec.max;
    if (spec.step != null) el.step = spec.step;
    el.oninput = () => {
      let v = spec.type === 'number' ? parseFloat(el.value) : el.value;
      if (spec.type === 'number' && Number.isNaN(v)) v = 0;
      const prevId = item.id;
      setVal(v);
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

// ---- pixel-art sprite editor ---------------------------------------------
const GRID = 16;
const PRESET = ['#000000', '#ffffff', '#e8d8b0', '#f2a6c2', '#b8a06a', '#6b6b6b', '#3a3a3a',
  '#c98b8b', '#d98fa0', '#9cd2ff', '#9cffd2', '#c0392b', '#e0494b', '#3a9bdc', '#d8c84a', '#8cc88c'];
let gridColors = makeEmptyGrid();
let currentColor = '#e8d8b0';
let eraser = false;
let painting = false;
let gctx = null;

function makeEmptyGrid() {
  return Array.from({ length: GRID }, () => Array(GRID).fill(null));
}

function setupSpriteEditor() {
  const c = $('spriteGrid');
  gctx = c.getContext('2d');

  // palette
  const pal = $('palette');
  const trans = document.createElement('div');
  trans.className = 'sw transparent';
  trans.title = 'Transparent (eraser)';
  trans.onclick = () => { eraser = true; refreshPaletteActive(); $('eraserBtn').classList.add('eraser-on'); };
  pal.appendChild(trans);
  for (const col of PRESET) {
    const sw = document.createElement('div');
    sw.className = 'sw';
    sw.style.background = col;
    sw.dataset.color = col;
    sw.onclick = () => selectColor(col);
    pal.appendChild(sw);
  }

  $('paintColor').oninput = (e) => selectColor(e.target.value);
  $('eraserBtn').onclick = () => { eraser = !eraser; $('eraserBtn').classList.toggle('eraser-on', eraser); refreshPaletteActive(); };
  $('clearSprite').onclick = () => {
    gridColors = makeEmptyGrid();
    const it = selected();
    if (it) { delete it.sprite; renderList(); liveValidate(); }
    drawGrid();
  };

  const paintFromEvent = (ev) => {
    const item = selected();
    if (!item) return;
    const rect = c.getBoundingClientRect();
    if (!rect.width || !rect.height) return; // canvas not laid out yet
    const x = Math.floor(((ev.clientX - rect.left) / rect.width) * GRID);
    const y = Math.floor(((ev.clientY - rect.top) / rect.height) * GRID);
    if (x < 0 || y < 0 || x >= GRID || y >= GRID) return;
    gridColors[y][x] = eraser ? null : currentColor;
    drawGrid();
    serializeGrid();
  };
  c.addEventListener('pointerdown', (e) => { painting = true; c.setPointerCapture(e.pointerId); paintFromEvent(e); });
  c.addEventListener('pointermove', (e) => { if (painting) paintFromEvent(e); });
  c.addEventListener('pointerup', () => { painting = false; });
  c.addEventListener('pointerleave', () => { painting = false; });

  selectColor(currentColor);
  drawGrid();
}

function selectColor(col) {
  currentColor = col;
  eraser = false;
  $('paintColor').value = col;
  $('eraserBtn').classList.remove('eraser-on');
  refreshPaletteActive();
}

function refreshPaletteActive() {
  document.querySelectorAll('#palette .sw').forEach((sw) => {
    sw.classList.toggle('active', !eraser && sw.dataset.color === currentColor);
  });
}

function drawGrid() {
  const size = gctx.canvas.width;
  const cell = size / GRID;
  // checker background for transparency
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const c = gridColors[y][x];
      if (c) { gctx.fillStyle = c; }
      else { gctx.fillStyle = (x + y) % 2 ? '#2a2333' : '#322a3d'; }
      gctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  // grid lines
  gctx.strokeStyle = 'rgba(0,0,0,0.25)';
  gctx.lineWidth = 1;
  for (let i = 0; i <= GRID; i++) {
    gctx.beginPath(); gctx.moveTo(i * cell, 0); gctx.lineTo(i * cell, size); gctx.stroke();
    gctx.beginPath(); gctx.moveTo(0, i * cell); gctx.lineTo(size, i * cell); gctx.stroke();
  }
}

function loadSpriteToGrid(item) {
  gridColors = makeEmptyGrid();
  if (item && item.sprite) {
    const parsed = parseSprite(item.sprite);
    if (parsed) for (const cell of parsed.cells) {
      if (cell.y < GRID && cell.x < GRID) gridColors[cell.y][cell.x] = cell.color;
    }
  }
  drawGrid();
}

const PALCHARS = '123456789abcdefghijklmnopqrstuvwxyz';
function serializeGrid() {
  const item = selected();
  if (!item) return;
  const palette = [];
  const indexOf = new Map();
  const rows = [];
  let any = false;
  for (let y = 0; y < GRID; y++) {
    let row = '';
    for (let x = 0; x < GRID; x++) {
      const col = gridColors[y][x];
      if (!col) { row += '.'; continue; }
      any = true;
      if (!indexOf.has(col)) { indexOf.set(col, palette.length); palette.push(col); }
      const idx = indexOf.get(col);
      row += idx < PALCHARS.length ? PALCHARS[idx] : '.';
    }
    rows.push(row);
  }
  if (any) item.sprite = { palette, rows };
  else delete item.sprite;
  renderList();
  liveValidate();
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

  if (!item) { requestAnimationFrame(previewLoop); return; }

  if (state.tab === 'characters') {
    drawPreviewActor(item, cx, cy, 40);
    if (item.weaponId) {
      const w = state.data.weapons.find((x) => x.id === item.weaponId);
      if (w) animateWeapon(w, cx, cy);
    }
  } else if (state.tab === 'weapons') {
    drawPreviewActor({ color: '#e8d8b0' }, cx, cy, 34);
    animateWeapon(item, cx, cy);
  } else {
    drawPreviewActor(item, cx, cy, 56);
  }
  requestAnimationFrame(previewLoop);
}

function drawPreviewActor(item, cx, cy, diameter) {
  if (item.sprite) {
    const parsed = parseSprite(item.sprite);
    if (parsed && parsed.cells.length) {
      const px = diameter / parsed.w;
      const ox = cx - (parsed.w * px) / 2;
      const oy = cy - (parsed.h * px) / 2;
      for (const c of parsed.cells) {
        pctx.fillStyle = c.color;
        pctx.fillRect(ox + c.x * px, oy + c.y * px, Math.ceil(px) + 0.5, Math.ceil(px) + 0.5);
      }
      return;
    }
  }
  pctx.beginPath();
  pctx.arc(cx, cy, diameter / 3, 0, Math.PI * 2);
  pctx.fillStyle = item.color || '#888';
  pctx.fill();
}

function animateWeapon(w, cx, cy) {
  const period = Math.max(6, Math.round(60 / Math.max(0.1, w.fireRate || 1)));
  if (frameCount % period === 0) {
    const count = Math.max(1, w.shotCount | 0);
    const spreadRad = (w.spread || 0) * Math.PI / 180;
    const base = -Math.PI / 2;
    const start = base - spreadRad * (count - 1) / 2;
    for (let i = 0; i < count; i++) {
      const a = start + spreadRad * i;
      shots.push({
        x: cx, y: cy,
        vx: Math.cos(a) * (w.projectileSpeed || 5),
        vy: Math.sin(a) * (w.projectileSpeed || 5),
        r: w.projectileSize || 6, color: w.color || '#9cd2ff', life: 40,
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
  const all = [...state.data.characters, ...state.data.weapons, ...state.data.items];
  const ids = new Set(all.map((x) => x.id));
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

// Initialize the pixel editor now that its `let` bindings above are in scope,
// then kick off the live preview loop.
setupSpriteEditor();
requestAnimationFrame(previewLoop);
