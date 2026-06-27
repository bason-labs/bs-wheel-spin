# SP4 — Admin Core (PIN-gated dashboard) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A PIN-gated `/admin` dashboard that lists, creates, edits, deletes, and resets wheels of any registered type via forms generated from each type's `configFields` — replacing the temporary `?seed=` dev path — verified entirely offline against a local Firebase emulator.

**Architecture:** A new pure module `public/engine/adminforms.js` renders a config form from a type entry and reads it back to a config object (no Firebase, no top-level DOM). `public/admin.html` is PIN-gated, imports `WHEEL_TYPES` + the form helpers, and wraps Firebase in a thin store (`listWheels/getConfig/saveConfig/resetDraws/deleteWheel`). Both `admin.html` and `wheel.html` gain an opt-in `?emu=1` hook that points them at a local RTDB emulator so the whole admin→participant round-trip is verified without touching production.

**Tech Stack:** Vanilla ES modules, Firebase Realtime Database (v10.12.2 CDN), Node 22 `node:test`, Firebase CLI 15.x RTDB emulator (Java 17 present), Python `http.server` + Playwright MCP. Zero runtime dependencies.

## Global Constraints

- **NO Firebase deploys and NO production RTDB writes.** All verification is local: `node --test`, `python3 -m http.server`, and `firebase emulators:start --only database`. The production database (`wheel-spin-a6f34`) is never written. Do not run `firebase deploy`.
- **`ADMIN_PIN = '2468'`** — an editable constant at the top of `admin.html`; client-side only, not real security.
- **Emulator opt-in:** the `connectDatabaseEmulator` hook activates ONLY when `?emu=1` is in the URL. Production never passes it.
- **Frozen runtime contract:** admin reads/writes the existing `wheels/<id>/config` and clears `wheels/<id>/state`; no participant-runtime method signatures change. New form field kinds beyond `text/number/bool/list/groups` are SP5, not SP4.
- **`public/` is the single source of truth** (no root copies). Vietnamese UI.
- Commit per task; end each commit message with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: `engine/adminforms.js` — pure form render/read

**Files:**
- Create: `public/engine/adminforms.js`
- Test: `tests/adminforms.test.js`

**Interfaces:**
- Consumes: `esc` from `./helpers.js`.
- Produces:
  - `darken(hex) -> '#rrggbb'` — a fixed darker shade of a `#rrggbb` input.
  - `renderConfigForm(typeEntry, config) -> htmlString` — a Title field + one control group per `typeEntry.configFields`, pre-filled from `config`.
  - `readConfigForm(rootEl, typeEntry) -> config` — `{ type, title, …fields }` read from the rendered controls (no `createdTs`).
  - `groupsFromRows(rows) -> [{key,name,color,dark}]` — pure: maps `[{name,color}]` to the group shape with `key=g{i+1}` and `dark=darken(color)`.

