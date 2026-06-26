# Admin-Configurable Wheel Engine — Umbrella Design

**Date:** 2026-06-26
**Status:** Approved (umbrella)

This is the shared design that all three sub-project specs depend on. It defines
the architecture, the `WHEEL_TYPES` registry contract, the Firebase data model, the
file layout, and the decomposition. Each sub-project below has its own detailed spec
→ plan → implementation cycle, but they must all conform to the contracts fixed here.

## Goal

An open (no-login) **admin dashboard** where an admin creates and manages multiple
"wheels", each of a chosen **type**, with admin-entered options; and a single
**generic participant page** that renders and runs any wheel from its saved config,
live-synced across devices via Firebase. Designed so new wheel types can be added by
appending one registry entry.

## Context

The repo has `group-wheel.html` (a Vietnamese, Firebase-realtime wheel assigning
people to one of two groups; also copied to `public/index.html`, which Firebase
Hosting serves). DB rules (`database.rules.json`) allow read/write on `wheel/$room`.
The existing `group-wheel.html` / `public/index.html` are **left untouched** for
backward compatibility; the engine uses a new `wheels/` subtree.

## File Layout

Authored at repo root, copied into `public/` for deploy (mirrors the existing
`group-wheel.html` → `public/index.html` convention). Firebase Hosting serves
`public/`, and relative ES-module imports between served files work.

- `wheel-types.js` — shared ES module: the `WHEEL_TYPES` registry + shared helpers.
- `wheel.html` — generic participant page (`?w=<wheelId>`).
- `admin.html` — admin dashboard.
- Deploy copies: `public/wheel-types.js`, `public/wheel.html`, `public/admin.html`.

Shared helpers that move into `wheel-types.js` (lifted from `group-wheel.html`,
behavior-preserving): `esc()`, `deviceId()`, the conic-gradient wheel renderer +
`transition: transform 4.6s cubic-bezier(.16,.84,.27,1)` spin/landing maths,
`burst()` (confetti), `chime()`. The CSS theme is duplicated into each HTML file's
`<style>` (CSS is not shared via the module).

## Firebase Data Model

```
wheels/
  <wheelId>/
    config: { type: <typeKey>, title: <string>, createdTs: <number>, ...typeFields }
    state:  { ...type-specific live data }
```

- `wheelId`: generated, URL-safe, e.g. first 8 chars of `crypto.randomUUID()`.
- `config` is written once at create and on edit; `state` is the live participant data.
- A wheel "type" is identified by `config.type`, a key present in `WHEEL_TYPES`.
- Participant link: `wheel.html?w=<wheelId>`.

**DB rules:** add an open rule for the new subtree, keeping the existing one:

```json
{
  "rules": {
    "wheel":  { "$room": { ".read": true, ".write": true } },
    "wheels": { "$id":   { ".read": true, ".write": true } }
  }
}
```

## The `WHEEL_TYPES` Registry Contract (FROZEN INTERFACE)

`wheel-types.js` exports `WHEEL_TYPES`, an object keyed by type key. Every entry
implements exactly this shape. All three sub-projects code against these signatures;
changing a signature is a cross-cutting change, so the interface is frozen here.

```js
// A "segment" describes one wedge of the wheel.
//   { label: string, color: string, dark: string, dim: boolean }
//
// `ctx` passed to assign(): { mine, ui } where
//   ui = type-specific selection from the participant controls
//        (e.g. { name } for group-division, { groupKey } for topic-group, {} for simple).
//
// assign(cur, ctx) MUTATES the transaction value `cur` (the wheels/<id>/state object,
//   created if absent) and returns either { targetIndex: <segment index to land on> }
//   on success, or { reason: <'taken'|'full'|'dup'|...> } to abort (return undefined
//   from the transaction so it does not commit).

WHEEL_TYPES = {
  <typeKey>: {
    key:        <string>,            // === the object key
    name:       <string>,            // human label for the admin type picker (Vietnamese)

    // ---- admin/config side ----
    defaultConfig(): <configObject>, // fresh config minus {type,title,createdTs}
    configFields:  [ <FieldSpec> ],  // declarative form schema (see below)
    validate(config): <string|null>, // null = ok, else an error message to show

    // ---- participant/runtime side ----
    identity:   'device' | 'group' | 'none',  // how "mine" is determined
    segments(config, state): [ <segment> ],
    availableIndices(config, state): [ <number> ],   // spinnable segment indices
    participantControls(config, state, mine): <htmlString>,  // input area (selector/field/empty)
    readSelection(rootEl): <uiObject>,               // read ui values from the rendered controls
    canSpin(config, state, ui, mine): <boolean>,
    assign(cur, { ui, mine, config }): { targetIndex } | { reason },
    resultView(config, state, mine): <htmlString>,   // locked/result card for "mine"
    panel(config, state, mine): <htmlString>,        // live list of all results
    claimKey(config, committedState, ui): <string|null>, // what to persist in localStorage as "mine"
  },
}
```

