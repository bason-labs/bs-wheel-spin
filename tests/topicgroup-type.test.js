import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WHEEL_TYPES } from '../public/engine/index.js';

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