- [ ] **Step 1: Write the failing tests** — create `tests/adminforms.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { darken, renderConfigForm, groupsFromRows } from '../public/engine/adminforms.js';
import { WHEEL_TYPES } from '../public/engine/index.js';

test('darken returns a valid darker #rrggbb', () => {
  const d = darken('#10b981');
  assert.match(d, /^#[0-9a-f]{6}$/);
  assert.notEqual(d, '#10b981');
  assert.equal(darken('#ffffff').length, 7);
  assert.equal(darken('#000000'), '#000000');
});

test('groupsFromRows assigns positional keys + derived dark', () => {
  const g = groupsFromRows([{ name: 'A', color: '#10b981' }, { name: 'B', color: '#8b5cf6' }]);
  assert.equal(g.length, 2);
  assert.deepEqual(g.map(x => x.key), ['g1', 'g2']);
  assert.equal(g[0].name, 'A'); assert.equal(g[0].color, '#10b981');
  assert.match(g[0].dark, /^#[0-9a-f]{6}$/);
});

test('renderConfigForm(simple) has a title + options list + removeAfterPick checkbox', () => {
  const cfg = WHEEL_TYPES.simple.defaultConfig();
  const html = renderConfigForm(WHEEL_TYPES.simple, { title: 'Demo', ...cfg });
  assert.match(html, /name="title"/);
  assert.match(html, /value="Demo"/);
  assert.match(html, /data-field="options"/);          // the list field container
  assert.equal((html.match(/data-list-row=/g) || []).length, cfg.options.length); // one row per option
  assert.match(html, /type="checkbox"[^>]*data-field="removeAfterPick"/);
});

test('renderConfigForm(topicgroup) renders topics list + groups rows with color inputs', () => {
  const cfg = WHEEL_TYPES.topicgroup.defaultConfig();
  const html = renderConfigForm(WHEEL_TYPES.topicgroup, { title: 'T', ...cfg });
  assert.equal((html.match(/data-list-row=/g) || []).length, cfg.topics.length); // 13
  assert.equal((html.match(/data-group-row=/g) || []).length, cfg.groups.length); // 8
  assert.match(html, /type="color"/);
});

test('renderConfigForm(groupdiv) renders groups rows + a number input', () => {
  const cfg = WHEEL_TYPES.groupdiv.defaultConfig();
  const html = renderConfigForm(WHEEL_TYPES.groupdiv, { title: 'G', ...cfg });
  assert.equal((html.match(/data-group-row=/g) || []).length, cfg.groups.length);
  assert.match(html, /type="number"[^>]*data-field="maxPerGroup"/);
  assert.match(html, /value="6"/);
});

test('renderConfigForm escapes user values', () => {
  const html = renderConfigForm(WHEEL_TYPES.simple, { title: '<x>"', options: ['<b>'], removeAfterPick: true });
  assert.ok(!html.includes('<x>"'));         // title escaped
  assert.match(html, /&lt;x&gt;/);
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `node --test tests/adminforms.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `public/engine/adminforms.js`**

```js
/* engine/adminforms.js — pure config-form rendering + reading for the admin page.
   No Firebase, no top-level DOM. Field kinds: text, number, bool, list, groups. */
import { esc } from './helpers.js';

export function darken(hex) {
  const m = /^#([0-9a-fA-F]{6})$/.exec(String(hex));
  if (!m) return '#000000';
  const n = parseInt(m[1], 16);
  const r = Math.max(0, ((n >> 16) & 255) - 40);
  const g = Math.max(0, ((n >> 8) & 255) - 40);
  const b = Math.max(0, (n & 255) - 40);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

export function groupsFromRows(rows) {
  return rows.map((row, i) => ({
    key: `g${i + 1}`,
    name: row.name,
    color: row.color,
    dark: darken(row.color),
  }));
}

const textField = (key, label, value) =>
  `<div class="field"><label>${esc(label)}</label>
    <input type="text" data-field="${esc(key)}" value="${esc(value ?? '')}"></div>`;

const numberField = (f, value) =>
  `<div class="field"><label>${esc(f.label)}</label>
    <input type="number" data-field="${esc(f.key)}" min="${f.min ?? 0}" value="${esc(value ?? f.default ?? 0)}"></div>`;

const boolField = (f, value) =>
  `<div class="checkrow"><label><input type="checkbox" data-field="${esc(f.key)}"${value ? ' checked' : ''}> ${esc(f.label)}</label></div>`;

const listRow = v => `<div class="lrow" data-list-row="1"><input type="text" value="${esc(v ?? '')}"><button type="button" class="rm" data-rm="1">✕</button></div>`;
const listField = (f, values) =>
  `<div class="field listfield" data-field="${esc(f.key)}" data-kind="list">
    <label>${esc(f.label)}</label>
    <div class="rows">${(values || []).map(listRow).join('')}</div>
    <button type="button" class="addrow" data-add="1">＋ ${esc(f.itemPlaceholder || 'Thêm')}</button></div>`;

const groupRow = g => `<div class="grow" data-group-row="1">
  <input type="color" value="${esc((g && g.color) || '#10b981')}">
  <input type="text" class="gname" value="${esc((g && g.name) || '')}" placeholder="Tên nhóm">
  <button type="button" class="rm" data-rm="1">✕</button></div>`;
const groupsField = (f, groups) =>
  `<div class="field groupsfield" data-field="${esc(f.key)}" data-kind="groups">
    <label>${esc(f.label)}</label>
    <div class="rows">${(groups || []).map(groupRow).join('')}</div>
    <button type="button" class="addgroup" data-add="1">＋ Thêm nhóm</button></div>`;

export function renderConfigForm(typeEntry, config) {
  const c = config || {};
  let html = textField('title', 'Tiêu đề', c.title);
  for (const f of typeEntry.configFields) {
    const v = c[f.key];
    if (f.kind === 'text') html += textField(f.key, f.label, v);
    else if (f.kind === 'number') html += numberField(f, v);
    else if (f.kind === 'bool') html += boolField(f, v);
    else if (f.kind === 'list') html += listField(f, v);
    else if (f.kind === 'groups') html += groupsField(f, v);
  }
  return html;
}

export function readConfigForm(rootEl, typeEntry) {
  const out = { type: typeEntry.key };
  const titleEl = rootEl.querySelector('[data-field="title"]');
  out.title = titleEl ? titleEl.value.trim() : '';
  for (const f of typeEntry.configFields) {
    const el = rootEl.querySelector(`[data-field="${f.key}"]`);
    if (f.kind === 'text') out[f.key] = el ? el.value.trim() : '';
    else if (f.kind === 'number') out[f.key] = el ? Number(el.value) : 0;
    else if (f.kind === 'bool') out[f.key] = !!(el && el.checked);
    else if (f.kind === 'list') {
      out[f.key] = el ? Array.from(el.querySelectorAll('[data-list-row] input')).map(i => i.value.trim()).filter(Boolean) : [];
    } else if (f.kind === 'groups') {
      const rows = el ? Array.from(el.querySelectorAll('[data-group-row]')).map(r => ({
        name: r.querySelector('.gname').value.trim(),
        color: r.querySelector('input[type="color"]').value,
      })).filter(r => r.name) : [];
      out[f.key] = groupsFromRows(rows);
    }
  }
  return out;
}
```

