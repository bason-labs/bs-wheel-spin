import { test } from 'node:test';
import assert from 'node:assert/strict';
import { burst, chime } from '../wheel-types.js';

test('chime is a no-op and does not throw without an audio context', () => {
  assert.doesNotThrow(() => chime(null));
  assert.doesNotThrow(() => chime(undefined));
});

test('burst does not throw when given no confetti element', () => {
  assert.doesNotThrow(() => burst({ color: '#fff', dark: '#000' }, null));
});
