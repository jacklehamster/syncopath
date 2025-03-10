import { describe, expect, it } from 'bun:test';
import { commitUpdates } from './data-update';
import { Update } from '../types/Update';
import { RoomState } from '../types/RoomState';

describe('commitUpdates', () => {
  it('should sort updates by confirmed timestamp and apply them', () => {
    const updates: Update[] = [
      { path: 'a/b', value: 2, confirmed: 2 },
      { path: 'a/b', value: 1, confirmed: 1 },
      { path: "test", value: "~{test}", confirmed: 3 },
    ];
    const obj: RoomState = {
      updates,
    };

    commitUpdates(obj, {
      test: "123",
    });

    expect(obj).toEqual({ a: { b: 2 }, test: "123" });
  });
});
