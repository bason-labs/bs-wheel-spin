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
