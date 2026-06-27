# Wheel Spin

A Vietnamese, real-time spinning-wheel tool. People open a link, spin once, and get a
result that syncs live across every device via Firebase Realtime Database. It powers a
few wheel "types" — pick a random option, split people into groups, or hand each group a
unique presentation topic — all from one generic engine. The app is a **zero-dependency,
vanilla ES-module static site** served by Firebase Hosting (project `wheel-spin-a6f34`)
out of `public/`. No bundler, no build step: the browser imports the small engine
modules natively.

## Routes

| Path | File | What it is |
|---|---|---|
| `/` | `public/wheel.html` (rewrite) | Home: the 8-group / 13-topic `topicgroup` wheel (config `wheels/home`) |
| `/groups` | `public/groups.html` (rewrite) | The original standalone people-splitter |
| `/wheel.html?w=<id>` | `public/wheel.html` | Any wheel, by its id |
| `/admin` | `public/admin.html` | PIN-gated config dashboard — create / edit / delete / reset wheels of any type |

Routing is configured in `firebase.json` (`hosting.rewrites`). `public/groups.html` is a
self-contained legacy page; it does not import the engine.

## Data model (Firebase Realtime Database)

Each wheel is a node under `wheels/`:

```
wheels/<id>/
  config: { type, title, createdTs, …type-specific fields, theme? }
  state:  { …live draw data, shape depends on type }
```

- `config` is written once (and on edit); `config.type` selects the wheel type.
- `state` holds live results: `simple` → `{ picked: number[] }`; `groupdiv` →
  `{ members: {gKey:[names]}, spins: {deviceId:{group,name,ts}} }`; `topicgroup` →
  `{ groups: {gKey:{topic,ts}} }`.
- The database rules (`database.rules.json`) are **open read/write** on `wheel/$room`
  and `wheels/$id` — a deliberate no-auth choice for this low-stakes tool. The planned
  `/admin` uses a **client-side PIN** to deter casual tampering; that is not real
  security (the DB stays world-writable).

## Wheel-type registry

Wheel types are **data, not pages**. Each type is one module under
`public/engine/types/<key>.js` exporting a registry entry; they are assembled in
`public/engine/registry.js`. **Adding a type = one module + one line in `registry.js`.**

A type entry implements a small contract: `key`, `name`, `identity`
(`none`/`device`/`group`), `defaultConfig()`, `configFields` (the admin form schema),
`validate(config)`, and the runtime methods (`segments`, `availableIndices`,
`participantControls`, `readSelection`, `canSpin`, `assign`, `resultView`, `panel`,
`claimKey`, plus optional `mineFrom`/`confirmSpin`). See the design docs under
`docs/superpowers/specs/` for the full contract.

Current types:

| Key | Name (VI) | Behavior |
|---|---|---|
| `simple` | Quay ngẫu nhiên | Spin to pick one option; optional remove-after-pick |
| `groupdiv` | Chia nhóm | People type a name, spin once, get a group (max per group), dup-name guard |
| `topicgroup` | Chủ đề cho nhóm | Each group draws one unique topic (lock is per group-key); a device claims a group and is shown its result on reload |
| `custom` | Tùy chỉnh | Hand-defined segments (label + colour + optional integer weight); host-screen picker, optional remove-after-pick |

**Theming:** any wheel can carry an optional `config.theme = { accent?, bg?, sound? }`
(set in the admin editor's "Giao diện" section). `accent`/`bg` are hex colours applied via
CSS variables on the participant page; `sound:false` mutes the spin chime. Wheels without a
theme look and sound exactly as before.

## Source layout

```
public/
  wheel.html          # generic participant page (imports ./engine/index.js)
  groups.html         # original standalone splitter (no engine import)
  admin.html          # PIN-gated config dashboard
  engine/
    index.js          # barrel — the public import surface
    helpers.js        # esc, deviceId, makeWheelId, stripVN, findDuplicate
    geometry.js       # PALETTE, landingRotation, discHtml
    celebration.js    # chime, burst
    adminforms.js     # config-form render/read for the admin page
    registry.js       # assembles WHEEL_TYPES from the type modules
    types/
      simple.js
      topicgroup.js
      groupdiv.js
      custom.js
tests/                # Node node:test; import ../public/engine/index.js
docs/superpowers/     # specs + plans
firebase.json         # hosting rewrites + cache headers + DB rules pointer
database.rules.json
```

`public/` is the **single source of truth** — there are no root copies and no `cp` step.

## Develop

Prerequisites: Node 22+ (tests use the built-in `node:test`; no `npm install` needed),
Python 3 (for a local static server), and optionally the Firebase CLI (for deploys).

```bash
npm test                       # run all unit tests (node --test)
python3 -m http.server 8123    # serve the repo; then open:
#   http://localhost:8123/public/wheel.html?w=<id>
#   http://localhost:8123/public/admin.html        (PIN: see ADMIN_PIN in admin.html)
```

Wheels are created from the `/admin` dashboard (the old `?seed=` dev path is gone).

**Local DB (no production writes):** pages support an opt-in `?emu=1` that points them at
a local Realtime Database emulator (`firebase emulators:start --only database`, port 9000).
The emulator requires JDK 21+. Production never passes `?emu=1`. For offline UI testing
without Firebase or Java, `admin.html` honours an injected `window.__WHEEL_STORE__`
in-memory store (set before unlocking); it is inert in production.

## Deploy

Deploys are run by a human with the Firebase CLI:

```bash
firebase deploy --only hosting     # publish public/
firebase deploy --only database    # publish database.rules.json
```

The home wheel's config lives at `wheels/home`. `firebase.json` sets `no-cache` headers
on `*.js`/`*.html` (and `/`, `/groups`) so updates reach users immediately.

## Admin & PIN

`/admin` is gated by a shared client-side PIN — the editable `ADMIN_PIN` constant at the
top of `public/admin.html`. The PIN hides the dashboard from casual visitors and deters
accidental edits; because the database rules are open, it is **not** a real security
boundary. The dashboard lists every wheel, creates one of any type from a generated form,
edits (including the `home` wheel), copies the participant link, resets draws, and deletes.
