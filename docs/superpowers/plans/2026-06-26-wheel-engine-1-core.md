# Wheel Engine — Sub-project 1 (Core + Registry + `simple` Type) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared `wheel-types.js` engine module (helpers + a frozen `WHEEL_TYPES` registry) with the `simple` ("Quay ngẫu nhiên") type fully implemented, plus a generic `wheel.html` participant page that loads a wheel config from Firebase and runs it end-to-end (render → spin → land → celebrate → live panel, hard-locked via `removeAfterPick`).

**Architecture:** A pure ESM module (`wheel-types.js`) holds string/geometry/registry logic with no top-level browser dependency, so it is unit-testable under Node. `wheel.html` imports it, wires Firebase Realtime Database (`wheels/<id>/config` + `/state`), and dispatches all type-specific behavior through the registry. Sub-projects 2 (more types) and 3 (admin page) extend this without changing its contracts.

**Tech Stack:** Vanilla ES modules, Firebase Realtime Database (v10.12.2 CDN, reused from `group-wheel.html`), Node built-in `node:test` for unit tests, Python `http.server` + Playwright MCP for browser verification.

## Global Constraints

- **UI language: Vietnamese**, matching `group-wheel.html`.
- **Frozen interface:** every `WHEEL_TYPES` entry conforms to the contract in `docs/superpowers/specs/2026-06-26-wheel-engine-design.md` (read it). Do not change method names/signatures — sub-projects 2 & 3 depend on them.
- **Reuse, don't reinvent:** `esc`, `deviceId`, the confetti `burst`, the `chime`, and the conic-gradient + `transition: transform 4.6s cubic-bezier(.16,.84,.27,1)` spin are ported behavior-preserving from `group-wheel.html`.
- **`wheel-types.js` must import in Node** without a browser: no top-level access to `window`/`document`/`localStorage`; such access only inside function bodies, guarded.
- **Do not modify** `group-wheel.html`, `public/index.html`, `firebase.json`, `.firebaserc`.
- **Firebase config** is the exact object from `group-wheel.html:86-92`.
- **Deploy copies:** every change to `wheel-types.js` / `wheel.html` is mirrored into `public/` (the directory Firebase Hosting serves). Keep root and `public/` copies byte-identical.

---

### Task 1: Test harness + module skeleton (`esc`, `deviceId`, `makeWheelId`)

**Files:**
- Create: `package.json`
- Create: `wheel-types.js`
- Test: `tests/helpers.test.js`

**Interfaces:**
- Produces: `esc(s) -> string`, `deviceId() -> string`, `makeWheelId() -> string` (8-char URL-safe id), all exported from `wheel-types.js`.

- [ ] **Step 1: Add `package.json` so Node treats `.js` as ESM**

```json
{
  "name": "wheel-engine",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/helpers.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, deviceId, makeWheelId } from '../wheel-types.js';

test('esc escapes HTML-significant characters', () => {
  assert.equal(esc('<b>&"x"'), '&lt;b&gt;&amp;&quot;x&quot;');
  assert.equal(esc('plain'), 'plain');
});

test('deviceId returns a non-empty string and does not throw without localStorage', () => {
  const id = deviceId();
  assert.equal(typeof id, 'string');
  assert.ok(id.length > 0);
});

test('makeWheelId returns an 8-char url-safe id', () => {
  const id = makeWheelId();
  assert.match(id, /^[0-9a-zA-Z_-]{8}$/);
  assert.notEqual(makeWheelId(), ''); // generates something each call
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd /Users/bason/Documents/bason-labs/wheel-spin && npm test`
Expected: FAIL — `Cannot find module '../wheel-types.js'`.

- [ ] **Step 4: Create `wheel-types.js` with the three helpers**

```js
/* Shared engine module — imported by wheel.html and (later) admin.html.
   Keep top-level code browser-free so Node can import it for unit tests. */

export const esc = s => String(s).replace(/[&<>"]/g,
  c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));

export function deviceId() {
  try {
    let id = localStorage.getItem('wheelDeviceId');
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID()
            : 'd-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10));
      localStorage.setItem('wheelDeviceId', id);
    }
    return id;
  } catch (e) {
    return 'd-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }
}

export function makeWheelId() {
  try {
    if (crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  } catch (e) {}
  return (Date.now().toString(36) + Math.random().toString(36).slice(2)).slice(0, 8);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd /Users/bason/Documents/bason-labs/wheel-spin && npm test`
