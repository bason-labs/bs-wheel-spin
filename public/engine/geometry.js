/* engine/geometry.js — color palette + wheel segment geometry/rendering. */
import { esc } from './helpers.js';

export function landingRotation(curRotation, idx, segCount, rng = Math.random) {
  const SEG = 360 / segCount;
  const base = (360 - (idx * SEG + SEG / 2)) % 360;
  const jitter = (rng() * 2 - 1) * (SEG / 2 - Math.min(8, SEG / 4));
  const targetMod = (((base + jitter) % 360) + 360) % 360;        // desired final angle (mod 360)
  let result = curRotation + 6 * 360;                             // at least 6 full turns ahead
  result += (((targetMod - (result % 360)) % 360) + 360) % 360;   // bump up to the target angle
  return result;
}

export function discHtml(segs, rotation) {
  const n = segs.length;
  const SEG = 360 / n;
  // Dimmed (taken) segments use an OPAQUE muted slate — not a translucent color,
  // which would otherwise let the dark page show through as a "hole"/line in the wheel.
  const DIM = '#3b4252';
  // Scale label text down + push it outward as the wheel gets denser, so labels don't overlap.
  const fontSize = n > 10 ? 11 : n > 6 ? 14 : 18;
  const r = n > 10 ? 36 : 31;
  const stops = segs
    .map((s, i) => `${s.dim ? DIM : s.color} ${i * SEG}deg ${(i + 1) * SEG}deg`)
    .join(',');
  const labels = segs.map((s, i) => {
    const a = (i * SEG + SEG / 2) * Math.PI / 180;
    return `<span class="label${s.dim ? ' dim' : ''}" style="left:${50 + r * Math.sin(a)}%;top:${50 - r * Math.cos(a)}%;font-size:${fontSize}px">${esc(s.label)}</span>`;
  }).join('');
  return `<div class="disc" id="disc" style="background:conic-gradient(${stops});transform:rotate(${rotation}deg)">${labels}</div>`;
}

export const PALETTE = [
  { color: '#10b981', dark: '#059669' }, { color: '#8b5cf6', dark: '#7c3aed' },
  { color: '#f59e0b', dark: '#d97706' }, { color: '#ec4899', dark: '#db2777' },
  { color: '#3b82f6', dark: '#2563eb' }, { color: '#ef4444', dark: '#dc2626' },
  { color: '#14b8a6', dark: '#0d9488' }, { color: '#a855f7', dark: '#9333ea' },
];

// A darker shade of a #rrggbb colour (used by types to derive a segment's dark edge,
// and by the admin form to derive a group/segment's dark from a picked colour).
export function darken(hex) {
  const m = /^#([0-9a-fA-F]{6})$/.exec(String(hex));
  if (!m) return '#000000';
  const n = parseInt(m[1], 16);
  const r = Math.max(0, ((n >> 16) & 255) - 40);
  const g = Math.max(0, ((n >> 8) & 255) - 40);
  const b = Math.max(0, (n & 255) - 40);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}
