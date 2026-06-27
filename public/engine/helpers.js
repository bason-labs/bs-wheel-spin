/* engine/helpers.js — pure string / id / name utilities.
   No imports; browser globals (localStorage, crypto) only inside function bodies so Node can import this. */

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
