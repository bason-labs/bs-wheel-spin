/* engine/celebration.js — spin chime + confetti burst. Defensive guards keep Node import safe. */

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