### FieldSpec (declarative admin form schema)

`configFields` is an ordered array describing the inputs the admin form renders. The
admin page has a generic renderer for these kinds; no per-type form code.

```
{ kind: 'text',   key, label, placeholder }                 // single line
{ kind: 'number', key, label, min, max, default }
{ kind: 'bool',   key, label }                              // checkbox
{ kind: 'list',   key, label, itemPlaceholder }             // dynamic add/remove string rows
{ kind: 'groups', key, label }                              // dynamic rows: name + color picker
```

`title` is always collected (common field), so it is not part of `configFields`.

## The Three Built-in Types

| Type key | name (VI) | identity | config (besides title) | state | assign |
|----------|-----------|----------|--------------------------|-------|--------|
| `simple` | "Quay ngẫu nhiên" | `none` | `options: string[]`, `removeAfterPick: bool` | `{ picked: number[] }` | pick from options minus (removeAfterPick ? picked : []); append index to `picked`; if none left → `{reason:'full'}` |
| `groupdiv` | "Chia nhóm" | `device` | `groups: {key,name,color,dark}[]`, `maxPerGroup: number` | `{ members: {gKey:string[]}, spins: {deviceId:{group,name,ts}} }` | one spin per device; assign `ui.name` to a random non-full group; dup-name guard; if all full → `{reason:'full'}` |
| `topicgroup` | "Chủ đề cho nhóm" | `group` | `topics: string[]`, `groups: {key,name,color,dark}[]` | `{ groups: {gKey:{topic,ts}} }` | group `ui.groupKey` draws a random **unique** topic; if group already drew → `{reason:'taken'}`; if no topics left → `{reason:'full'}` |

`groupdiv` and `topicgroup` runtime logic is the existing/already-spec'd behavior,
moved behind the contract. `topicgroup` carries over the unique-per-group + hard-lock
+ group-selector design from `2026-06-26-topic-wheel-design.md`.

## Cross-Cutting Decisions (resolved in brainstorming)

- Architecture: **generic engine, admin-driven** (types are data, not separate pages).
- Built-in types: **simple, groupdiv, topicgroup**; registry is extensible for more.
- Admin access: **open page, no login** (DB rules stay open; UX-only "admin").
- Admin workflow: **dashboard managing many wheels** (list / create / edit / delete /
  copy link). **No reset** — assignments are hard-locked, consistent throughout.
- Language: **Vietnamese**, matching the existing page.
- `group-wheel.html` / `public/index.html` are **unchanged**.

## Decomposition (three sequential sub-projects)

Each is independently testable working software and gets its own spec → plan.

1. **Core + registry + `simple` type end-to-end**
   (`2026-06-26-wheel-engine-1-core-design.md`)
   Build `wheel-types.js` with shared helpers + the registry contract + the `simple`
   type fully implemented. Build a minimal `wheel.html` that loads a hardcoded/seeded
   `wheels/<id>` of type `simple` and runs it (render, spin, panel, hard lock).
   Update DB rules. Deploy copies. Proves the engine end-to-end with one type.

2. **Participant engine: `groupdiv` + `topicgroup`**
   (`2026-06-26-wheel-engine-2-types-design.md`)
   Add the two remaining type entries to the registry (device/group identity,
   dup-name guard, unique-topic logic) and the participant-side branching in
   `wheel.html` (`participantControls`/`readSelection`/`claimKey` per identity mode).

3. **Admin dashboard (`admin.html`)**
   (`2026-06-26-wheel-engine-3-admin-design.md`)
   List all wheels; "New wheel" type picker; generic `configFields` form renderer
   (text/number/bool/list/groups) with per-type `validate()`; save/edit/delete;
   copy participant link. Replaces the seeding step from sub-project 1.

## Testing Strategy (all sub-projects)

Pure-function unit checks for registry methods (`validate`, `defaultConfig`,
`availableIndices`, the pick logic inside `assign` exercised on a plain `cur` object)
+ Playwright against a locally served copy for render/spin/lock/round-trip flows.
Tests use a fresh `wheelId`/room so they never touch real draw data, and avoid
writing to production Firebase where a pure-function check suffices.