- [ ] **Step 4: Run — verify it passes**

Run: `node --test tests/adminforms.test.js`
Expected: PASS (6 tests). Then `npm test` → full suite passes (36 + 6 = 42).

- [ ] **Step 5: Commit**

```bash
git add public/engine/adminforms.js tests/adminforms.test.js
git commit -m "feat(admin): adminforms.js — pure config-form render/read for text/number/bool/list/groups

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Deferred-minor fixes — render guards + hex validation

**Files:**
- Modify: `public/engine/types/simple.js`, `public/engine/types/topicgroup.js`
- Test: `tests/simple-type.test.js`, `tests/topicgroup-type.test.js`

**Interfaces:** unchanged signatures; behavior hardened.

- [ ] **Step 1: Add failing tests** — append to `tests/simple-type.test.js`:

```js
test('simple.resultView guards an out-of-bounds pick after options shrink', () => {
  const cfg = { options: ['a', 'b'], removeAfterPick: false };
  // state references an index no longer present (options were shortened)
  const html = WHEEL_TYPES.simple.resultView(cfg, { picked: [5] });
  assert.ok(!html.includes('undefined'));
  assert.match(html, />\?</);   // renders the '?' placeholder, not "undefined"
});
```

And append to `tests/topicgroup-type.test.js` a hex-validation case:

```js
test('topicgroup.validate rejects a group with a non-hex color', () => {
  const cfg = WHEEL_TYPES.topicgroup.defaultConfig();
  cfg.groups[0] = { key: 'g1', name: 'G1', color: 'red);x', dark: '#000000' };
  assert.match(WHEEL_TYPES.topicgroup.validate(cfg), /màu|color|hex/i);
});
```

- [ ] **Step 2: Run — verify they fail**

Run: `node --test tests/simple-type.test.js tests/topicgroup-type.test.js`
Expected: FAIL (resultView prints "undefined"; validate returns null for bad color).

- [ ] **Step 3: Apply the fixes**

In `public/engine/types/simple.js`, in `resultView`, change:
```js
      <div class="grp" style="background:linear-gradient(135deg,${p.color},${p.dark})">${esc(config.options[i])}</div>
```
to:
```js
      <div class="grp" style="background:linear-gradient(135deg,${p.color},${p.dark})">${esc(config.options[i] ?? '?')}</div>
```
and in `panel`, change `${esc(config.options[i])}` to `${esc(config.options[i] ?? '?')}`.

In `public/engine/types/topicgroup.js` AND `public/engine/types/groupdiv.js`, add a hex check inside `validate`, right before `return null;`. Define a shared check at the top of each file:
```js
const HEX = /^#[0-9a-fA-F]{6}$/;
```
and in `topicgroup.validate`, after the existing checks:
```js
    if (groups.some(g => !HEX.test(g.color) || !HEX.test(g.dark))) return 'Màu nhóm không hợp lệ (cần #rrggbb).';
