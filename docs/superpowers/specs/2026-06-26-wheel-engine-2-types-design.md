# Sub-project 2 — `groupdiv` + `topicgroup` Types — Design

**Date:** 2026-06-26
**Status:** Approved pending user review
**Umbrella:** `2026-06-26-wheel-engine-design.md` (contracts) · builds on sub-project 1 (`…-1-core-design.md`)

## Goal

Add the two remaining built-in wheel types to the engine and the participant-side
identity handling they need:

- **`groupdiv`** ("Chia nhóm") — people type their name, spin once per device, get
  assigned to one of N groups (max size per group). Ports the existing
  `group-wheel.html` behavior, including the duplicate-name guard.
- **`topicgroup`** ("Chủ đề cho nhóm") — each group draws one **unique** topic from a
  list; hard-locked; one device claims one group. This is the 13-topics-for-8-groups
  use case.

After this sub-project, `wheel.html` runs all three types. No admin page yet
(sub-project 3); wheels are still created via the `?seed=` dev path or by writing
config directly.

## Decisions (resolved in brainstorming)

- **`topicgroup`: one device = one group.** A device picks a group, spins once; its
  result locks and the device shows that result on reload. A device cannot draw for a
  second group. The lock is enforced both server-side (a group is locked once it has a
  topic) and per-device (a claimed device shows its locked view).
- **`groupdiv`: keep the duplicate-name guard.** When a typed name closely matches an
  existing member, show a `confirm()` dialog before allowing the spin (ported behavior).

## Additive Contract Refinements (backward-compatible)

Sub-project 1 implemented only `simple` (identity `'none'`), which needed none of the
identity plumbing. Supporting `'device'`/`'group'` requires three additions. All are
**additive and do not change sub-project 1's `simple` entry or any existing call
shape** — existing code keeps working unchanged.

1. **`identityKey` added to the `assign` context.** `wheel.html` now passes
   `assign(cur, { ui, mine, config, identityKey })`, where `wheel.html` computes:
   - `identity === 'none'` → `identityKey = null`
   - `identity === 'device'` → `identityKey = uid` (the `deviceId()`)
   - `identity === 'group'` → `identityKey = ui.groupKey`
   `simple.assign(cur, { config })` ignores the extra keys — unchanged.