Expected: PASS — 3 tests.

- [ ] **Step 6: Commit**

```bash
git add package.json wheel-types.js tests/helpers.test.js
git commit -m "feat(engine): module skeleton with esc/deviceId/makeWheelId + node test harness"
```
(If `git` is not initialized, skip the commit step in every task — the directory is currently not a git repo.)

---

### Task 2: Wheel geometry — `landingRotation` + `discHtml`

**Files:**
- Modify: `wheel-types.js`
- Test: `tests/geometry.test.js`

**Interfaces:**
- Consumes: `esc` (Task 1).
- Produces:
  - `landingRotation(curRotation, idx, segCount, rng = Math.random) -> number` — absolute rotation (deg) that lands segment `idx` under the top pointer, ≥6 full turns from `curRotation`, with bounded in-segment jitter. `rng` injectable for deterministic tests.
  - `discHtml(segs, rotation) -> string` where `segs = [{label,color,dark,dim}]` — the `<div class="disc">` markup with a conic-gradient background, positioned `.label` spans, and the rotation inlined.

- [ ] **Step 1: Write the failing test**

Create `tests/geometry.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { landingRotation, discHtml } from '../wheel-types.js';

// With zero jitter, the pointer (top = 0deg) must sit at segment idx's center.
test('landingRotation centers the target segment under the top pointer', () => {
  const segCount = 13, idx = 5, SEG = 360 / segCount;
  const r = landingRotation(0, idx, segCount, () => 0.5); // 0.5 -> zero jitter
  // The wheel rotates by r; the segment that ends up at the top is the one whose
  // pre-rotation center angle equals (360 - r) mod 360.
  const atTop = ((360 - (r % 360)) % 360 + 360) % 360;
  const expectedCenter = idx * SEG + SEG / 2;
  assert.ok(Math.abs(atTop - expectedCenter) < 0.001, `atTop=${atTop} expected=${expectedCenter}`);
});

test('landingRotation spins at least 6 full turns forward', () => {
  const r = landingRotation(100, 0, 8, () => 0.5);
  assert.ok(r - 100 >= 6 * 360, `delta=${r - 100}`);
});

test('landingRotation jitter stays inside the segment', () => {
  const segCount = 8, idx = 3, SEG = 360 / segCount;
  for (const v of [0, 1, 0.5, 0.123, 0.987]) {
    const r = landingRotation(0, idx, segCount, () => v);
    const atTop = ((360 - (r % 360)) % 360 + 360) % 360;
    const lo = idx * SEG, hi = (idx + 1) * SEG;
    assert.ok(atTop > lo && atTop < hi, `v=${v} atTop=${atTop} not in (${lo},${hi})`);
  }
});

test('discHtml renders one label per segment and inlines rotation', () => {
  const html = discHtml([
    { label: 'A', color: '#10b981', dark: '#059669', dim: false },
    { label: 'B', color: '#8b5cf6', dark: '#7c3aed', dim: true },
  ], 720);
  assert.match(html, /conic-gradient/);
  assert.match(html, /rotate\(720deg\)/);
  assert.ok((html.match(/class="label/g) || []).length === 2);
  assert.match(html, />A</);
  assert.match(html, />B</);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/bason/Documents/bason-labs/wheel-spin && node --test tests/geometry.test.js`
Expected: FAIL — `landingRotation`/`discHtml` are not exported.

- [ ] **Step 3: Add the geometry functions to `wheel-types.js`**

Append:

