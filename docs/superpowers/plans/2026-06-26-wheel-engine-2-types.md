# Wheel Engine — Sub-project 2 (`topicgroup` + home link, then `groupdiv`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `topicgroup` (unique-topic-per-group, identity `group`) and `groupdiv` (people→groups, identity `device`) wheel types to the engine, plus the generic identity handling they need; and make the 8-group/13-topic `topicgroup` wheel the clean home page (`/`), moving the original splitter to `/groups`.

**Architecture:** Extend `wheel-types.js`'s frozen `WHEEL_TYPES` registry with two new entries and a couple of pure helpers. Add backward-compatible identity plumbing to `wheel.html` (`myClaim`, `identityKey`, `confirmSpin`, claim persistence) — the spin/landing/celebration machinery is already type-agnostic. Route `/` and `/groups` via Firebase Hosting rewrites.

**Tech Stack:** Vanilla ES modules, Firebase Realtime Database + Hosting (project `wheel-spin-a6f34`), Node built-in `node:test`, Python `http.server` + Playwright MCP for browser verification, `curl` for the one-time home-config seed via the RTDB REST API.

## Global Constraints

- **UI language: Vietnamese.**
- **Frozen contract** lives in `docs/superpowers/specs/2026-06-26-wheel-engine-design.md` (incl. the sub-project-2 identity addendum). The additions here are backward-compatible: **do not change `WHEEL_TYPES.simple` or any existing call shape.**
- **`wheel-types.js` must import in Node** (no top-level/in-body DOM at import; `confirm()` only inside `confirmSpin`, called at runtime).
- **Reuse** `esc`, `PALETTE`, `discHtml`, `landingRotation`, `burst`, `chime` from sub-project 1. `stripVN`/`findDuplicate` and the groups panel markup are ported from `group-wheel.html`.
- **Deploy copies:** keep root and `public/` copies of `wheel.html` and `wheel-types.js` byte-identical.
- **Do not modify** `group-wheel.html` (it is the source for `public/groups.html`).
- **`createdTs`/`ts`** use `Date.now()` (browser/REST only — never in tests).

---

## PHASE A — `topicgroup` + clean home link (ship first)

### Task 1: `WHEEL_TYPES.topicgroup` registry entry

**Files:**
- Modify: `wheel-types.js`
- Test: `tests/topicgroup-type.test.js`

**Interfaces:**
- Consumes: `esc`, `PALETTE` (sub-project 1).
- Produces: `WHEEL_TYPES.topicgroup` implementing the contract incl. the new `mineFrom`/`claimKey`. Exported helper `takenTopicSet(state)`.

- [ ] **Step 1: Write the failing test** — create `tests/topicgroup-type.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WHEEL_TYPES } from '../wheel-types.js';

const T = () => WHEEL_TYPES.topicgroup;
const cfg = () => ({ topics: ['A','B','C'], groups: [
  {key:'g1',name:'G1',color:'#10b981',dark:'#059669'},
  {key:'g2',name:'G2',color:'#8b5cf6',dark:'#7c3aed'} ] });

test('metadata + identity', () => {
  assert.equal(T().key, 'topicgroup');
  assert.equal(T().identity, 'group');
  assert.equal(typeof T().name, 'string');
});

test('defaultConfig: 13 topics, 8 groups', () => {
  const c = T().defaultConfig();
  assert.equal(c.topics.length, 13);
  assert.equal(c.groups.length, 8);
  assert.ok(c.groups.every(g => g.key && g.name && g.color && g.dark));
});

test('validate: needs topics, groups, and topics>=groups', () => {
  assert.equal(T().validate(cfg()), null);
  assert.match(T().validate({topics:[],groups:cfg().groups}), /chủ đề/i);
  assert.match(T().validate({topics:['A'],groups:[]}), /nhóm/i);
  assert.match(T().validate({topics:['A'],groups:cfg().groups}), /lớn hơn|>=|bằng/i);
});

test('availableIndices excludes taken topics', () => {
  assert.deepEqual(T().availableIndices(cfg(), { groups:{ g1:{topic:1} } }), [0,2]);
  assert.deepEqual(T().availableIndices(cfg(), {}), [0,1,2]);
});

test('assign gives a unique topic, blocks re-draw, reports full', () => {
  const c = cfg(), cur = {};
  const r1 = T().assign(cur, { ui:{groupKey:'g1'}, config:c });
  assert.ok([0,1,2].includes(r1.targetIndex));
  assert.equal(cur.groups.g1.topic, r1.targetIndex);
  // same group cannot re-draw
  assert.deepEqual(T().assign(cur, { ui:{groupKey:'g1'}, config:c }), { reason:'taken' });
  // second group gets a DIFFERENT topic
  const r2 = T().assign(cur, { ui:{groupKey:'g2'}, config:c });
  assert.notEqual(r2.targetIndex, r1.targetIndex);
});

test('assign reports full when topics exhausted', () => {
  const c = { topics:['only'], groups: cfg().groups };
  const cur = {};
  assert.equal(T().assign(cur, { ui:{groupKey:'g1'}, config:c }).targetIndex, 0);
  assert.deepEqual(T().assign(cur, { ui:{groupKey:'g2'}, config:c }), { reason:'full' });
});

test('segments dims taken topics', () => {
  const segs = T().segments(cfg(), { groups:{ g1:{topic:2} } });
  assert.equal(segs.length, 3);
  assert.equal(segs[2].dim, true);
  assert.equal(segs[0].dim, false);
});

test('mineFrom + claimKey + canSpin', () => {
  const c = cfg(), state = { groups:{ g1:{topic:0} } };
  assert.deepEqual(T().mineFrom(c, state, 'g1'), { groupKey:'g1', topic:0 });
  assert.equal(T().mineFrom(c, state, 'g2'), null);
  assert.equal(T().claimKey(c, state, {groupKey:'g2'}), 'g2');
  // canSpin: false if mine, false if group already drew, true otherwise
  assert.equal(T().canSpin(c, state, {groupKey:'g2'}, null), true);
  assert.equal(T().canSpin(c, state, {groupKey:'g1'}, null), false);
  assert.equal(T().canSpin(c, state, {groupKey:'g2'}, {groupKey:'g2',topic:0}), false);
});
```

