# SP4 — Admin Core (PIN-gated dashboard) — Design

**Date:** 2026-06-27
**Status:** Approved pending user review
**Umbrella:** `2026-06-27-admin-flexible-config-design.md` (read first — contracts there are binding)
**Builds on:** SP3 (the `public/engine/*` modules + barrel).

## Goal

A PIN-gated `/admin` dashboard that manages every wheel without code: list all wheels,
create one of any registered type via a form generated from that type's `configFields`,
edit (including the `home` wheel), delete, copy the participant link, and **reset draws**.
Removes the temporary `?seed=` dev path from `wheel.html`. The participant runtime
contract is unchanged — admin only reads/writes the same `wheels/<id>/config` and clears
`wheels/<id>/state` that already exist.

## Scope

**In:** `public/admin.html` (the dashboard, PIN gate, Firebase CRUD); a new pure module
`public/engine/adminforms.js` (form rendering + form→config reading for the field kinds
`text`/`number`/`bool`/`list`/`groups`); the `/admin` Hosting rewrite; removal of the
`?seed=` path from `wheel.html`; an opt-in `?emu=1` emulator hook in `admin.html` +
`wheel.html` for offline verification; the small deferred-minor fixes that become
reachable once configs are editable (hex-format check in `validate`; out-of-bounds
guards in `simple`/`topicgroup` render). README `/admin` row flipped to live.

**Out:** the `custom` wheel type and per-wheel theming (SP5); the new field kinds
`color`/`segments`/`theme` (SP5); any Firebase deploy or production RTDB write; real auth.

## Files

- **Create:** `public/admin.html`, `public/engine/adminforms.js`, `tests/adminforms.test.js`.
- **Modify:** `public/wheel.html` (delete the `?seed=` block; add the `?emu=1` hook),
  `firebase.json` (add `/admin` rewrite + an `emulators.database` block),
  `public/engine/types/simple.js` + `public/engine/types/topicgroup.js` (render guards +
  hex check in `validate`), `README.md` (`/admin` row → live; note local emulator).
- **Unchanged:** the runtime contract, `database.rules.json` (rules already cover `wheels/$id`),
  `groups.html`, the other engine modules.

## PIN gate (client-side)

- An editable constant at the top of `admin.html`: `const ADMIN_PIN = '2468';` (the user
  changes it like the topic placeholders). It is **not** real security — the DB rules stay
  open; the PIN only hides the dashboard from casual visitors and deters accidental edits.
- On load, `admin.html` shows a PIN prompt screen (a single input + "Mở khoá" button). On
  a correct match it reveals the dashboard and remembers it in `sessionStorage`
  (`adminUnlocked=1`) so a reload within the tab session skips the prompt. Wrong PIN →
  an inline error, no reveal. There is no lockout (it is cosmetic).

## `public/engine/adminforms.js` (pure, testable)

No Firebase, no top-level DOM. Exports:

- `renderConfigForm(typeEntry, config) -> htmlString` — renders the common **Title** field
  plus one control group per `typeEntry.configFields` entry, pre-filled from `config`.
- `readConfigForm(rootEl, typeEntry) -> config` — reads the rendered controls back into a
  config object: `{ type: typeEntry.key, title, …fields }` (no `createdTs` — the caller
  stamps that on create).
- Internal per-kind renderers/readers for the five kinds, dispatched by `field.kind`:
  - `text` → `<input type="text">`
  - `number` → `<input type="number" min=… >` (read as Number)
  - `bool` → `<input type="checkbox">` (read as boolean)
  - `list` → a dynamic list of `<input type="text">` rows with add/remove buttons (read as
    a trimmed string array, dropping empty rows)
  - `groups` → dynamic rows, each `{ name: <text>, color: <input type="color"> }` with
    add/remove; read as `[{ key, name, color, dark }]` where `key` is `g1…gN` (assigned by
    row order) and `dark` is derived from `color` via a fixed `darken(hex)` helper (so the
    existing `{key,name,color,dark}` group shape is produced). `<input type="color">` always
    yields a valid `#rrggbb`, so group colors are inherently sanitized.

The module is unit-tested in Node for the pure pieces and exercised in a real browser DOM
(via Playwright `page.evaluate`) for the render→fill→read round-trip.

## `public/admin.html` behavior

Mirrors `wheel.html`'s Firebase setup (same `firebaseConfig`, `initializeApp`,
`getDatabase`). Imports `WHEEL_TYPES` from `./engine/index.js` and the form helpers from
`./engine/adminforms.js`. A thin store layer wraps Firebase:

```
listWheels(cb):   onValue(ref(db,'wheels'), s => cb(s.val() || {}))
getConfig(id):    get(ref(db,`wheels/${id}/config`)).then(s => s.val())
saveConfig(id,c): set(ref(db,`wheels/${id}/config`), c)
resetDraws(id):   remove(ref(db,`wheels/${id}/state`))
deleteWheel(id):  remove(ref(db,`wheels/${id}`))
```
(`remove` is added to the firebase-database import list.)

**Dashboard:** subscribes via `listWheels`. For each wheel id it shows a card: title, a
type badge (`WHEEL_TYPES[type].name`, or "loại không hỗ trợ" if unknown), the participant
link `wheel.html?w=<id>` with a **Copy** button, and **Sửa** (edit) / **Xoá** (delete) /
**Reset lượt** (reset draws) actions. A **"＋ Tạo vòng quay"** button opens the create flow.
Delete and Reset use a `confirm()` guard. The `home` wheel appears in the list like any
other and is editable.