```js
export function landingRotation(curRotation, idx, segCount, rng = Math.random) {
  const SEG = 360 / segCount;
  const base = (360 - (idx * SEG + SEG / 2)) % 360;        // brings segment center to top
  const jitter = (rng() * 2 - 1) * (SEG / 2 - Math.min(8, SEG / 4)); // stay inside the wedge
  return curRotation + (6 * 360 + base + jitter) - (curRotation % 360);
}

export function discHtml(segs, rotation) {
  const n = segs.length;
  const SEG = 360 / n;
  const stops = segs
    .map((s, i) => `${s.dim ? s.color + '33' : s.color} ${i * SEG}deg ${(i + 1) * SEG}deg`)
    .join(',');
  const labels = segs.map((s, i) => {
    const a = (i * SEG + SEG / 2) * Math.PI / 180, r = 31;
    return `<span class="label${s.dim ? ' dim' : ''}" style="left:${50 + r * Math.sin(a)}%;top:${50 - r * Math.cos(a)}%">${esc(s.label)}</span>`;
  }).join('');
  return `<div class="disc" id="disc" style="background:conic-gradient(${stops});transform:rotate(${rotation}deg)">${labels}</div>`;
}
```

Note: `SEG/2 - Math.min(8, SEG/4)` keeps the jitter strictly inside the wedge for both wide (n=2) and narrow (n=13) segments — the test's `(lo,hi)` bound enforces this.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /Users/bason/Documents/bason-labs/wheel-spin && node --test tests/geometry.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add wheel-types.js tests/geometry.test.js
git commit -m "feat(engine): landingRotation + discHtml geometry, generalized to N segments"
```

---

### Task 3: `WHEEL_TYPES.simple` registry entry

**Files:**
- Modify: `wheel-types.js`
- Test: `tests/simple-type.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `WHEEL_TYPES` (exported object) with a `simple` entry implementing the frozen contract. Key methods used downstream: `defaultConfig()`, `validate(config)`, `segments(config,state)`, `availableIndices(config,state)`, `participantControls()`, `readSelection()`, `canSpin(config,state,ui,mine)`, `assign(cur,{config})`, `resultView(config,state)`, `panel(config,state)`, `claimKey()`, plus `key`, `name`, `identity`.

- [ ] **Step 1: Write the failing test**

Create `tests/simple-type.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WHEEL_TYPES } from '../wheel-types.js';

const T = () => WHEEL_TYPES.simple;

test('metadata', () => {
  assert.equal(T().key, 'simple');
  assert.equal(T().identity, 'none');
  assert.equal(typeof T().name, 'string');
});

test('defaultConfig has non-empty options and removeAfterPick', () => {
  const c = T().defaultConfig();
  assert.ok(Array.isArray(c.options) && c.options.length > 0);
  assert.equal(typeof c.removeAfterPick, 'boolean');
});

test('validate rejects empty / blank option lists', () => {
  assert.equal(T().validate({ options: ['x'], removeAfterPick: true }), null);
  assert.match(T().validate({ options: [], removeAfterPick: true }), /lựa chọn/i);
  assert.match(T().validate({ options: ['  ', ''], removeAfterPick: true }), /lựa chọn/i);
});

test('availableIndices excludes picked only when removeAfterPick', () => {
  const cfg = { options: ['a', 'b', 'c'], removeAfterPick: true };
  assert.deepEqual(T().availableIndices(cfg, { picked: [1] }), [0, 2]);
  const cfg2 = { ...cfg, removeAfterPick: false };
  assert.deepEqual(T().availableIndices(cfg2, { picked: [1] }), [0, 1, 2]);
});

test('assign appends a pick, never repeats when removeAfterPick, then reports full', () => {
  const cfg = { options: ['a', 'b'], removeAfterPick: true };
  const cur = {};
  const r1 = T().assign(cur, { config: cfg });
  assert.ok(r1.targetIndex === 0 || r1.targetIndex === 1);
  assert.deepEqual(cur.picked, [r1.targetIndex]);
  const r2 = T().assign(cur, { config: cfg });
  assert.notEqual(r2.targetIndex, r1.targetIndex);
  assert.equal(cur.picked.length, 2);
  const r3 = T().assign(cur, { config: cfg });
  assert.deepEqual(r3, { reason: 'full' });
});

test('assign can repeat when removeAfterPick is false', () => {
  const cfg = { options: ['only'], removeAfterPick: false };
  const cur = {};
  assert.equal(T().assign(cur, { config: cfg }).targetIndex, 0);
  assert.equal(T().assign(cur, { config: cfg }).targetIndex, 0);
  assert.equal(cur.picked.length, 2);
});

test('segments dims picked options when removeAfterPick', () => {
  const cfg = { options: ['a', 'b'], removeAfterPick: true };
  const segs = T().segments(cfg, { picked: [0] });
  assert.equal(segs.length, 2);
  assert.equal(segs[0].dim, true);
  assert.equal(segs[1].dim, false);
  assert.equal(segs[0].label, 'a');
});

test('canSpin false when nothing available', () => {
  const cfg = { options: ['a'], removeAfterPick: true };
  assert.equal(T().canSpin(cfg, { picked: [] }, {}, null), true);
  assert.equal(T().canSpin(cfg, { picked: [0] }, {}, null), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/bason/Documents/bason-labs/wheel-spin && node --test tests/simple-type.test.js`
