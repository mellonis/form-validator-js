import { describe, expect, test, vi } from 'vitest';
import AsyncValidationCoordinator from './AsyncValidationCoordinator';

function makeCoordinator() {
  return new AsyncValidationCoordinator({
    onApplyResult: vi.fn(),
    onElementPendingChange: vi.fn(),
    onFormPendingChange: vi.fn(),
    onSlotResolved: vi.fn(),
  });
}

describe('AsyncValidationCoordinator queries on empty', () => {
  test('hasPending returns false when no cycles started', () => {
    const c = makeCoordinator();
    expect(c.hasPending()).toBe(false);
  });

  test('hasPendingFor returns false for any element when no cycles started', () => {
    const c = makeCoordinator();
    const el = document.createElement('input');
    expect(c.hasPendingFor(el)).toBe(false);
  });
});
