import { test } from 'node:test';
import assert from 'node:assert/strict';
import { landingRotation, discHtml } from '../public/engine/index.js';

// With zero jitter, the pointer (top = 0deg) must sit at segment idx's center.
test('landingRotation centers the target segment under the top pointer', () => {
  const segCount = 13, idx = 5, SEG = 360 / segCount;
  const r = landingRotation(0, idx, segCount, () => 0.5); // 0.5 -> zero jitter
  // The wheel rotates by r; the segment that ends up at the top is the one whose
  // pre-rotation center angle equals (360 - r) mod 360.
  const atTop = ((360 - (r % 360)) % 360 + 360) % 360;
  const expectedCenter = idx * SEG + SEG / 2;
  assert.ok(Math.abs(atTop - expectedCenter) < 0.001, `atTop=${atTop} expected=${expectedCenter}`);
});

test('landingRotation spins at least 6 full turns forward', () => {
  const r = landingRotation(100, 0, 8, () => 0.5);
  assert.ok(r - 100 >= 6 * 360, `delta=${r - 100}`);
});

test('landingRotation jitter stays inside the segment', () => {
  const segCount = 8, idx = 3, SEG = 360 / segCount;
  for (const v of [0, 1, 0.5, 0.123, 0.987]) {
    const r = landingRotation(0, idx, segCount, () => v);
    const atTop = ((360 - (r % 360)) % 360 + 360) % 360;
    const lo = idx * SEG, hi = (idx + 1) * SEG;
    assert.ok(atTop > lo && atTop < hi, `v=${v} atTop=${atTop} not in (${lo},${hi})`);
  }
});

test('discHtml renders one label per segment and inlines rotation', () => {
  const html = discHtml([
    { label: 'A', color: '#10b981', dark: '#059669', dim: false },
    { label: 'B', color: '#8b5cf6', dark: '#7c3aed', dim: true },
  ], 720);
  assert.match(html, /conic-gradient/);
  assert.match(html, /rotate\(720deg\)/);
  assert.ok((html.match(/class="label/g) || []).length === 2);
  assert.match(html, />A</);
  assert.match(html, />B</);
});

test('landingRotation guarantees >=6 turns and correct landing from large/odd current rotations', () => {
  for (const cur of [359, 350.5, 7200 + 359, 12345.6]) {
    for (const v of [0, 1, 0.5]) {
      const r = landingRotation(cur, 3, 8, () => v);
      assert.ok(r - cur >= 6 * 360, `cur=${cur} v=${v} delta=${r - cur}`);
      const SEG = 360 / 8;
      const atTop = ((360 - (r % 360)) % 360 + 360) % 360;
      const lo = 3 * SEG, hi = 4 * SEG;
      assert.ok(atTop > lo && atTop < hi, `cur=${cur} v=${v} atTop=${atTop}`);
    }
  }
});
