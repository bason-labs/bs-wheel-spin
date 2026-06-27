/* engine/types/simple.js — "Quay ngẫu nhiên" host-screen picker. */
import { PALETTE } from '../geometry.js';
import { esc } from '../helpers.js';

const pickedArr = state => Array.isArray(state && state.picked) ? state.picked : [];

export const simple = {
  key: 'simple',
  name: 'Quay ngẫu nhiên',
  identity: 'none',

  defaultConfig() {
    return { options: ['Lựa chọn 1', 'Lựa chọn 2', 'Lựa chọn 3'], removeAfterPick: true };
  },
  configFields: [
    { kind: 'list', key: 'options', label: 'Các lựa chọn', itemPlaceholder: 'Nhập lựa chọn...' },
    { kind: 'bool', key: 'removeAfterPick', label: 'Không lặp lại kết quả đã quay' },
  ],
  validate(config) {
    const opts = (config && config.options) || [];
    if (!Array.isArray(opts) || !opts.some(o => String(o).trim())) return 'Cần ít nhất 1 lựa chọn.';
    return null;
  },

  segments(config, state) {
    const picked = pickedArr(state);
    return config.options.map((label, i) => ({
      label,
      color: PALETTE[i % PALETTE.length].color,
      dark: PALETTE[i % PALETTE.length].dark,
      dim: !!config.removeAfterPick && picked.includes(i),
    }));
  },
  availableIndices(config, state) {
    const picked = pickedArr(state);
    return config.options
      .map((_, i) => i)
      .filter(i => !config.removeAfterPick || !picked.includes(i));
  },
  participantControls() { return ''; },
  readSelection() { return {}; },
  canSpin(config, state, _ui, _mine) { return this.availableIndices(config, state).length > 0; },

  assign(cur, { config }) {
    cur.picked = Array.isArray(cur.picked) ? cur.picked : [];
    const avail = config.options
      .map((_, i) => i)
      .filter(i => !config.removeAfterPick || !cur.picked.includes(i));
    if (!avail.length) return { reason: 'full' };
    const pick = avail[Math.floor(Math.random() * avail.length)];
    cur.picked.push(pick);
    return { targetIndex: pick };
  },

  resultView(config, state) {
    const picked = pickedArr(state);
    if (!picked.length) return '';
    const i = picked[picked.length - 1];
    const p = PALETTE[i % PALETTE.length];
    return `<div class="result-card"><div class="crown">🎉</div>
      <div class="who">Kết quả</div>
      <div class="grp" style="background:linear-gradient(135deg,${p.color},${p.dark})">${esc(config.options[i])}</div>
      <div class="note">Nhấn QUAY để quay tiếp</div></div>`;
  },
  panel(config, state) {
    const picked = pickedArr(state);
    const remaining = config.removeAfterPick ? (config.options.length - picked.length) : '∞';
    const items = picked.slice().reverse().map((i, n) => {
      const p = PALETTE[i % PALETTE.length];
      return `<li class="member"><span class="avatar" style="--gc:${p.color};--gcd:${p.dark}">${picked.length - n}</span><span>${esc(config.options[i])}</span></li>`;
    }).join('') || `<li class="empty">Chưa quay lần nào...</li>`;
    return `<div class="groups"><div class="group" style="--gc:#fbbf24;--gcd:#f59e0b;border-color:#fbbf2466">
      <div class="ghead"><span class="gname">Đã quay</span><span class="gcount">Còn lại: ${remaining}</span></div>
      <ul class="members">${items}</ul></div></div>`;
  },
  claimKey() { return null; },
};
