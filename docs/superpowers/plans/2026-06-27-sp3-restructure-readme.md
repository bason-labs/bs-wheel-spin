# SP3 — Source Restructure + README Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the 405-line `wheel-types.js` monolith into small single-responsibility ES modules under `public/engine/`, make `public/` the single source of truth (delete root duplicates), repoint `wheel.html` + all tests, and write a README — with no behavior change.

**Architecture:** Native browser ES modules (no bundler, no build). The engine becomes `public/engine/{helpers,geometry,celebration,registry}.js` + `public/engine/types/{simple,topicgroup,groupdiv}.js`, tied together by a barrel `public/engine/index.js` that re-exports the exact public surface today's `wheel-types.js` exports. `wheel.html` and every test import from the barrel. Function/method bodies are copied **verbatim** from the current `wheel-types.js`; only module location and import/export wiring change.

**Tech Stack:** Vanilla ES modules, Node 22 built-in `node:test`, Python `http.server` + Playwright MCP for the smoke check. Zero runtime dependencies.

## Global Constraints

- **NO Firebase deploys and NO production RTDB writes** during this sub-project. Local `node --test` and local `python3 -m http.server` only. Do not run `firebase deploy`. Do not use the `?seed=` path (it writes to production).
- **Verbatim bodies:** every moved function/method/object body is copied character-for-character from the current `wheel-types.js` (committed at the branch base). Only `import`/`export` wrapper lines and the documented one-line renames change. No logic edits.
- **`public/` is the single source of truth** — after this sub-project there is no root `wheel-types.js`/`wheel.html`/`group-wheel.html` and no `cp` step.
- **Zero dependencies**, native ESM, no bundler/build.
- **Reference source:** all line numbers below refer to `wheel-types.js` as it exists at the start of this sub-project (branch `feat/wheel-engine-3`, commit `882fae0`). If reading it fresh, confirm the ranges by content, not just number.
- The full **36-test** unit suite passing after the switchover is the primary "no behavior change" gate.

---

### Task 1: `engine/helpers.js` — pure utilities

**Files:**
- Create: `public/engine/helpers.js`

**Interfaces:**
- Produces: `esc(s)`, `deviceId()`, `makeWheelId()`, `stripVN(s)`, `findDuplicate(name, existingNames)`. No imports (pure; localStorage/crypto only inside function bodies).

- [ ] **Step 1: Create the file**

Copy these five exports **verbatim** from `wheel-types.js` into `public/engine/helpers.js`, in this order:
- `esc` — lines 4-5
- `deviceId` — lines 7-19
- `makeWheelId` — lines 21-26
- `stripVN` — lines 391-392
- `findDuplicate` — lines 394-404

Prepend this file header comment, no imports:

```js
/* engine/helpers.js — pure string / id / name utilities.
   No imports; browser globals (localStorage, crypto) only inside function bodies so Node can import this. */
```

- [ ] **Step 2: Syntax-check the file**

Run: `node --check public/engine/helpers.js`
Expected: exit 0, no output.

- [ ] **Step 3: Commit**

```bash
git add public/engine/helpers.js
git commit -m "refactor(engine): extract helpers.js (esc, deviceId, makeWheelId, stripVN, findDuplicate)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `engine/geometry.js` — palette + wheel geometry

**Files:**
- Create: `public/engine/geometry.js`

**Interfaces:**
- Consumes: `esc` from `./helpers.js`.
- Produces: `PALETTE` (array of `{color,dark}`), `landingRotation(curRotation, idx, segCount, rng=Math.random)`, `discHtml(segs, rotation)`.

- [ ] **Step 1: Create the file**

Header + import, then copy **verbatim** from `wheel-types.js`:
- `landingRotation` — lines 28-36
- `discHtml` — lines 38-55 (it uses `esc`, now imported)
- `PALETTE` — lines 57-62

```js
/* engine/geometry.js — color palette + wheel segment geometry/rendering. */
import { esc } from './helpers.js';

