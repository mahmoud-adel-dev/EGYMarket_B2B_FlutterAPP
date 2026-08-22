import { describe, expect, it } from 'vitest';
import { parsePagination } from '../lib/api/pagination';
import { anchoredExactRegExp, containsRegExp, escapeRegExp } from '../lib/utils/regexp';

describe('parsePagination clamping (P1-3/P2-1)', () => {
  it('returns defaults for missing or garbage input instead of NaN', () => {
    const params = new URLSearchParams('page=abc&limit=xyz');
    const result = parsePagination(params);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.skip).toBe(0);
  });

  it('clamps oversized limits to the hard cap of 100', () => {
    const result = parsePagination(new URLSearchParams('page=1&limit=99999999'));
    expect(result.limit).toBe(100);
  });

  it('floors zero/negative pages to 1 (previously negative skip → driver error)', () => {
    expect(parsePagination(new URLSearchParams('page=-1')).skip).toBe(0);
    expect(parsePagination(new URLSearchParams('page=0')).skip).toBe(0);
    expect(parsePagination(new URLSearchParams('page=3')).skip).toBe(40);
  });
});

describe('regex helpers (P1-2 ReDoS)', () => {
  it('escapes quantifiers so pathological patterns cannot hang matching', () => {
    const evil = '(a+)+$';
    const escaped = escapeRegExp(evil);
    expect(escaped).toBe('\\(a\\+\\)\\+\\$');
    // The escaped pattern matches only the literal text, never catastrophic backtracking.
    expect(containsRegExp(evil).test('literal (a+)+$ text')).toBe(true);
    expect(containsRegExp(evil).test('aaaaaaaaaaaaaaaaaaaaaaaaaaa!')).toBe(false);
  });

  it('anchors exact matches for governorate filters', () => {
    expect(anchoredExactRegExp('القاهرة').test('القاهرة')).toBe(true);
    expect(anchoredExactRegExp('القاهرة').test('القاهرة الجديدة')).toBe(false);
  });
});