- [ ] **Step 2: Run it (fails)** — `node --test tests/topicgroup-type.test.js` → FAIL (`topicgroup` undefined).

- [ ] **Step 3: Add `takenTopicSet` and `WHEEL_TYPES.topicgroup` to `wheel-types.js`** (append, after the `simple` entry — add as `WHEEL_TYPES.topicgroup = {...}` or extend the object literal):

```js
export const takenTopicSet = state =>
  new Set(Object.values((state && state.groups) || {}).map(a => a.topic));

WHEEL_TYPES.topicgroup = {
  key: 'topicgroup',
  name: 'Chủ đề cho nhóm',
  identity: 'group',

  defaultConfig() {
    return {
      topics: Array.from({ length: 13 }, (_, i) => `Chủ đề ${i + 1}`),
      groups: Array.from({ length: 8 }, (_, i) => ({
        key: `g${i + 1}`, name: `Group ${i + 1}`,
        color: PALETTE[i % PALETTE.length].color, dark: PALETTE[i % PALETTE.length].dark,
      })),
    };
  },
  configFields: [
    { kind: 'list',   key: 'topics', label: 'Các chủ đề', itemPlaceholder: 'Nhập chủ đề...' },
    { kind: 'groups', key: 'groups', label: 'Các nhóm' },
  ],
  validate(config) {
    const topics = (config && config.topics) || [];
    const groups = (config && config.groups) || [];
    if (!Array.isArray(topics) || !topics.some(t => String(t).trim())) return 'Cần ít nhất 1 chủ đề.';
    if (!Array.isArray(groups) || !groups.length) return 'Cần ít nhất 1 nhóm.';
    if (groups.length > topics.length) return 'Số chủ đề phải lớn hơn hoặc bằng số nhóm.';
    return null;
  },

  segments(config, state) {
    const taken = takenTopicSet(state);
    return config.topics.map((label, i) => ({
      label,
      color: PALETTE[i % PALETTE.length].color,
      dark:  PALETTE[i % PALETTE.length].dark,
      dim: taken.has(i),
    }));
  },
  availableIndices(config, state) {
    const taken = takenTopicSet(state);
    return config.topics.map((_, i) => i).filter(i => !taken.has(i));
  },
  participantControls(config, state, mine) {
    if (mine) return '';
    const drawn = (state && state.groups) || {};
    const opts = config.groups.map(g => {
      const d = drawn[g.key];
      const label = d ? `${esc(g.name)} — ${esc(config.topics[d.topic] ?? '?')}` : esc(g.name);
      return `<option value="${esc(g.key)}"${d ? ' disabled' : ''}>${label}</option>`;
    }).join('');
    return `<div class="selectwrap"><label>Nhóm của bạn</label><select id="groupSel">${opts}</select></div>`;
  },
  readSelection(rootEl) {
    const sel = rootEl.querySelector('#groupSel');
    return { groupKey: sel ? sel.value : '' };
  },
  canSpin(config, state, ui, mine) {
    if (mine) return false;
    if (!ui || !ui.groupKey) return false;
    if (state && state.groups && state.groups[ui.groupKey]) return false;
    return this.availableIndices(config, state).length > 0;
  },
  assign(cur, { ui, config }) {
    cur.groups = (cur.groups && typeof cur.groups === 'object') ? cur.groups : {};
    const gk = ui && ui.groupKey;
    if (!gk || cur.groups[gk]) return { reason: 'taken' };
    const taken = new Set(Object.values(cur.groups).map(a => a.topic));
    const avail = config.topics.map((_, i) => i).filter(i => !taken.has(i));
    if (!avail.length) return { reason: 'full' };
    const pick = avail[Math.floor(Math.random() * avail.length)];
    cur.groups[gk] = { topic: pick, ts: Date.now() };
    return { targetIndex: pick };
  },
  mineFrom(config, state, groupKey) {
    const g = state && state.groups && state.groups[groupKey];
    return g ? { groupKey, topic: g.topic } : null;
  },
  claimKey(config, committedState, ui) { return (ui && ui.groupKey) || null; },

  resultView(config, state, mine) {
    if (!mine) return '';
    const g = config.groups.find(x => x.key === mine.groupKey);
    const gname = g ? g.name : mine.groupKey;
    const color = g ? g.color : '#10b981', dark = g ? g.dark : '#059669';
    return `<div class="result-card"><div class="crown">🎉</div>
      <div class="who"><b>${esc(gname)}</b> đã nhận chủ đề</div>
      <div class="grp" style="background:linear-gradient(135deg,${color},${dark})">${esc(config.topics[mine.topic] ?? '?')}</div>
      <div class="note">Mỗi nhóm chỉ quay 1 lần · Kết quả đã được lưu</div></div>`;
  },
  panel(config, state, mine) {
    const drawn = (state && state.groups) || {};
    const done = Object.keys(drawn).length;
    const cells = config.groups.map(g => {
      const d = drawn[g.key];
      const isMine = mine && mine.groupKey === g.key;
      const topicLabel = d ? esc(config.topics[d.topic] ?? '?') : '⏳ Chưa quay';
      return `<div class="group" style="--gc:${g.color};--gcd:${g.dark};border-color:${g.color}66">
        <div class="ghead"><span class="gname"><span class="gtag"></span>${esc(g.name)}${isMine ? ' <span class="you">(nhóm của bạn)</span>' : ''}</span></div>
        <ul class="members"><li class="member"><span>${topicLabel}</span></li></ul></div>`;
    }).join('');
    return `<div class="progress-top"><span>Đã chọn:</span><span class="pill">${done}/${config.groups.length} nhóm</span></div>
      <div class="groups">${cells}</div>`;
  },
};
```

