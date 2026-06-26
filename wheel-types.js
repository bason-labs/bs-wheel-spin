/* Shared engine module — imported by wheel.html and (later) admin.html.
   Keep top-level code browser-free so Node can import it for unit tests. */

export const esc = s => String(s).replace(/[&<>"]/g,
  c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));

export function deviceId() {
  try {
    let id = localStorage.getItem('wheelDeviceId');
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID()
            : 'd-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10));
      localStorage.setItem('wheelDeviceId', id);
    }
    return id;
  } catch (e) {
    return 'd-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }
}

export function makeWheelId() {
  try {
    if (crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  } catch (e) {}
  return (Date.now().toString(36) + Math.random().toString(36).slice(2)).slice(0, 8);
}

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
  const stops = segs
    .map((s, i) => `${s.dim ? s.color + '33' : s.color} ${i * SEG}deg ${(i + 1) * SEG}deg`)
    .join(',');
  const labels = segs.map((s, i) => {
    const a = (i * SEG + SEG / 2) * Math.PI / 180, r = 31;
    return `<span class="label${s.dim ? ' dim' : ''}" style="left:${50 + r * Math.sin(a)}%;top:${50 - r * Math.cos(a)}%">${esc(s.label)}</span>`;
  }).join('');
  return `<div class="disc" id="disc" style="background:conic-gradient(${stops});transform:rotate(${rotation}deg)">${labels}</div>`;
}

export const PALETTE = [
  { color: '#10b981', dark: '#059669' }, { color: '#8b5cf6', dark: '#7c3aed' },
  { color: '#f59e0b', dark: '#d97706' }, { color: '#ec4899', dark: '#db2777' },
  { color: '#3b82f6', dark: '#2563eb' }, { color: '#ef4444', dark: '#dc2626' },
  { color: '#14b8a6', dark: '#0d9488' }, { color: '#a855f7', dark: '#9333ea' },
];

const pickedArr = state => Array.isArray(state && state.picked) ? state.picked : [];

export const WHEEL_TYPES = {
  simple: {
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
  },
};

export const takenTopicSet = state =>
  new Set(Object.values((state && state.groups) || {}).map(a => a.topic));

WHEEL_TYPES.topicgroup = {
  key: 'topicgroup',
  name: 'Chủ đề cho nhóm',
  identity: 'group',

  defaultConfig() {
    return {
      topics: Array.from({ length: 13 }, (_, i) => `Chủ đề ${i + 1}`),
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

export function chime(audioCtx) {
  if (!audioCtx) return;
  try {
    [660, 880, 1175].forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'triangle'; o.frequency.value = f; o.connect(g); g.connect(audioCtx.destination);
      const t = audioCtx.currentTime + i * 0.09;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(.001, t + 0.35);
      o.start(t); o.stop(t + 0.36);
    });
  } catch (e) {}
}

export function burst(colorPair, confettiEl) {
  if (!confettiEl || typeof document === 'undefined') return;
  const colors = [colorPair.color, colorPair.dark, '#fbbf24', '#ffffff'];
  for (let i = 0; i < 100; i++) {
    const c = document.createElement('div'); c.className = 'conf';
    const size = 6 + Math.random() * 8;
    c.style.left = (Math.random() * 100) + 'vw'; c.style.top = '-20px';
    c.style.width = size + 'px'; c.style.height = (size * 1.4) + 'px';
    c.style.background = colors[i % colors.length];
    c.style.borderRadius = Math.random() < .5 ? '50%' : '2px';
    const dx = (Math.random() * 2 - 1) * 30, dur = 2200 + Math.random() * 1500, rot = Math.random() * 720;
    confettiEl.appendChild(c);
    c.animate(
      [{ transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
       { transform: `translate(${dx}vw,108vh) rotate(${rot}deg)`, opacity: .9 }],
      { duration: dur, easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'forwards' });
    setTimeout(() => c.remove(), dur + 100);
  }
}

export const stripVN = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase().trim().replace(/\s+/g, ' ');

export function findDuplicate(name, existingNames) {
  const a = stripVN(name); if (!a) return null;
  const at = a.split(' ');
  for (const ex of (existingNames || [])) {
    const b = stripVN(ex), bt = b.split(' ');
    if (a === b) return ex;
    if (at.every(t => bt.includes(t)) || bt.every(t => at.includes(t))) return ex;
    if (at[at.length - 1] === bt[bt.length - 1]) return ex;
  }
  return null;
}
