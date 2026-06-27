# Admin + Restructure + Flexible Config — Umbrella Design

**Date:** 2026-06-27
**Status:** Approved (umbrella)

The shared design for the next arc of the wheel engine: a source restructure, a
README, and a flexible PIN-gated `/admin` that can manage every wheel type, add
fully-custom wheels, and theme each wheel. Splits into three sequential sub-projects,
each its own spec → plan → implementation. Contracts fixed here are binding on all
three.

## Goals

1. **Restructure** the source to remove the root↔`public/` duplication and break the
   404-line `wheel-types.js` monolith into small, single-responsibility ES modules.
2. **README** documenting the site flow (routes, data model, type registry, run/deploy).
3. **Flexible `/admin`**: a PIN-gated dashboard to create / edit / delete / reset wheels
   of any registered type, add **custom** wheels (hand-defined segments), and **theme**
   each wheel — all without code.

## Context

The app is a zero-dependency, vanilla-JS, Firebase-Hosting static site. Today:
`wheel.html` (generic participant page) + `wheel-types.js` (the engine: helpers,
geometry, palette, 3 wheel types, celebration, name-matching) exist in **both** repo
root and `public/`, kept in sync by manual `cp` (a maintenance smell). The original
people-splitter is the standalone `group-wheel.html` (root) → `public/groups.html`.
Firebase serves `public/`. Three wheel types exist: `simple`, `groupdiv`, `topicgroup`.

## Global Constraints (bind all three sub-projects)

- **NO Firebase deploys (hosting or database) until the user explicitly requests one.**
  Implementation is code + local `node --test` + local `python3 -m http.server` smoke
  checks only. Do not run `firebase deploy`. Do not write to production RTDB.
- **Zero runtime dependencies**, vanilla ES modules, no bundler, no build step. Modules
  are imported natively by the browser over HTTP and by Node for tests.
- **UI language: Vietnamese**, consistent with the existing pages.
- **`public/` is the single source of truth** after SP3 — no root duplicates, no `cp`.
- **Backward-compatible data model**: existing `wheels/<id>/{config,state}` records keep
  working; new fields (`theme`, custom `segments`) are optional and additive.
- **Frozen runtime contract**: the `WHEEL_TYPES` entry interface (from
  `2026-06-26-wheel-engine-design.md`, incl. the identity addendum) is unchanged. New
  work ADDS type entries, field kinds, and an optional theme layer — it does not change
  existing method signatures.

## Target Source Layout (after SP3)

```
public/
  wheel.html          # generic participant page   (/, /wheel.html?w=…)
  groups.html         # original splitter           (/groups)   [standalone, no engine import]
  admin.html          # dashboard                   (/admin, PIN-gated)   [added in SP4]
  engine/
    index.js          # barrel — re-exports the public surface (importers use this)
    helpers.js        # esc, deviceId, makeWheelId, stripVN, findDuplicate
    geometry.js       # PALETTE, landingRotation, discHtml
    celebration.js    # chime, burst
    registry.js       # assembles WHEEL_TYPES from the type modules
    types/
      simple.js
      groupdiv.js
      topicgroup.js
      custom.js        # added in SP5
tests/                # node:test; import ../public/engine/index.js
README.md             # added in SP3
firebase.json         # /admin rewrite added in SP4 (not SP3 — would 404 without admin.html)
```

Root `wheel.html`, `wheel-types.js`, `group-wheel.html` are deleted in SP3.

## Module Boundaries & Dependencies (SP3)

- `helpers.js` — pure string/id/name utilities. No imports. (`esc`, `deviceId`,
  `makeWheelId`, `stripVN`, `findDuplicate`.)
- `geometry.js` — `PALETTE` (color pairs), `landingRotation`, `discHtml`. Imports `esc`
  from `helpers.js`. No browser globals at module top level.
- `celebration.js` — `chime`, `burst`. Defensive guards so Node import never throws.
- `types/simple.js`, `types/topicgroup.js`, `types/groupdiv.js` — one `WHEEL_TYPES`
  entry each, default-exported (or named). Import `PALETTE` from `geometry.js` and
  `esc`/`findDuplicate` from `helpers.js` as needed. `takenTopicSet` lives in
  `topicgroup.js` as a local helper (re-exported by the barrel for parity).
- `registry.js` — imports the three type objects and exports
  `WHEEL_TYPES = { simple, groupdiv, topicgroup }`.
- `index.js` — re-exports the full public surface: `esc, deviceId, makeWheelId,
  stripVN, findDuplicate, PALETTE, landingRotation, discHtml, chime, burst,
  WHEEL_TYPES, takenTopicSet`.

