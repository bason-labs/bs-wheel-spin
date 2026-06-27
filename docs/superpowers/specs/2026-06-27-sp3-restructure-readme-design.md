# SP3 — Source Restructure + README — Design

**Date:** 2026-06-27
**Status:** Approved pending user review
**Umbrella:** `2026-06-27-admin-flexible-config-design.md` (read first — contracts there are binding)

## Goal

A mechanical, behavior-preserving restructure: split the 404-line `wheel-types.js`
monolith into small single-responsibility ES modules under `public/engine/`, make
`public/` the single source of truth (delete the root duplicates), repoint `wheel.html`
and all tests, and write a README documenting the site flow. **No behavior change. No
Firebase deploy.** Acceptance bar: all 36 unit tests stay green and the live pages
render identically via a local server.

## Scope

**In:** create `public/engine/*` modules; delete root `wheel.html`, `wheel-types.js`,
`group-wheel.html`; repoint `wheel.html`'s import and all 7 test imports; write
`README.md`; verify via `node --test` + local `python3 -m http.server` + Playwright
smoke.

**Out:** any wheel-type behavior change; `admin.html` / `/admin` rewrite (SP4); the
`custom` type or theming (SP5); removing the `?seed=` dev path (SP4); any Firebase
deploy or production data write.

## Files

- **Create:** `public/engine/helpers.js`, `public/engine/geometry.js`,
  `public/engine/celebration.js`, `public/engine/registry.js`,
  `public/engine/types/simple.js`, `public/engine/types/topicgroup.js`,
  `public/engine/types/groupdiv.js`, `public/engine/index.js`, `README.md`.
- **Modify:** `public/wheel.html` (import path → `./engine/index.js`); all of
  `tests/*.js` (import path → `../public/engine/index.js`).
- **Delete:** `wheel.html` (root), `wheel-types.js` (root), `public/wheel-types.js`,
  `group-wheel.html` (root). `public/groups.html` remains (canonical splitter; standalone).
- **Unchanged:** `firebase.json`, `database.rules.json`, `.firebaserc`, `package.json`,
  `docs/**`, `public/groups.html`.

## Exact Module Mapping (from current `wheel-types.js` exports)

| Current export (in `wheel-types.js`) | New home |
|---|---|
| `esc`, `deviceId`, `makeWheelId`, `stripVN`, `findDuplicate` | `engine/helpers.js` |
| `PALETTE`, `landingRotation`, `discHtml` | `engine/geometry.js` (`discHtml` imports `esc` from `./helpers.js`) |
| `chime`, `burst` | `engine/celebration.js` |
| `WHEEL_TYPES.simple` (the object literal) | `engine/types/simple.js` |
| `WHEEL_TYPES.topicgroup` + `takenTopicSet` | `engine/types/topicgroup.js` |
| `WHEEL_TYPES.groupdiv` (+ local `allMemberNames`) | `engine/types/groupdiv.js` |
| `WHEEL_TYPES` assembly | `engine/registry.js` |

The function/method **bodies are copied verbatim** — only their module location and
`import`/`export` wiring change. No logic edits.

### Module contents

- **`engine/helpers.js`** — `export const esc`, `export function deviceId`,
  `export function makeWheelId`, `export const stripVN`, `export function findDuplicate`.
  No imports; no top-level browser globals (localStorage only inside try/catch bodies).
- **`engine/geometry.js`** — `import { esc } from './helpers.js';` then
  `export const PALETTE`, `export function landingRotation`, `export function discHtml`.
- **`engine/celebration.js`** — `export function chime`, `export function burst`
  (Node-safe guards intact).
- **`engine/types/simple.js`** —
  `import { PALETTE } from '../geometry.js'; import { esc } from '../helpers.js';`
  Move the `pickedArr` local helper here. `export const simple = { … };`
- **`engine/types/topicgroup.js`** —
  `import { PALETTE } from '../geometry.js'; import { esc } from '../helpers.js';`
  Keep `takenTopicSet` here: `export const takenTopicSet = …;` and
  `export const topicgroup = { … };`
- **`engine/types/groupdiv.js`** —
  `import { esc, findDuplicate } from '../helpers.js';` Move the `allMemberNames` local
  helper here. `export const groupdiv = { … };`