// …landingRotation (28-36)…
// …discHtml (38-55)…
// …PALETTE (57-62)…
```

- [ ] **Step 2: Syntax-check**

Run: `node --check public/engine/geometry.js`
Expected: exit 0, no output.

- [ ] **Step 3: Commit**

```bash
git add public/engine/geometry.js
git commit -m "refactor(engine): extract geometry.js (PALETTE, landingRotation, discHtml)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `engine/celebration.js` — chime + confetti

**Files:**
- Create: `public/engine/celebration.js`

**Interfaces:**
- Produces: `chime(audioCtx)`, `burst(colorPair, confettiEl)`. No imports (defensive guards intact so Node import never throws).

- [ ] **Step 1: Create the file**

Header, then copy **verbatim** from `wheel-types.js`:
- `chime` — lines 356-369
- `burst` — lines 371-389

```js
/* engine/celebration.js — spin chime + confetti burst. Defensive guards keep Node import safe. */

// …chime (356-369)…
// …burst (371-389)…
```

- [ ] **Step 2: Syntax-check**

Run: `node --check public/engine/celebration.js`
Expected: exit 0, no output.

- [ ] **Step 3: Commit**

```bash
git add public/engine/celebration.js
git commit -m "refactor(engine): extract celebration.js (chime, burst)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `engine/types/{simple,topicgroup,groupdiv}.js` — the three wheel types

**Files:**
- Create: `public/engine/types/simple.js`
- Create: `public/engine/types/topicgroup.js`
- Create: `public/engine/types/groupdiv.js`

**Interfaces:**
- Consumes: `PALETTE` from `../geometry.js`; `esc`, `findDuplicate` from `../helpers.js`.
- Produces: `export const simple`, `export const topicgroup` (+ `export const takenTopicSet`), `export const groupdiv` — each the same `WHEEL_TYPES` entry object as today.

- [ ] **Step 1: Create `public/engine/types/simple.js`**

```js
/* engine/types/simple.js — "Quay ngẫu nhiên" host-screen picker. */
import { PALETTE } from '../geometry.js';
import { esc } from '../helpers.js';

const pickedArr = state => Array.isArray(state && state.picked) ? state.picked : [];

export const simple = {
  // …verbatim body of the `simple:` object from wheel-types.js lines 68-136…
};
```
Extraction detail: copy `wheel-types.js` lines 68-136 (from `key: 'simple',` through `claimKey() { return null; },`) verbatim as the object body. The `pickedArr` helper is line 64. (The original wrapper `simple: {` / closing `},` becomes `export const simple = {` / `};`.)

- [ ] **Step 2: Create `public/engine/types/topicgroup.js`**

```js
/* engine/types/topicgroup.js — "Chủ đề cho nhóm" unique-topic-per-group, group identity. */
import { PALETTE } from '../geometry.js';
import { esc } from '../helpers.js';

export const takenTopicSet = state =>
  new Set(Object.values((state && state.groups) || {}).map(a => a.topic));

export const topicgroup = {
  // …verbatim body from wheel-types.js lines 144-243…
};
```
Extraction detail: `takenTopicSet` is lines 140-141. The object body is lines 144-243 (`key: 'topicgroup',` through the closing of `panel`). The original `WHEEL_TYPES.topicgroup = {` / `};` becomes `export const topicgroup = {` / `};`.

- [ ] **Step 3: Create `public/engine/types/groupdiv.js`**

```js
/* engine/types/groupdiv.js — "Chia nhóm" people→groups, device identity, dup-name guard. */
import { esc, findDuplicate } from '../helpers.js';

const allMemberNames = state => {
  const m = (state && state.members) || {};
  return Object.values(m).flat();
};

