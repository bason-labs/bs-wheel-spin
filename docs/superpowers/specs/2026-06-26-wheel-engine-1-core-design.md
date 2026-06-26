# Sub-project 1 — Core + Registry + `simple` Type — Design

**Date:** 2026-06-26
**Status:** Approved
**Umbrella:** `2026-06-26-wheel-engine-design.md` (read first — contracts there are frozen)

## Goal

Stand up the engine end-to-end with one wheel type. After this sub-project: a
`wheel-types.js` module exporting shared helpers and a `WHEEL_TYPES` registry
containing a fully working `simple` ("Quay ngẫu nhiên") type; a `wheel.html`
participant page that loads `wheels/<id>` and runs a `simple` wheel (render, spin,
landing animation, live panel, hard lock); updated DB rules; and deploy copies.
Sub-projects 2 and 3 extend this without changing its contracts.

## Scope

**In:**
- `wheel-types.js` with: shared helpers (`esc`, `deviceId`, `makeWheelId`, segment
  geometry/label maths, `spinTo`, `burst`, `chime`), and `WHEEL_TYPES.simple`.
- `wheel.html`: parse `?w=<id>`, subscribe to `wheels/<id>`, dispatch to the type
  runtime, handle spin transaction + landing + celebration, render result + panel,
  hard lock. Handles only `identity: 'none'` this sub-project (the `simple` case);
  the dispatch is written so identity branches added in sub-project 2 slot in.
- DB rules: add `wheels/$id` open rule (keep existing `wheel/$room`).
- Deploy copies into `public/`.
- A temporary **seed helper** to create a `simple` wheel config for testing/manual
  use (a small `?seed=1` code path or a documented console snippet), since the admin
  page doesn't exist yet. Clearly marked as removed/ignored once sub-project 3 lands.

**Out:** `groupdiv` and `topicgroup` types (sub-project 2); `admin.html` (sub-project 3);
any change to `group-wheel.html` / `public/index.html`; reset/clear; auth.

## Files

- **Create:** `wheel-types.js`
- **Create:** `wheel.html`
- **Create (deploy copies):** `public/wheel-types.js`, `public/wheel.html`
- **Modify:** `database.rules.json` (add `wheels/$id`)
- **Create:** `tests/` harness files as defined by the plan (see Testing)
- **Unchanged:** `group-wheel.html`, `public/index.html`, `firebase.json`, `.firebaserc`

## `wheel-types.js` — exports

```js
export const esc = s => /* HTML-escape — copied from group-wheel.html */;
export function deviceId() { /* localStorage 'wheelDeviceId', UUID fallback — copied */ }
export function makeWheelId() { /* crypto.randomUUID().slice(0,8), fallback to ts+rand */ }

// Geometry/render for a disc of N segments.
//   segs: [{label,color,dark,dim}]
export function discHtml(segs) { /* conic-gradient background + positioned .label spans */ }
//   Returns target absolute rotation (deg) to land within segment `idx`, given the
//   current rotation, using >=6 full turns + segment-center + bounded jitter
//   (the existing group-wheel maths, generalized to N segments).
export function landingRotation(curRotation, idx, segCount) { /* ... */ }

export function burst(colorPair, confettiEl) { /* confetti — copied, color from segment */ }
export function chime(audioCtx) { /* triad chime — copied */ }

export const WHEEL_TYPES = {
  simple: { /* full entry, see below */ },
};
```

`discHtml` and `landingRotation` generalize `group-wheel.html`'s 2-segment maths to
arbitrary `segCount` (`SEG = 360 / segCount`). Behavior for the existing geometry must
be equivalent.

## `WHEEL_TYPES.simple` (full)

```
key: 'simple'
name: 'Quay ngẫu nhiên'
identity: 'none'

defaultConfig(): { options: ['Lựa chọn 1','Lựa chọn 2','Lựa chọn 3'], removeAfterPick: true }
configFields: [
  { kind:'list', key:'options', label:'Các lựa chọn', itemPlaceholder:'Nhập lựa chọn...' },
  { kind:'bool', key:'removeAfterPick', label:'Không lặp lại kết quả đã quay' },
]
validate(config):
  - options must be a non-empty array of non-empty trimmed strings → else
    'Cần ít nhất 1 lựa chọn.'  (sub-project 3 uses this; defined now for completeness)

segments(config, state):
  - map config.options → { label, color: palette[i % palette.length].color,
    dark: palette[i].dark, dim: removeAfterPick && state.picked?.includes(i) }
availableIndices(config, state):
  - all option indices, minus state.picked if config.removeAfterPick
participantControls(config, state, mine): ''   // no input; identity none
readSelection(rootEl): {}                       // nothing to read
canSpin(config, state, ui, mine):
  - availableIndices(...).length > 0
assign(cur, { config }):
  - cur.picked = Array.isArray(cur.picked) ? cur.picked : []
  - avail = option indices minus (config.removeAfterPick ? cur.picked : [])
  - if !avail.length → { reason:'full' }
  - pick = avail[Math.floor(Math.random()*avail.length)]
  - cur.picked.push(pick); return { targetIndex: pick }
resultView(config, state, mine):
  - card showing the most recent picked option:
    state.picked?.length ? config.options[last] in its segment color : ''
panel(config, state, mine):
  - ordered list of picked results (most-recent first), each with its option label;
    plus a remaining count when removeAfterPick.
claimKey(config, committedState, ui): null      // simple has no per-device claim
```

