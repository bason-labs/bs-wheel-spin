import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, deviceId, makeWheelId } from '../public/engine/index.js';

test('esc escapes HTML-significant characters', () => {
  assert.equal(esc('<b>&"x"'), '&lt;b&gt;&amp;&quot;x&quot;');
  assert.equal(esc('plain'), 'plain');
});

test('deviceId returns a non-empty string and does not throw without localStorage', () => {
  const id = deviceId();
  assert.equal(typeof id, 'string');
  assert.ok(id.length > 0);
});

test('makeWheelId returns an 8-char url-safe id', () => {
  const id = makeWheelId();
  assert.match(id, /^[0-9a-zA-Z_-]{8}$/);
  assert.notEqual(makeWheelId(), ''); // generates something each call
});
