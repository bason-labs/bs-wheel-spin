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