export const groupdiv = {
  // …verbatim body from wheel-types.js lines 252-353…
};
```
Extraction detail: `allMemberNames` is lines 246-249. The object body is lines 252-353 (`key: 'groupdiv',` through the closing of `panel`). The original `WHEEL_TYPES.groupdiv = {` / `};` becomes `export const groupdiv = {` / `};`. Note `groupdiv` uses `findDuplicate` (in `confirmSpin`) and `esc` (imported); it does NOT use `PALETTE`.

- [ ] **Step 4: Syntax-check all three**

Run: `node --check public/engine/types/simple.js && node --check public/engine/types/topicgroup.js && node --check public/engine/types/groupdiv.js`
Expected: exit 0, no output.

- [ ] **Step 5: Commit**

```bash
git add public/engine/types/
git commit -m "refactor(engine): extract simple/topicgroup/groupdiv type modules

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `engine/registry.js` + `engine/index.js` — assembly + barrel

**Files:**
- Create: `public/engine/registry.js`
- Create: `public/engine/index.js`

**Interfaces:**
- Consumes: the three type modules; all leaf modules.
- Produces: `WHEEL_TYPES = { simple, topicgroup, groupdiv }` (registry); the barrel re-exporting the full public surface: `esc, deviceId, makeWheelId, stripVN, findDuplicate, PALETTE, landingRotation, discHtml, chime, burst, takenTopicSet, WHEEL_TYPES`.

- [ ] **Step 1: Create `public/engine/registry.js`**

```js
/* engine/registry.js — assembles the WHEEL_TYPES registry from the type modules.
   Add a new type = one module in ./types/ + one line here. */
import { simple } from './types/simple.js';
import { topicgroup } from './types/topicgroup.js';
import { groupdiv } from './types/groupdiv.js';

export const WHEEL_TYPES = { simple, topicgroup, groupdiv };
```

- [ ] **Step 2: Create `public/engine/index.js` (barrel)**

```js
/* engine/index.js — public surface barrel. Importers use this path; internal file layout can change behind it. */
export { esc, deviceId, makeWheelId, stripVN, findDuplicate } from './helpers.js';
export { PALETTE, landingRotation, discHtml } from './geometry.js';
export { chime, burst } from './celebration.js';
export { takenTopicSet } from './types/topicgroup.js';
export { WHEEL_TYPES } from './registry.js';
```

- [ ] **Step 3: Load-gate the barrel (Node)**

Create a temporary check file `tests/_barrel-smoke.mjs` with:

```js
import * as m from '../public/engine/index.js';
const need = ['esc','deviceId','makeWheelId','stripVN','findDuplicate','PALETTE','landingRotation','discHtml','chime','burst','takenTopicSet','WHEEL_TYPES'];
const missing = need.filter(k => typeof m[k] === 'undefined');
if (missing.length) { console.error('MISSING EXPORTS:', missing); process.exit(1); }
const types = Object.keys(m.WHEEL_TYPES).sort().join(',');
if (types !== 'groupdiv,simple,topicgroup') { console.error('WHEEL_TYPES keys:', types); process.exit(1); }
console.log('barrel OK:', need.length, 'exports, types =', types);
```

Run: `node tests/_barrel-smoke.mjs`
Expected: `barrel OK: 12 exports, types = groupdiv,simple,topicgroup`

- [ ] **Step 4: Remove the temporary smoke file**

Run: `rm tests/_barrel-smoke.mjs`
(The full suite in Task 6 is the durable gate; this throwaway just proves the barrel resolves before repointing consumers.)

- [ ] **Step 5: Commit**