Expected: FAIL — `WHEEL_TYPES` is undefined.

- [ ] **Step 3: Add the palette and `WHEEL_TYPES.simple` to `wheel-types.js`**

Append:

```js
export const PALETTE = [
  { color: '#10b981', dark: '#059669' }, { color: '#8b5cf6', dark: '#7c3aed' },
  { color: '#f59e0b', dark: '#d97706' }, { color: '#ec4899', dark: '#db2777' },
  { color: '#3b82f6', dark: '#2563eb' }, { color: '#ef4444', dark: '#dc2626' },
  { color: '#14b8a6', dark: '#0d9488' }, { color: '#a855f7', dark: '#9333ea' },
];

const pickedArr = state => Array.isArray(state && state.picked) ? state.picked : [];

export const WHEEL_TYPES = {
  simple: {
    key: 'simple',
    name: 'Quay ngẫu nhiên',
    identity: 'none',

    defaultConfig() {
      return { options: ['Lựa chọn 1', 'Lựa chọn 2', 'Lựa chọn 3'], removeAfterPick: true };
    },
    configFields: [
      { kind: 'list', key: 'options', label: 'Các lựa chọn', itemPlaceholder: 'Nhập lựa chọn...' },
      { kind: 'bool', key: 'removeAfterPick', label: 'Không lặp lại kết quả đã quay' },
    ],
    validate(config) {
      const opts = (config && config.options) || [];
      if (!Array.isArray(opts) || !opts.some(o => String(o).trim())) return 'Cần ít nhất 1 lựa chọn.';
      return null;
    },

    segments(config, state) {
      const picked = pickedArr(state);
      return config.options.map((label, i) => ({
        label,
        color: PALETTE[i % PALETTE.length].color,
        dark: PALETTE[i % PALETTE.length].dark,
        dim: !!config.removeAfterPick && picked.includes(i),
      }));
    },
    availableIndices(config, state) {
      const picked = pickedArr(state);
      return config.options
        .map((_, i) => i)
        .filter(i => !config.removeAfterPick || !picked.includes(i));
    },
    participantControls() { return ''; },
    readSelection() { return {}; },
    canSpin(config, state) { return this.availableIndices(config, state).length > 0; },

    assign(cur, { config }) {
      cur.picked = Array.isArray(cur.picked) ? cur.picked : [];
      const avail = config.options
        .map((_, i) => i)
        .filter(i => !config.removeAfterPick || !cur.picked.includes(i));
      if (!avail.length) return { reason: 'full' };
      const pick = avail[Math.floor(Math.random() * avail.length)];
      cur.picked.push(pick);
      return { targetIndex: pick };
    },

    resultView(config, state) {
      const picked = pickedArr(state);
      if (!picked.length) return '';
      const i = picked[picked.length - 1];
      const p = PALETTE[i % PALETTE.length];
      return `<div class="result-card"><div class="crown">🎉</div>
        <div class="who">Kết quả</div>
        <div class="grp" style="background:linear-gradient(135deg,${p.color},${p.dark})">${esc(config.options[i])}</div>
        <div class="note">Nhấn QUAY để quay tiếp</div></div>`;
    },
    panel(config, state) {
      const picked = pickedArr(state);
      const remaining = config.removeAfterPick ? (config.options.length - picked.length) : '∞';
      const items = picked.slice().reverse().map((i, n) => {
        const p = PALETTE[i % PALETTE.length];
        return `<li class="member"><span class="avatar" style="--gc:${p.color};--gcd:${p.dark}">${picked.length - n}</span><span>${esc(config.options[i])}</span></li>`;
      }).join('') || `<li class="empty">Chưa quay lần nào...</li>`;
      return `<div class="groups"><div class="group" style="--gc:#fbbf24;--gcd:#f59e0b;border-color:#fbbf2466">
        <div class="ghead"><span class="gname">Đã quay</span><span class="gcount">Còn lại: ${remaining}</span></div>
        <ul class="members">${items}</ul></div></div>`;
    },
    claimKey() { return null; },
  },
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /Users/bason/Documents/bason-labs/wheel-spin && node --test tests/simple-type.test.js`
Expected: PASS — 8 tests.

