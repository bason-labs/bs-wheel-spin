/* engine/adminforms.js — pure config-form rendering + reading for the admin page.
   No Firebase, no top-level DOM. Field kinds: text, number, bool, list, groups, color, segments (+ theme section). */
import { esc } from './helpers.js';
import { darken } from './geometry.js';
export { darken };   // re-exported so importers of adminforms keep working

export function groupsFromRows(rows) {
  return rows.map((row, i) => ({
    key: `g${i + 1}`,
    name: row.name,
    color: row.color,
    dark: darken(row.color),
  }));
}

const textField = (key, label, value) =>
  `<div class="field"><label>${esc(label)}</label>
    <input type="text" data-field="${esc(key)}" value="${esc(value ?? '')}"></div>`;

const numberField = (f, value) =>
  `<div class="field"><label>${esc(f.label)}</label>
    <input type="number" data-field="${esc(f.key)}" min="${f.min ?? 0}" value="${esc(value ?? f.default ?? 0)}"></div>`;

const boolField = (f, value) =>
  `<div class="checkrow"><label><input type="checkbox" data-field="${esc(f.key)}"${value ? ' checked' : ''}> ${esc(f.label)}</label></div>`;

export const listRow = v =>
  `<div class="lrow" data-list-row="1"><input type="text" value="${esc(v ?? '')}"><button type="button" class="rm" data-rm="1">✕</button></div>`;

const listField = (f, values) =>
  `<div class="field listfield" data-field="${esc(f.key)}" data-kind="list">
    <label>${esc(f.label)}</label>
    <div class="rows">${(values || []).map(listRow).join('')}</div>
    <button type="button" class="addrow" data-add="1">＋ ${esc(f.itemPlaceholder || 'Thêm')}</button></div>`;

export const groupRow = g =>
  `<div class="grow" data-group-row="1">
    <input type="color" value="${esc((g && g.color) || '#10b981')}">
    <input type="text" class="gname" value="${esc((g && g.name) || '')}" placeholder="Tên nhóm">
    <button type="button" class="rm" data-rm="1">✕</button></div>`;

const groupsField = (f, groups) =>
  `<div class="field groupsfield" data-field="${esc(f.key)}" data-kind="groups">
    <label>${esc(f.label)}</label>
    <div class="rows">${(groups || []).map(groupRow).join('')}</div>
    <button type="button" class="addgroup" data-add="1">＋ Thêm nhóm</button></div>`;

export function renderConfigForm(typeEntry, config) {
  const c = config || {};
  let html = textField('title', 'Tiêu đề', c.title);
  for (const f of typeEntry.configFields) {
    const v = c[f.key];
    if (f.kind === 'text') html += textField(f.key, f.label, v);
    else if (f.kind === 'number') html += numberField(f, v);
    else if (f.kind === 'bool') html += boolField(f, v);
    else if (f.kind === 'list') html += listField(f, v);
    else if (f.kind === 'groups') html += groupsField(f, v);
  }
  return html;
}

export function readConfigForm(rootEl, typeEntry) {
  const out = { type: typeEntry.key };
  const titleEl = rootEl.querySelector('[data-field="title"]');
  out.title = titleEl ? titleEl.value.trim() : '';
  for (const f of typeEntry.configFields) {
    const el = rootEl.querySelector(`[data-field="${f.key}"]`);
    if (f.kind === 'text') out[f.key] = el ? el.value.trim() : '';
    else if (f.kind === 'number') out[f.key] = el ? Number(el.value) : 0;
    else if (f.kind === 'bool') out[f.key] = !!(el && el.checked);
    else if (f.kind === 'list') {
      out[f.key] = el ? Array.from(el.querySelectorAll('[data-list-row] input')).map(i => i.value.trim()).filter(Boolean) : [];
    } else if (f.kind === 'groups') {
      const rows = el ? Array.from(el.querySelectorAll('[data-group-row]')).map(r => ({
        name: r.querySelector('.gname').value.trim(),
        color: r.querySelector('input[type="color"]').value,
      })).filter(r => r.name) : [];
      out[f.key] = groupsFromRows(rows);
    }
  }
  return out;
}
