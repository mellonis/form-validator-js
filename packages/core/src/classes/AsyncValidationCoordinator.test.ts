import AsyncValidationCoordinator from './AsyncValidationCoordinator';
import FormValidatorValidationResult from './FormValidatorValidationResult';

function makeCoordinator() {
  const callbacks = {
    onApplyResult: vi.fn(),
    onElementPendingChange: vi.fn(),
    onFormPendingChange: vi.fn(),
    onSlotResolved: vi.fn(),
  };
  return { c: new AsyncValidationCoordinator(callbacks), callbacks };
}

describe('AsyncValidationCoordinator queries on empty', () => {
  test('hasPending returns false when no cycles started', () => {
    const { c } = makeCoordinator();
    expect(c.hasPending()).toBe(false);
  });

  test('hasPendingFor returns false for any element when no cycles started', () => {
    const { c } = makeCoordinator();
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
    const { c, callbacks } = makeCoordinator();
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
    const { c, callbacks } = makeCoordinator();
    const el = document.createElement('input');
    c.startCycle(el, 'x', deferred<FormValidatorValidationResult>().promise, new AbortController());
    c.startCycle(el, 'y', deferred<FormValidatorValidationResult>().promise, new AbortController());

    expect(callbacks.onElementPendingChange).toHaveBeenCalledTimes(1);
    expect(callbacks.onFormPendingChange).toHaveBeenCalledTimes(1);
  });

  test('two startCycles on different elements: element callback fires twice, form once', () => {
    const { c, callbacks } = makeCoordinator();
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
    const { c, callbacks } = makeCoordinator();
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
    const { c, callbacks } = makeCoordinator();
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

describe('AsyncValidationCoordinator T3 reject', () => {
  test('AbortError after replace drops silently, no double-decrement (counter invariant)', async () => {
    const { c, callbacks } = makeCoordinator();
    const el = document.createElement('input');
    const dOld = deferred<FormValidatorValidationResult>();
    const dNew = deferred<FormValidatorValidationResult>();
    c.startCycle(el, 'x', dOld.promise, new AbortController());
    c.startCycle(el, 'x', dNew.promise, new AbortController());

    // Old promise rejects with AbortError after replace.
    dOld.reject(new DOMException('Aborted', 'AbortError'));
    await flushMicrotasks();

    expect(callbacks.onApplyResult).not.toHaveBeenCalled();
    expect(c.hasPending()).toBe(true); // counter must still be 1, not 0

    dNew.resolve(new FormValidatorValidationResult({ isValid: true }));
    await flushMicrotasks();
    expect(c.hasPending()).toBe(false); // counter goes 1 → 0 cleanly
  });

  test('non-AbortError with no onError manufactures default failure result', async () => {
    const { c, callbacks } = makeCoordinator();
    const el = document.createElement('input');
    const d = deferred<FormValidatorValidationResult>();
    c.startCycle(el, 'x', d.promise, new AbortController());

    d.reject(new Error('network down'));
    await flushMicrotasks();

    expect(callbacks.onApplyResult).toHaveBeenCalledTimes(1);
    const [, , result] = callbacks.onApplyResult.mock.calls[0];
    expect(result.isValid).toBe(false);
    expect(result.validatorSubtypeList).toEqual(['error']);
    expect(c.hasPending()).toBe(false);
  });

  test('non-AbortError with onError uses its returned result', async () => {
    const { c, callbacks } = makeCoordinator();
    const el = document.createElement('input');
    const d = deferred<FormValidatorValidationResult>();
    const customResult = new FormValidatorValidationResult({
      isValid: false,
      validatorSubtypeList: ['rateLimited'],
    });
    c.startCycle(el, 'x', d.promise, new AbortController(), () => customResult);

    d.reject(new Error('429'));
    await flushMicrotasks();

    const [, , result] = callbacks.onApplyResult.mock.calls[0];
    expect(result).toBe(customResult);
  });

  test('onError that throws falls back to default failure result', async () => {
    const { c, callbacks } = makeCoordinator();
    const el = document.createElement('input');
    const d = deferred<FormValidatorValidationResult>();
    c.startCycle(el, 'x', d.promise, new AbortController(), () => {
      throw new Error('onError blew up');
    });

    d.reject(new Error('original'));
    await flushMicrotasks();

    const [, , result] = callbacks.onApplyResult.mock.calls[0];
    expect(result.isValid).toBe(false);
    expect(result.validatorSubtypeList).toEqual(['error']);
  });

  test('onError returning non-Result falls back to default failure result', async () => {
    const { c, callbacks } = makeCoordinator();
    const el = document.createElement('input');
    const d = deferred<FormValidatorValidationResult>();
    c.startCycle(el, 'x', d.promise, new AbortController(), () => 'not a result' as unknown as FormValidatorValidationResult);

    d.reject(new Error('original'));
    await flushMicrotasks();

    const [, , result] = callbacks.onApplyResult.mock.calls[0];
    expect(result.isValid).toBe(false);
    expect(result.validatorSubtypeList).toEqual(['error']);
  });
});

describe('AsyncValidationCoordinator T1 replace path', () => {
  test('startCycle on existing slot aborts previous, bumps generation, no counter change, no callbacks', () => {
    const { c, callbacks } = makeCoordinator();
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
    const { c, callbacks } = makeCoordinator();
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

describe('AsyncValidationCoordinator stale generation drops', () => {
  test('resolve of stale generation drops without apply or counter change', async () => {
    const { c, callbacks } = makeCoordinator();
    const el = document.createElement('input');
    const dOld = deferred<FormValidatorValidationResult>();
    const dNew = deferred<FormValidatorValidationResult>();
    c.startCycle(el, 'x', dOld.promise, new AbortController());
    c.startCycle(el, 'x', dNew.promise, new AbortController()); // bumps generation

    // Old resolves naturally (user ignored signal). Should drop.
    dOld.resolve(new FormValidatorValidationResult({ isValid: true }));
    await flushMicrotasks();

    expect(callbacks.onApplyResult).not.toHaveBeenCalled();
    expect(c.hasPending()).toBe(true);
    expect(callbacks.onSlotResolved).not.toHaveBeenCalled();
  });
});

describe('AsyncValidationCoordinator abortSlot', () => {
  test('abortSlot on existing slot aborts controller, removes slot, fires transitions, no onSlotResolved', () => {
    const { c, callbacks } = makeCoordinator();
    const el = document.createElement('input');
    const ctrl = new AbortController();
    c.startCycle(el, 'x', deferred<FormValidatorValidationResult>().promise, ctrl);
    callbacks.onElementPendingChange.mockClear();
    callbacks.onFormPendingChange.mockClear();

    c.abortSlot(el, 'x');

    expect(ctrl.signal.aborted).toBe(true);
    expect(c.hasPending()).toBe(false);
    expect(c.hasPendingFor(el)).toBe(false);
    expect(callbacks.onElementPendingChange).toHaveBeenCalledWith(el, false);
    expect(callbacks.onFormPendingChange).toHaveBeenCalledWith(false);
    expect(callbacks.onSlotResolved).not.toHaveBeenCalled();
    expect(callbacks.onApplyResult).not.toHaveBeenCalled();
  });

  test('abortSlot on non-existent slot is a no-op', () => {
    const { c, callbacks } = makeCoordinator();
    const el = document.createElement('input');
    expect(() => c.abortSlot(el, 'nope')).not.toThrow();
    expect(callbacks.onElementPendingChange).not.toHaveBeenCalled();
    expect(callbacks.onFormPendingChange).not.toHaveBeenCalled();
  });

  test('abortSlot on one of two slots on same element keeps element pending', () => {
    const { c, callbacks } = makeCoordinator();
    const el = document.createElement('input');
    c.startCycle(el, 'a', deferred<FormValidatorValidationResult>().promise, new AbortController());
    c.startCycle(el, 'b', deferred<FormValidatorValidationResult>().promise, new AbortController());
    callbacks.onElementPendingChange.mockClear();
    callbacks.onFormPendingChange.mockClear();

    c.abortSlot(el, 'a');

    expect(c.hasPendingFor(el)).toBe(true);
    expect(callbacks.onElementPendingChange).not.toHaveBeenCalled();
    expect(callbacks.onFormPendingChange).not.toHaveBeenCalled();
  });
});

describe('AsyncValidationCoordinator abortAll', () => {
  test('abortAll aborts every controller, fires per-element and form callbacks, clears state', () => {
    const { c, callbacks } = makeCoordinator();
    const elA = document.createElement('input');
    const elB = document.createElement('input');
    const ctrlA = new AbortController();
    const ctrlB1 = new AbortController();
    const ctrlB2 = new AbortController();
    c.startCycle(elA, 'x', deferred<FormValidatorValidationResult>().promise, ctrlA);
    c.startCycle(elB, 'x', deferred<FormValidatorValidationResult>().promise, ctrlB1);
    c.startCycle(elB, 'y', deferred<FormValidatorValidationResult>().promise, ctrlB2);
    callbacks.onElementPendingChange.mockClear();
    callbacks.onFormPendingChange.mockClear();

    c.abortAll();

    expect(ctrlA.signal.aborted).toBe(true);
    expect(ctrlB1.signal.aborted).toBe(true);
    expect(ctrlB2.signal.aborted).toBe(true);
    expect(c.hasPending()).toBe(false);
    expect(c.hasPendingFor(elA)).toBe(false);
    expect(c.hasPendingFor(elB)).toBe(false);
    expect(callbacks.onElementPendingChange).toHaveBeenCalledWith(elA, false);
    expect(callbacks.onElementPendingChange).toHaveBeenCalledWith(elB, false);
    expect(callbacks.onElementPendingChange).toHaveBeenCalledTimes(2); // one per element
    expect(callbacks.onFormPendingChange).toHaveBeenCalledWith(false);
    expect(callbacks.onFormPendingChange).toHaveBeenCalledTimes(1);
    expect(callbacks.onSlotResolved).not.toHaveBeenCalled();
  });

  test('abortAll on empty coordinator is a no-op', () => {
    const { c, callbacks } = makeCoordinator();
    expect(() => c.abortAll()).not.toThrow();
    expect(callbacks.onElementPendingChange).not.toHaveBeenCalled();
    expect(callbacks.onFormPendingChange).not.toHaveBeenCalled();
  });

  test('AbortError microtask after abortAll drops silently (no negative counter)', async () => {
    const { c, callbacks } = makeCoordinator();
    const el = document.createElement('input');
    const d = deferred<FormValidatorValidationResult>();
    c.startCycle(el, 'x', d.promise, new AbortController());

    c.abortAll();
    d.reject(new DOMException('Aborted', 'AbortError'));
    await flushMicrotasks();

    expect(c.hasPending()).toBe(false);
    expect(callbacks.onApplyResult).not.toHaveBeenCalled();
  });
});