```
and in `groupdiv.validate`, after the existing checks:
```js
    if (groups.some(g => !HEX.test(g.color) || !HEX.test(g.dark))) return 'Màu nhóm không hợp lệ (cần #rrggbb).';
```

- [ ] **Step 4: Run — verify pass**

Run: `npm test`
Expected: full suite green (42 + the 2 new = 44).

- [ ] **Step 5: Commit**

```bash
git add public/engine/types/ tests/simple-type.test.js tests/topicgroup-type.test.js
git commit -m "fix(engine): out-of-bounds render guard (simple) + hex color validation (topicgroup/groupdiv)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: firebase.json (/admin rewrite + emulators) + wheel.html (remove seed, add emu hook)

**Files:**
- Modify: `firebase.json`, `public/wheel.html`

**Interfaces:** none.

- [ ] **Step 1: Add the `/admin` rewrite + emulators block to `firebase.json`**

In `hosting.rewrites`, add `{ "source": "/admin", "destination": "/admin.html" }` **before** the `{ "source": "/", … }` entry. Add a top-level `emulators` block:
```json
  "emulators": { "database": { "port": 9000 }, "ui": { "enabled": false } }
```

- [ ] **Step 2: Remove the `?seed=` block from `public/wheel.html`**

Delete the line `const SEED = params.get('seed');` and the entire seed block in `startApp` (the `// TEMP dev seed …` comment, `const SEED_TITLES = …`, and the `if (SEED && WHEEL_TYPES[SEED]) { … }` try/catch). Also remove `set` from the firebase-database import on line 88 if it is no longer used elsewhere (grep first — it is only used by the seed block; `get` is still used? grep: `get(` — the seed used `get`; confirm no other `get(`/`set(` remain before removing those names).

- [ ] **Step 3: Add the `?emu=1` hook to `public/wheel.html`**

Immediately after `db = getDatabase(fb);` in `startApp`, insert:
```js
  if (params.get('emu') === '1') {
    const { connectDatabaseEmulator } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js");
    connectDatabaseEmulator(db, '127.0.0.1', 9000);
  }
```

- [ ] **Step 4: Verify wheel.html still loads (no seed) — local, read-only**

Run (background): `python3 -m http.server 8123`. Navigate Playwright to `http://localhost:8123/public/wheel.html?w=nope-fresh` → still shows "Vòng quay chưa được thiết lập", no console errors (favicon ok), and `seed` is gone. Stop the server.

- [ ] **Step 5: Commit**