- [ ] **Step 4: Run it (passes)** — `node --test tests/topicgroup-type.test.js` → PASS (8 tests).
- [ ] **Step 5: Full suite** — `npm test` → all pass (sub-project 1's 18 + these 8 = 26).
- [ ] **Step 6: Commit** — `git add wheel-types.js tests/topicgroup-type.test.js && git commit -m "feat(engine): WHEEL_TYPES.topicgroup — unique topic per group, group identity"`

---

### Task 2: Identity plumbing in `wheel.html` + generic seed path

**Files:**
- Modify: `wheel.html`
- Test: browser verification (Task 3 deploys; this task verifies via local server against live Firebase)

**Interfaces:**
- Consumes: `T.identity`, `T.mineFrom`, `T.confirmSpin` (optional), `T.claimKey`, `WHEEL_TYPES`.

- [ ] **Step 1: Add a `sessionClaim` var and implement `myClaim()`.** Replace the existing stub:
```js
function myClaim() {
  // identity 'none' -> always null; device/group resolve via uid / persisted claim.
  return null;
}
```
with:
```js
let sessionClaim = null;
function myClaim() {
  if (!T || T.identity === 'none') return null;
  let key = null;
  if (T.identity === 'device') key = uid;
  else if (T.identity === 'group') {
    try { key = localStorage.getItem('wheelClaim:' + WID); } catch (e) {}
    if (!key) key = sessionClaim;
  }
  return key && T.mineFrom ? T.mineFrom(config, state, key) : null;
}
```

- [ ] **Step 2: Wire `confirmSpin` + `identityKey` + claim persistence into `doSpin`.**
  - After the `if (!T.canSpin(config, state, ui, mine)) return;` line, add:
    ```js
    if (T.confirmSpin && !T.confirmSpin(config, state, ui)) return;
    ```
  - Replace the transaction setup line `let target = null, liveState = state, pendingTarget = null;` block's `T.assign(cur, { ui, mine, config })` call and the commit block so the assign call passes `identityKey` and the claim is also stored to `sessionClaim`. Concretely, just before `let target = null, ...`, compute:
    ```js
    const identityKey = T.identity === 'device' ? uid : (T.identity === 'group' ? (ui && ui.groupKey) : null);
    ```
    change the assign call to:
    ```js
      const r = T.assign(cur, { ui, mine, config, identityKey });
    ```
    and change the claim-persist line inside `if (res.committed)` from:
    ```js
      const ck = T.claimKey(config, liveState, ui);
      if (ck) { try { localStorage.setItem('wheelClaim:' + WID, ck); } catch (e) {} }
    ```
    to:
    ```js
      const ck = T.claimKey(config, liveState, ui);
      if (ck) { sessionClaim = ck; try { localStorage.setItem('wheelClaim:' + WID, ck); } catch (e) {} }
    ```

- [ ] **Step 3: Add the `spun` hint.** In `hintFor`, add before the `error` line:
```js
  if (reason === 'spun') return '⚠️ Bạn đã quay rồi.';
```

- [ ] **Step 4: Generalize the seed path.** Replace the `if (SEED === 'simple') { ... }` block in `startApp` with:
```js
  // TEMP dev seed — remove in sub-project 3 (admin page supersedes this)
  const SEED_TITLES = { simple: 'Vòng quay thử nghiệm', topicgroup: 'Vòng quay chủ đề', groupdiv: 'Vòng quay chia nhóm' };
  if (SEED && WHEEL_TYPES[SEED]) {
    try {
      const cfgRef = ref(db, `wheels/${WID}/config`);
      const snap = await get(cfgRef);
      if (!snap.exists()) {
        await set(cfgRef, { type: SEED, title: SEED_TITLES[SEED] || SEED, createdTs: Date.now(), ...WHEEL_TYPES[SEED].defaultConfig() });
      }
    } catch (e) { console.warn('seed write skipped:', e.message); }
  }
```

- [ ] **Step 5: Verify topicgroup end-to-end (live Firebase).** Start `python3 -m http.server 8123` (background) from repo root. With Playwright MCP, navigate to `http://localhost:8123/wheel.html?w=tg-verify-A&seed=topicgroup` (fresh id). Confirm: a 13-segment wheel, a group dropdown (Group 1–8), progress `0/8 nhóm`. Select a group, click QUAY, wait ~5s: a result card "Group N đã nhận chủ đề: …", panel shows that group's topic, progress `1/8`, the group now disabled in the dropdown. Reload the page: it shows the locked result for the claimed group (no spin controls). Open a different fresh id with a second simulated device by clearing localStorage (or use `?w=tg-verify-A` in a new context) — confirm a second group draws a different topic. Stop the server. No console errors (favicon 404 ok).

- [ ] **Step 6: `npm test`** → still 26 pass (no module change). **Commit** — `git add wheel.html && git commit -m "feat(engine): identity plumbing (myClaim/identityKey/confirmSpin/claim persist) + generic seed path"`

---

### Task 3: Clean home link — DEFAULT_WID, hosting rewrites, seed home config, deploy

**Files:**
- Modify: `wheel.html` (DEFAULT_WID)
- Modify: `firebase.json` (rewrites)
- Delete: `public/index.html`
- Create: `public/groups.html` (copy of `group-wheel.html`)
- Create deploy copies: `public/wheel.html`, `public/wheel-types.js`

**Interfaces:** none (routing + config).

- [ ] **Step 1: Default the wheel id in `wheel.html`.** Find:
```js
const WID = params.get('w');
const SEED = params.get('seed');
```
Replace with:
```js
const DEFAULT_WID = 'home';
const WID = params.get('w') || DEFAULT_WID;
const SEED = params.get('seed');
```
Then remove the now-dead missing-id branch — find:
```js
if (!WID) {
  showMessage('⚠️ Không tìm thấy vòng quay', 'Thiếu mã vòng quay trong đường dẫn (?w=...).');
} else if (firebaseConfig.apiKey === 'PASTE_API_KEY') {
```
and replace with:
```js
if (firebaseConfig.apiKey === 'PASTE_API_KEY') {
```
(WID always has a value now.)

- [ ] **Step 2: Add hosting rewrites + remove index.html + create groups.html.** Edit `firebase.json` `hosting` to add a `rewrites` array (keep `public` + `ignore`):
```json
"hosting": {
  "public": "public",
  "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
  "rewrites": [
    { "source": "/groups", "destination": "/groups.html" },
    { "source": "/", "destination": "/wheel.html" }
  ]
}
```
Then:
```bash
cd /Users/bason/Documents/bason-labs/wheel-spin
git rm public/index.html
cp group-wheel.html public/groups.html
```

- [ ] **Step 3: Refresh deploy copies of the engine files.**
```bash
cd /Users/bason/Documents/bason-labs/wheel-spin
cp wheel-types.js public/wheel-types.js
cp wheel.html public/wheel.html
diff -q wheel-types.js public/wheel-types.js && diff -q wheel.html public/wheel.html && echo OK
```

- [ ] **Step 4: Seed the fixed `home` config (one-time REST PUT to the open RTDB).** Write the topicgroup config for room `home`. Run:
```bash
curl -fsS -X PUT 'https://wheel-spin-a6f34-default-rtdb.firebaseio.com/wheels/home/config.json' \
  -H 'Content-Type: application/json' \
  -d '{"type":"topicgroup","title":"Vòng quay chủ đề — 8 nhóm","createdTs":0,
"topics":["Chủ đề 1","Chủ đề 2","Chủ đề 3","Chủ đề 4","Chủ đề 5","Chủ đề 6","Chủ đề 7","Chủ đề 8","Chủ đề 9","Chủ đề 10","Chủ đề 11","Chủ đề 12","Chủ đề 13"],
"groups":[{"key":"g1","name":"Group 1","color":"#10b981","dark":"#059669"},{"key":"g2","name":"Group 2","color":"#8b5cf6","dark":"#7c3aed"},{"key":"g3","name":"Group 3","color":"#f59e0b","dark":"#d97706"},{"key":"g4","name":"Group 4","color":"#ec4899","dark":"#db2777"},{"key":"g5","name":"Group 5","color":"#3b82f6","dark":"#2563eb"},{"key":"g6","name":"Group 6","color":"#ef4444","dark":"#dc2626"},{"key":"g7","name":"Group 7","color":"#14b8a6","dark":"#0d9488"},{"key":"g8","name":"Group 8","color":"#a855f7","dark":"#9333ea"}]}'
echo; echo "seeded home config"
```
(`createdTs:0` is fine for a seeded record. Topic titles are placeholders the user edits later / via the admin page.)

- [ ] **Step 5: Deploy hosting.**
```bash
cd /Users/bason/Documents/bason-labs/wheel-spin && firebase deploy --only hosting 2>&1 | tail -15
```
Expected: `Deploy complete!`

- [ ] **Step 6: Verify live routing + the home wheel (Playwright MCP + curl).**
  - `curl -s -o /dev/null -w "%{http_code}\n" https://wheel-spin-a6f34.web.app/` → 200.
  - `curl -s https://wheel-spin-a6f34.web.app/ | grep -o '<title>[^<]*</title>'` → `<title>Vòng quay</title>` (the engine page, not the old "chia nhóm" title).
  - `curl -s https://wheel-spin-a6f34.web.app/groups | grep -o '<title>[^<]*</title>'` → `<title>Vòng quay chia nhóm</title>` (original splitter preserved).
  - Playwright: navigate to `https://wheel-spin-a6f34.web.app/`, wait for load. Confirm a 13-segment topic wheel, an 8-group dropdown, progress `0/8 nhóm`, NO `?w=` in the address bar, no console errors. Select Group 1, spin, wait ~5s, confirm a unique topic locks and progress reads `1/8`.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat(engine): make / the 8-group/13-topic topic wheel; move splitter to /groups; deploy"`

> **PHASE A milestone:** the user's clean home link is live. Pause point for review if executing in batches.

---

## PHASE B — `groupdiv` type (the original splitter, as an engine type)

### Task 4: Shared helpers `stripVN` + `findDuplicate`

**Files:**
- Modify: `wheel-types.js`
- Test: `tests/dup.test.js`

**Interfaces:**
- Produces: `stripVN(s) -> string`, `findDuplicate(name, existingNames) -> string|null` (the existing name `name` likely duplicates, else null).

- [ ] **Step 1: Write the failing test** — create `tests/dup.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripVN, findDuplicate } from '../wheel-types.js';

test('stripVN normalizes Vietnamese diacritics + case + spacing', () => {
  assert.equal(stripVN('  Nguyễn   Văn  An '), 'nguyen van an');
  assert.equal(stripVN('Đỗ Thị Bình'), 'do thi binh');
});

test('findDuplicate matches exact, token-subset, shared last name', () => {
  const existing = ['Nguyễn Văn An', 'Trần Bình'];
  assert.equal(findDuplicate('nguyen van an', existing), 'Nguyễn Văn An'); // exact (normalized)
  assert.equal(findDuplicate('An', ['Nguyễn Văn An']), 'Nguyễn Văn An');   // token subset
  assert.equal(findDuplicate('Lê Bình', ['Trần Bình']), 'Trần Bình');      // shared last name
});

test('findDuplicate returns null on no match / empty', () => {
  assert.equal(findDuplicate('Hoàng Yến', ['Trần Bình']), null);
  assert.equal(findDuplicate('', ['Trần Bình']), null);
  assert.equal(findDuplicate('x', []), null);
});
```

- [ ] **Step 2: Run it (fails)** — `node --test tests/dup.test.js` → FAIL.

- [ ] **Step 3: Add the helpers to `wheel-types.js`** (ported from `group-wheel.html:114,168-177`):
```js
export const stripVN = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase().trim().replace(/\s+/g, ' ');

export function findDuplicate(name, existingNames) {
  const a = stripVN(name); if (!a) return null;
  const at = a.split(' ');
  for (const ex of (existingNames || [])) {
    const b = stripVN(ex), bt = b.split(' ');
    if (a === b) return ex;
    if (at.every(t => bt.includes(t)) || bt.every(t => at.includes(t))) return ex;
    if (at[at.length - 1] === bt[bt.length - 1]) return ex;
  }
  return null;
}
```

- [ ] **Step 4: Run it (passes)** — `node --test tests/dup.test.js` → PASS. Then `npm test` → all pass.
- [ ] **Step 5: Commit** — `git add wheel-types.js tests/dup.test.js && git commit -m "feat(engine): port stripVN + findDuplicate name-matching helpers"`

---

### Task 5: `WHEEL_TYPES.groupdiv` registry entry

**Files:**
- Modify: `wheel-types.js`
- Test: `tests/groupdiv-type.test.js`

**Interfaces:**
- Consumes: `esc`, `findDuplicate`.
- Produces: `WHEEL_TYPES.groupdiv` (identity `device`), incl. `confirmSpin`, `mineFrom`.

- [ ] **Step 1: Write the failing test** — create `tests/groupdiv-type.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WHEEL_TYPES } from '../wheel-types.js';

const T = () => WHEEL_TYPES.groupdiv;
const cfg = () => ({ maxPerGroup: 2, groups: [
  {key:'g1',name:'G1',color:'#10b981',dark:'#059669'},
  {key:'g2',name:'G2',color:'#8b5cf6',dark:'#7c3aed'} ] });

test('metadata + identity', () => {
  assert.equal(T().key, 'groupdiv');
  assert.equal(T().identity, 'device');
});

test('defaultConfig has groups + maxPerGroup', () => {
  const c = T().defaultConfig();
  assert.ok(c.groups.length >= 1 && c.maxPerGroup >= 1);
});

test('validate', () => {
  assert.equal(T().validate(cfg()), null);
  assert.match(T().validate({groups:[],maxPerGroup:6}), /nhóm/i);
  assert.match(T().validate({groups:cfg().groups,maxPerGroup:0}), /tối đa|>=|1/i);
});

test('assign: one spin per device, fills groups, reports full', () => {
  const c = cfg(), cur = {};
  const r1 = T().assign(cur, { ui:{name:'An'}, config:c, identityKey:'devA' });
  assert.ok([0,1].includes(r1.targetIndex));
  assert.equal(cur.spins.devA.name, 'An');
  // same device cannot spin again
  assert.deepEqual(T().assign(cur, { ui:{name:'An2'}, config:c, identityKey:'devA' }), { reason:'spun' });
  // fill to capacity (maxPerGroup 2 x 2 groups = 4 total; 1 used)
  T().assign(cur, { ui:{name:'B'}, config:c, identityKey:'devB' });
  T().assign(cur, { ui:{name:'C'}, config:c, identityKey:'devC' });
  T().assign(cur, { ui:{name:'D'}, config:c, identityKey:'devD' });
  assert.deepEqual(T().assign(cur, { ui:{name:'E'}, config:c, identityKey:'devE' }), { reason:'full' });
});

test('availableIndices excludes full groups; segments dims them', () => {
  const c = cfg();
  const state = { members: { g1:['a','b'], g2:['c'] } };
  assert.deepEqual(T().availableIndices(c, state), [1]); // g1 full (2/2)
  assert.equal(T().segments(c, state)[0].dim, true);
  assert.equal(T().segments(c, state)[1].dim, false);
});

test('mineFrom resolves a device spin', () => {
  const state = { spins: { devA: { group:'g1', name:'An' } } };
  assert.deepEqual(T().mineFrom(cfg(), state, 'devA'), { group:'g1', name:'An' });
  assert.equal(T().mineFrom(cfg(), state, 'devZ'), null);
});

test('confirmSpin returns true when no duplicate (no existing members)', () => {
  // with empty state there is no duplicate, so it proceeds without calling confirm()
  assert.equal(T().confirmSpin(cfg(), { members:{} }, { name:'Brand New' }), true);
});
```

- [ ] **Step 2: Run it (fails)** — `node --test tests/groupdiv-type.test.js` → FAIL.

- [ ] **Step 3: Add `WHEEL_TYPES.groupdiv` to `wheel-types.js`:**
```js
const allMemberNames = state => {
  const m = (state && state.members) || {};
  return Object.values(m).flat();
};

WHEEL_TYPES.groupdiv = {
  key: 'groupdiv',
  name: 'Chia nhóm',
  identity: 'device',

  defaultConfig() {
    return {
      groups: [
        { key: 'g1', name: 'Group 1', color: '#10b981', dark: '#059669' },
        { key: 'g2', name: 'Group 2', color: '#8b5cf6', dark: '#7c3aed' },
      ],
      maxPerGroup: 6,
    };
  },
  configFields: [
    { kind: 'groups', key: 'groups', label: 'Các nhóm' },
    { kind: 'number', key: 'maxPerGroup', label: 'Số người tối đa mỗi nhóm', min: 1, default: 6 },
  ],
  validate(config) {
    const groups = (config && config.groups) || [];
    if (!Array.isArray(groups) || !groups.length || !groups.every(g => String(g.name || '').trim()))
      return 'Cần ít nhất 1 nhóm có tên.';
    if (!(Number(config.maxPerGroup) >= 1)) return 'Số người tối đa mỗi nhóm phải >= 1.';
    return null;
  },

  segments(config, state) {
    const m = (state && state.members) || {};
    return config.groups.map(g => ({
      label: g.name, color: g.color, dark: g.dark,
      dim: (m[g.key] ? m[g.key].length : 0) >= config.maxPerGroup,
    }));
  },
  availableIndices(config, state) {
    const m = (state && state.members) || {};
    return config.groups.map((_, i) => i).filter(i => (m[config.groups[i].key] ? m[config.groups[i].key].length : 0) < config.maxPerGroup);
  },
  participantControls(config, state, mine) {
    if (mine) return '';
    return `<div class="field"><label>Tên của bạn</label>
      <input id="nameInput" type="text" placeholder="Ví dụ: Minh, Lan..." maxlength="24" autocomplete="off"></div>`;
  },
  readSelection(rootEl) {
    const i = rootEl.querySelector('#nameInput');
    return { name: i ? i.value.trim() : '' };
  },
  canSpin(config, state, ui, mine) {
    return !mine && !!(ui && ui.name) && this.availableIndices(config, state).length > 0;
  },
  confirmSpin(config, state, ui) {
    const dup = findDuplicate(ui.name, allMemberNames(state));
    if (!dup) return true;
    if (typeof confirm === 'undefined') return true;
    return confirm(`Tên "${ui.name}" có vẻ trùng với "${dup}" đã có.\n\nĐây có phải NGƯỜI KHÁC không?\n\n• OK = người khác → vẫn quay\n• Cancel = cùng người → dừng lại`);
  },
  assign(cur, { ui, config, identityKey }) {
    cur.members = (cur.members && typeof cur.members === 'object') ? cur.members : {};
    cur.spins = (cur.spins && typeof cur.spins === 'object') ? cur.spins : {};
    config.groups.forEach(g => { if (!Array.isArray(cur.members[g.key])) cur.members[g.key] = []; });
    if (cur.spins[identityKey]) return { reason: 'spun' };
    const open = config.groups.filter(g => cur.members[g.key].length < config.maxPerGroup);
    if (!open.length) return { reason: 'full' };
    const pick = open[Math.floor(Math.random() * open.length)];
    cur.members[pick.key].push(ui.name);
    cur.spins[identityKey] = { group: pick.key, name: ui.name, ts: Date.now() };
    return { targetIndex: config.groups.findIndex(g => g.key === pick.key) };
  },
  mineFrom(config, state, identityKey) {
    const s = state && state.spins && state.spins[identityKey];
    return s ? { group: s.group, name: s.name } : null;
  },
  claimKey() { return null; },

  resultView(config, state, mine) {
    if (!mine) return '';
    const g = config.groups.find(x => x.key === mine.group);
    const gname = g ? g.name : mine.group;
    const color = g ? g.color : '#10b981', dark = g ? g.dark : '#059669';
    return `<div class="result-card"><div class="crown">🎉</div>
      <div class="who"><b>${esc(mine.name)}</b>, bạn đã được xếp vào</div>
      <div class="grp" style="background:linear-gradient(135deg,${color},${dark})">${esc(gname)}</div>
      <div class="note">Mỗi người chỉ quay 1 lần · Kết quả đã được lưu</div></div>`;
  },
  panel(config, state, mine) {
    const m = (state && state.members) || {};
    const total = config.groups.reduce((n, g) => n + (m[g.key] ? m[g.key].length : 0), 0);
    const cap = config.groups.length * config.maxPerGroup;
    const cells = config.groups.map(g => {
      const arr = m[g.key] || [];
      const pct = Math.round(arr.length / config.maxPerGroup * 100);
      const lis = arr.length ? arr.map(n => {
        const isMe = mine && mine.group === g.key && mine.name === n;
        const initial = (String(n).trim()[0] || '?').toUpperCase();
        return `<li class="member ${isMe ? 'me' : ''}"><span class="avatar">${esc(initial)}</span><span>${esc(n)}</span>${isMe ? '<span class="you">(bạn)</span>' : ''}</li>`;
      }).join('') : `<li class="empty">Chưa có ai...</li>`;
      return `<div class="group" style="--gc:${g.color};--gcd:${g.dark};border-color:${g.color}66">
        <div class="ghead"><span class="gname"><span class="gtag"></span>${esc(g.name)}</span><span class="gcount">${arr.length}/${config.maxPerGroup}</span></div>
        <div class="bar"><i style="width:${pct}%"></i></div>
        <ul class="members">${lis}</ul></div>`;
    }).join('');
    return `<div class="progress-top"><span>Đã chọn:</span><span class="pill">${total}/${cap}</span></div>
      <div class="groups">${cells}</div>`;
  },
};
```

- [ ] **Step 4: Run it (passes)** — `node --test tests/groupdiv-type.test.js` → PASS. Then `npm test` → all pass (26 + 3 dup + 7 groupdiv = 36).
- [ ] **Step 5: Commit** — `git add wheel-types.js tests/groupdiv-type.test.js && git commit -m "feat(engine): WHEEL_TYPES.groupdiv — people→groups, device identity, dup-name guard"`

---

### Task 6: Deploy copies + groupdiv end-to-end verification + full regression

**Files:**
- Create deploy copies: `public/wheel-types.js`, `public/wheel.html`

**Interfaces:** none.

- [ ] **Step 1: Refresh deploy copies.**
```bash
cd /Users/bason/Documents/bason-labs/wheel-spin
cp wheel-types.js public/wheel-types.js
cp wheel.html public/wheel.html
diff -q wheel-types.js public/wheel-types.js && diff -q wheel.html public/wheel.html && echo OK
```

- [ ] **Step 2: Full unit suite** — `npm test` → all pass (36).

- [ ] **Step 3: Verify groupdiv end-to-end (live Firebase).** Start `python3 -m http.server 8123` (background). Playwright: navigate to `http://localhost:8123/wheel.html?w=gd-verify-A&seed=groupdiv` (fresh id). Confirm: a 2-segment group wheel, a "Tên của bạn" input, progress `0/12`. Type "Minh", spin, wait ~5s: assigned to a group, panel shows "Minh" under it with a count, progress `1/12`. Reload: shows the locked result for this device. Type a near-duplicate name in a fresh device context to confirm the `confirm()` guard fires (the dialog appears). Stop the server. No console errors.

- [ ] **Step 4: Regression — home + groups + simple still work.** With the server running (or against live), confirm via Playwright/curl: `http://localhost:8123/wheel.html?w=home` renders the topic wheel; `http://localhost:8123/groups.html` renders the original splitter; `http://localhost:8123/wheel.html?w=sx&seed=simple` renders the simple wheel. Stop the server.

- [ ] **Step 5: Deploy hosting** (publishes groupdiv availability + refreshed engine):
```bash
cd /Users/bason/Documents/bason-labs/wheel-spin && firebase deploy --only hosting 2>&1 | tail -12
```

- [ ] **Step 6: Commit** — `git add public/wheel-types.js public/wheel.html && git commit -m "chore(engine): deploy copies; groupdiv verified end-to-end"`

---

## Notes for Sub-project 3 (admin)

- The `?seed=` path in `wheel.html` is still the temporary affordance (marked for removal). Sub-project 3's admin page creates configs properly and can edit the `home` wheel's topics/groups.
- All three types now expose `configFields`/`validate`/`defaultConfig`, ready for the generic admin form renderer.
- The `home` wheel config lives at `wheels/home/config`; the admin "edit" flow should target it so the user can set real topic titles without code.
