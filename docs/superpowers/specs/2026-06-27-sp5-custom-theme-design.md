# SP5 — Custom Type + Per-Wheel Theming — Design

**Date:** 2026-06-27
**Status:** Approved (per umbrella) — final sub-project of the flexible-config arc
**Umbrella:** `2026-06-27-admin-flexible-config-design.md` · **Builds on:** SP3 (modules) + SP4 (admin).

## Goal

Two flexible-config features: a **`custom`** wheel type (hand-defined labeled/colored
segments with optional weights, host-screen picker) and an optional **per-wheel theme**
(accent colour, page background, sound on/off) that any wheel can carry. The admin gains
the `color`, `segments`, and `theme` form controls; the participant page applies a wheel's
theme. Closes the arc. **No Firebase deploy / no production writes** (verify offline).

## New wheel type — `custom`  (`public/engine/types/custom.js`)

```
key: 'custom'   name: 'Tùy chỉnh'   identity: 'none'
config: { segments: [{ label, color, weight? }], removeAfterPick: bool }
state:  { picked: number[] }
```
- A host-screen picker like `simple`, but segments are hand-defined. `weight` is an optional
  integer ≥ 1 biasing the random pick (default 1).
- `defaultConfig()` → 3 segments using `PALETTE[0..2]` colours, `removeAfterPick: true`.
- `configFields`: `[{ kind:'segments', key:'segments', label:'Các mục' }, { kind:'bool', key:'removeAfterPick', label:'Không lặp lại kết quả đã quay' }]`.
- `validate`: at least one segment with a non-empty label; every segment colour matches
  `^#[0-9a-fA-F]{6}$`; every present `weight` is an integer ≥ 1.
- `segments(config,state)` → `{ label, color, dark: darken(color), dim: removeAfterPick && picked.includes(i) }`.
- `availableIndices` / `canSpin` / `resultView` / `panel` / `claimKey` mirror `simple`.
- `assign(cur,{config})`: among available indices, pick **weighted** by `weight` (default 1);
  push to `cur.picked`; `{reason:'full'}` when none left. (`darken` is imported from `adminforms.js`? No — keep a tiny local `darken` in `geometry.js` so types and forms share it.)

Registered with one line in `registry.js`; the barrel re-exports nothing new (the type is
reached via `WHEEL_TYPES`).

## Shared `darken` (move to `geometry.js`)

`darken(hex)` currently lives in `adminforms.js`. Move it to `public/engine/geometry.js`
(export) and have `adminforms.js` import it, so `custom.js` (and any type) can derive a
segment's `dark` shade without depending on the admin module. Behaviour unchanged.

## Per-wheel theme

Optional `config.theme = { accent?: hex, bg?: hex, sound?: bool }` on ANY wheel.

**Participant (`wheel.html`):** after a config loads, `applyTheme(config.theme)`:
- `accent` → `document.documentElement.style.setProperty('--gold', accent)` (recolours the
  spin button, focus rings, hints).
- `bg` → set `document.body.style.background` to a themed gradient built from `bg` (+ a soft
  accent glow). Absent → today's default background is untouched.
- `sound` → a module flag `soundOn = theme.sound !== false`; `doSpin` calls `chime` only
  when `soundOn`. Default (no theme) keeps sound on.
- Only hex-valid `accent`/`bg` are applied (defensive against hand-edited configs).

Nothing about segment rendering or the spin transaction changes; existing wheels with no
`theme` look and behave exactly as before.

## Admin form controls (`adminforms.js`)

Add three field kinds + an always-present theme section:
- `color` — `<input type="color" data-field=key>`; read as `.value`. (Not used by the
  built-in types yet, but completes the kind set for future types.)
- `segments` — dynamic rows `{ color, label, weight }`: `<input type="color">` +
  `<input type="text" class="seg-label">` + `<input type="number" min="1" class="seg-weight">`
  + remove; `data-segment-row`. Read → `[{ label, color, weight }]` where `weight` is the
  parsed number when ≥ 1 (omit the key when blank/1 to keep configs clean), dropping rows
  with an empty label. An add button appends a `segmentRow`.
- **Theme section** (always appended after the type fields, collapsible "Giao diện"):
  accent `<input type="color">`, bg `<input type="color">`, and a sound `<input type="checkbox">`
  (checked by default). `readConfigForm` assembles `out.theme = { accent, bg, sound }`,
  **omitting** `accent`/`bg` when left at a neutral "unset" sentinel and including `sound`
  only when unchecked (so a plain wheel saves no `theme`, preserving the default look).

`renderConfigForm`/`readConfigForm` dispatch the new kinds the same way as the existing
five; the theme section is handled outside the `configFields` loop (it is cross-type, like
`title`). `admin.html`'s delegated editor handler gains `data-segment-row` add/remove
(alongside list/groups).

## Files

- **Create:** `public/engine/types/custom.js`; `tests/custom-type.test.js`.
- **Modify:** `public/engine/registry.js` (+`custom`); `public/engine/geometry.js`
  (export `darken`); `public/engine/adminforms.js` (move-in `darken` import; `color`/
  `segments`/`theme` kinds + `segmentRow` export; theme read/write); `public/admin.html`
  (segment-row add/remove delegation); `public/wheel.html` (`applyTheme` + sound gating);
  `tests/adminforms.test.js` (new-kind cases); `README.md` (custom type + theming row).

## Testing (offline; NO production writes)

- **Unit (`node:test`):** `custom` — `defaultConfig`/`validate` (empty, bad hex, bad weight);
  weighted `assign` (a weight-heavy segment is chosen with the expected bias over many runs
  using an injected RNG; never returns a removed index when `removeAfterPick`; `{reason:'full'}`
  on exhaustion); `segments` dim. `adminforms` — `segmentRow`/`segments` render+attributes;
  `color` kind; theme read assembles `{accent,bg,sound}` and omits unset; `darken` still
  works from its new home.
- **Browser round-trip (Playwright + injected store, zero Firebase):** in `admin.html`,
  create a `custom` wheel (add/remove segment rows, set a weight, set an accent+bg theme,
  toggle sound off) → Save → assert the saved config has the segments + `theme`; feed it to
  `WHEEL_TYPES.custom.segments`/`discHtml` and assert it renders N labels; load the same
  config object through a small in-page `applyTheme` check to confirm `--gold` and the body
  background change and `soundOn` is false. Confirm the theme section round-trips for a
  `topicgroup` wheel too (theme is cross-type).
- Full unit suite green; final adversarial verification workflow.

## Acceptance

An admin can create a `custom` wheel with hand-defined weighted, coloured segments and give
any wheel an accent/background/sound theme; a participant page renders the custom wheel and
applies the theme; wheels without a theme are visually unchanged; all unit tests pass;
verified offline with no production writes. This completes the flexible-config arc.