- **`engine/registry.js`** —
  `import { simple } from './types/simple.js';`
  `import { topicgroup } from './types/topicgroup.js';`
  `import { groupdiv } from './types/groupdiv.js';`
  `export const WHEEL_TYPES = { simple, topicgroup, groupdiv };`
- **`engine/index.js`** — barrel re-exporting the full public surface so importers are
  decoupled from internal file layout:
  ```js
  export { esc, deviceId, makeWheelId, stripVN, findDuplicate } from './helpers.js';
  export { PALETTE, landingRotation, discHtml } from './geometry.js';
  export { chime, burst } from './celebration.js';
  export { takenTopicSet } from './types/topicgroup.js';
  export { WHEEL_TYPES } from './registry.js';
  ```

### Consumer repoint
- `public/wheel.html` line 89: change
  `from "./wheel-types.js"` → `from "./engine/index.js"` (import list unchanged:
  `{ WHEEL_TYPES, discHtml, esc, deviceId, burst, chime, landingRotation }`).
- Each `tests/*.js`: change `from '../wheel-types.js'` →
  `from '../public/engine/index.js'` (named imports unchanged). Affects all 7 files:
  helpers, geometry, celebration, dup, simple-type, topicgroup-type, groupdiv-type.

## README.md (repo root)

Authored to the umbrella's README outline. Concretely includes: project summary; a
routes table (`/`, `/groups`, `/wheel.html?w=<id>`, and `/admin` noted as SP4);
the Firebase data model (`wheels/<id>/config` + `/state`) and the open-rules caveat;
the type-registry explanation (a type = one module in `engine/types/` + a `registry.js`
line); the `public/engine/` layout map; develop commands (`npm test`, `python3 -m
http.server 8123`); deploy commands (`firebase deploy --only hosting|database`, run by
the user) and the no-cache header note; and the PIN-admin note. Vietnamese-facing app,
English README (developer doc).

## Error Handling / Risks

- **Native ESM path resolution:** `wheel.html` served at `/` (via rewrite) imports
  `./engine/index.js` → resolves to `/engine/index.js`; `index.js` imports
  `./helpers.js` → `/engine/helpers.js`; types import `../geometry.js` →
  `/engine/geometry.js`. All resolve under `public/`. Verify by loading in a browser.
- **Node test imports:** `tests/*.js` import `../public/engine/index.js`; Node resolves
  the relative path and follows the barrel's re-exports. `package.json` already sets
  `"type": "module"`.
- **No-cache headers:** the existing `**/*.@(js|html)` glob already covers
  `public/engine/**/*.js`, so the new modules are not stage-cached (relevant only when
  the user later deploys).
- **Behavior drift:** mitigated by verbatim body copies + the full unit suite as a
  regression gate + a Playwright render smoke.

## Testing

- **Unit:** `npm test` → all **36** existing tests pass unchanged (only their import
  path changed). This is the primary regression gate for "no behavior change."
- **Local server smoke (Playwright, ZERO Firebase writes):** serve the repo with
  `python3 -m http.server 8123`. Two checks, neither writes to production:
  1. **Module-load + render (no Firebase at all):** load any served page, then in the
     browser `page.evaluate` dynamically `import('/public/engine/index.js')`, assert the
     barrel exposes `WHEEL_TYPES` with keys `simple`/`groupdiv`/`topicgroup` and that
     `discHtml(segs, 0)` returns markup with one `.label` per segment. This proves the
     split modules resolve and behave, with no network/Firebase contact.
  2. **Page-load smoke (read-only):** load `http://localhost:8123/public/wheel.html?w=<fresh-id>`
     (no `seed`) and `http://localhost:8123/public/groups.html`; assert no console errors
     other than a favicon 404 and no module/import (404 or MIME) errors. A fresh `?w` with
     no seed renders the "chưa được thiết lập" message — a Firebase *read*, never a write.
  Do **not** use the `?seed=` path during SP3 verification (it writes a config to
  production RTDB, which is disallowed until the user requests a deploy).

## Acceptance

`public/` is the only source of code (no root duplicates, no `cp` step); `wheel-types.js`
is gone, replaced by `public/engine/*` focused modules; `wheel.html` and all tests import
from the new paths; `npm test` is 36/36; the participant pages render identically via a
local server; `README.md` documents the site flow. Nothing deployed.
