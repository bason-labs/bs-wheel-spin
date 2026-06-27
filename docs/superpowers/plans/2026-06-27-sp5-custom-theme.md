# SP5 — Custom Type + Per-Wheel Theming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a `custom` wheel type (hand-defined weighted, coloured segments) and an optional per-wheel theme (accent / background / sound), with admin form controls (`color`, `segments`, theme section) and participant-side theme application — completing the flexible-config arc.

**Architecture:** A new `public/engine/types/custom.js` (host-screen picker with weighted random) joins the registry. `darken` moves to `geometry.js` so types and forms share it. `adminforms.js` gains the `color`/`segments` kinds + an always-present theme section. `wheel.html` applies `config.theme` via CSS variables and gates the chime.

**Tech Stack:** Vanilla ES modules, Node 22 `node:test`, Python `http.server` + Playwright MCP. Zero deps.

## Global Constraints

- **NO Firebase deploys / NO production writes.** Verify offline (`node --test`, local server, injected `window.__WHEEL_STORE__`). The RTDB emulator is unavailable (needs JDK 21; system has Java 17).
- **Frozen contract** (umbrella + identity addendum) unchanged; `custom` is a new registry entry; `theme` is additive/optional — wheels without it are visually identical.
- `public/` single source of truth; Vietnamese UI; commit per task; end each commit message with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Move `darken` to `geometry.js`

**Files:** Modify `public/engine/geometry.js`, `public/engine/adminforms.js`. Test: existing suite.

- [ ] **Step 1:** In `public/engine/geometry.js`, add (after `PALETTE`):
```js
export function darken(hex) {
  const m = /^#([0-9a-fA-F]{6})$/.exec(String(hex));
  if (!m) return '#000000';
  const n = parseInt(m[1], 16);
  const r = Math.max(0, ((n >> 16) & 255) - 40);
  const g = Math.max(0, ((n >> 8) & 255) - 40);
  const b = Math.max(0, (n & 255) - 40);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}
```
- [ ] **Step 2:** In `public/engine/adminforms.js`, DELETE its local `darken` function and instead `import { darken } from './geometry.js';` (add to the existing import line: `import { esc } from './helpers.js';` stays; add `import { darken } from './geometry.js';`). `groupsFromRows` keeps using `darken` (now imported).
- [ ] **Step 3:** Re-export for tests: in `public/engine/index.js` add `darken` to the geometry re-export line → `export { PALETTE, landingRotation, discHtml, darken } from './geometry.js';`. Update `tests/adminforms.test.js` import to pull `darken` from `'../public/engine/adminforms.js'` (still works — adminforms re-exports? No). Simpler: keep `tests/adminforms.test.js` importing `darken` from `'../public/engine/adminforms.js'` by having adminforms `export { darken } from './geometry.js';` (re-export). Add that re-export to adminforms.js so the existing test import is unchanged.
- [ ] **Step 4:** Run `npm test` → 44/44 still green (darken behaviour unchanged, just relocated).
- [ ] **Step 5:** Commit:
```bash
git add public/engine/geometry.js public/engine/adminforms.js public/engine/index.js
git commit -m "refactor(engine): move darken to geometry.js (shared by types + forms)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `custom` wheel type

**Files:** Create `public/engine/types/custom.js`, `tests/custom-type.test.js`; Modify `public/engine/registry.js`.

**Interfaces:** Consumes `darken` from `../geometry.js`, `esc` from `../helpers.js`. Produces `export const custom`.

- [ ] **Step 1: Write failing tests** — `tests/custom-type.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WHEEL_TYPES } from '../public/engine/index.js';
const T = () => WHEEL_TYPES.custom;