```bash
git add public/engine/registry.js public/engine/index.js
git commit -m "refactor(engine): add registry + index barrel exposing the full public surface

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Switch over — repoint consumers, delete duplicates, full suite green

**Files:**
- Modify: `public/wheel.html:89`
- Modify: `tests/helpers.test.js:3`, `tests/geometry.test.js:3`, `tests/celebration.test.js:3`, `tests/dup.test.js:3`, `tests/simple-type.test.js:3`, `tests/topicgroup-type.test.js:3`, `tests/groupdiv-type.test.js:3`
- Delete: `wheel.html` (root), `wheel-types.js` (root), `public/wheel-types.js`, `group-wheel.html` (root)

**Interfaces:**
- Consumes: `public/engine/index.js` (Task 5).

- [ ] **Step 1: Repoint `public/wheel.html`**

Change line 89 from:
```js
import { WHEEL_TYPES, discHtml, esc, deviceId, burst, chime, landingRotation } from "./wheel-types.js";
```
to:
```js
import { WHEEL_TYPES, discHtml, esc, deviceId, burst, chime, landingRotation } from "./engine/index.js";
```
(Only the path changes; the named-import list is identical.)

- [ ] **Step 2: Repoint all 7 test files**

In each of `tests/helpers.test.js`, `tests/geometry.test.js`, `tests/celebration.test.js`, `tests/dup.test.js`, `tests/simple-type.test.js`, `tests/topicgroup-type.test.js`, `tests/groupdiv-type.test.js`, change the import path on line 3 from `'../wheel-types.js'` to `'../public/engine/index.js'`. The named imports on each line are unchanged.

Bulk command (verify after): 
```bash
cd /Users/bason/Documents/bason-labs/wheel-spin
sed -i '' "s#from '../wheel-types.js'#from '../public/engine/index.js'#" tests/*.js
grep -rn "wheel-types.js" tests/ ; echo "exit: $?"
```
Expected: no matches for `wheel-types.js` in `tests/` (grep exit 1).

- [ ] **Step 3: Delete the root duplicates and the old monolith**

```bash
cd /Users/bason/Documents/bason-labs/wheel-spin
git rm wheel.html wheel-types.js public/wheel-types.js group-wheel.html
```
Expected: 4 files staged for deletion. (`public/wheel.html`, `public/groups.html`, and the new `public/engine/*` remain.)

- [ ] **Step 4: Run the full unit suite**

Run: `npm test`
Expected: `# tests 36`, `# pass 36`, `# fail 0`. This proves every export resolves through the barrel and all bodies behave identically.

- [ ] **Step 5: Confirm no dangling references remain**

```bash
cd /Users/bason/Documents/bason-labs/wheel-spin
grep -rn "wheel-types" --include='*.html' --include='*.js' . | grep -v node_modules | grep -v docs/ ; echo "exit: $?"
```
Expected: no matches (exit 1) — nothing references the deleted monolith.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(engine): switch wheel.html + tests to engine/index.js barrel; delete monolith + root duplicates

public/ is now the single source of truth; no more root copies or cp step.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: README.md — site flow + architecture

**Files:**
- Create: `README.md`

**Interfaces:** none (documentation).

- [ ] **Step 1: Write `README.md`**

Author a developer-facing README (English) covering exactly these sections, accurate to the post-restructure code:

1. **Wheel Spin** — one paragraph: a Vietnamese, real-time (Firebase) spinning-wheel tool; Firebase project `wheel-spin-a6f34`; zero-dependency vanilla ESM static site served by Firebase Hosting from `public/`.
2. **Routes** — a table:
   | Path | File | What it is |
   |---|---|---|
   | `/` | `public/wheel.html` (rewrite) | Home: the 8-group / 13-topic `topicgroup` wheel (`wheels/home`) |
   | `/groups` | `public/groups.html` (rewrite) | The original standalone people-splitter |
   | `/wheel.html?w=<id>` | `public/wheel.html` | Any wheel by id |
   | `/admin` | `public/admin.html` | PIN-gated dashboard — **built in SP4 (not yet present)** |
3. **Data model** — `wheels/<id>/config` (`{ type, title, createdTs, …type-fields, theme? }`) and `wheels/<id>/state` (live draws, shape per type). Note the DB rules are open read/write (`database.rules.json`) — a deliberate no-auth choice; `/admin` will use a client-side PIN (not real security).
4. **Wheel-type registry** — types are data: each lives in `public/engine/types/<key>.js` and is wired in `public/engine/registry.js`. Adding a type = one module + one registry line. The current types: `simple` (Quay ngẫu nhiên), `groupdiv` (Chia nhóm), `topicgroup` (Chủ đề cho nhóm).
5. **Source layout** — a tree of `public/` and `public/engine/` matching the actual files (`helpers.js`, `geometry.js`, `celebration.js`, `registry.js`, `index.js`, `types/*.js`), plus `tests/`, `docs/`, `firebase.json`.
6. **Develop** — `npm test` (Node `node:test`, no install); `python3 -m http.server 8123` then open `http://localhost:8123/public/wheel.html?w=<id>` for a local check; note that `?seed=<type>` writes a demo config (dev only).
7. **Deploy** — `firebase deploy --only hosting` and `firebase deploy --only database` (run by a human); the `wheels/home` config; the `no-cache` headers in `firebase.json`.
8. **Admin & PIN** — one line: `/admin` is PIN-gated client-side; the PIN deters casual tampering only.

- [ ] **Step 2: Check the README's file tree matches reality**

Run: `ls public/ public/engine public/engine/types`
Expected output to reconcile against the README's "Source layout" section — the tree in the README must list exactly these files (no more, no fewer): `public/` → `wheel.html`, `groups.html`, `engine/`; `public/engine/` → `helpers.js`, `geometry.js`, `celebration.js`, `registry.js`, `index.js`, `types/`; `public/engine/types/` → `simple.js`, `topicgroup.js`, `groupdiv.js`. Fix the README if it drifts.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add README — site flow, routes, data model, type registry, dev/deploy

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Zero-write smoke verification (Playwright, no Firebase writes)

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Serve the repo locally**

Run (background): `cd /Users/bason/Documents/bason-labs/wheel-spin && python3 -m http.server 8123`

- [ ] **Step 2: Module-load + render check (no Firebase contact)**

Navigate the Playwright MCP browser to `http://localhost:8123/public/groups.html` (a real served page as a host context), then `page.evaluate`:
```js
async () => {
  const m = await import('/public/engine/index.js?v=' + Date.now());
  const segs = [
    { label: 'A', color: '#10b981', dark: '#059669', dim: false },
    { label: 'B', color: '#8b5cf6', dark: '#7c3aed', dim: true },
    { label: 'C', color: '#f59e0b', dark: '#d97706', dim: false },
  ];
  const div = document.createElement('div'); div.innerHTML = m.discHtml(segs, 0);
  return {
    types: Object.keys(m.WHEEL_TYPES).sort().join(','),
    labelCount: div.querySelectorAll('.label').length,
    hasDiscBg: /conic-gradient/.test(div.querySelector('.disc').getAttribute('style')),
    escOk: m.esc('<x>') === '&lt;x&gt;',
  };
}
```
Expected: `{ types: 'groupdiv,simple,topicgroup', labelCount: 3, hasDiscBg: true, escOk: true }`. This proves the split modules resolve and render with zero Firebase contact.

- [ ] **Step 3: Page-load console check (read-only)**

Navigate to `http://localhost:8123/public/wheel.html?w=sp3smoke-doesnotexist` (a fresh id, **no `seed`**). Confirm the page loads, shows the "Vòng quay chưa được thiết lập" message (a Firebase *read* of a non-existent config — never a write), and the console has no errors other than a `favicon.ico` 404 and no module/import (404 or MIME-type) errors. Then navigate to `http://localhost:8123/public/groups.html` and confirm it renders the original splitter with no console errors beyond favicon.

- [ ] **Step 4: Stop the server**

Stop the background `python3 -m http.server` process.

- [ ] **Step 5: Final confirmation (no commit needed — verification task)**

Confirm: `npm test` is 36/36; `public/engine/` holds the 8 modules; no root `wheel-types.js`/`wheel.html`/`group-wheel.html`; `README.md` exists; nothing was deployed and no production RTDB write occurred.

---

## Notes for SP4 / SP5

- The barrel `public/engine/index.js` is the stable import path. SP5's `custom` type adds `public/engine/types/custom.js` + one line in `registry.js`; the barrel may re-export any new helper.
- SP4 adds `public/admin.html` and the `/admin` rewrite to `firebase.json`, removes the `?seed=` dev path from `public/wheel.html`, and introduces the `color`/`segments`/`theme` field-kind renderers.
- README's `/admin` row is marked "built in SP4" — update it to live when SP4 lands.
