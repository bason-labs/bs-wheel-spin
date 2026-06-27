/* engine/types/topicgroup.js — "Chủ đề cho nhóm" unique-topic-per-group, group identity. */
import { PALETTE } from '../geometry.js';
import { esc } from '../helpers.js';

export const takenTopicSet = state =>
  new Set(Object.values((state && state.groups) || {}).map(a => a.topic));

const HEX = /^#[0-9a-fA-F]{6}$/;

export const topicgroup = {
  key: 'topicgroup',
  name: 'Chủ đề cho nhóm',
  identity: 'group',

  defaultConfig() {
    return {
      topics: Array.from({ length: 13 }, (_, i) => `CĐ ${i + 1}`),
      groups: Array.from({ length: 8 }, (_, i) => ({
        key: `g${i + 1}`, name: `Group ${i + 1}`,
        color: PALETTE[i % PALETTE.length].color, dark: PALETTE[i % PALETTE.length].dark,
      })),
    };
  },
  configFields: [
    { kind: 'list',   key: 'topics', label: 'Các chủ đề', itemPlaceholder: 'Nhập chủ đề...' },
    { kind: 'groups', key: 'groups', label: 'Các nhóm' },
  ],
  validate(config) {
    const topics = (config && config.topics) || [];
    const groups = (config && config.groups) || [];
    if (!Array.isArray(topics) || !topics.some(t => String(t).trim())) return 'Cần ít nhất 1 chủ đề.';
    if (!Array.isArray(groups) || !groups.length) return 'Cần ít nhất 1 nhóm.';
    if (groups.length > topics.length) return 'Số chủ đề phải lớn hơn hoặc bằng số nhóm.';
    if (groups.some(g => !HEX.test(g.color) || !HEX.test(g.dark))) return 'Màu nhóm không hợp lệ (cần #rrggbb).';
    return null;
  },

  segments(config, state) {
    const taken = takenTopicSet(state);
    return config.topics.map((label, i) => ({
      label,
      color: PALETTE[i % PALETTE.length].color,
      dark:  PALETTE[i % PALETTE.length].dark,
      dim: taken.has(i),
    }));
  },
  availableIndices(config, state) {
    const taken = takenTopicSet(state);
    return config.topics.map((_, i) => i).filter(i => !taken.has(i));
  },
  participantControls(config, state, mine) {
    if (mine) return '';
    const drawn = (state && state.groups) || {};
    const opts = config.groups.map(g => {
      const d = drawn[g.key];
      const label = d ? `${esc(g.name)} — ${esc(config.topics[d.topic] ?? '?')}` : esc(g.name);
      return `<option value="${esc(g.key)}"${d ? ' disabled' : ''}>${label}</option>`;
    }).join('');
    return `<div class="selectwrap"><label>Nhóm của bạn</label><select id="groupSel">${opts}</select></div>`;
  },
  readSelection(rootEl) {
    const sel = rootEl.querySelector('#groupSel');
    return { groupKey: sel ? sel.value : '' };
  },
  canSpin(config, state, ui, mine) {
    if (mine) return false;
    if (!ui || !ui.groupKey) return false;
    if (state && state.groups && state.groups[ui.groupKey]) return false;
    return this.availableIndices(config, state).length > 0;
  },
  assign(cur, { ui, config }) {
    cur.groups = (cur.groups && typeof cur.groups === 'object') ? cur.groups : {};
    const gk = ui && ui.groupKey;
    if (!gk || cur.groups[gk]) return { reason: 'taken' };
    const taken = new Set(Object.values(cur.groups).map(a => a.topic));
    const avail = config.topics.map((_, i) => i).filter(i => !taken.has(i));
    if (!avail.length) return { reason: 'full' };
    const pick = avail[Math.floor(Math.random() * avail.length)];
    cur.groups[gk] = { topic: pick, ts: Date.now() };
    return { targetIndex: pick };
  },
  mineFrom(config, state, groupKey) {
    const g = state && state.groups && state.groups[groupKey];
    return g ? { groupKey, topic: g.topic } : null;
  },
  claimKey(config, committedState, ui) { return (ui && ui.groupKey) || null; },

  resultView(config, state, mine) {
    if (!mine) return '';
    const g = config.groups.find(x => x.key === mine.groupKey);
    const gname = g ? g.name : mine.groupKey;
    const color = g ? g.color : '#10b981', dark = g ? g.dark : '#059669';
    return `<div class="result-card"><div class="crown">🎉</div>
      <div class="who"><b>${esc(gname)}</b> đã nhận chủ đề</div>
      <div class="grp" style="background:linear-gradient(135deg,${color},${dark})">${esc(config.topics[mine.topic] ?? '?')}</div>
      <div class="note">Mỗi nhóm chỉ quay 1 lần · Kết quả đã được lưu</div></div>`;
  },
  panel(config, state, mine) {
    const drawn = (state && state.groups) || {};
    const done = Object.keys(drawn).length;
    const cells = config.groups.map(g => {
      const d = drawn[g.key];
      const isMine = mine && mine.groupKey === g.key;
      const topicLabel = d ? esc(config.topics[d.topic] ?? '?') : '⏳ Chưa quay';
      return `<div class="group" style="--gc:${g.color};--gcd:${g.dark};border-color:${g.color}66">
        <div class="ghead"><span class="gname"><span class="gtag"></span>${esc(g.name)}${isMine ? ' <span class="you">(nhóm của bạn)</span>' : ''}</span></div>
        <ul class="members"><li class="member"><span>${topicLabel}</span></li></ul></div>`;
    }).join('');
    return `<div class="progress-top"><span>Đã chọn:</span><span class="pill">${done}/${config.groups.length} nhóm</span></div>
      <div class="groups">${cells}</div>`;
  },
};
