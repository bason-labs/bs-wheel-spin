import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WHEEL_TYPES } from '../public/engine/index.js';

const T = () => WHEEL_TYPES.simple;

test('metadata', () => {
  assert.equal(T().key, 'simple');
  assert.equal(T().identity, 'none');
  assert.equal(typeof T().name, 'string');
});

test('defaultConfig has non-empty options and removeAfterPick', () => {
  const c = T().defaultConfig();
  assert.ok(Array.isArray(c.options) && c.options.length > 0);
  assert.equal(typeof c.removeAfterPick, 'boolean');
});

test('validate rejects empty / blank option lists', () => {
  assert.equal(T().validate({ options: ['x'], removeAfterPick: true }), null);
  assert.match(T().validate({ options: [], removeAfterPick: true }), /lựa chọn/i);
  assert.match(T().validate({ options: ['  ', ''], removeAfterPick: true }), /lựa chọn/i);
});

test('availableIndices excludes picked only when removeAfterPick', () => {
  const cfg = { options: ['a', 'b', 'c'], removeAfterPick: true };
  assert.deepEqual(T().availableIndices(cfg, { picked: [1] }), [0, 2]);
  const cfg2 = { ...cfg, removeAfterPick: false };
  assert.deepEqual(T().availableIndices(cfg2, { picked: [1] }), [0, 1, 2]);
});

test('assign appends a pick, never repeats when removeAfterPick, then reports full', () => {
  const cfg = { options: ['a', 'b'], removeAfterPick: true };
  const cur = {};
  const r1 = T().assign(cur, { config: cfg });
  assert.ok(r1.targetIndex === 0 || r1.targetIndex === 1);
  assert.deepEqual(cur.picked, [r1.targetIndex]);
  const r2 = T().assign(cur, { config: cfg });
  assert.notEqual(r2.targetIndex, r1.targetIndex);
  assert.equal(cur.picked.length, 2);
  const r3 = T().assign(cur, { config: cfg });
  assert.deepEqual(r3, { reason: 'full' });
});

test('assign can repeat when removeAfterPick is false', () => {
  const cfg = { options: ['only'], removeAfterPick: false };
  const cur = {};
  assert.equal(T().assign(cur, { config: cfg }).targetIndex, 0);
  assert.equal(T().assign(cur, { config: cfg }).targetIndex, 0);
  assert.equal(cur.picked.length, 2);
});

test('segments dims picked options when removeAfterPick', () => {
  const cfg = { options: ['a', 'b'], removeAfterPick: true };
  const segs = T().segments(cfg, { picked: [0] });
  assert.equal(segs.length, 2);
  assert.equal(segs[0].dim, true);
  assert.equal(segs[1].dim, false);
  assert.equal(segs[0].label, 'a');
});

test('canSpin false when nothing available', () => {
  const cfg = { options: ['a'], removeAfterPick: true };
  assert.equal(T().canSpin(cfg, { picked: [] }, {}, null), true);
  assert.equal(T().canSpin(cfg, { picked: [0] }, {}, null), false);
});