Note `simple` is host-screen oriented: any device can spin repeatedly; there is no
per-device lock. "Hard lock" for `simple` means `removeAfterPick` permanently removes
a drawn option from future spins (enforced server-side in `assign`).

## `wheel.html` behavior

1. Standard `<head>` + the shared CSS theme (duplicated from `group-wheel.html`),
   connection badge, `<div id="confetti">`, `<div id="app">`.
2. `import { ... , WHEEL_TYPES } from './wheel-types.js'`.
3. Parse `?w=<id>`. If absent → render "⚠️ Không tìm thấy vòng quay" message and stop.
4. Firebase-not-configured sentinel → show setup card (as `group-wheel.html`).
5. `onValue(ref(db,'wheels/'+id))`: read `config` and `state`. If no `config` →
   "Vòng quay chưa được thiết lập." If `config.type` not in `WHEEL_TYPES` →
   "Loại vòng quay không hỗ trợ."
6. Let `T = WHEEL_TYPES[config.type]`. Build UI:
   - title = `config.title`; disc = `discHtml(T.segments(config,state))`;
   - controls = `T.participantControls(config,state,mine)`; QUAY button enabled per
     `T.canSpin`; result via `T.resultView`; panel via `T.panel`; progress as
     appropriate to the type.
   - `mine`: for `identity:'none'` it is null; for `device`/`group` (sub-project 2)
     it derives from `localStorage` + state. The dispatch reads `T.identity` so later
     modes plug in.
7. On QUAY: `ui = T.readSelection(appEl)`; guard `T.canSpin`; run
   `runTransaction(ref(db,'wheels/'+id+'/state'), cur => { cur=cur||{}; const r =
   T.assign(cur,{ui,mine,config}); if (r.reason){ lastReason=r.reason; return; }
   lastTarget=r.targetIndex; return cur; })`.
   - On commit: if `T.claimKey` returns a key, store it in `localStorage`. Animate via
     `landingRotation` to `lastTarget`, then `chime` + `burst(segmentColor)` + rebuild.
   - On abort: map `reason` → Vietnamese hint (`full`→"🎉 Hết lựa chọn!", others per type).
8. Re-render on every `onValue` while not mid-spin (same gating as `group-wheel.html`).

## Error handling
Missing/invalid `?w`; missing config; unknown type; empty options (canSpin false →
button disabled); `full` at spin time; transaction/network error (re-enable button);
Firebase-not-configured; `localStorage` blocked (deviceId falls back to session id;
irrelevant for `simple` but the helper must not throw).

## Testing
- **Unit (pure functions):** `landingRotation` lands inside the target segment for
  several `(segCount, idx)`; `WHEEL_TYPES.simple.availableIndices` excludes picked iff
  `removeAfterPick`; `simple.assign` on a plain `cur` never returns an already-picked
  index when `removeAfterPick`, returns `{reason:'full'}` when exhausted, and appends
  to `cur.picked`; `validate` rejects empty options. Run these in Node (the module is
  pure ESM; import it and assert) or via a Playwright `page.evaluate` against the
  loaded module — the plan picks the concrete harness.
- **Playwright (served copy, fresh `?w` room):** load `wheel.html?w=<freshId>` with a
  seeded `simple` config; assert disc renders one segment per option; click QUAY; after
  the animation assert the panel shows the picked option and (with removeAfterPick) the
  segment dims; spin until exhausted → QUAY disabled and "Hết lựa chọn!" hint.

## Acceptance
A reviewer can: open `wheel.html?w=<seededId>`, see a labeled wheel of the configured
options, spin it, watch it land and celebrate, see the result logged in the panel, and
(with removeAfterPick) confirm drawn options never repeat — all live-synced and with no
console errors. `group-wheel.html` still works unchanged.
