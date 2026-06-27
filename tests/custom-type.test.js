import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WHEEL_TYPES } from '../public/engine/index.js';
const T = () => WHEEL_TYPES.custom;

test('metadata + defaultConfig', () => {
  assert.equal(T().key, 'custom');
  assert.equal(T().identity, 'none');
  const c = T().defaultConfig();
  assert.ok(c.segments.length >= 1 && c.segments.every(s => s.label && /^#[0-9a-f]{6}$/i.test(s.color)));
  assert.equal(typeof c.removeAfterPick, 'boolean');
});

test('validate: needs a labelled segment, hex colors, integer weight >= 1', () => {
  assert.equal(T().validate({ segments: [{ label: 'A', color: '#10b981' }], removeAfterPick: true }), null);
  assert.match(T().validate({ segments: [], removeAfterPick: true }), /mục/i);
  assert.match(T().validate({ segments: [{ label: 'A', color: 'red' }], removeAfterPick: true }), /màu/i);
  assert.match(T().validate({ segments: [{ label: 'A', color: '#10b981', weight: 0 }], removeAfterPick: true }), /trọng số|weight/i);
});

test('segments derive dark + dim picked when removeAfterPick', () => {
  const cfg = { segments: [{ label: 'A', color: '#10b981' }, { label: 'B', color: '#8b5cf6' }], removeAfterPick: true };
  const segs = T().segments(cfg, { picked: [0] });
  assert.equal(segs.length, 2);
  assert.match(segs[0].dark, /^#[0-9a-f]{6}$/);
  assert.equal(segs[0].dim, true); assert.equal(segs[1].dim, false);
});

test('assign respects removeAfterPick and reports full', () => {
  const cfg = { segments: [{ label: 'A', color: '#10b981' }, { label: 'B', color: '#8b5cf6' }], removeAfterPick: true };
  const cur = {};
  const r1 = T().assign(cur, { config: cfg }); assert.ok([0, 1].includes(r1.targetIndex));
  const r2 = T().assign(cur, { config: cfg }); assert.notEqual(r2.targetIndex, r1.targetIndex);
  assert.deepEqual(T().assign(cur, { config: cfg }), { reason: 'full' });
});

test('assign is weight-biased (injected RNG)', () => {
  // weights 1 and 9 → cumulative [1,10); rng 0.5 -> value 5 -> falls in segment B (index 1)
  const cfg = { segments: [{ label: 'A', color: '#10b981', weight: 1 }, { label: 'B', color: '#8b5cf6', weight: 9 }], removeAfterPick: false };
  const r = T().assign({}, { config: cfg, rng: () => 0.5 });   // 0.5 * 10 = 5 → B
  assert.equal(r.targetIndex, 1);
  const r0 = T().assign({}, { config: cfg, rng: () => 0.0 });  // 0 → A
  assert.equal(r0.targetIndex, 0);
});
