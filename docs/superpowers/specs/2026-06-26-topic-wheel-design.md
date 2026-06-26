# Topic-to-Group Wheel — Design

**Date:** 2026-06-26
**Status:** SUPERSEDED by `2026-06-26-wheel-engine-design.md`

> This standalone page was absorbed into the admin-configurable wheel engine.
> "Topic → group" is now a built-in **type** in the engine's `WHEEL_TYPES`
> registry rather than its own hardcoded HTML file. The logic here (unique-per-group
> assignment, hard lock, group selector, server-authoritative transaction) carries
> over verbatim into that type's runtime. Kept for reference.

## Goal

A new live-synced web page where each of 8 groups spins a wheel once and draws a **unique** presentation topic from a list of 13. No two groups end up with the same topic; once a group draws, its topic is hard-locked.

## Context

The repo already contains `group-wheel.html` — a Vietnamese, Firebase-realtime wheel that assigns *people* to one of two groups (max 6 each). `public/index.html` is an exact copy of `group-wheel.html` and is what Firebase Hosting serves (`firebase.json` → `"public": "public"`). The Realtime Database rules (`database.rules.json`) already allow read/write on any `wheel/$room` path.

This feature is a **separate new page**. The existing people-grouping wheel is left untouched.

## Scope

- One new static HTML file, self-contained (HTML + CSS + ES-module `<script>`), mirroring the structure and visual theme of `group-wheel.html`.
- Reuses the existing Firebase project/config and DB rules; uses a **new room path** so it does not collide with the people-grouping data.
- Vietnamese UI, consistent with the existing page.

Out of scope: authentication, a host reset/clear control, editing topics from the UI, changing the existing `group-wheel.html`.

## Files

- **Create:** `topic-wheel.html` (repo root — the authored source).
- **Create:** `public/topic-wheel.html` (deploy copy, served at `/topic-wheel.html`). It is a byte-for-byte copy of the root file, matching the existing `group-wheel.html` → `public/index.html` convention.
- **Unchanged:** `group-wheel.html`, `public/index.html`, `firebase.json`, `database.rules.json`, `.firebaserc`.

## Editable Configuration

At the top of the `<script type="module">`, in clearly-marked config blocks (same style as the current `GROUPS`/`MAX`/`ROOM` block):

```js
const firebaseConfig = { /* same values as group-wheel.html */ };

// 13 presentation topics — edit these strings.
const TOPICS = [
  'Chủ đề 1', 'Chủ đề 2', 'Chủ đề 3', 'Chủ đề 4', 'Chủ đề 5',
  'Chủ đề 6', 'Chủ đề 7', 'Chủ đề 8', 'Chủ đề 9', 'Chủ đề 10',
  'Chủ đề 11', 'Chủ đề 12', 'Chủ đề 13',
];

// 8 groups — edit names/colors.
const GROUPS = [
  { key:'g1', name:'Group 1', color:'#10b981', dark:'#059669' },
  { key:'g2', name:'Group 2', color:'#8b5cf6', dark:'#7c3aed' },
  { key:'g3', name:'Group 3', color:'#f59e0b', dark:'#d97706' },
  { key:'g4', name:'Group 4', color:'#ec4899', dark:'#db2777' },
  { key:'g5', name:'Group 5', color:'#3b82f6', dark:'#2563eb' },
  { key:'g6', name:'Group 6', color:'#ef4444', dark:'#dc2626' },
  { key:'g7', name:'Group 7', color:'#14b8a6', dark:'#0d9488' },
  { key:'g8', name:'Group 8', color:'#a855f7', dark:'#9333ea' },
];

const ROOM = 'topics1';   // change to start a fresh empty draw
```

`TOPICS.length` (13) and `GROUPS.length` (8) are read dynamically; changing the array lengths must not break the layout or logic. The design assumes `GROUPS.length <= TOPICS.length` (otherwise some groups could never get a unique topic — see Error Handling).

## Data Model (Firebase Realtime Database)

Path: `wheel/${ROOM}` (i.e. `wheel/topics1`).

```
wheel/topics1/
  groups/
    g3: { topic: 6, ts: 1750000000000 }   // group g3 drew TOPICS[6]
    g1: { topic: 0, ts: 1750000000123 }
    ...
```

- A group's assignment lives at `groups/<gKey>`. Absence means that group has not drawn yet.
- A topic index is **taken** if and only if some group's `.topic` equals it. Uniqueness is enforced by computing this set inside the assignment transaction — no separate structure needed.
- No per-device `spins` map (unlike `group-wheel.html`). The lock is per **group**, not per device: a group is locked once `groups/<gKey>` exists.

## Device Identity

`localStorage` key `topicWheelGroup` stores the `gKey` this device claimed (set the moment a spin commits). On reload, if set and that group has an assignment in state, the page shows the locked result view for that group and marks it "(nhóm của bạn)" in the panel. This is purely a local convenience; the server lock is authoritative.

## UI / Flow

