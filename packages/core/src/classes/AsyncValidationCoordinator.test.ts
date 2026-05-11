import AsyncValidationCoordinator from './AsyncValidationCoordinator';
import FormValidatorValidationResult from './FormValidatorValidationResult';

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

async function flushMicrotasks() {
  // Drain the microtask queue — Promise then-callbacks settle here.
  await Promise.resolve();
  await Promise.resolve();
}

describe('AsyncValidationCoordinator T2 resolve', () => {
  test('resolve applies result and fires not-pending transitions', async () => {
    const callbacks = {
      onApplyResult: vi.fn(),
      onElementPendingChange: vi.fn(),
      onFormPendingChange: vi.fn(),
      onSlotResolved: vi.fn(),
    };
    const c = new AsyncValidationCoordinator(callbacks);
    const el = document.createElement('input');
    const d = deferred<FormValidatorValidationResult>();
    c.startCycle(el, 'x', d.promise, new AbortController());

    const result = new FormValidatorValidationResult({ isValid: true });
    d.resolve(result);
    await flushMicrotasks();

    expect(callbacks.onApplyResult).toHaveBeenCalledWith(el, 'x', result);
    expect(callbacks.onElementPendingChange).toHaveBeenLastCalledWith(el, false);
    expect(callbacks.onFormPendingChange).toHaveBeenLastCalledWith(false);
    expect(callbacks.onSlotResolved).toHaveBeenCalledTimes(1);
    expect(c.hasPending()).toBe(false);
    expect(c.hasPendingFor(el)).toBe(false);
  });

  test('onApplyResult fires before pending-change callbacks (consumer sees consistent intermediate state)', async () => {
    const order: string[] = [];
    const c = new AsyncValidationCoordinator({
      onApplyResult: () => order.push('apply'),
      onElementPendingChange: (_e, p) => order.push(`element:${p}`),
      onFormPendingChange: (p) => order.push(`form:${p}`),
      onSlotResolved: () => order.push('resolved'),
    });
    const el = document.createElement('input');
    const d = deferred<FormValidatorValidationResult>();
    c.startCycle(el, 'x', d.promise, new AbortController());
    order.length = 0; // ignore startup callbacks

    d.resolve(new FormValidatorValidationResult({ isValid: true }));
    await flushMicrotasks();

    expect(order).toEqual(['apply', 'element:false', 'form:false', 'resolved']);
  });

  test('resolving one of two slots on same element keeps element pending', async () => {
    const callbacks = {
      onApplyResult: vi.fn(),
      onElementPendingChange: vi.fn(),
      onFormPendingChange: vi.fn(),
      onSlotResolved: vi.fn(),
    };
    const c = new AsyncValidationCoordinator(callbacks);
    const el = document.createElement('input');
    const dA = deferred<FormValidatorValidationResult>();
    const dB = deferred<FormValidatorValidationResult>();
    c.startCycle(el, 'a', dA.promise, new AbortController());
    c.startCycle(el, 'b', dB.promise, new AbortController());

    dA.resolve(new FormValidatorValidationResult({ isValid: true }));
    await flushMicrotasks();

    expect(callbacks.onElementPendingChange).toHaveBeenCalledTimes(1); // only the initial true
    expect(c.hasPendingFor(el)).toBe(true);
    expect(c.hasPending()).toBe(true);
  });
});

describe('AsyncValidationCoordinator T1 replace path', () => {
  test('startCycle on existing slot aborts previous, bumps generation, no counter change, no callbacks', () => {
    const callbacks = {
      onApplyResult: vi.fn(),
      onElementPendingChange: vi.fn(),
      onFormPendingChange: vi.fn(),
      onSlotResolved: vi.fn(),
    };
    const c = new AsyncValidationCoordinator(callbacks);
    const el = document.createElement('input');
    const ctrl1 = new AbortController();
    const ctrl2 = new AbortController();
    c.startCycle(el, 'x', deferred<FormValidatorValidationResult>().promise, ctrl1);
    callbacks.onElementPendingChange.mockClear();
    callbacks.onFormPendingChange.mockClear();

    expect(ctrl1.signal.aborted).toBe(false);
    c.startCycle(el, 'x', deferred<FormValidatorValidationResult>().promise, ctrl2);

    expect(ctrl1.signal.aborted).toBe(true);
    expect(callbacks.onElementPendingChange).not.toHaveBeenCalled();
    expect(callbacks.onFormPendingChange).not.toHaveBeenCalled();
    expect(c.hasPending()).toBe(true);
    expect(c.hasPendingFor(el)).toBe(true);
  });

  test('after replace, only the new generation resolve applies', async () => {
    const callbacks = {
      onApplyResult: vi.fn(),
      onElementPendingChange: vi.fn(),
      onFormPendingChange: vi.fn(),
      onSlotResolved: vi.fn(),
    };
    const c = new AsyncValidationCoordinator(callbacks);
    const el = document.createElement('input');
    const dOld = deferred<FormValidatorValidationResult>();
    const dNew = deferred<FormValidatorValidationResult>();
    c.startCycle(el, 'x', dOld.promise, new AbortController());
    c.startCycle(el, 'x', dNew.promise, new AbortController());

    const oldResult = new FormValidatorValidationResult({ isValid: true });
    const newResult = new FormValidatorValidationResult({ isValid: false });
    dOld.resolve(oldResult);
    await flushMicrotasks();
    expect(callbacks.onApplyResult).not.toHaveBeenCalledWith(el, 'x', oldResult);

    dNew.resolve(newResult);
    await flushMicrotasks();
    expect(callbacks.onApplyResult).toHaveBeenCalledWith(el, 'x', newResult);
    expect(callbacks.onApplyResult).toHaveBeenCalledTimes(1);
  });
});
