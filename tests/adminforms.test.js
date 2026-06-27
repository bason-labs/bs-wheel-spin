import { test } from 'node:test';
import assert from 'node:assert/strict';
import { darken, renderConfigForm, groupsFromRows } from '../public/engine/adminforms.js';
import { WHEEL_TYPES } from '../public/engine/index.js';

test('darken returns a valid darker #rrggbb', () => {
  const d = darken('#10b981');
  assert.match(d, /^#[0-9a-f]{6}$/);
  assert.notEqual(d, '#10b981');
  assert.equal(darken('#ffffff').length, 7);
  assert.equal(darken('#000000'), '#000000');
});

test('groupsFromRows assigns positional keys + derived dark', () => {
  const g = groupsFromRows([{ name: 'A', color: '#10b981' }, { name: 'B', color: '#8b5cf6' }]);
  assert.equal(g.length, 2);
  assert.deepEqual(g.map(x => x.key), ['g1', 'g2']);
  assert.equal(g[0].name, 'A'); assert.equal(g[0].color, '#10b981');
  assert.match(g[0].dark, /^#[0-9a-f]{6}$/);
});

test('renderConfigForm(simple) has a title + options list + removeAfterPick checkbox', () => {
  const cfg = WHEEL_TYPES.simple.defaultConfig();
  const html = renderConfigForm(WHEEL_TYPES.simple, { title: 'Demo', ...cfg });
  assert.match(html, /name="title"|data-field="title"/);
  assert.match(html, /value="Demo"/);
  assert.match(html, /data-field="options"/);          // the list field container
  assert.equal((html.match(/data-list-row=/g) || []).length, cfg.options.length); // one row per option
  assert.match(html, /type="checkbox"[^>]*data-field="removeAfterPick"/);
});

test('renderConfigForm(topicgroup) renders topics list + groups rows with color inputs', () => {
  const cfg = WHEEL_TYPES.topicgroup.defaultConfig();
  const html = renderConfigForm(WHEEL_TYPES.topicgroup, { title: 'T', ...cfg });
  assert.equal((html.match(/data-list-row=/g) || []).length, cfg.topics.length); // 13
  assert.equal((html.match(/data-group-row=/g) || []).length, cfg.groups.length); // 8
  assert.match(html, /type="color"/);
});

test('renderConfigForm(groupdiv) renders groups rows + a number input', () => {
  const cfg = WHEEL_TYPES.groupdiv.defaultConfig();
  const html = renderConfigForm(WHEEL_TYPES.groupdiv, { title: 'G', ...cfg });
  assert.equal((html.match(/data-group-row=/g) || []).length, cfg.groups.length);
  assert.match(html, /type="number"[^>]*data-field="maxPerGroup"/);
  assert.match(html, /value="6"/);
});

test('renderConfigForm escapes user values', () => {
  const html = renderConfigForm(WHEEL_TYPES.simple, { title: '<x>"', options: ['<b>'], removeAfterPick: true });
  assert.ok(!html.includes('<x>"'));         // title escaped
  assert.match(html, /&lt;x&gt;/);
});

test('renderConfigForm(custom) renders segment rows (color+label+weight) + theme section', () => {
  const cfg = WHEEL_TYPES.custom.defaultConfig();
  const html = renderConfigForm(WHEEL_TYPES.custom, { title: 'C', ...cfg });
  assert.equal((html.match(/data-segment-row=/g) || []).length, cfg.segments.length);
  assert.match(html, /class="seg-label"/);
  assert.match(html, /class="seg-weight"/);
  assert.match(html, /data-theme="accent"/);
  assert.match(html, /data-theme="bg"/);
  assert.match(html, /data-theme="sound"/);
});

test('theme section is present for a topicgroup wheel too (cross-type)', () => {
  const cfg = WHEEL_TYPES.topicgroup.defaultConfig();
  const html = renderConfigForm(WHEEL_TYPES.topicgroup, { title: 'T', ...cfg });
  assert.match(html, /data-theme="accent"/);
});