- [ ] **Step 5: Run the full suite**

Run: `cd /Users/bason/Documents/bason-labs/wheel-spin && npm test`
Expected: PASS — all tests across the three files.

- [ ] **Step 6: Commit**

```bash
git add wheel-types.js tests/simple-type.test.js
git commit -m "feat(engine): WHEEL_TYPES.simple — options, removeAfterPick, server-side pick"
```

---

### Task 4: Celebration helpers — `burst` + `chime`

**Files:**
- Modify: `wheel-types.js`
- Test: `tests/celebration.test.js`

**Interfaces:**
- Produces:
  - `chime(audioCtx)` — plays a triad; no-op if `audioCtx` falsy or unavailable (never throws).
  - `burst(colorPair, confettiEl)` — appends confetti to `confettiEl`; `colorPair = {color,dark}`. No-op if `confettiEl` falsy (never throws). Guards on `document`/element APIs so a Node import is safe.

These are DOM/audio side-effecting and verified visually in Task 7; the unit test only pins their defensive no-throw contract.

- [ ] **Step 1: Write the failing test**

Create `tests/celebration.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { burst, chime } from '../wheel-types.js';

test('chime is a no-op and does not throw without an audio context', () => {
  assert.doesNotThrow(() => chime(null));
  assert.doesNotThrow(() => chime(undefined));
});

test('burst does not throw when given no confetti element', () => {
  assert.doesNotThrow(() => burst({ color: '#fff', dark: '#000' }, null));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/bason/Documents/bason-labs/wheel-spin && node --test tests/celebration.test.js`
Expected: FAIL — `burst`/`chime` not exported.

- [ ] **Step 3: Port `burst` + `chime` from `group-wheel.html` (lines 294-319) with guards**

Append:

```js
export function chime(audioCtx) {
  if (!audioCtx) return;
  try {
    [660, 880, 1175].forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'triangle'; o.frequency.value = f; o.connect(g); g.connect(audioCtx.destination);
      const t = audioCtx.currentTime + i * 0.09;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(.001, t + 0.35);
      o.start(t); o.stop(t + 0.36);
    });
  } catch (e) {}
}

export function burst(colorPair, confettiEl) {
  if (!confettiEl || typeof document === 'undefined') return;
  const colors = [colorPair.color, colorPair.dark, '#fbbf24', '#ffffff'];
  for (let i = 0; i < 100; i++) {
    const c = document.createElement('div'); c.className = 'conf';
    const size = 6 + Math.random() * 8;
    c.style.left = (Math.random() * 100) + 'vw'; c.style.top = '-20px';
    c.style.width = size + 'px'; c.style.height = (size * 1.4) + 'px';
    c.style.background = colors[i % colors.length];
    c.style.borderRadius = Math.random() < .5 ? '50%' : '2px';
    const dx = (Math.random() * 2 - 1) * 30, dur = 2200 + Math.random() * 1500, rot = Math.random() * 720;
    confettiEl.appendChild(c);
    c.animate(
      [{ transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
       { transform: `translate(${dx}vw,108vh) rotate(${rot}deg)`, opacity: .9 }],
      { duration: dur, easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'forwards' });
    setTimeout(() => c.remove(), dur + 100);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /Users/bason/Documents/bason-labs/wheel-spin && node --test tests/celebration.test.js`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add wheel-types.js tests/celebration.test.js
