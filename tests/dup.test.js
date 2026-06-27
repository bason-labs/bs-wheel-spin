import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripVN, findDuplicate } from '../public/engine/index.js';

test('stripVN normalizes Vietnamese diacritics + case + spacing', () => {
  assert.equal(stripVN('  Nguyễn   Văn  An '), 'nguyen van an');
  assert.equal(stripVN('Đỗ Thị Bình'), 'do thi binh');
});

test('findDuplicate matches exact, token-subset, shared last name', () => {
  const existing = ['Nguyễn Văn An', 'Trần Bình'];
  assert.equal(findDuplicate('nguyen van an', existing), 'Nguyễn Văn An'); // exact (normalized)
  assert.equal(findDuplicate('An', ['Nguyễn Văn An']), 'Nguyễn Văn An');   // token subset
  assert.equal(findDuplicate('Lê Bình', ['Trần Bình']), 'Trần Bình');      // shared last name
});

test('findDuplicate returns null on no match / empty', () => {
  assert.equal(findDuplicate('Hoàng Yến', ['Trần Bình']), null);
  assert.equal(findDuplicate('', ['Trần Bình']), null);
  assert.equal(findDuplicate('x', []), null);
});
