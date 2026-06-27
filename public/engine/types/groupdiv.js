/* engine/types/groupdiv.js — "Chia nhóm" people→groups, device identity, dup-name guard. */
import { esc, findDuplicate } from '../helpers.js';

const allMemberNames = state => {
  const m = (state && state.members) || {};
  return Object.values(m).flat();
};

const HEX = /^#[0-9a-fA-F]{6}$/;

export const groupdiv = {
  key: 'groupdiv',
  name: 'Chia nhóm',
  identity: 'device',

  defaultConfig() {
    return {
      groups: [
        { key: 'g1', name: 'Group 1', color: '#10b981', dark: '#059669' },
        { key: 'g2', name: 'Group 2', color: '#8b5cf6', dark: '#7c3aed' },
      ],
      maxPerGroup: 6,
    };
  },
  configFields: [
    { kind: 'groups', key: 'groups', label: 'Các nhóm' },
    { kind: 'number', key: 'maxPerGroup', label: 'Số người tối đa mỗi nhóm', min: 1, default: 6 },
  ],
  validate(config) {
    const groups = (config && config.groups) || [];
    if (!Array.isArray(groups) || !groups.length || !groups.every(g => String(g.name || '').trim()))
      return 'Cần ít nhất 1 nhóm có tên.';
    if (!(Number(config.maxPerGroup) >= 1)) return 'Số người tối đa mỗi nhóm phải >= 1.';
    if (groups.some(g => !HEX.test(g.color) || !HEX.test(g.dark))) return 'Màu nhóm không hợp lệ (cần #rrggbb).';
    return null;
  },

  segments(config, state) {
    const m = (state && state.members) || {};
    return config.groups.map(g => ({
      label: g.name, color: g.color, dark: g.dark,
      dim: (m[g.key] ? m[g.key].length : 0) >= config.maxPerGroup,
    }));
  },
  availableIndices(config, state) {
    const m = (state && state.members) || {};
    return config.groups.map((_, i) => i).filter(i => (m[config.groups[i].key] ? m[config.groups[i].key].length : 0) < config.maxPerGroup);
  },
  participantControls(config, state, mine) {
    if (mine) return '';
    return `<div class="field"><label>Tên của bạn</label>
      <input id="nameInput" type="text" placeholder="Ví dụ: Minh, Lan..." maxlength="24" autocomplete="off"></div>`;
  },
  readSelection(rootEl) {
    const i = rootEl.querySelector('#nameInput');
    return { name: i ? i.value.trim() : '' };
  },
  canSpin(config, state, ui, mine) {
    return !mine && !!(ui && ui.name) && this.availableIndices(config, state).length > 0;
  },
  confirmSpin(config, state, ui) {
    const dup = findDuplicate(ui.name, allMemberNames(state));
    if (!dup) return true;
    if (typeof confirm === 'undefined') return true;
    return confirm(`Tên "${ui.name}" có vẻ trùng với "${dup}" đã có.\n\nĐây có phải NGƯỜI KHÁC không?\n\n• OK = người khác → vẫn quay\n• Cancel = cùng người → dừng lại`);
  },
  assign(cur, { ui, config, identityKey }) {
    cur.members = (cur.members && typeof cur.members === 'object') ? cur.members : {};
    cur.spins = (cur.spins && typeof cur.spins === 'object') ? cur.spins : {};
    config.groups.forEach(g => { if (!Array.isArray(cur.members[g.key])) cur.members[g.key] = []; });
    if (cur.spins[identityKey]) return { reason: 'spun' };
    const open = config.groups.filter(g => cur.members[g.key].length < config.maxPerGroup);
    if (!open.length) return { reason: 'full' };
    const pick = open[Math.floor(Math.random() * open.length)];
    cur.members[pick.key].push(ui.name);
    cur.spins[identityKey] = { group: pick.key, name: ui.name, ts: Date.now() };
    return { targetIndex: config.groups.findIndex(g => g.key === pick.key) };
  },
  mineFrom(config, state, identityKey) {
    const s = state && state.spins && state.spins[identityKey];
    return s ? { group: s.group, name: s.name } : null;
  },
  claimKey() { return null; },

  resultView(config, state, mine) {
    if (!mine) return '';
    const g = config.groups.find(x => x.key === mine.group);
    const gname = g ? g.name : mine.group;
    const color = g ? g.color : '#10b981', dark = g ? g.dark : '#059669';
    return `<div class="result-card"><div class="crown">🎉</div>
      <div class="who"><b>${esc(mine.name)}</b>, bạn đã được xếp vào</div>
      <div class="grp" style="background:linear-gradient(135deg,${color},${dark})">${esc(gname)}</div>
      <div class="note">Mỗi người chỉ quay 1 lần · Kết quả đã được lưu</div></div>`;
  },
  panel(config, state, mine) {
    const m = (state && state.members) || {};
    const total = config.groups.reduce((n, g) => n + (m[g.key] ? m[g.key].length : 0), 0);
    const cap = config.groups.length * config.maxPerGroup;
    const cells = config.groups.map(g => {
      const arr = m[g.key] || [];
      const pct = Math.round(arr.length / config.maxPerGroup * 100);
      const lis = arr.length ? arr.map(n => {
        const isMe = mine && mine.group === g.key && mine.name === n;
        const initial = (String(n).trim()[0] || '?').toUpperCase();
        return `<li class="member ${isMe ? 'me' : ''}"><span class="avatar">${esc(initial)}</span><span>${esc(n)}</span>${isMe ? '<span class="you">(bạn)</span>' : ''}</li>`;
      }).join('') : `<li class="empty">Chưa có ai...</li>`;
      return `<div class="group" style="--gc:${g.color};--gcd:${g.dark};border-color:${g.color}66">
        <div class="ghead"><span class="gname"><span class="gtag"></span>${esc(g.name)}</span><span class="gcount">${arr.length}/${config.maxPerGroup}</span></div>
        <div class="bar"><i style="width:${pct}%"></i></div>
        <ul class="members">${lis}</ul></div>`;
    }).join('');
    return `<div class="progress-top"><span>Đã chọn:</span><span class="pill">${total}/${cap}</span></div>
      <div class="groups">${cells}</div>`;
  },
};