git commit -m "feat(engine): port burst + chime celebration helpers with Node-safe guards"
```

---

### Task 5: DB rules + `wheel.html` participant page (load, render, seed)

**Files:**
- Modify: `database.rules.json`
- Create: `wheel.html`
- Test: browser verification (Task 7); this task ends at "page renders a seeded wheel".

**Interfaces:**
- Consumes: `WHEEL_TYPES`, `discHtml`, `esc`, `deviceId`, `makeWheelId` from `./wheel-types.js`.
- Produces: a served page at `wheel.html?w=<id>` that subscribes to `wheels/<id>` and renders the `simple` wheel; a dev-only seeding path `wheel.html?w=<id>&seed=simple` that writes a demo `simple` config if none exists.

- [ ] **Step 1: Add the `wheels/$id` rule**

Edit `database.rules.json` to:

```json
{
  "rules": {
    "wheel":  { "$room": { ".read": true, ".write": true } },
    "wheels": { "$id":   { ".read": true, ".write": true } }
  }
}
```

- [ ] **Step 2: Create `wheel.html`**

```html
<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Vòng quay</title>
<style>
/* PORT: copy the entire <style>…</style> body from group-wheel.html (the rules between
   the <style> and </style> tags, lines 8-69) verbatim here, then add the rules below. */

/* --- additions for the generic engine --- */
.label.dim{opacity:.35;}
.selectwrap{position:relative;width:100%;margin-bottom:22px;}
.selectwrap label{position:absolute;top:-9px;left:14px;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--gold);background:#0e1326;padding:1px 8px;border-radius:6px;z-index:1;}
.selectwrap select{width:100%;padding:16px 18px;border-radius:16px;border:1px solid var(--line);font-size:16px;background:rgba(255,255,255,.95);color:var(--ink);font-weight:600;appearance:none;}
.notfound{max-width:480px;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:28px;margin-top:40px;text-align:center;line-height:1.6;}
</style>
</head>
<body>
  <div id="confetti"></div>
  <div class="badge"><span class="dot" id="conn"></span> <span id="connText">Đang kết nối...</span></div>
  <h1 id="title">Vòng Quay</h1>
  <p class="sub" id="sub"></p>
  <div id="app"><div class="loading">⏳ Đang tải...</div></div>

<script type="module">
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, onValue, runTransaction, set, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { WHEEL_TYPES, discHtml, esc, deviceId, burst, chime, landingRotation } from "./wheel-types.js";

const firebaseConfig = {
  apiKey:      "AIzaSyCiRDS3QlL00uAfp45V6ZmA3IcZXK2EjCo",
  authDomain:  "wheel-spin-a6f34.firebaseapp.com",
  databaseURL: "https://wheel-spin-a6f34-default-rtdb.firebaseio.com",
  projectId:   "wheel-spin-a6f34",
  appId:       "1:622383530807:web:c64191d81c6c7cc1a190b2"
};

const app = document.getElementById('app');
const connDot = document.getElementById('conn');
const connText = document.getElementById('connText');
const titleEl = document.getElementById('title');
const subEl = document.getElementById('sub');
const confettiEl = document.getElementById('confetti');

const params = new URLSearchParams(location.search);
const WID = params.get('w');
const SEED = params.get('seed');

let db = null, uid = null, T = null, config = null, state = {},
    rotation = 0, spinning = false, audioCtx = null, lastReason = null;

if (!WID) {
  showMessage('⚠️ Không tìm thấy vòng quay', 'Thiếu mã vòng quay trong đường dẫn (?w=...).');
} else if (firebaseConfig.apiKey === 'PASTE_API_KEY') {
  showMessage('⚙️ Chưa cấu hình Firebase', 'Dán cấu hình Firebase vào file này.');
} else {
  startApp();
}

function showMessage(h, body) {
  app.innerHTML = `<div class="notfound"><h2>${esc(h)}</h2><p>${esc(body)}</p></div>`;
}

async function startApp() {
  const fb = initializeApp(firebaseConfig);
  db = getDatabase(fb);
  uid = deviceId();
  connDot.classList.add('on'); connText.textContent = 'Đã kết nối · trực tiếp';

  if (SEED === 'simple') {
    const cfgRef = ref(db, `wheels/${WID}/config`);
    const snap = await get(cfgRef);
    if (!snap.exists()) {
      const def = WHEEL_TYPES.simple.defaultConfig();
      await set(cfgRef, { type: 'simple', title: 'Vòng quay thử nghiệm', createdTs: Date.now(), ...def });
    }
  }

  onValue(ref(db, `wheels/${WID}`), snap => {
    const v = snap.val() || {};
    config = v.config || null;
    state = v.state || {};
    if (!config) { showMessage('Vòng quay chưa được thiết lập', 'Quản trị viên chưa tạo cấu hình cho vòng quay này.'); return; }
    T = WHEEL_TYPES[config.type];
    if (!T) { showMessage('Loại vòng quay không hỗ trợ', `type = ${config.type}`); return; }
    if (!spinning) buildUI();
  });
}