**Create flow:** pick a type (a small list of `WHEEL_TYPES` with their `name`) → render the
form from `defaultConfig()` → Save runs `WHEEL_TYPES[type].validate(config)`; on error show
the message inline; on success `saveConfig(makeWheelId(), { ...config, type, createdTs: Date.now() })`
and return to the dashboard.

**Edit flow:** load the wheel's `config`, render the form pre-filled, Save validates and
`saveConfig(id, { ...config, type, createdTs })` (preserving the original `createdTs`).
Note: editing structural fields (`groups`/`topics`/`options`) after draws exist can desync
`state` (which references positional `g1…gN` keys / indices). The Edit screen shows a small
warning when that wheel already has `state`, suggesting **Reset lượt** after a structural
change; SP4 does not auto-migrate state.

**Errors:** unknown `config.type` → card shows a disabled "loại không hỗ trợ" note (no edit
form). Network/transaction errors → a non-blocking inline message. Firebase-not-configured
sentinel → the same setup card pattern `wheel.html` uses.

**Emulator hook (verification only):** if `?emu=1` is present, after `getDatabase` call
`connectDatabaseEmulator(db, '127.0.0.1', 9000)` (dynamically imported). Production
(`wheel-spin-a6f34.web.app`) never passes `?emu=1`, so it always uses real Firebase. The
same opt-in hook is added to `wheel.html` so a test can drive admin→participant entirely
against the local emulator.

## `wheel.html` changes

1. **Remove the `?seed=` dev path** (the `SEED`/`SEED_TITLES` block in `startApp`) — the
   admin page is now the way to create wheels. The `const SEED = …` line and the seed block
   are deleted.
2. **Add the `?emu=1` hook** (same guarded `connectDatabaseEmulator` block) for offline tests.

## Deferred-minor fixes (now reachable because configs become editable)

- **Out-of-bounds render guard:** `simple.resultView`/`panel` index `config.options[i]`; if
  an edit shortens `options` after a pick, `i` can exceed the array. Guard with
  `config.options[i] ?? '?'` (mirrors `topicgroup`'s existing `?? '?'`). These edits change
  those two methods' output only in the out-of-bounds case (otherwise byte-identical).
- **Hex-format check in `validate`:** the `groups` validators additionally reject a group
  whose `color`/`dark` is not `^#[0-9a-fA-F]{6}$`. Defense-in-depth for hand-edited configs;
  the admin UI's `<input type="color">` already only emits valid hex. (Full render-path color
  sanitization is noted as possible SP5 hardening; out of SP4 scope given the open DB rules.)

## firebase.json

- Add a rewrite: `{ "source": "/admin", "destination": "/admin.html" }` (place it before the
  `/` catch-all). The `**/*.@(js|html)` no-cache header already covers `admin.html` and the
  new module.
- Add an `emulators` block so `firebase emulators:start --only database` uses a known port:
  `"emulators": { "database": { "port": 9000 }, "ui": { "enabled": false } }`.

## Testing (NO production writes — local only)

1. **Unit (`node:test`, pure):** `tests/adminforms.test.js` —
   - `renderConfigForm` emits a Title field + the right control per kind for each of the 3
     types (assert on the HTML string: input types, labels, pre-filled values, list/group
     rows matching the config).
   - `darken(hex)` produces a valid `#rrggbb` darker shade.
   - the `groups` reader's key assignment (`g1…gN` by order) and `validate` hex check.
   - Existing per-type `validate` tests still pass; add cases for the new hex rejection and
     the `simple` out-of-bounds render guard.
2. **Browser form round-trip (Playwright, NO Firebase):** serve locally; in a page,
   `import('/public/engine/adminforms.js')`, render each type's form into a detached DOM,
   programmatically fill the inputs, `readConfigForm` back, and assert the resulting config
   deep-equals the intended config and `WHEEL_TYPES[type].validate(it)` is null. Proves the
   render→fill→read loop in a real DOM with zero Firebase contact.
3. **Emulator round-trip (Playwright + local RTDB emulator, NO production):** start
   `firebase emulators:start --only database` (Java 17 present); drive `admin.html?emu=1`:
   PIN-unlock, create a `topicgroup` wheel, confirm it appears in the list; open
   `wheel.html?w=<that id>&emu=1` and confirm it renders the configured wheel; back in admin,
   edit the title and confirm the participant reflects it; Reset draws and confirm cleared;
   Delete and confirm it disappears. All data lives in the local emulator — production is
   never touched. Stop the emulator after.
4. **PIN gate:** Playwright — wrong PIN keeps the dashboard hidden; correct PIN reveals it
   and a reload (same tab session) stays unlocked.

The full unit suite must stay green; the emulator/Playwright checks confirm the integration
offline. No `firebase deploy`, no write to the production database.

## Acceptance

From `/admin` (PIN-gated), a user can create a wheel of any type via a generated form,
see it listed with a copyable participant link, open that link and have it render, edit it
(incl. the `home` wheel) and see the change reflected, reset its draws, and delete it —
all verified against the local emulator with no production writes. `wheel.html` no longer
has the `?seed=` path. The unit suite is green. README documents `/admin` and local-emulator
dev. Nothing deployed.

## Notes for SP5

`adminforms.js` gains the `color`/`segments`/`theme` field kinds; `admin.html`'s form
already dispatches by `field.kind`, so SP5 adds renderers/readers without restructuring.
The `custom` type and `theme` layer plug into the same create/edit flow.