2. **New optional type method `mineFrom(config, state, identityKey)`** → returns the
   "mine" object (this actor's locked result) or `null`. Implemented by
   identity-bearing types only; `wheel.html` calls it solely when
   `identity !== 'none'`, so `simple` needs no `mineFrom`.

3. **New optional type method `confirmSpin(config, state, ui)`** → returns `true` to
   proceed or `false` to abort, and MAY show an interactive `confirm()`. `wheel.html`
   calls it in `doSpin` before starting the spin: `if (T.confirmSpin && !T.confirmSpin(config, state, ui)) return;`.
   Only `groupdiv` defines it; absence means "always proceed".

The umbrella's `claimKey(config, committedState, ui)` (already in the contract) is now
used: `topicgroup` returns `ui.groupKey` so the device remembers which group it owns;
`groupdiv` returns `null` (the device is found via `uid`); `simple` returns `null`.

## `wheel.html` changes

- **`myClaim()`** (currently returns `null`) becomes:
  ```
  function myClaim() {
    if (!T || T.identity === 'none') return null;
    let key = null;
    if (T.identity === 'device') key = uid;
    else if (T.identity === 'group') { try { key = localStorage.getItem('wheelClaim:' + WID); } catch (e) { key = sessionClaim; } }
    return key ? T.mineFrom(config, state, key) : null;
  }
  ```
  (`sessionClaim` is an in-memory fallback set alongside the `localStorage` write in
  `doSpin`, so a private-mode device still shows its result within the session.)
- **`doSpin`**: before the spin, call the `confirmSpin` hook. Compute `identityKey`
  from `T.identity` and pass it in the `assign` ctx. On commit, if `T.claimKey(...)`
  returns a key, persist it to `localStorage['wheelClaim:'+WID]` (already wired in
  sub-project 1) **and** to the in-memory `sessionClaim`.
- **`buildUI`** is already generic: it renders `T.participantControls(config,state,mine)`,
  the QUAY button enabled per `T.canSpin(config,state,ui,mine)`, and
  `T.resultView(config,state,mine)`. The locked vs. spin presentation is the type's
  responsibility — identity types return `''` from `participantControls` (and a
  disabled spin via `canSpin`) once `mine` exists, and a filled `resultView`.
- **`hintFor`**: ensure reasons `spun`, `taken`, `full`, `dup`, `error` all map to
  Vietnamese (sub-project 1 already covers `full`/`taken`/`dup`/`error`; confirm
  `spun` → "⚠️ Bạn đã quay rồi.").

No change to the spin transaction / landing / celebration machinery (type-agnostic).

## Shared helpers (added to `wheel-types.js`)

Ported from `group-wheel.html`, for the `groupdiv` duplicate-name guard:

```js
export const stripVN = s => s.normalize('NFD').replace(/[̀-ͯ]/g,'')
  .replace(/đ/g,'d').replace(/Đ/g,'d').toLowerCase().trim().replace(/\s+/g,' ');

// Returns the existing member name that `name` likely duplicates, or null.
export function findDuplicate(name, existingNames) { /* ported token/last-name match */ }
```

`findDuplicate` is pure and unit-tested. `confirmSpin` (which calls `confirm()`) wraps
it and stays browser-only at call time.

## `WHEEL_TYPES.groupdiv` (identity `'device'`)

```
key:'groupdiv'  name:'Chia nhóm'  identity:'device'

defaultConfig(): {
  groups: [ {key:'g1',name:'Group 1',color:'#10b981',dark:'#059669'},
            {key:'g2',name:'Group 2',color:'#8b5cf6',dark:'#7c3aed'} ],
  maxPerGroup: 6,
}
configFields: [
  { kind:'groups', key:'groups', label:'Các nhóm' },
  { kind:'number', key:'maxPerGroup', label:'Số người tối đa mỗi nhóm', min:1, default:6 },
]
validate(config): groups non-empty & each has a name & maxPerGroup>=1, else a VI message.

segments(config, state):
  groups → { label:name, color, dark, dim: (members[key]?.length||0) >= maxPerGroup }
availableIndices(config, state): group indices whose member count < maxPerGroup
participantControls(config, state, mine):
  mine ? '' : a name <input id="nameInput"> field (VI label "Tên của bạn")
readSelection(rootEl): { name: rootEl.querySelector('#nameInput')?.value.trim() || '' }
canSpin(config, state, ui, mine):
  !mine && !!(ui?.name) && availableIndices(config,state).length>0
confirmSpin(config, state, ui):
  dup = findDuplicate(ui.name, allMemberNames(state)); if !dup return true;
  return confirm(`Tên "${ui.name}" có vẻ trùng với "${dup}"… OK = người khác, Cancel = dừng`);
assign(cur, { ui, config, identityKey }):
  cur.members ||= {}; cur.spins ||= {}; ensure each group's array exists;
  if (cur.spins[identityKey]) return { reason:'spun' };
  open = groups with members<max; if !open return { reason:'full' };
  pick = random(open); cur.members[pick.key].push(ui.name);
  cur.spins[identityKey] = { group:pick.key, name:ui.name, ts:Date.now() };
  return { targetIndex: groups.findIndex(g=>g.key===pick.key) };
mineFrom(config, state, identityKey):
  state.spins?.[identityKey] ? { group:..., name:... } : null
resultView(config, state, mine):
  mine ? result card "<name>, bạn đã được xếp vào <Group>" in the group's color : ''
panel(config, state, mine):
  the 2-column groups grid (ported look): per group a header (name + count/max),
  progress bar, member list; highlight the member matching `mine`.
claimKey(): null
```

`groupdiv`'s `panel` reuses the existing `.groups/.group/.bar/.member/.avatar` CSS
already present in `wheel.html` (carried over from `group-wheel.html`).

## `WHEEL_TYPES.topicgroup` (identity `'group'`)

```
key:'topicgroup'  name:'Chủ đề cho nhóm'  identity:'group'

defaultConfig(): {
  topics: ['Chủ đề 1', … 'Chủ đề 13'],
  groups: [ Group 1..8 using PALETTE colors ],
}
configFields: [
  { kind:'list',   key:'topics', label:'Các chủ đề', itemPlaceholder:'Nhập chủ đề...' },
  { kind:'groups', key:'groups', label:'Các nhóm' },
]
validate(config):
  topics non-empty & groups non-empty & groups.length <= topics.length,
  else "Số chủ đề phải lớn hơn hoặc bằng số nhóm." (or per-field VI message)

segments(config, state):
  topics → { label, color: PALETTE[i].*, dim: takenTopicSet(state).has(i) }
availableIndices(config, state): topic indices not in takenTopicSet(state)
participantControls(config, state, mine):
  mine ? '' :
    a <select id="groupSel"> of groups; options for already-drawn groups are disabled
    and labelled with their topic; default = first not-yet-drawn group. (VI label "Nhóm của bạn")
readSelection(rootEl): { groupKey: rootEl.querySelector('#groupSel')?.value || '' }
canSpin(config, state, ui, mine):
  !mine && !!(ui?.groupKey) && !state.groups?.[ui.groupKey] && availableIndices(...).length>0
assign(cur, { ui, config }):
  cur.groups ||= {}; gk = ui.groupKey;
  if (cur.groups[gk]) return { reason:'taken' };
  taken = topics held by any group; avail = topic indices not taken;
  if (!avail.length) return { reason:'full' };
  pick = random(avail); cur.groups[gk] = { topic:pick, ts:Date.now() };
  return { targetIndex: pick };
mineFrom(config, state, groupKey):
  state.groups?.[groupKey] ? { groupKey, topic: state.groups[groupKey].topic } : null
claimKey(config, committedState, ui): ui.groupKey
resultView(config, state, mine):
  mine ? result card "Nhóm <name> đã nhận chủ đề: <topic>" in the group's color : ''
panel(config, state, mine):
  list all groups with their assigned topic title or "⏳ Chưa quay"; highlight `mine`'s group.
```

`takenTopicSet(state)` = `new Set(Object.values(state.groups||{}).map(a=>a.topic))`.

## Data Model (Firebase) — per type

- `groupdiv`: `wheels/<id>/state = { members:{gKey:[names]}, spins:{deviceId:{group,name,ts}} }`
- `topicgroup`: `wheels/<id>/state = { groups:{gKey:{topic,ts}} }`

Both fit the existing `wheels/$id` rule (already deployed). No DB-rules change.

## Error Handling

`spun` (device already spun, groupdiv), `taken` (group already drew, topicgroup),
`full` (no groups open / no topics left), `dup` handled via the confirm flow,
transaction/network error, malformed config (missing/empty groups or topics →
`canSpin` false; `validate` blocks the future admin save). `localStorage` blocked →
`sessionClaim` in-memory fallback for the `group` identity.

## Testing

- **Unit (`node:test`):**
  - `findDuplicate`: matches exact, token-subset, and shared-last-name cases; returns
    null on no match / empty input.
  - `groupdiv`: `validate`; `availableIndices` excludes full groups; `assign` blocks a
    second spin by the same `identityKey` (`{reason:'spun'}`), assigns to an open group,
    returns `{reason:'full'}` when all groups are full, mutates `members`+`spins`;
    `segments` dims full groups; `mineFrom` resolves/!resolves.
  - `topicgroup`: `validate` (incl. groups>topics rejected); `availableIndices` excludes
    taken topics; `assign` gives a unique topic, blocks a re-draw by the same group
    (`{reason:'taken'}`), `{reason:'full'}` when topics exhausted; `mineFrom`; `claimKey`
    returns the groupKey; `segments` dims taken topics.
- **Playwright (live Firebase, fresh `?w` per run, via `?seed=groupdiv` / `?seed=topicgroup`):**
  - `groupdiv`: type a name, spin → assigned to a group, panel + progress update, reload
    shows the locked result; a duplicate name triggers the confirm.
  - `topicgroup`: select a group, spin → unique topic, that group disabled in the selector,
    reload shows the locked result for the claimed group, a second device/group draws a
    different topic.
- Extend the `?seed=` dev path in `wheel.html` to seed `groupdiv` and `topicgroup`
  default configs (still marked "remove in sub-project 3").

## Clean Home Link (build FIRST, with `topicgroup`)

Per the user's priority and choices: the home page becomes the 8-group/13-topic
`topicgroup` wheel at a clean URL, and the original people-splitter moves to `/groups`.
Build order: **`topicgroup` + the home link first**, ship/verify, then `groupdiv`.

- **`wheel.html` default room.** Add `const DEFAULT_WID = 'home';` and set
  `WID = params.get('w') || DEFAULT_WID`. So `wheel.html` with no `?w` opens the home
  wheel; the "thiếu mã vòng quay" message path is removed (a default always exists).
- **Fixed home config.** Seed `wheels/home/config` once with a `topicgroup` config: 13
  placeholder topics (`Chủ đề 1…13`, editable later) and 8 groups (PALETTE colors).
  Seeded via a REST PUT to the open RTDB (no admin UI yet):
  `PUT https://wheel-spin-a6f34-default-rtdb.firebaseio.com/wheels/home/config.json`.
- **Hosting routing (Firebase rewrites).** In `firebase.json` add:
  ```json
  "rewrites": [
    { "source": "/groups", "destination": "/groups.html" },
    { "source": "/",       "destination": "/wheel.html" }
  ]
  ```
  Remove `public/index.html` so the `/` rewrite takes effect (a static `index.html`
  would otherwise win). Add `public/groups.html` = a copy of the original group-wheel
  (sourced from `group-wheel.html`, which stays unchanged at the repo root).
- **Result:**
  - `/` → 8-group/13-topic topic wheel (clean, no query string)
  - `/groups` → original people-splitter (preserved, clean URL)
  - `/wheel.html?w=<id>` → any other wheel (unchanged)
  - relative `./wheel-types.js` import still resolves under the `/` rewrite (resolves to
    `/wheel-types.js`, which exists).
- **Deploy:** this phase ends with `firebase deploy --only hosting` (+ the one-time
  config PUT) and a live check of `/`, `/groups`, and a second-device draw.

## Acceptance

After Phase A (topicgroup + home link): `https://wheel-spin-a6f34.web.app/` opens the
13-topic/8-group draw directly; each device selects a group, spins a unique topic,
hard-locks, and shows its result on reload; `/groups` still serves the original
splitter. After Phase B (`groupdiv`): `wheel.html?w=<id>&seed=groupdiv` runs the
original people-splitter behavior as an engine type (name → random open group, one spin
per device, dup guard, live panel). All unit tests pass; `simple` is unaffected.