```bash
git add firebase.json public/wheel.html
git commit -m "feat(admin): /admin rewrite + RTDB emulator config; remove ?seed= dev path; add ?emu=1 hook

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `admin.html` — PIN gate + store layer + dashboard list

**Files:**
- Create: `public/admin.html`

**Interfaces:**
- Consumes: `WHEEL_TYPES`, `makeWheelId` from `./engine/index.js`; `renderConfigForm`, `readConfigForm` from `./engine/adminforms.js`.

- [ ] **Step 1: Create `public/admin.html`** with this structure:

- `<head>`: copy the shared CSS theme from `public/wheel.html` (the `<style>` body), then add admin-specific rules for `.field input`, `.checkrow`, `.lrow`/`.grow` (flex rows with inputs + a `.rm` button), `.addrow`/`.addgroup` buttons, `.wheelcard` (dashboard card), `.badge2` (type badge), `.adminbtn` variants, and a `.pinscreen` centered card.
- `<body>`: a `#pin` screen (input + "Mở khoá" button + `#pinErr`) and a hidden `#admin` container (`#list` + a `#editor` panel).
- `<script type="module">`:
  - `const ADMIN_PIN = '2468';` (editable; client-side only).
  - imports: `initializeApp`; `getDatabase, ref, onValue, set, get, remove` from firebase-database; `WHEEL_TYPES, makeWheelId` from `./engine/index.js`; `renderConfigForm, readConfigForm` from `./engine/adminforms.js`.
  - the same `firebaseConfig` object as `wheel.html`.
  - the `?emu=1` hook (same guarded `connectDatabaseEmulator` block) right after `getDatabase`.
  - **PIN gate:** on load, if `sessionStorage.adminUnlocked === '1'` show `#admin`, else show `#pin`. The unlock button compares the input to `ADMIN_PIN`; on match set `sessionStorage.adminUnlocked='1'`, hide `#pin`, show `#admin`, and start the dashboard; on mismatch show `#pinErr` "Sai mã PIN".
  - **store layer:**
    ```js
    const store = {
      listWheels: cb => onValue(ref(db, 'wheels'), s => cb(s.val() || {})),
      getConfig: id => get(ref(db, `wheels/${id}/config`)).then(s => s.val()),
      saveConfig: (id, c) => set(ref(db, `wheels/${id}/config`), c),
      resetDraws: id => remove(ref(db, `wheels/${id}/state`)),
      deleteWheel: id => remove(ref(db, `wheels/${id}`)),
      hasState: id => get(ref(db, `wheels/${id}/state`)).then(s => s.exists()),
    };
    ```
  - **dashboard render:** `store.listWheels(wheels => renderList(wheels))`. `renderList` builds, for each `[id, node]`, a `.wheelcard` showing `node.config.title || id`, a badge `WHEEL_TYPES[node.config.type]?.name || 'loại không hỗ trợ'`, the link `wheel.html?w=${id}` with a Copy button (`navigator.clipboard.writeText`), and buttons **Sửa** (→ openEditor(id)), **Reset lượt** (confirm → store.resetDraws), **Xoá** (confirm → store.deleteWheel). Plus a top **＋ Tạo vòng quay** button (→ openCreate()). All dynamic text via the imported `esc` (re-export it from the barrel or import from `./engine/index.js`).

- [ ] **Step 2: PIN gate test (Playwright, no Firebase needed for the gate)**

Serve locally; navigate to `http://localhost:8123/public/admin.html`. Confirm the PIN screen shows and `#admin` is hidden. Type a wrong PIN → `#pinErr` shows, still hidden. Type `2468` → `#admin` shows. Reload → stays unlocked (sessionStorage). (No Firebase write involved.)

- [ ] **Step 3: Dashboard list test (Playwright + emulator)**

Start `firebase emulators:start --only database` (background). Seed one wheel directly into the emulator via its REST endpoint:
`curl -X PUT 'http://127.0.0.1:9000/wheels/demo1/config.json?ns=wheel-spin-a6f34-default-rtdb' -d '{"type":"simple","title":"Demo","createdTs":0,"options":["A","B"],"removeAfterPick":true}'`.
Navigate to `http://localhost:8123/public/admin.html?emu=1`, unlock, confirm a card for "Demo" with the `simple` badge and a `wheel.html?w=demo1` link appears. Stop the emulator + server.

- [ ] **Step 4: Commit**

```bash
git add public/admin.html
git commit -m "feat(admin): admin.html — PIN gate, Firebase store layer, dashboard list

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `admin.html` — create / edit / delete / reset flows

**Files:**
- Modify: `public/admin.html`

**Interfaces:** uses `renderConfigForm`/`readConfigForm` + the store.

- [ ] **Step 1: Implement the editor flows in `admin.html`**

- **openCreate():** render a small type picker (each `WHEEL_TYPES[k].name`). On pick, `openForm(type, WHEEL_TYPES[type].defaultConfig(), null)`.
- **openEditor(id):** `const node = current[id]; openForm(node.config.type, node.config, id)`. If that wheel `hasState`, show a small warning "Vòng quay đã có lượt quay — cân nhắc Reset sau khi đổi nhóm/chủ đề." (per the spec's structural-edit note).
- **openForm(type, config, id):** set `#editor.innerHTML = renderConfigForm(WHEEL_TYPES[type], config)` + a "Lưu"/"Huỷ" bar; wire the list/group add/remove buttons (delegate clicks: `[data-add]` appends a `listRow`/`groupRow`; `[data-rm]` removes its row). On **Lưu**: `const cfg = readConfigForm(#editor, WHEEL_TYPES[type]); const err = WHEEL_TYPES[type].validate(cfg); if (err) showFormErr(err); else { const wid = id || makeWheelId(); store.saveConfig(wid, { ...cfg, createdTs: (id && current[id]?.config?.createdTs) || Date.now() }); closeEditor(); }`. On **Huỷ**: closeEditor().
- **delete/reset** are already wired in Task 4's card buttons (confirm() guards).
- The add/remove row wiring must reuse the exact `listRow`/`groupRow` markup from `adminforms.js`; re-export those two helpers from `adminforms.js` (`export` them) and import into `admin.html` so the dynamically-added rows match what `readConfigForm` expects (`data-list-row` / `data-group-row`).