1. **Connection badge** (reused): "Đang kết nối…" → "Đã kết nối · trực tiếp".
2. **Header**: title "Vòng Quay Chủ Đề" (gradient styling reused); subtitle explaining "Mỗi nhóm quay 1 lần để nhận 1 chủ đề — không trùng nhau."
3. **Progress pill**: `Đã chọn: X/8 nhóm`.
4. **Stage** — two states:
   - **Spin view** (this device has not claimed a locked group, or its claimed group is still open):
     - A **group selector** (replaces the name text input): a `<select>` listing `Group 1 … Group 8`. Groups already assigned are shown with their topic and **disabled**. Default selection is the first still-open group.
     - The **wheel**: a conic-gradient disc with **13 topic segments** (`SEG = 360 / TOPICS.length`), each labeled with the topic title. Segments whose topic is already taken render **dimmed** (reduced opacity) but stay in place so the wheel geometry is stable.
     - **QUAY 🎲** button, disabled until a valid open group is selected.
     - **Hint** line for messages.
   - **Locked view** (this device's claimed group has an assignment): a result card — "Nhóm X đã nhận chủ đề:" + the topic title in the group's color. Note: "Mỗi nhóm chỉ quay 1 lần · Kết quả đã được lưu."
5. **Groups panel**: all 8 groups listed, each showing its assigned topic title or "⏳ Chưa quay". The device's own group is highlighted with "(nhóm của bạn)".
6. **Status footer** (reused): "🔄 Đồng bộ trực tiếp giữa mọi thiết bị".

## Assignment Logic (server-authoritative)

On QUAY, run a `runTransaction(ref(db, 'wheel/' + ROOM), cur => {...})`:

```
cur = cur || {}; cur.groups = cur.groups || {};
if (cur.groups[gKey]) { reason = 'taken'; return; }            // group already drew -> abort
const taken = new Set(Object.values(cur.groups).map(a => a.topic));
const available = TOPICS.map((_, i) => i).filter(i => !taken.has(i));
if (!available.length) { reason = 'full'; return; }            // no topics left -> abort
const pick = available[Math.floor(Math.random() * available.length)];
cur.groups[gKey] = { topic: pick, ts: Date.now() };
return cur;
```

After commit:
- Read the committed topic index for `gKey`, set `localStorage.topicWheelGroup = gKey`.
- Compute target rotation so the wheel lands within the chosen topic's segment (same maths as `group-wheel.html`: `base = (360 - (idx*SEG + SEG/2)) % 360`, plus jitter bounded to the segment, plus `6*360` full turns). Apply transform; after the ~4.7s CSS transition, fire `chime()` + `burst(groupColor)` and rebuild the UI into the locked view.

`idx` here is the **topic index** (0–12), and the wheel segments are topics — so landing maths is unchanged in form, just driven by topic index instead of group index.

## Error Handling

- **Group already taken** (`reason === 'taken'`): hint "⚠️ Nhóm này đã quay rồi." Rebuild UI (selector will now show it disabled).
- **No topics left** (`reason === 'full'`): hint "🎉 Hết chủ đề!" Only reachable if `GROUPS.length > TOPICS.length`; with 8 groups / 13 topics it never fires, but the branch exists for safety.
- **Transaction/network error** (catch): hint "⚠️ Lỗi mạng, thử lại nhé.", re-enable the button and selector.
- **No open group selected / selector empty**: QUAY button stays disabled.
- **Firebase not configured** (`apiKey` is the placeholder sentinel): show the same setup-instructions card as `group-wheel.html`.
- **`localStorage` blocked** (private mode): claimed-group memory falls back to an in-memory variable for the session (the spin still works and the server lock still holds; only cross-reload "your group" highlighting is lost).

## Reused From `group-wheel.html` (verbatim or near-verbatim)

- Entire CSS theme (colors, card, wheel ring/gloss/hub/pointer, buttons, result card, groups grid, confetti, badge, keyframes).
- `esc()` HTML-escaping helper.
- `deviceId()` pattern → adapted to store/read the claimed group key.
- Firebase init, `onValue` listener wiring, the `runTransaction` shape.
- `chime()` and `burst()` celebration functions.
- The conic-gradient disc + `transition: transform 4.6s cubic-bezier(...)` spin animation.

## Testing

The artifact is a single static HTML file talking to Firebase. Verify with Playwright against a locally served copy:

1. **Renders**: load `/topic-wheel.html`; assert the disc exists and contains 13 topic labels; assert the groups panel lists 8 groups; assert progress reads `0/8` on a fresh room.
2. **Spin assigns a unique topic**: select an open group, click QUAY, wait for the animation; assert that group's panel entry now shows a topic title, progress reads `1/8`, and `localStorage.topicWheelGroup` is set.
3. **Hard lock**: after a spin, reload; assert the page shows the locked result view for the claimed group and the QUAY flow is not offered for it.
4. **Uniqueness (logic-level)**: a unit-style check of the pick function — given a `taken` set, the returned index is never in `taken` and is within `0..TOPICS.length-1`.

To avoid hitting production Firebase during automated tests, the pick/uniqueness logic (step 4) is exercised as a pure function; the render and spin tests (1–3) run against a fresh `ROOM` value so they don't pollute real draw data. The implementation plan specifies the exact harness.

## Decisions (resolved during brainstorming)

- Topics are **unique per group** (8 of 13 used).
- Actors are **group reps on their own devices**, **live-synced** via Firebase.
- Topic titles ship as **editable placeholders** (`Chủ đề 1…13`).
- This is a **new separate page**; the existing wheel is unchanged.
- Assignments are **hard-locked**; no reset control.