function myClaim() {
  // identity 'none' -> always null; device/group modes added in sub-project 2.
  return null;
}

function buildUI() {
  titleEl.textContent = config.title || 'Vòng Quay';
  const mine = myClaim();
  const segs = T.segments(config, state);
  const canSpin = T.canSpin(config, state, {}, mine);
  app.innerHTML = `
    <div class="stage">
      ${T.participantControls(config, state, mine)}
      <div class="wheel-wrap"><div class="pointer"></div>
        <div class="ring">${discHtml(segs, rotation)}<div class="gloss"></div></div>
        <div class="hub">🎯</div></div>
      <button class="spin-btn" id="spinBtn" ${canSpin ? '' : 'disabled'}>QUAY 🎲</button>
      <div class="hint" id="hint"></div>
      ${T.resultView(config, state, mine)}
    </div>
    ${T.panel(config, state, mine)}
    <div class="status">🔄 Đồng bộ trực tiếp giữa mọi thiết bị</div>`;
  wire();
}

function wire() {
  const btn = document.getElementById('spinBtn');
  if (!btn) return;
  btn.addEventListener('click', doSpin);
}

async function doSpin() { /* implemented in Task 6 */ }
</script>
</body>
</html>
```

- [ ] **Step 3: Verify the file parses (no syntax errors) by serving and loading it**

Run (background server): `cd /Users/bason/Documents/bason-labs/wheel-spin && python3 -m http.server 8123`
Then load `http://localhost:8123/wheel.html?w=devtest1&seed=simple` in the Playwright MCP browser and take a snapshot.
Expected: the page shows the title "Vòng quay thử nghiệm", a wheel disc with 3 segments ("Lựa chọn 1/2/3"), a QUAY button, and the "Đã quay" panel reading "Còn lại: 3". No console errors.

- [ ] **Step 4: Commit**

```bash
git add database.rules.json wheel.html
git commit -m "feat(engine): wheel.html loads + renders a seeded simple wheel; add wheels DB rule"
```

---

### Task 6: Spin transaction, landing animation, celebration

**Files:**
- Modify: `wheel.html` (replace the `doSpin` stub)

**Interfaces:**
- Consumes: `T.readSelection`, `T.canSpin`, `T.assign`, `T.segments`, `T.claimKey`, `landingRotation`, `burst`, `chime`.

- [ ] **Step 1: Replace the `doSpin` stub in `wheel.html`**

```js
async function doSpin() {
  if (spinning || !T) return;
  const btn = document.getElementById('spinBtn');
  const hint = document.getElementById('hint');
  const disc = document.getElementById('disc');
  const mine = myClaim();
  const ui = T.readSelection(app);
  if (!T.canSpin(config, state, ui, mine)) return;

  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  spinning = true; btn.disabled = true; btn.textContent = 'Đang quay...'; hint.textContent = '';
  lastReason = null;

  let target = null;
  try {
    const res = await runTransaction(ref(db, `wheels/${WID}/state`), cur => {
      cur = cur || {};
      const r = T.assign(cur, { ui, mine, config });
      if (r.reason) { lastReason = r.reason; return; }   // abort
      cur.__lastTarget = r.targetIndex;                   // carry target out of the txn
      return cur;
    });
    if (res.committed) {
      const v = res.snapshot.val();
      target = v.__lastTarget;
      const ck = T.claimKey(config, v, ui);
      if (ck) { try { localStorage.setItem('wheelClaim:' + WID, ck); } catch (e) {} }
    }
  } catch (e) { lastReason = 'error'; console.error(e); }

  if (target == null) {
    spinning = false;
    btn.disabled = false; btn.textContent = 'QUAY 🎲';
    hint.textContent = hintFor(lastReason);
    buildUI();
    return;
  }

  const segCount = T.segments(config, state).length;
  rotation = landingRotation(rotation, target, segCount);
  disc.style.transform = `rotate(${rotation}deg)`;
  const seg = T.segments(config, state)[target];

  setTimeout(() => {
    spinning = false;
    chime(audioCtx);
    burst({ color: seg.color, dark: seg.dark }, confettiEl);
    buildUI();
  }, 4700);
}

function hintFor(reason) {
  if (reason === 'full') return '🎉 Hết lựa chọn!';
  if (reason === 'taken') return '⚠️ Mục này đã được chọn rồi.';
  if (reason === 'dup') return '⚠️ Tên này đã có rồi.';
  if (reason === 'error') return '⚠️ Lỗi mạng, thử lại nhé.';
  return '';
}
```