- [ ] **Step 2: Adjust `adminforms.js` to export the row helpers**

Add `export` to `listRow` and `groupRow` in `public/engine/adminforms.js` (so admin.html can append matching rows). Re-run `node --test tests/adminforms.test.js` — still green (exports are additive).

- [ ] **Step 3: Emulator round-trip test (Playwright, no production)**

With the emulator + server running, at `admin.html?emu=1` (unlocked): click **＋ Tạo vòng quay** → pick `topicgroup` → the form shows 13 topic rows + 8 group rows → change the title to "Round Trip" → **Lưu**. Confirm a card "Round Trip" appears. Click its `wheel.html?w=<id>` link opened as `…?w=<id>&emu=1`; confirm the participant page renders a 13-segment wheel + 8-group dropdown. Back in admin, **Sửa** that wheel, change title to "Edited", **Lưu**; reload the participant page → title "Edited". **Reset lượt** then **Xoá** the wheel → card disappears. Stop emulator + server.

- [ ] **Step 4: Commit**

```bash
git add public/admin.html public/engine/adminforms.js
git commit -m "feat(admin): create/edit/delete/reset flows wired to adminforms + store

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: README update

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the README**

- Flip the `/admin` routes-table row from "built in SP4 (not present yet)" to live: "PIN-gated config dashboard — create/edit/delete/reset wheels".
- Update the Source-layout tree to include `admin.html` and `engine/adminforms.js`.
- Update the Admin & PIN section: the `ADMIN_PIN` constant is editable in `admin.html`.
- Add a **Local emulator** note under Develop: `firebase emulators:start --only database` + open `…/admin.html?emu=1` / `…/wheel.html?w=<id>&emu=1` to develop/test against a local DB without touching production.

- [ ] **Step 2: Reconcile the tree**

Run `ls public public/engine` and confirm the README tree lists `admin.html` and `adminforms.js`.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README — /admin live, adminforms module, local emulator dev

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Integration verification + adversarial review

**Files:** none (verification).

- [ ] **Step 1: Full unit suite**

Run: `npm test` → all green (44).

- [ ] **Step 2: Full emulator round-trip (Playwright, no production)**

Re-run the Task 5 round-trip end-to-end in one pass (create→participant render→edit→reflect→reset→delete) against the emulator, plus the PIN gate (Task 4 Step 2) and the dashboard-list (Task 4 Step 3). Confirm zero production contact (the only Firebase endpoint hit is `127.0.0.1:9000`). Capture screenshots of the dashboard and a created participant wheel.

- [ ] **Step 3: Confirm no production-write leakage**

Grep `admin.html` + `wheel.html` for any unguarded `set(`/`remove(`/`update(` outside the store layer and confirm the emulator hook is the only thing redirecting the db. Confirm production (`wheel-spin-a6f34`) was never written (no `firebase deploy`, no curl to the `*.firebaseio.com` production host).

- [ ] **Step 4: Adversarial verification workflow**

Dispatch a verification workflow (parallel reviewers): (a) form render/read round-trip correctness vs each type's `defaultConfig`/`validate`; (b) PIN-gate logic (no bypass, sessionStorage behavior); (c) store-layer/CRUD correctness + the `createdTs` preservation on edit; (d) no production-write path / emulator opt-in is the only redirect; (e) spec coverage vs `2026-06-27-sp4-admin-core-design.md`. Fix any Critical/Important findings, re-verify.

- [ ] **Step 5: Final confirmation**

`npm test` 44/44; `/admin` works against the emulator (create/edit/delete/reset + participant round-trip); `wheel.html` has no `?seed=`; README updated; nothing deployed, no production write.

---

## Notes for SP5

`adminforms.js` dispatches by `field.kind`; SP5 adds `color`/`segments`/`theme` renderers+readers there and the `custom` type module — no restructuring of `admin.html`'s create/edit flow. The `theme` form section writes `config.theme`, which `wheel.html` reads to set CSS variables.
