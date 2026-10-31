import { describe, expect, it, vi } from 'vitest';

vi.mock('./appService', () => ({ default: { get: vi.fn(), post: vi.fn(), del: vi.fn() } }));

import { browseQuery, CATEGORY_LABELS } from './marketplaceService';

describe('browseQuery', () => {
  it('is empty when nothing is filtered', () => {
    expect(browseQuery()).toBe('');
    expect(browseQuery({ q: '   ', category: '', mine: false })).toBe('');
  });

  it('encodes the search text and keeps only the filters that are set', () => {
    expect(browseQuery({ q: ' fees & rent ', category: 'support', mine: true })).toBe('?q=fees+%26+rent&category=support&mine=1');
    expect(browseQuery({ category: 'fun' })).toBe('?category=fun');
    expect(browseQuery({ sort: 'top_rated' })).toBe('?sort=top_rated');
    expect(browseQuery({ sort: 'popular' })).toBe('');
  });
});

describe('CATEGORY_LABELS', () => {
  it('matches the categories the server accepts', () => {
    expect(Object.keys(CATEGORY_LABELS)).toEqual(['support', 'community', 'productivity', 'learning', 'fun', 'other']);
  });
});