Note: `__lastTarget` is a transient field written into `state` to ferry the chosen index out of the transaction; it is harmless (ignored by every type's render). `segments` is recomputed from the just-updated `state` after `onValue` fires, so `buildUI` reflects the new pick.

- [ ] **Step 2: Verify a spin end-to-end in the browser**

With the server from Task 5 running, load `http://localhost:8123/wheel.html?w=spintest1&seed=simple` in the Playwright MCP browser. Click the QUAY button; wait ~5s; take a snapshot.
Expected: the disc rotates and lands; a result card shows one of the three options; the "Đã quay" panel lists it and now reads "Còn lại: 2"; that segment renders dimmed on the next render. No console errors.

- [ ] **Step 3: Verify hard-lock (removeAfterPick) exhaustion**

In the same browser, click QUAY two more times (waiting for each to settle).
Expected: after 3 picks the three options are all dimmed, the panel reads "Còn lại: 0", and the QUAY button is disabled. Clicking does nothing / hint would read "Hết lựa chọn!".

- [ ] **Step 4: Commit**

```bash
git add wheel.html
git commit -m "feat(engine): spin transaction + landing animation + celebration in wheel.html"
```

---

### Task 7: Deploy copies + full verification

**Files:**
- Create: `public/wheel-types.js` (copy of root)
- Create: `public/wheel.html` (copy of root)

**Interfaces:** none (packaging task).

- [ ] **Step 1: Copy the engine files into the served directory**

Run:
```bash
cd /Users/bason/Documents/bason-labs/wheel-spin
cp wheel-types.js public/wheel-types.js
cp wheel.html public/wheel.html
```

- [ ] **Step 2: Confirm the copies are byte-identical**

Run:
```bash
cd /Users/bason/Documents/bason-labs/wheel-spin
diff -q wheel-types.js public/wheel-types.js && diff -q wheel.html public/wheel.html && echo OK
```
Expected: `OK`.

- [ ] **Step 3: Run the full unit suite once more**

Run: `cd /Users/bason/Documents/bason-labs/wheel-spin && npm test`
Expected: PASS — all tests (helpers, geometry, simple-type, celebration).

- [ ] **Step 4: Regression-check the existing page**

Serve the repo root (`python3 -m http.server 8123`) and load `http://localhost:8123/group-wheel.html` in the Playwright MCP browser.
Expected: the original group wheel still renders and connects ("Đã kết nối · trực tiếp"), unaffected by the new files.

- [ ] **Step 5: Stop the background server**

Stop the `python3 -m http.server` process started during verification.

- [ ] **Step 6: Commit**

```bash
git add public/wheel-types.js public/wheel.html
git commit -m "chore(engine): deploy copies of wheel-types.js + wheel.html into public/"
```

---

## Notes for Sub-projects 2 & 3

- The `seed=simple` path in `wheel.html` is a temporary dev affordance. Sub-project 3 (admin page) supersedes it; leave it until then (it is inert without the `seed` query param).
- `myClaim()` in `wheel.html` returns `null` today. Sub-project 2 implements `device`/`group` identity by reading `localStorage['wheelClaim:'+WID]` and resolving it against `state`, then passing the result through `buildUI`/`doSpin` (the call sites already exist).
- `groupdiv`/`topicgroup` only add registry entries + the identity resolution; the spin/landing/celebration machinery in `doSpin` is type-agnostic and should not need changes.
```