Consumers: `wheel.html` imports from `./engine/index.js`; every test imports from
`../public/engine/index.js` (single path substitution from today's `../wheel-types.js`).

## Decomposition (three sequential sub-projects)

### SP3 — Restructure + README  (spec: `2026-06-27-sp3-restructure-readme-design.md`)
Mechanical, behavior-preserving: split the monolith into `public/engine/*`, delete the
root duplicates, repoint `wheel.html` + all tests, write the README. Acceptance: all 36
unit tests green, `/`, `/groups`, `/wheel.html?w=…&seed=…` still render identically via
local server. No Firebase deploy.

### SP4 — Admin core  (spec: `2026-06-27-sp4-admin-core-design.md`, written later)
PIN-gated `public/admin.html` (+ `/admin` rewrite). A generic form renderer driven by
each type's `configFields` + `validate`. Dashboard over `wheels/`: list, create (pick
type → form → Save), edit (incl. the `home` wheel), delete, copy participant link, and
**Reset draws** (clear `state` only). Removes the temporary `?seed=` dev path from
`wheel.html`. Resolves deferred minors: hex-color validation; `resultView`/`panel`
bounds checks; `simple.assign` DRY.

### SP5 — Custom type + theming  (spec: `2026-06-27-sp5-custom-theme-design.md`, later)
A `custom` wheel type and a per-wheel theme layer (below). Admin gains a **segments
editor** and a **theme section**.

## Flexible-Config Contracts (frozen here; implemented in SP4/SP5)

### Admin form field kinds (`configFields`)
The existing FieldSpec kinds are `text`, `number`, `bool`, `list`, `groups`. SP4/SP5 add:
- `color` — a single hex color input (validated `^#[0-9a-fA-F]{6}$`).
- `segments` — dynamic rows of `{ label, color, weight? }` for the custom type.
- `theme` — the per-wheel theme sub-form (renders accent + bg color pickers + sound toggle).
The admin renderer handles all kinds generically; types only declare `configFields`.

### `custom` wheel type (SP5)
```
key: 'custom'   name: 'Tùy chỉnh'   identity: 'none'
config: { segments: [{ label, color, weight? }], removeAfterPick: bool }
state:  { picked: number[] }
```
A host-screen picker like `simple`, but segments are hand-defined (label + color, with
an optional integer `weight` ≥ 1 biasing the random pick; default weight 1).
`removeAfterPick` permanently removes a drawn segment (server-side in `assign`, like
`simple`). Reuses `simple`'s result/panel patterns. Hex colors validated by `validate`.

### Per-wheel theme (SP5)
Optional `config.theme = { accent?: hex, bg?: hex, sound?: bool }`.
- `accent` — overrides the gold accent (button gradient, focus rings) via a CSS variable.
- `bg` — overrides the page background base color via a CSS variable.
- `sound` — when `false`, the spin `chime()` is suppressed.
Absent fields fall back to today's defaults, so existing wheels are visually unchanged.
`wheel.html` reads `config.theme` and sets CSS custom properties on `:root`/`body`;
nothing about segment rendering or the spin transaction changes.

## README Outline (SP3)
1. What the site is (one paragraph).
2. Routes: `/` (home topic wheel), `/groups` (original splitter), `/wheel.html?w=<id>`
   (any wheel), `/admin` (PIN-gated dashboard — noted as built in SP4).
3. Firebase data model: `wheels/<id>/config` (type + fields + optional theme) and
   `/state` (live draws); the open DB rules and what that implies.
4. The wheel-type registry: types are data; adding a type = one module under
   `engine/types/` + a registry line.
5. Develop: `npm test` (Node `node:test`), `python3 -m http.server` for a local server,
   the file layout map.
6. Deploy: `firebase deploy --only hosting` / `--only database` (run by the user), the
   `wheels/home` config, the no-cache headers.
7. Admin & PIN note.

## Testing Strategy (all sub-projects)
- Pure-function unit tests under `tests/` (Node `node:test`, zero deps) for engine
  modules, the field renderer's pure parts, `validate`, custom-type pick logic, and
  theme-to-CSS mapping.
- Playwright (local `http.server`, fresh `?w=` room, `?seed=`) for render/spin/lock and,
  in SP4/SP5, admin create→participant round-trip and theme application.
- No production Firebase writes during automated checks; use throwaway wheel ids.

## Cross-Cutting Decisions (resolved in brainstorming)
- Restructure: **single `public/` + native ESM, no build, zero-dep.**
- Admin scope: **everything** — manage 3 types + custom wheel + per-wheel theme.
- Admin access: **client-side PIN gate** (UX deterrent; DB stays open — not real security).
- Build order: **SP3 → SP4 → SP5** (foundation, then admin core, then custom+theme).
- **No Firebase deploys until the user asks.**
