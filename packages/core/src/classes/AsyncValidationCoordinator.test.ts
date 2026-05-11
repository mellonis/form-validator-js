import AsyncValidationCoordinator from './AsyncValidationCoordinator';
import type FormValidatorValidationResult from './FormValidatorValidationResult';

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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('AsyncValidationCoordinator T1 new-slot path', () => {
  test('startCycle on empty slot increments pendingCount and fires transition callbacks', () => {
    const callbacks = {
      onApplyResult: vi.fn(),
      onElementPendingChange: vi.fn(),
      onFormPendingChange: vi.fn(),
      onSlotResolved: vi.fn(),
    };
    const c = new AsyncValidationCoordinator(callbacks);
    const el = document.createElement('input');
    const d = deferred<FormValidatorValidationResult>();
    const controller = new AbortController();

    c.startCycle(el, 'x', d.promise, controller);

    expect(c.hasPending()).toBe(true);
    expect(c.hasPendingFor(el)).toBe(true);
    expect(callbacks.onElementPendingChange).toHaveBeenCalledWith(el, true);
    expect(callbacks.onFormPendingChange).toHaveBeenCalledWith(true);
    expect(callbacks.onElementPendingChange).toHaveBeenCalledTimes(1);
    expect(callbacks.onFormPendingChange).toHaveBeenCalledTimes(1);
  });

  test('two startCycles on same element different validators: element callback fires once, form once', () => {
    const callbacks = {
      onApplyResult: vi.fn(),
      onElementPendingChange: vi.fn(),
      onFormPendingChange: vi.fn(),
      onSlotResolved: vi.fn(),
    };
    const c = new AsyncValidationCoordinator(callbacks);
    const el = document.createElement('input');
    c.startCycle(el, 'x', deferred<FormValidatorValidationResult>().promise, new AbortController());
    c.startCycle(el, 'y', deferred<FormValidatorValidationResult>().promise, new AbortController());

    expect(callbacks.onElementPendingChange).toHaveBeenCalledTimes(1);
    expect(callbacks.onFormPendingChange).toHaveBeenCalledTimes(1);
  });

  test('two startCycles on different elements: element callback fires twice, form once', () => {
    const callbacks = {
      onApplyResult: vi.fn(),
      onElementPendingChange: vi.fn(),
      onFormPendingChange: vi.fn(),
      onSlotResolved: vi.fn(),
    };
    const c = new AsyncValidationCoordinator(callbacks);
    const elA = document.createElement('input');
    const elB = document.createElement('input');
    c.startCycle(elA, 'x', deferred<FormValidatorValidationResult>().promise, new AbortController());
    c.startCycle(elB, 'x', deferred<FormValidatorValidationResult>().promise, new AbortController());

    expect(callbacks.onElementPendingChange).toHaveBeenCalledTimes(2);
    expect(callbacks.onFormPendingChange).toHaveBeenCalledTimes(1);
  });
});
