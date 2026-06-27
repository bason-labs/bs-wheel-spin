/* engine/types/custom.js — "Tùy chỉnh" host-screen picker with hand-defined weighted segments. */
import { darken } from '../geometry.js';
import { esc } from '../helpers.js';

const HEX = /^#[0-9a-fA-F]{6}$/;
const pickedArr = state => Array.isArray(state && state.picked) ? state.picked : [];
const wOf = s => { const w = Number(s.weight); return Number.isFinite(w) && w >= 1 ? Math.floor(w) : 1; };

export const custom = {
  key: 'custom',
  name: 'Tùy chỉnh',
  identity: 'none',

  defaultConfig() {
    return {
      segments: [
        { label: 'Mục 1', color: '#10b981' },
        { label: 'Mục 2', color: '#8b5cf6' },
        { label: 'Mục 3', color: '#f59e0b' },
      ],
      removeAfterPick: true,
    };
  },
  configFields: [
    { kind: 'segments', key: 'segments', label: 'Các mục' },
    { kind: 'bool', key: 'removeAfterPick', label: 'Không lặp lại kết quả đã quay' },
  ],
  validate(config) {
    const segs = (config && config.segments) || [];
    if (!Array.isArray(segs) || !segs.some(s => String(s.label || '').trim())) return 'Cần ít nhất 1 mục có tên.';
    if (segs.some(s => !HEX.test(s.color))) return 'Màu mục không hợp lệ (cần #rrggbb).';
    if (segs.some(s => s.weight != null && !(Number.isInteger(Number(s.weight)) && Number(s.weight) >= 1))) return 'Trọng số phải là số nguyên ≥ 1.';
    return null;
  },

  segments(config, state) {
    const picked = pickedArr(state);
    return config.segments.map((s, i) => ({
      label: s.label,
      color: s.color,
      dark: darken(s.color),
      dim: !!config.removeAfterPick && picked.includes(i),
    }));
  },
  availableIndices(config, state) {
    const picked = pickedArr(state);
    return config.segments.map((_, i) => i).filter(i => !config.removeAfterPick || !picked.includes(i));
  },
  participantControls() { return ''; },
  readSelection() { return {}; },
  canSpin(config, state, _ui, _mine) { return this.availableIndices(config, state).length > 0; },

  assign(cur, { config, rng = Math.random }) {
    cur.picked = Array.isArray(cur.picked) ? cur.picked : [];
    const avail = config.segments.map((_, i) => i).filter(i => !config.removeAfterPick || !cur.picked.includes(i));
    if (!avail.length) return { reason: 'full' };
    const total = avail.reduce((t, i) => t + wOf(config.segments[i]), 0);
    let r = rng() * total;
    let pick = avail[avail.length - 1];
    for (const i of avail) { r -= wOf(config.segments[i]); if (r < 0) { pick = i; break; } }
    cur.picked.push(pick);
    return { targetIndex: pick };
  },

  resultView(config, state) {
    const picked = pickedArr(state);
    if (!picked.length) return '';
    const i = picked[picked.length - 1];
    const s = config.segments[i] || { label: '?', color: '#10b981' };
    return `<div class="result-card"><div class="crown">🎉</div>
        <div class="who">Kết quả</div>
        <div class="grp" style="background:linear-gradient(135deg,${s.color},${darken(s.color)})">${esc(s.label ?? '?')}</div>
        <div class="note">Nhấn QUAY để quay tiếp</div></div>`;
  },
  panel(config, state) {
    const picked = pickedArr(state);
    const remaining = config.removeAfterPick ? (config.segments.length - picked.length) : '∞';
    const items = picked.slice().reverse().map((i, n) => {
      const s = config.segments[i] || { label: '?', color: '#10b981' };
      return `<li class="member"><span class="avatar" style="--gc:${s.color};--gcd:${darken(s.color)}">${picked.length - n}</span><span>${esc(s.label ?? '?')}</span></li>`;
    }).join('') || `<li class="empty">Chưa quay lần nào...</li>`;
    return `<div class="groups"><div class="group" style="--gc:#fbbf24;--gcd:#f59e0b;border-color:#fbbf2466">
        <div class="ghead"><span class="gname">Đã quay</span><span class="gcount">Còn lại: ${remaining}</span></div>
        <ul class="members">${items}</ul></div></div>`;
  },
  claimKey() { return null; },
};
