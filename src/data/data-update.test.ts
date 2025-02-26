import { describe, expect, it } from 'bun:test';
import { commitUpdates } from './data-update';
import { Update } from '../types/Update';
import { DataObject } from '../types/DataObject';

describe('commitUpdates', () => {
  it('should sort updates by confirmed timestamp and apply them', () => {
    const updates: Update[] = [
      { path: 'a/b', value: 2, confirmed: 2 },
      { path: 'a/b', value: 1, confirmed: 1 },
    ];
    const obj: DataObject = {};

    commitUpdates(obj, updates);

    expect(obj).toEqual({ a: { b: 2 } });
  });
});