test('metadata + defaultConfig', () => {
  assert.equal(T().key, 'custom');
  assert.equal(T().identity, 'none');
  const c = T().defaultConfig();
  assert.ok(c.segments.length >= 1 && c.segments.every(s => s.label && /^#[0-9a-f]{6}$/i.test(s.color)));
  assert.equal(typeof c.removeAfterPick, 'boolean');
});

test('validate: needs a labelled segment, hex colors, integer weight >= 1', () => {
  assert.equal(T().validate({ segments: [{ label: 'A', color: '#10b981' }], removeAfterPick: true }), null);
  assert.match(T().validate({ segments: [], removeAfterPick: true }), /mục/i);
  assert.match(T().validate({ segments: [{ label: 'A', color: 'red' }], removeAfterPick: true }), /màu/i);
  assert.match(T().validate({ segments: [{ label: 'A', color: '#10b981', weight: 0 }], removeAfterPick: true }), /trọng số|weight/i);
});

test('segments derive dark + dim picked when removeAfterPick', () => {
  const cfg = { segments: [{ label: 'A', color: '#10b981' }, { label: 'B', color: '#8b5cf6' }], removeAfterPick: true };
  const segs = T().segments(cfg, { picked: [0] });
  assert.equal(segs.length, 2);
  assert.match(segs[0].dark, /^#[0-9a-f]{6}$/);
  assert.equal(segs[0].dim, true); assert.equal(segs[1].dim, false);
});

test('assign respects removeAfterPick and reports full', () => {
  const cfg = { segments: [{ label: 'A', color: '#10b981' }, { label: 'B', color: '#8b5cf6' }], removeAfterPick: true };
  const cur = {};
  const r1 = T().assign(cur, { config: cfg }); assert.ok([0, 1].includes(r1.targetIndex));
  const r2 = T().assign(cur, { config: cfg }); assert.notEqual(r2.targetIndex, r1.targetIndex);
  assert.deepEqual(T().assign(cur, { config: cfg }), { reason: 'full' });
});

test('assign is weight-biased (injected RNG)', () => {
  // weights 1 and 9 → cumulative [1,10); rng 0.5 -> value 5 -> falls in segment B (index 1)
  const cfg = { segments: [{ label: 'A', color: '#10b981', weight: 1 }, { label: 'B', color: '#8b5cf6', weight: 9 }], removeAfterPick: false };
  let calls = 0; const rng = () => 0.5;            // 0.5 * 10 = 5 → B
  const r = T().assign({}, { config: cfg, rng });
  assert.equal(r.targetIndex, 1);
  const r0 = T().assign({}, { config: cfg, rng: () => 0.0 });  // 0 → A
  assert.equal(r0.targetIndex, 0);
});
```

- [ ] **Step 2: Run — fails** (`node --test tests/custom-type.test.js`).

- [ ] **Step 3: Create `public/engine/types/custom.js`:**
```js
/* engine/types/custom.js — "Tùy chỉnh" host-screen picker with hand-defined weighted segments. */
import { darken } from '../geometry.js';
import { esc } from '../helpers.js';

const HEX = /^#[0-9a-fA-F]{6}$/;
const pickedArr = state => Array.isArray(state && state.picked) ? state.picked : [];
const wOf = s => { const w = Number(s.weight); return Number.isFinite(w) && w >= 1 ? Math.floor(w) : 1; };

export const custom = {
  key: 'custom',
  name: 'Tùy chỉnh',
  identity: 'none',

  defaultConfig() {
    return {
      segments: [
        { label: 'Mục 1', color: '#10b981' },
        { label: 'Mục 2', color: '#8b5cf6' },
        { label: 'Mục 3', color: '#f59e0b' },
      ],
      removeAfterPick: true,
    };
  },
  configFields: [
    { kind: 'segments', key: 'segments', label: 'Các mục' },
    { kind: 'bool', key: 'removeAfterPick', label: 'Không lặp lại kết quả đã quay' },
  ],
  validate(config) {
    const segs = (config && config.segments) || [];
    if (!Array.isArray(segs) || !segs.some(s => String(s.label || '').trim())) return 'Cần ít nhất 1 mục có tên.';
    if (segs.some(s => !HEX.test(s.color))) return 'Màu mục không hợp lệ (cần #rrggbb).';
    if (segs.some(s => s.weight != null && !(Number.isInteger(Number(s.weight)) && Number(s.weight) >= 1))) return 'Trọng số phải là số nguyên ≥ 1.';
    return null;
  },

  segments(config, state) {
    const picked = pickedArr(state);
    return config.segments.map((s, i) => ({
      label: s.label,
      color: s.color,
      dark: darken(s.color),
      dim: !!config.removeAfterPick && picked.includes(i),
    }));
  },
  availableIndices(config, state) {
    const picked = pickedArr(state);
    return config.segments.map((_, i) => i).filter(i => !config.removeAfterPick || !picked.includes(i));
  },
  participantControls() { return ''; },
  readSelection() { return {}; },
  canSpin(config, state, _ui, _mine) { return this.availableIndices(config, state).length > 0; },

  assign(cur, { config, rng = Math.random }) {
    cur.picked = Array.isArray(cur.picked) ? cur.picked : [];
    const avail = config.segments.map((_, i) => i).filter(i => !config.removeAfterPick || !cur.picked.includes(i));
    if (!avail.length) return { reason: 'full' };
    const total = avail.reduce((t, i) => t + wOf(config.segments[i]), 0);
    let r = rng() * total;
    let pick = avail[avail.length - 1];
    for (const i of avail) { r -= wOf(config.segments[i]); if (r < 0) { pick = i; break; } }
    cur.picked.push(pick);
    return { targetIndex: pick };
  },

  resultView(config, state) {
    const picked = pickedArr(state);
    if (!picked.length) return '';
    const i = picked[picked.length - 1];
    const s = config.segments[i] || { label: '?', color: '#10b981' };
    return `<div class="result-card"><div class="crown">🎉</div>
        <div class="who">Kết quả</div>
        <div class="grp" style="background:linear-gradient(135deg,${s.color},${darken(s.color)})">${esc(s.label ?? '?')}</div>
        <div class="note">Nhấn QUAY để quay tiếp</div></div>`;
  },
  panel(config, state) {
    const picked = pickedArr(state);
    const remaining = config.removeAfterPick ? (config.segments.length - picked.length) : '∞';
    const items = picked.slice().reverse().map((i, n) => {
      const s = config.segments[i] || { label: '?', color: '#10b981' };
      return `<li class="member"><span class="avatar" style="--gc:${s.color};--gcd:${darken(s.color)}">${picked.length - n}</span><span>${esc(s.label ?? '?')}</span></li>`;
    }).join('') || `<li class="empty">Chưa quay lần nào...</li>`;
    return `<div class="groups"><div class="group" style="--gc:#fbbf24;--gcd:#f59e0b;border-color:#fbbf2466">
        <div class="ghead"><span class="gname">Đã quay</span><span class="gcount">Còn lại: ${remaining}</span></div>
        <ul class="members">${items}</ul></div></div>`;
  },
  claimKey() { return null; },
};
```

- [ ] **Step 4:** In `public/engine/registry.js`: `import { custom } from './types/custom.js';` and add `custom` to the exported object → `export const WHEEL_TYPES = { simple, topicgroup, groupdiv, custom };`.

- [ ] **Step 5: Run — pass** (`node --test tests/custom-type.test.js`), then `npm test` → 44 + 5 = 49.

- [ ] **Step 6: Commit:**
```bash
git add public/engine/types/custom.js public/engine/registry.js tests/custom-type.test.js
git commit -m "feat(engine): custom wheel type — hand-defined weighted coloured segments

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `adminforms` — color + segments kinds + theme section

**Files:** Modify `public/engine/adminforms.js`; Test: `tests/adminforms.test.js`.

**Interfaces:** Produces `export const segmentRow`; `renderConfigForm`/`readConfigForm` handle `color`, `segments`, and an always-appended theme section.

- [ ] **Step 1: Add failing tests** — append to `tests/adminforms.test.js`:
```js
import { renderConfigForm as _rcf, readConfigForm } from '../public/engine/adminforms.js';

test('renderConfigForm(custom) renders segment rows (color+label+weight) + theme section', () => {
  const cfg = WHEEL_TYPES.custom.defaultConfig();
  const html = renderConfigForm(WHEEL_TYPES.custom, { title: 'C', ...cfg });
  assert.equal((html.match(/data-segment-row=/g) || []).length, cfg.segments.length);
  assert.match(html, /class="seg-label"/);
  assert.match(html, /class="seg-weight"/);
  assert.match(html, /data-theme="accent"/);
  assert.match(html, /data-theme="bg"/);
  assert.match(html, /data-theme="sound"/);
});

test('theme section round-trips a topicgroup wheel (cross-type)', () => {
  const cfg = WHEEL_TYPES.topicgroup.defaultConfig();
  const html = renderConfigForm(WHEEL_TYPES.topicgroup, { title: 'T', ...cfg });
  assert.match(html, /data-theme="accent"/);   // theme is always present, even for non-custom types
});
```
(The DOM-reading `readConfigForm` for segments/theme is exercised in the Playwright round-trip, not Node — note this in the commit.)

- [ ] **Step 2: Run — fails.**

- [ ] **Step 3: Edit `public/engine/adminforms.js`:**
  - Add the `color` field renderer:
```js
const colorField = (f, value) =>
  `<div class="field"><label>${esc(f.label)}</label>
    <input type="color" data-field="${esc(f.key)}" value="${esc(value || '#10b981')}"></div>`;
```
  - Add the segment row + segments field (export `segmentRow`):
```js
export const segmentRow = s =>
  `<div class="grow" data-segment-row="1">
    <input type="color" value="${esc((s && s.color) || '#10b981')}">
    <input type="text" class="seg-label" value="${esc((s && s.label) || '')}" placeholder="Tên mục">
    <input type="number" class="seg-weight" min="1" value="${esc((s && s.weight) || '')}" placeholder="x1" style="width:64px">
    <button type="button" class="rm" data-rm="1">✕</button></div>`;

const segmentsField = (f, segs) =>
  `<div class="field segmentsfield" data-field="${esc(f.key)}" data-kind="segments">
    <label>${esc(f.label)}</label>
    <div class="rows">${(segs || []).map(segmentRow).join('')}</div>
    <button type="button" class="addseg" data-add="1">＋ Thêm mục</button></div>`;
```
  - Add a theme section renderer:
```js
const themeSection = theme => {
  const t = theme || {};
  return `<div class="field themefield" data-kind="theme">
    <label>Giao diện (tùy chọn)</label>
    <div class="themerow">
      <span>Màu nhấn</span><input type="color" data-theme="accent" value="${esc(t.accent || '#fbbf24')}">
      <span>Nền</span><input type="color" data-theme="bg" value="${esc(t.bg || '#0b1020')}">
      <label class="soundlab"><input type="checkbox" data-theme="sound"${t.sound === false ? '' : ' checked'}> Âm thanh</label>
    </div></div>`;
};
```
  - In `renderConfigForm`, dispatch `color` and `segments` in the `configFields` loop, then append the theme section before returning:
```js
    else if (f.kind === 'color') html += colorField(f, v);
    else if (f.kind === 'segments') html += segmentsField(f, v);
```
    and after the loop: `html += themeSection(c.theme);`
  - In `readConfigForm`, handle `color`/`segments`, then read the theme:
```js
    else if (f.kind === 'color') out[f.key] = el ? el.value : '';
    else if (f.kind === 'segments') {
      out[f.key] = el ? Array.from(el.querySelectorAll('[data-segment-row]')).map(r => {
        const w = Number(r.querySelector('.seg-weight').value);
        const seg = { label: r.querySelector('.seg-label').value.trim(), color: r.querySelector('input[type="color"]').value };
        if (Number.isInteger(w) && w > 1) seg.weight = w;
        return seg;
      }).filter(s => s.label) : [];
    }
```
    and after the loop (theme), only including non-default values:
```js
  const HEXc = /^#[0-9a-fA-F]{6}$/;
  const aEl = rootEl.querySelector('[data-theme="accent"]');
  const bEl = rootEl.querySelector('[data-theme="bg"]');
  const sEl = rootEl.querySelector('[data-theme="sound"]');
  const theme = {};
  if (aEl && HEXc.test(aEl.value) && aEl.value.toLowerCase() !== '#fbbf24') theme.accent = aEl.value;
  if (bEl && HEXc.test(bEl.value) && bEl.value.toLowerCase() !== '#0b1020') theme.bg = bEl.value;
  if (sEl && !sEl.checked) theme.sound = false;
  if (Object.keys(theme).length) out.theme = theme;
```
  (A wheel left at the default accent/bg with sound on saves no `theme` — preserving the default look.)

- [ ] **Step 4: Run — pass** (`node --test tests/adminforms.test.js`), then `npm test` → 49 + 2 = 51.

- [ ] **Step 5: Commit:**
```bash
git add public/engine/adminforms.js tests/adminforms.test.js
git commit -m "feat(admin): color + segments field kinds + per-wheel theme section in adminforms

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `admin.html` — segment-row add/remove + theme CSS

**Files:** Modify `public/admin.html`.

- [ ] **Step 1:** In the editor delegated click handler (the `data-add` branch), handle the segments kind:
```js
    if (field.dataset.kind === 'list') rows.insertAdjacentHTML('beforeend', listRow(''));
    else if (field.dataset.kind === 'groups') rows.insertAdjacentHTML('beforeend', groupRow(null));
    else if (field.dataset.kind === 'segments') rows.insertAdjacentHTML('beforeend', segmentRow(null));
```
  and add `segmentRow` to the adminforms import: `import { renderConfigForm, readConfigForm, listRow, groupRow, segmentRow } from "./engine/adminforms.js";`.
  The `data-rm` branch already removes `[data-list-row],[data-group-row]` — extend its selector to also match `[data-segment-row]`:
```js
    const row = t.closest('[data-list-row],[data-group-row],[data-segment-row]');
```
- [ ] **Step 2:** Add CSS for `.seg-weight`, `.themerow` (flex, gap, align), `.soundlab` to the admin `<style>` so the segment + theme rows lay out cleanly.
- [ ] **Step 3: Verify (Playwright + injected store, offline):** create a `custom` wheel — add a segment row, remove one, set a weight, set accent+bg, toggle sound off → Save → assert the saved config has the right `segments` (incl. the weight) and `theme:{accent,bg,sound:false}`, and `WHEEL_TYPES.custom.validate(saved) === null`. (Detailed assertions run in Task 6's integration pass.)
- [ ] **Step 4: Commit:**
```bash
git add public/admin.html
git commit -m "feat(admin): segment-row add/remove + theme/segment CSS in admin.html

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `wheel.html` — apply theme + gate sound

**Files:** Modify `public/wheel.html`.

- [ ] **Step 1:** Add a `soundOn` module flag (default true) near the other state vars:
`let soundOn = true;`
- [ ] **Step 2:** Add `applyTheme` and call it when a config first loads. In the `onValue` handler, after `T = WHEEL_TYPES[config.type];` and before `buildUI()`, add `applyTheme(config.theme);`. Define:
```js
const HEXt = /^#[0-9a-fA-F]{6}$/;
function applyTheme(theme) {
  if (!theme) { soundOn = true; return; }
  soundOn = theme.sound !== false;
  if (theme.accent && HEXt.test(theme.accent)) document.documentElement.style.setProperty('--gold', theme.accent);
  if (theme.bg && HEXt.test(theme.bg)) {
    const accent = (theme.accent && HEXt.test(theme.accent)) ? theme.accent : '#10b981';
    document.body.style.background =
      `radial-gradient(900px 500px at 12% -5%, ${accent}33, transparent 60%),` +
      `linear-gradient(160deg, ${theme.bg} 0%, ${theme.bg} 100%)`;
  }
}
```
- [ ] **Step 3:** Gate the chime: in `doSpin`'s post-animation timeout, change `chime(audioCtx);` to `if (soundOn) chime(audioCtx);`.
- [ ] **Step 4: Verify (Playwright, offline):** in a page, `import` the engine, build a `custom` config with a theme, call a copy of `applyTheme` logic / or load `wheel.html` with an injected store config and confirm `--gold` and `body.style.background` change and that with `sound:false` the flag is false. (Covered in Task 6.)
- [ ] **Step 5: Commit:**
```bash
git add public/wheel.html
git commit -m "feat(engine): wheel.html applies per-wheel theme (accent/bg) + gates chime by theme.sound

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: README + integration verify + adversarial workflow

**Files:** Modify `README.md`; verification only otherwise.

- [ ] **Step 1: README** — add the `custom` row to the wheel-type table (`custom` | Tùy chỉnh | hand-defined weighted/coloured segments, host-screen picker); add a one-line "Theming" note (any wheel can carry an optional `theme` of accent/background/sound, set in the admin editor); add `types/custom.js` to the layout tree.
- [ ] **Step 2: Full unit suite** — `npm test` → 51 green.
- [ ] **Step 3: Offline integration (Playwright + injected store, zero Firebase):** serve locally; in `admin.html`, unlock, create a `custom` wheel (segments add/remove, a weight, accent+bg+sound-off theme) → Save → read `window.__WHEEL_DATA__` and assert: segments array (with the weight), `theme:{accent,bg,sound:false}`, `validate===null`. Then feed the saved config to `WHEEL_TYPES.custom.segments` + `discHtml` and assert N labels render; run the `applyTheme` logic on it and assert `--gold` + body background change and `soundOn===false`. Also confirm a `topicgroup` wheel can save a theme (cross-type). Screenshot the custom-wheel editor.
- [ ] **Step 4: Adversarial workflow** — dispatch verifiers: (a) custom type correctness incl. weighted-assign distribution + removeAfterPick + bounds; (b) adminforms color/segments/theme render↔read attribute parity + theme omit-when-default; (c) wheel.html theme application safety (hex-gated, no injection, sound default) + no behaviour change for un-themed wheels; (d) no production-write path; (e) SP5 spec coverage. Fix any Critical/Important, re-verify.
- [ ] **Step 5: Commit** README + finalize:
```bash
git add README.md
git commit -m "docs: README — custom type + per-wheel theming

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Done = arc complete

After SP5: four wheel types (`simple`, `groupdiv`, `topicgroup`, `custom`), a PIN-gated admin that configures any of them + per-wheel theming, a clean `public/engine/*` structure, a README, and ~51 unit tests — all verified offline, nothing deployed. The flexible-config arc (SP3→SP5) is finished and ready to push/deploy on the user's request.
