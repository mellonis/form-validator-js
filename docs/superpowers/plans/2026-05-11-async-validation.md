# Async Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-class async support to `@form-validator-js/core`: validators may return Promises, the engine tracks in-flight cycles per (target, validatorName) with race-by-latest correctness, exposes per-element + form-level pending callbacks, auto-manages `aria-busy`, blocks submit until async resolves and re-fires via `requestSubmit` on success, and surfaces a granular `retry()` method.

**Architecture:** Extract a new `AsyncValidationCoordinator` class owning the in-flight Map, generation tracking, AbortController management, and counter invariants. `FormValidator` instantiates one in its constructor, wires callbacks to its existing apply pipeline, and routes Promise-returning validates through it. Submit handler gains pending-state with a loop-guarded `requestSubmit` re-entry. New `retry()` method on the FormValidator instance.

**Tech Stack:** TypeScript, Vitest (with `vi.useFakeTimers` for debounce-recipe tests, hand-rolled Deferred for coordinator tests), tsup for builds. npm-workspaces monorepo.

**Spec:** `docs/superpowers/specs/2026-05-11-async-validation-design.md`

---

## File Structure

**Created:**
- `packages/core/src/classes/AsyncValidationCoordinator.ts` — coordinator class
- `packages/core/src/classes/AsyncValidationCoordinator.test.ts` — coordinator unit tests

**Modified:**
- `packages/core/src/classes/FormValidator.ts` — type widening, async branch in validate handler, submit pending flow, retry method, ErrorDetail third arg, aria-busy management, factor out `#applyResults`
- `packages/core/src/classes/FormValidator.test.ts` — async integration tests
- `packages/core/src/index.ts` — export new `ErrorDetail` type
- `README.md` — replace "Injecting validation results (async checks)" section with full "Async validation" section
- `packages/validators/src/readme-examples.test.ts` — mirror new README async snippets
- `packages/core/README.md` — add `ErrorDetail` to exported types list
- `CLAUDE.md` — add async architecture subsection, update validator contract and lifecycle sections
- `packages/core/package.json` — version `1.0.0` → `1.1.0`
- `packages/validators/package.json` — version `1.0.0` → `1.1.0`, peerDep on core to `"1.1.0"`

---

## Task 1: Coordinator scaffold + queries

Establish the class skeleton and the two derived-state queries. No behavior yet beyond what's needed for the queries to return correct values on an empty coordinator.

**Files:**
- Create: `packages/core/src/classes/AsyncValidationCoordinator.ts`
- Create: `packages/core/src/classes/AsyncValidationCoordinator.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/classes/AsyncValidationCoordinator.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/src/classes/AsyncValidationCoordinator.test.ts`
Expected: FAIL with "Cannot find module './AsyncValidationCoordinator'".

- [ ] **Step 3: Create the coordinator scaffold**

Create `packages/core/src/classes/AsyncValidationCoordinator.ts`:

```ts
import type FormValidatorValidationResult from './FormValidatorValidationResult';

export interface AsyncValidationCoordinatorCallbacks {
  onApplyResult: (
    element: Element,
    name: string,
    result: FormValidatorValidationResult,
  ) => void;
  onElementPendingChange: (element: Element, isPending: boolean) => void;
  onFormPendingChange: (isPending: boolean) => void;
  onSlotResolved: () => void;
}

interface SlotEntry {
  generation: number;
  controller: AbortController;
}

export default class AsyncValidationCoordinator {
  readonly #callbacks: AsyncValidationCoordinatorCallbacks;

  readonly #asyncInFlight = new Map<Element, Map<string, SlotEntry>>();

  #pendingCount = 0;

  constructor(callbacks: AsyncValidationCoordinatorCallbacks) {
    this.#callbacks = callbacks;
  }

  hasPending(): boolean {
    return this.#pendingCount > 0;
  }

  hasPendingFor(element: Element): boolean {
    const inner = this.#asyncInFlight.get(element);
    return inner ? inner.size > 0 : false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/src/classes/AsyncValidationCoordinator.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

Ask the user for commit permission. If granted:
```bash
git add packages/core/src/classes/AsyncValidationCoordinator.ts packages/core/src/classes/AsyncValidationCoordinator.test.ts
git commit -m "feat(core): scaffold AsyncValidationCoordinator with queries"
```

---

## Task 2: Coordinator T1 — new-slot path (no previous)

Implement `startCycle` for the case where no in-flight slot exists yet. Counter increments, transition callbacks fire.

**Files:**
- Modify: `packages/core/src/classes/AsyncValidationCoordinator.ts`
- Modify: `packages/core/src/classes/AsyncValidationCoordinator.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `AsyncValidationCoordinator.test.ts`:

```ts
import FormValidatorValidationResult from './FormValidatorValidationResult';

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/src/classes/AsyncValidationCoordinator.test.ts -t 'T1 new-slot'`
Expected: FAIL — `c.startCycle is not a function`.

- [ ] **Step 3: Implement `startCycle` (new-slot path only)**

Add to `AsyncValidationCoordinator.ts` (inside the class):

```ts
  startCycle(
    element: Element,
    name: string,
    promise: Promise<FormValidatorValidationResult>,
    controller: AbortController,
    onError?: (err: unknown) => FormValidatorValidationResult,
  ): void {
    let inner = this.#asyncInFlight.get(element);
    const previous = inner?.get(name);

    if (previous) {
      // Replace path — implemented in Task 4.
      return;
    }

    if (!inner) {
      inner = new Map();
      this.#asyncInFlight.set(element, inner);
    }

    const wasFirstForElement = inner.size === 0;
    const wasFirstForForm = this.#pendingCount === 0;

    inner.set(name, { generation: 0, controller });
    this.#pendingCount += 1;

    if (wasFirstForElement) this.#callbacks.onElementPendingChange(element, true);
    if (wasFirstForForm) this.#callbacks.onFormPendingChange(true);

    // Promise hookup is implemented in Task 3 alongside the resolve handler.
    void promise;
    void onError;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/src/classes/AsyncValidationCoordinator.test.ts -t 'T1 new-slot'`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

Ask the user for commit permission. If granted:
```bash
git add packages/core/src/classes/AsyncValidationCoordinator.ts packages/core/src/classes/AsyncValidationCoordinator.test.ts
git commit -m "feat(core): coordinator startCycle new-slot path with transition callbacks"
```

---

## Task 3: Coordinator T2 — resolve

Hook the promise; on resolution apply the result and fire transitions to not-pending. `onApplyResult` must fire BEFORE counter changes and pending callbacks.

**Files:**
- Modify: `packages/core/src/classes/AsyncValidationCoordinator.ts`
- Modify: `packages/core/src/classes/AsyncValidationCoordinator.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `AsyncValidationCoordinator.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/src/classes/AsyncValidationCoordinator.test.ts -t 'T2 resolve'`
Expected: FAIL — promise hookup not implemented; `onApplyResult` never fires.

- [ ] **Step 3: Hook the promise and implement T2**

Replace the `startCycle` body's last lines (`void promise; void onError;`) and add a private resolve handler. Updated `startCycle`:

```ts
  startCycle(
    element: Element,
    name: string,
    promise: Promise<FormValidatorValidationResult>,
    controller: AbortController,
    onError?: (err: unknown) => FormValidatorValidationResult,
  ): void {
    let inner = this.#asyncInFlight.get(element);
    const previous = inner?.get(name);

    if (previous) {
      // Replace path — implemented in Task 4.
      return;
    }

    if (!inner) {
      inner = new Map();
      this.#asyncInFlight.set(element, inner);
    }

    const wasFirstForElement = inner.size === 0;
    const wasFirstForForm = this.#pendingCount === 0;

    const generation = 0;
    inner.set(name, { generation, controller });
    this.#pendingCount += 1;

    if (wasFirstForElement) this.#callbacks.onElementPendingChange(element, true);
    if (wasFirstForForm) this.#callbacks.onFormPendingChange(true);

    promise.then(
      (result) => this.#handleResolve(element, name, generation, result),
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      (_err) => { /* T3 implemented in Task 5 */ },
    );
  }

  #handleResolve(
    element: Element,
    name: string,
    generation: number,
    result: FormValidatorValidationResult,
  ): void {
    const inner = this.#asyncInFlight.get(element);
    const current = inner?.get(name);
    if (!current || current.generation !== generation) return; // stale or cleared

    this.#callbacks.onApplyResult(element, name, result);

    inner.delete(name);
    if (inner.size === 0) this.#asyncInFlight.delete(element);
    this.#pendingCount -= 1;

    if (!inner.size) this.#callbacks.onElementPendingChange(element, false);
    if (this.#pendingCount === 0) this.#callbacks.onFormPendingChange(false);
    this.#callbacks.onSlotResolved();
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/src/classes/AsyncValidationCoordinator.test.ts -t 'T2 resolve'`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

Ask the user for commit permission. If granted:
```bash
git add packages/core/src/classes/AsyncValidationCoordinator.ts packages/core/src/classes/AsyncValidationCoordinator.test.ts
git commit -m "feat(core): coordinator T2 resolve with apply-before-callbacks ordering"
```

---

## Task 4: Coordinator T1 — replace path with generation bump

When a slot already exists, abort the previous controller, bump generation, replace controller in place. **No counter change. No callbacks.**

**Files:**
- Modify: `packages/core/src/classes/AsyncValidationCoordinator.ts`
- Modify: `packages/core/src/classes/AsyncValidationCoordinator.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `AsyncValidationCoordinator.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/src/classes/AsyncValidationCoordinator.test.ts -t 'T1 replace'`
Expected: FAIL — replace path returns early.

- [ ] **Step 3: Implement the replace path**

In `AsyncValidationCoordinator.ts`, replace the early return inside `startCycle`'s `if (previous)` block:

```ts
    if (previous) {
      previous.controller.abort();
      const newGeneration = previous.generation + 1;
      inner!.set(name, { generation: newGeneration, controller });
      // Wire the new generation's promise.
      promise.then(
        (result) => this.#handleResolve(element, name, newGeneration, result),
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        (_err) => { /* T3 implemented in Task 5 */ },
      );
      return;
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/src/classes/AsyncValidationCoordinator.test.ts -t 'T1 replace'`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

Ask the user for commit permission. If granted:
```bash
git add packages/core/src/classes/AsyncValidationCoordinator.ts packages/core/src/classes/AsyncValidationCoordinator.test.ts
git commit -m "feat(core): coordinator T1 replace path aborts previous and bumps generation"
```

---

## Task 5: Coordinator T3 — reject (AbortError, default fallback, onError hook)

Implement the rejection handler covering all three branches: AbortError silent drop, non-Abort with no `onError` falling back to default `{ isValid: false, validatorSubtypeList: ['error'] }`, non-Abort with `onError` declared.

**Files:**
- Modify: `packages/core/src/classes/AsyncValidationCoordinator.ts`
- Modify: `packages/core/src/classes/AsyncValidationCoordinator.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `AsyncValidationCoordinator.test.ts`:

```ts
describe('AsyncValidationCoordinator T3 reject', () => {
  test('AbortError after replace drops silently, no double-decrement (counter invariant)', async () => {
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

    d.reject(new Error('network down'));
    await flushMicrotasks();

    expect(callbacks.onApplyResult).toHaveBeenCalledTimes(1);
    const [, , result] = callbacks.onApplyResult.mock.calls[0];
    expect(result.isValid).toBe(false);
    expect(result.validatorSubtypeList).toEqual(['error']);
    expect(c.hasPending()).toBe(false);
  });

  test('non-AbortError with onError uses its returned result', async () => {
    const callbacks = {
      onApplyResult: vi.fn(),
      onElementPendingChange: vi.fn(),
      onFormPendingChange: vi.fn(),
      onSlotResolved: vi.fn(),
    };
    const c = new AsyncValidationCoordinator(callbacks);
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
    const callbacks = {
      onApplyResult: vi.fn(),
      onElementPendingChange: vi.fn(),
      onFormPendingChange: vi.fn(),
      onSlotResolved: vi.fn(),
    };
    const c = new AsyncValidationCoordinator(callbacks);
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
    const callbacks = {
      onApplyResult: vi.fn(),
      onElementPendingChange: vi.fn(),
      onFormPendingChange: vi.fn(),
      onSlotResolved: vi.fn(),
    };
    const c = new AsyncValidationCoordinator(callbacks);
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/src/classes/AsyncValidationCoordinator.test.ts -t 'T3 reject'`
Expected: FAIL — reject branch is a no-op stub.

- [ ] **Step 3: Implement T3 reject handler**

In `AsyncValidationCoordinator.ts`, add `#handleReject` and wire both `promise.then` calls (in both `startCycle` paths) to it. Replace the two stub reject callbacks:

```ts
      (err) => this.#handleReject(element, name, /* generation */ 0, err, onError),
```
and
```ts
      (err) => this.#handleReject(element, name, newGeneration, err, onError),
```

Then add the method:

```ts
  #handleReject(
    element: Element,
    name: string,
    generation: number,
    err: unknown,
    onError: ((err: unknown) => FormValidatorValidationResult) | undefined,
  ): void {
    if (err instanceof DOMException && err.name === 'AbortError') {
      // Drop silently. Counter was never decremented for the replaced/cleared
      // slot; T1 replace and T4 abortAll handle their own counter math.
      return;
    }

    const inner = this.#asyncInFlight.get(element);
    const current = inner?.get(name);
    if (!current || current.generation !== generation) return; // stale generation

    let result: FormValidatorValidationResult | undefined;
    if (onError) {
      try {
        const candidate = onError(err);
        if (candidate instanceof FormValidatorValidationResult) {
          result = candidate;
        }
      } catch {
        // fall through to default
      }
    }
    if (!result) {
      result = new FormValidatorValidationResult({
        isValid: false,
        validatorSubtypeList: ['error'],
      });
    }

    this.#handleResolve(element, name, generation, result);
  }
```

`#handleResolve` is reused — it does the apply + cleanup + transition firing.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/src/classes/AsyncValidationCoordinator.test.ts -t 'T3 reject'`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

Ask the user for commit permission. If granted:
```bash
git add packages/core/src/classes/AsyncValidationCoordinator.ts packages/core/src/classes/AsyncValidationCoordinator.test.ts
git commit -m "feat(core): coordinator T3 reject handler with onError hybrid fallback"
```

---

## Task 6: Coordinator stale-generation drop on resolve

Already implicitly tested via Task 4 (the dOld vs dNew test). Add an explicit cross-check that `#handleResolve` drops without firing `onApplyResult` or changing the counter when generation is stale.

**Files:**
- Modify: `packages/core/src/classes/AsyncValidationCoordinator.test.ts`

- [ ] **Step 1: Write the test**

Append to `AsyncValidationCoordinator.test.ts`:

```ts
describe('AsyncValidationCoordinator stale generation drops', () => {
  test('resolve of stale generation drops without apply or counter change', async () => {
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
    c.startCycle(el, 'x', dNew.promise, new AbortController()); // bumps generation

    // Old resolves naturally (user ignored signal). Should drop.
    dOld.resolve(new FormValidatorValidationResult({ isValid: true }));
    await flushMicrotasks();

    expect(callbacks.onApplyResult).not.toHaveBeenCalled();
    expect(c.hasPending()).toBe(true);
    expect(callbacks.onSlotResolved).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test**

Run: `npx vitest run packages/core/src/classes/AsyncValidationCoordinator.test.ts -t 'stale generation'`
Expected: PASS (already implemented in Task 3's `#handleResolve` lookup check).

- [ ] **Step 3: Commit**

Ask the user for commit permission. If granted:
```bash
git add packages/core/src/classes/AsyncValidationCoordinator.test.ts
git commit -m "test(core): explicit stale-generation drop coverage"
```

---

## Task 7: Coordinator `abortSlot`

Public API for FormValidator's injection path and sync-supersedes-async path. Aborts and removes the slot, decrements counter, fires transitions to not-pending. Does NOT fire `onSlotResolved` (the slot is being torn down externally, not naturally completing).

**Files:**
- Modify: `packages/core/src/classes/AsyncValidationCoordinator.ts`
- Modify: `packages/core/src/classes/AsyncValidationCoordinator.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `AsyncValidationCoordinator.test.ts`:

```ts
describe('AsyncValidationCoordinator abortSlot', () => {
  test('abortSlot on existing slot aborts controller, removes slot, fires transitions, no onSlotResolved', () => {
    const callbacks = {
      onApplyResult: vi.fn(),
      onElementPendingChange: vi.fn(),
      onFormPendingChange: vi.fn(),
      onSlotResolved: vi.fn(),
    };
    const c = new AsyncValidationCoordinator(callbacks);
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
    const callbacks = {
      onApplyResult: vi.fn(),
      onElementPendingChange: vi.fn(),
      onFormPendingChange: vi.fn(),
      onSlotResolved: vi.fn(),
    };
    const c = new AsyncValidationCoordinator(callbacks);
    const el = document.createElement('input');
    expect(() => c.abortSlot(el, 'nope')).not.toThrow();
    expect(callbacks.onElementPendingChange).not.toHaveBeenCalled();
    expect(callbacks.onFormPendingChange).not.toHaveBeenCalled();
  });

  test('abortSlot on one of two slots on same element keeps element pending', () => {
    const callbacks = {
      onApplyResult: vi.fn(),
      onElementPendingChange: vi.fn(),
      onFormPendingChange: vi.fn(),
      onSlotResolved: vi.fn(),
    };
    const c = new AsyncValidationCoordinator(callbacks);
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/src/classes/AsyncValidationCoordinator.test.ts -t 'abortSlot'`
Expected: FAIL — `c.abortSlot is not a function`.

- [ ] **Step 3: Implement `abortSlot`**

Add to `AsyncValidationCoordinator.ts` (inside the class):

```ts
  abortSlot(element: Element, name: string): void {
    const inner = this.#asyncInFlight.get(element);
    const slot = inner?.get(name);
    if (!slot || !inner) return;

    slot.controller.abort();
    inner.delete(name);
    if (inner.size === 0) this.#asyncInFlight.delete(element);
    this.#pendingCount -= 1;

    if (!inner.size) this.#callbacks.onElementPendingChange(element, false);
    if (this.#pendingCount === 0) this.#callbacks.onFormPendingChange(false);
    // Intentionally NOT firing onSlotResolved — this is external teardown,
    // not natural slot completion; submit hand-off should not trigger.
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/src/classes/AsyncValidationCoordinator.test.ts -t 'abortSlot'`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

Ask the user for commit permission. If granted:
```bash
git add packages/core/src/classes/AsyncValidationCoordinator.ts packages/core/src/classes/AsyncValidationCoordinator.test.ts
git commit -m "feat(core): coordinator abortSlot for external teardown without submit hand-off"
```

---

## Task 8: Coordinator `abortAll` (T4 reset semantics)

Bulk teardown for `reset` and `destroy`. Aborts every controller, fires per-element + form transitions, clears all state. Does NOT fire `onSlotResolved`.

**Files:**
- Modify: `packages/core/src/classes/AsyncValidationCoordinator.ts`
- Modify: `packages/core/src/classes/AsyncValidationCoordinator.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `AsyncValidationCoordinator.test.ts`:

```ts
describe('AsyncValidationCoordinator abortAll', () => {
  test('abortAll aborts every controller, fires per-element and form callbacks, clears state', () => {
    const callbacks = {
      onApplyResult: vi.fn(),
      onElementPendingChange: vi.fn(),
      onFormPendingChange: vi.fn(),
      onSlotResolved: vi.fn(),
    };
    const c = new AsyncValidationCoordinator(callbacks);
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
    const callbacks = {
      onApplyResult: vi.fn(),
      onElementPendingChange: vi.fn(),
      onFormPendingChange: vi.fn(),
      onSlotResolved: vi.fn(),
    };
    const c = new AsyncValidationCoordinator(callbacks);
    expect(() => c.abortAll()).not.toThrow();
    expect(callbacks.onElementPendingChange).not.toHaveBeenCalled();
    expect(callbacks.onFormPendingChange).not.toHaveBeenCalled();
  });

  test('AbortError microtask after abortAll drops silently (no negative counter)', async () => {
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

    c.abortAll();
    d.reject(new DOMException('Aborted', 'AbortError'));
    await flushMicrotasks();

    expect(c.hasPending()).toBe(false);
    expect(callbacks.onApplyResult).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/src/classes/AsyncValidationCoordinator.test.ts -t 'abortAll'`
Expected: FAIL — `c.abortAll is not a function`.

- [ ] **Step 3: Implement `abortAll`**

Add to `AsyncValidationCoordinator.ts`:

```ts
  abortAll(): void {
    if (this.#pendingCount === 0) return;

    const elementsToNotify: Element[] = [];
    for (const [element, inner] of this.#asyncInFlight) {
      for (const { controller } of inner.values()) {
        controller.abort();
      }
      elementsToNotify.push(element);
    }

    this.#asyncInFlight.clear();
    this.#pendingCount = 0;

    for (const element of elementsToNotify) {
      this.#callbacks.onElementPendingChange(element, false);
    }
    this.#callbacks.onFormPendingChange(false);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/src/classes/AsyncValidationCoordinator.test.ts -t 'abortAll'`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

Ask the user for commit permission. If granted:
```bash
git add packages/core/src/classes/AsyncValidationCoordinator.ts packages/core/src/classes/AsyncValidationCoordinator.test.ts
git commit -m "feat(core): coordinator abortAll for reset and destroy"
```

---

## Task 9: Full coordinator suite check + lint/typecheck

Sanity check before moving to FormValidator integration.

**Files:** none (verification only)

- [ ] **Step 1: Run the full coordinator test file**

Run: `npx vitest run packages/core/src/classes/AsyncValidationCoordinator.test.ts`
Expected: ALL PASS (~17 tests across all describes).

- [ ] **Step 2: Run lint and typecheck on the workspace**

Run: `npm run lint && npm run typecheck`
Expected: PASS (no errors). If any unused-import or `any`-type warnings, clean up inline.

- [ ] **Step 3: No commit needed** — verification step only.

---

## Task 10: FormValidator type widenings

Widen the public `ValidatorValidateFunction`, add the new declaration field `onError`, add the new constructor params, define and export `ErrorDetail`. **No new behavior in this task** — purely type changes plus the third arg to `onErrorMessageListChanged` (which receives an empty array for now).

**Files:**
- Modify: `packages/core/src/classes/FormValidator.ts:37-40` (ValidatorValidateFunction)
- Modify: `packages/core/src/classes/FormValidator.ts:42-46` (ValidatorDeclaration adds onError)
- Modify: `packages/core/src/classes/FormValidator.ts:50-94` (FormValidatorParams adds onPendingChange, onFormPendingChange, widens onErrorMessageListChanged)
- Modify: `packages/core/src/classes/FormValidator.ts:53-56` (onErrorMessageListChanged signature widening + define ErrorDetail near it)
- Modify: `packages/core/src/index.ts` (export ErrorDetail)

- [ ] **Step 1: Write the failing test**

Append to `packages/core/src/classes/FormValidator.test.ts` inside a new describe block:

```ts
describe('FormValidator type-widening surface', () => {
  test('onErrorMessageListChanged receives a third arg (errors) — empty array when no errors', () => {
    const onChange = vi.fn<(el: Element, msgs: string[], errors: unknown[]) => void>();
    document.body.innerHTML = '<form id="t"><input name="a" data-validation="required"/></form>';
    const form2 = document.getElementById('t') as HTMLFormElement;
    new FormValidator({
      form: form2,
      validatorDeclarations: {
        required: {
          init: () => new FormValidatorInitResult({ observableElementList: [], extraData: {} }),
          validate: () => new FormValidatorValidationResult({ isValid: true }),
          errorMessage: 'required',
        },
      },
      onErrorMessageListChanged: onChange,
    });
    // Trigger a validation cycle.
    const input = form2.querySelector('input')!;
    input.dispatchEvent(FormValidator.createValidateEvent());
    // No assertions on call count — we just need the type to compile and fire without throwing.
    expect(true).toBe(true);
  });

  test('onPendingChange and onFormPendingChange are accepted in constructor params', () => {
    document.body.innerHTML = '<form id="t2"/>';
    const form2 = document.getElementById('t2') as HTMLFormElement;
    expect(() => new FormValidator({
      form: form2,
      onPendingChange: () => {},
      onFormPendingChange: () => {},
    })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/src/classes/FormValidator.test.ts -t 'type-widening'`
Expected: FAIL — `onPendingChange` not assignable; or compile error if running with `tsc --noEmit` first.

- [ ] **Step 3: Apply type changes in FormValidator.ts**

Replace lines 37–40 (`ValidatorValidateFunction`):

```ts
export type ValidatorValidateFunction = (
  target: FormElement,
  data: Record<string, unknown>,
  options?: { signal: AbortSignal },
) => FormValidatorValidationResult | Promise<FormValidatorValidationResult> | undefined;
```

Replace lines 42–46 (`ValidatorDeclaration`):

```ts
export interface ValidatorDeclaration {
  init?: ValidatorInitFunction;
  validate?: ValidatorValidateFunction;
  errorMessage?: ErrorMessage;
  onError?: (err: unknown) => FormValidatorValidationResult;
}
```

Add a new exported type near line 30 (after `ErrorMessage`):

```ts
export interface ErrorDetail {
  validatorName: string;
  subtype: string;
  message: string;
  isContextError: boolean;
}
```

Update `FormValidatorParams.onErrorMessageListChanged` signature (lines 53–56):

```ts
  onErrorMessageListChanged?: (
    element: Element,
    errorMessages: string[],
    errors: ErrorDetail[],
  ) => void;
```

Add new optional fields to `FormValidatorParams` (after `trigger?` at line 93):

```ts
  /**
   * Fires when an element's pending state flips between "no async in flight"
   * and "at least one async in flight" (aggregated across all validators on
   * that element). Used for per-field "checking…" UI.
   */
  onPendingChange?: (element: Element, isPending: boolean) => void;
  /**
   * Fires when the form-level pending state flips. Used for disabling the
   * submit button while any async check is in flight.
   */
  onFormPendingChange?: (isPending: boolean) => void;
```

Internally, where `onErrorMessageListChanged` is called (line 797), also pass an empty array as the third arg for now. Find and update that one call site:

```ts
        this.#onErrorMessageListChanged(element, after, []);
```

And the reset call site at line 683:

```ts
        this.#onErrorMessageListChanged(element, [], []);
```

Update the field declaration (line ~189) to match the new signature:

```ts
  readonly #onErrorMessageListChanged: (
    element: Element,
    errorMessages: string[],
    errors: ErrorDetail[],
  ) => void;
```

In `packages/core/src/index.ts`, add `ErrorDetail` to the type re-exports:

```ts
export type {
  ElementType,
  ErrorDetail,
  ErrorMessage,
  FormValidatorParams,
  ValidatorDeclaration,
  ValidatorDeclarations,
  ValidatorInitFunction,
  ValidatorValidateFunction,
} from './classes/FormValidator';
```

- [ ] **Step 4: Run tests + lint + typecheck**

Run: `npm run lint && npm run typecheck && npx vitest run packages/core`
Expected: PASS — type widenings compile, existing tests still green, the two new tests pass.

- [ ] **Step 5: Commit**

Ask the user for commit permission. If granted:
```bash
git add packages/core/src/classes/FormValidator.ts packages/core/src/classes/FormValidator.test.ts packages/core/src/index.ts
git commit -m "feat(core): widen ValidatorValidateFunction return; add ErrorDetail, onError, pending callbacks"
```

---

## Task 11: Factor `#applyResults` out of `#validateEventHandler`

Extract the apply pipeline (lines ~764–810 in the current file) into a private `#applyResults(targetElement, validationResultList)` method so it can be called from both the validate handler loop and the coordinator's `onApplyResult` callback. Behavior unchanged.

**Files:**
- Modify: `packages/core/src/classes/FormValidator.ts:710-813`

- [ ] **Step 1: Write the failing test**

Existing tests cover the apply pipeline. Add one regression test that asserts the same callback firing for a sync validate cycle, to guard against accidental behavior changes during refactor:

Append to `FormValidator.test.ts`:

```ts
describe('FormValidator #applyResults refactor regression', () => {
  test('sync validate still fires onErrorMessageListChanged with correct messages', () => {
    document.body.innerHTML = '<form id="r"><input name="a" data-validation="r"/></form>';
    const form3 = document.getElementById('r') as HTMLFormElement;
    const onChange = vi.fn();
    new FormValidator({
      form: form3,
      validatorDeclarations: {
        r: {
          init: () => new FormValidatorInitResult({ observableElementList: [], extraData: {} }),
          validate: () => new FormValidatorValidationResult({ isValid: false }),
          errorMessage: 'invalid',
        },
      },
      onErrorMessageListChanged: onChange,
    });
    const input = form3.querySelector('input')!;
    input.dispatchEvent(FormValidator.createValidateEvent());
    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls.at(-1)!;
    expect(lastCall[1]).toContain('invalid');
  });
});
```

- [ ] **Step 2: Run test (passes — establishes baseline)**

Run: `npx vitest run packages/core/src/classes/FormValidator.test.ts -t 'applyResults refactor regression'`
Expected: PASS.

- [ ] **Step 3: Refactor — extract `#applyResults`**

In `#validateEventHandler` (around line 764), replace the apply block:

```ts
    const elementSet = new Set<Element>();
    const elementToErrorMessageBeforeValidationListMap = new Map<Element, string[]>();

    for (const validationResult of validationResultList) {
      const { isContextError, isValid, validatorName } = validationResult;
      const element = isContextError
        ? this.#getContext(targetElement, validatorName).element
        : targetElement;

      if (!elementToErrorMessageBeforeValidationListMap.has(element)) {
        elementToErrorMessageBeforeValidationListMap.set(
          element,
          getErrorMessageList(this.#elementToErrorListMap.get(element) ?? []),
        );
      }

      if (isValid) {
        this.#removeError(element, validationResult);
      } else {
        this.#addError(element, validationResult);
      }

      elementSet.add(element);
    }

    for (const element of elementSet) {
      const before = elementToErrorMessageBeforeValidationListMap.get(element) ?? [];
      const after = getErrorMessageList(this.#elementToErrorListMap.get(element) ?? []);
      const sameLength = before.length === after.length;
      const sameContents = sameLength && before.every((msg, ix) => msg === after[ix]);
      if (!sameContents) {
        this.#syncAriaInvalid(element, after.length > 0);
        this.#syncCustomValidity(element, after);
        this.#onErrorMessageListChanged(element, after, []);
      }
    }

    if (
      this.#getEffectiveTrigger(targetElement) === 'blur-then-input'
      && validationResultList.some((r) => !r.isValid)
    ) {
      this.#fieldsShownError.add(targetElement);
    }
```

with a single call:

```ts
    this.#applyResults(targetElement, validationResultList);
```

Add the new method:

```ts
  #applyResults = (
    targetElement: FormElement,
    validationResultList: FormValidatorValidationResult[],
  ): void => {
    const elementSet = new Set<Element>();
    const elementToErrorMessageBeforeValidationListMap = new Map<Element, string[]>();

    for (const validationResult of validationResultList) {
      const { isContextError, isValid, validatorName } = validationResult;
      const element = isContextError
        ? this.#getContext(targetElement, validatorName).element
        : targetElement;

      if (!elementToErrorMessageBeforeValidationListMap.has(element)) {
        elementToErrorMessageBeforeValidationListMap.set(
          element,
          getErrorMessageList(this.#elementToErrorListMap.get(element) ?? []),
        );
      }

      if (isValid) {
        this.#removeError(element, validationResult);
      } else {
        this.#addError(element, validationResult);
      }

      elementSet.add(element);
    }

    for (const element of elementSet) {
      const before = elementToErrorMessageBeforeValidationListMap.get(element) ?? [];
      const after = getErrorMessageList(this.#elementToErrorListMap.get(element) ?? []);
      const sameLength = before.length === after.length;
      const sameContents = sameLength && before.every((msg, ix) => msg === after[ix]);
      if (!sameContents) {
        this.#syncAriaInvalid(element, after.length > 0);
        this.#syncCustomValidity(element, after);
        this.#onErrorMessageListChanged(element, after, []);
      }
    }

    if (
      this.#getEffectiveTrigger(targetElement) === 'blur-then-input'
      && validationResultList.some((r) => !r.isValid)
    ) {
      this.#fieldsShownError.add(targetElement);
    }
  };
```

- [ ] **Step 4: Run full test suite to verify no regressions**

Run: `npm test`
Expected: ALL PASS — refactor is behavior-preserving.

- [ ] **Step 5: Commit**

Ask the user for commit permission. If granted:
```bash
git add packages/core/src/classes/FormValidator.ts packages/core/src/classes/FormValidator.test.ts
git commit -m "refactor(core): extract #applyResults from validate handler"
```

---

## Task 12: Instantiate coordinator + wire callbacks in FormValidator constructor

Add the `#coordinator`, `#onPendingChange`, `#onFormPendingChange` fields. Wire callbacks. No async validation runs yet — this just plumbs the wiring.

**Files:**
- Modify: `packages/core/src/classes/FormValidator.ts` (constructor + new private fields)

- [ ] **Step 1: Write the failing test**

Append to `FormValidator.test.ts`:

```ts
describe('FormValidator coordinator wiring', () => {
  test('constructor accepts onPendingChange and onFormPendingChange without throwing', () => {
    document.body.innerHTML = '<form id="cw"/>';
    const form4 = document.getElementById('cw') as HTMLFormElement;
    const onPending = vi.fn();
    const onFormPending = vi.fn();
    expect(() => new FormValidator({
      form: form4,
      onPendingChange: onPending,
      onFormPendingChange: onFormPending,
    })).not.toThrow();
    // No async cycles started yet → no callbacks fired.
    expect(onPending).not.toHaveBeenCalled();
    expect(onFormPending).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it passes (Task 10 already added the param types)**

Run: `npx vitest run packages/core/src/classes/FormValidator.test.ts -t 'coordinator wiring'`
Expected: PASS — types accept the args; behavior placeholder.

- [ ] **Step 3: Add coordinator wiring**

In `FormValidator.ts`, add the import at the top:

```ts
import AsyncValidationCoordinator from './AsyncValidationCoordinator';
```

Add the new private fields near the other `readonly #` fields (around line 189):

```ts
  readonly #onPendingChange: (element: Element, isPending: boolean) => void;

  readonly #onFormPendingChange: (isPending: boolean) => void;

  readonly #coordinator: AsyncValidationCoordinator;
```

Add the constructor params destructuring (where `onErrorMessageListChanged` is destructured around line 217):

```ts
    onPendingChange = () => {},
    onFormPendingChange = () => {},
```

Add field assignments (after `this.#onErrorMessageListChanged = onErrorMessageListChanged;`):

```ts
    this.#onPendingChange = onPendingChange;
    this.#onFormPendingChange = onFormPendingChange;
    this.#coordinator = new AsyncValidationCoordinator({
      onApplyResult: (element, _name, result) => {
        this.#applyResults(element as FormElement, [result]);
      },
      onElementPendingChange: (element, isPending) => {
        this.#syncAriaBusy(element, isPending);
        this.#onPendingChange(element, isPending);
      },
      onFormPendingChange: (isPending) => {
        this.#onFormPendingChange(isPending);
      },
      onSlotResolved: () => {
        this.#checkSubmitHandoff();
      },
    });
```

Add stub helpers (will be filled in subsequent tasks):

```ts
  #syncAriaBusy = (element: Element, isPending: boolean): void => {
    // Filled in Task 15.
    void element; void isPending;
  };

  #checkSubmitHandoff = (): void => {
    // Filled in Task 16.
  };
```

`#applyResults` is reused from Task 11 — it expects a target element and a single-result list, which is the shape coordinator hands it.

- [ ] **Step 4: Run tests, lint, typecheck**

Run: `npm run lint && npm run typecheck && npm test`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

Ask the user for commit permission. If granted:
```bash
git add packages/core/src/classes/FormValidator.ts packages/core/src/classes/FormValidator.test.ts
git commit -m "feat(core): instantiate AsyncValidationCoordinator and wire callbacks"
```

---

## Task 13: Validate handler async branch (route Promise returns through coordinator)

Modify `#validateEventHandler` to detect Promise-returning validates and route them through `coordinator.startCycle`. Sync results that supersede in-flight async call `coordinator.abortSlot`. Injection path also calls `abortSlot`.

**Files:**
- Modify: `packages/core/src/classes/FormValidator.ts` (`#validateEventHandler` body)

- [ ] **Step 1: Write the failing tests**

Append to `FormValidator.test.ts`:

```ts
describe('FormValidator async validation routing', () => {
  function setupAsyncForm(opts: {
    validate: (target: Element, data: unknown, options?: { signal: AbortSignal }) => unknown;
    onError?: (err: unknown) => FormValidatorValidationResult;
    onPending?: (el: Element, p: boolean) => void;
    onFormPending?: (p: boolean) => void;
    onErrorChange?: (el: Element, msgs: string[], errors: unknown[]) => void;
  }) {
    document.body.innerHTML = '<form id="af"><input name="u" data-validation="async"/></form>';
    const form5 = document.getElementById('af') as HTMLFormElement;
    const validator = new FormValidator({
      form: form5,
      validatorDeclarations: {
        async: {
          init: () => new FormValidatorInitResult({ observableElementList: [], extraData: {} }),
          validate: opts.validate as never,
          errorMessage: { '': 'invalid', error: 'failed to verify' },
          onError: opts.onError,
        },
      },
      onPendingChange: opts.onPending,
      onFormPendingChange: opts.onFormPending,
      onErrorMessageListChanged: opts.onErrorChange,
    });
    const input = form5.querySelector('input')!;
    return { form: form5, input, validator };
  }

  test('Promise-returning validate routes through coordinator (pending callback fires)', async () => {
    const onPending = vi.fn();
    const { input } = setupAsyncForm({
      validate: () => new Promise(() => { /* never resolves */ }),
      onPending,
    });
    input.dispatchEvent(FormValidator.createValidateEvent());
    expect(onPending).toHaveBeenCalledWith(input, true);
  });

  test('async result lands in error store and fires onErrorMessageListChanged', async () => {
    const onErrorChange = vi.fn();
    let resolveFn!: (r: FormValidatorValidationResult) => void;
    const { input } = setupAsyncForm({
      validate: () => new Promise<FormValidatorValidationResult>((res) => { resolveFn = res; }),
      onErrorChange,
    });
    input.dispatchEvent(FormValidator.createValidateEvent());

    resolveFn(new FormValidatorValidationResult({ isValid: false }));
    await Promise.resolve(); await Promise.resolve();

    const lastCall = onErrorChange.mock.calls.at(-1)!;
    expect(lastCall[1]).toContain('invalid');
  });

  test('sync result on a slot with in-flight async aborts the in-flight', async () => {
    let abortedFromInside = false;
    const { input } = setupAsyncForm({
      validate: (_t, _d, opts) => {
        if (!opts) return new FormValidatorValidationResult({ isValid: true });
        opts.signal.addEventListener('abort', () => { abortedFromInside = true; });
        return new Promise(() => { /* never resolves */ });
      },
    });
    input.dispatchEvent(FormValidator.createValidateEvent());
    expect(abortedFromInside).toBe(false);

    // Replace the validator with a sync one mid-stream by dispatching with injected result.
    input.dispatchEvent(FormValidator.createValidateEvent({
      data: { async: new FormValidatorValidationResult({ isValid: true }) },
    }));
    expect(abortedFromInside).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/src/classes/FormValidator.test.ts -t 'async validation routing'`
Expected: FAIL — Promise return is silently ignored; coordinator never called.

- [ ] **Step 3: Modify `#validateEventHandler`**

In `FormValidator.ts`, find the `#validateEventHandler` loop (around line 735). Replace the per-validator iteration:

```ts
    for (const validatorName of validatorNameToContextMap.keys()) {
      const data = validatorNameToDataMap.get(validatorName);
      if (!data) continue;

      const injected = eventData[validatorName];
      if (injected instanceof FormValidatorValidationResult) {
        this.#coordinator.abortSlot(targetElement, validatorName);
        const stamped = injected;
        stamped.validatorName = validatorName;
        if (this.ignoreValidationResult) {
          validationResultList.push(new FormValidatorValidationResult({
            ...stamped,
            validatorSubtypeList: stamped.validatorSubtypeList,
            isValid: true,
          }));
        } else {
          validationResultList.push(stamped);
        }
        continue;
      }

      const definition = this.#validatorNameToDefinitionMap.get(validatorName);
      if (!definition) continue;

      const controller = new AbortController();
      let returnValue: ReturnType<ValidatorValidateFunction>;
      try {
        returnValue = definition.validate(targetElement, data, { signal: controller.signal });
      } catch (err) {
        throw err; // existing behavior — sync throw propagates
      }

      if (returnValue instanceof Promise) {
        this.#coordinator.startCycle(
          targetElement,
          validatorName,
          returnValue,
          controller,
          definition.onError,
        );
        // async result will land via coordinator's onApplyResult → #applyResults
      } else if (returnValue instanceof FormValidatorValidationResult) {
        this.#coordinator.abortSlot(targetElement, validatorName);
        const stamped = returnValue;
        stamped.validatorName = validatorName;
        if (this.ignoreValidationResult) {
          validationResultList.push(new FormValidatorValidationResult({
            ...stamped,
            validatorSubtypeList: stamped.validatorSubtypeList,
            isValid: true,
          }));
        } else {
          validationResultList.push(stamped);
        }
      }
      // else (undefined / non-Result): silent skip, existing behavior.
    }
```

Update `ValidatorDefinition` interface (around line 98) to include `onError`:

```ts
interface ValidatorDefinition {
  init: ValidatorInitFunction;
  validate: ValidatorValidateFunction;
  errorMessage: Record<string, string>;
  onError?: (err: unknown) => FormValidatorValidationResult;
}
```

Find where `ValidatorDefinition` is constructed (search for `init:` near line 400ish — `#validatorNameToDefinitionMap.set(...)`); pass `onError` from the user's declaration through.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/src/classes/FormValidator.test.ts -t 'async validation routing'`
Expected: PASS, 3 tests.

- [ ] **Step 5: Run full suite to confirm no regressions**

Run: `npm test`
Expected: ALL PASS.

- [ ] **Step 6: Commit**

Ask the user for commit permission. If granted:
```bash
git add packages/core/src/classes/FormValidator.ts packages/core/src/classes/FormValidator.test.ts
git commit -m "feat(core): route Promise validate returns through coordinator; abortSlot on injection and sync supersession"
```

---

## Task 14: ErrorDetail third arg in `onErrorMessageListChanged`

Build the structured `ErrorDetail[]` parallel to `msgs[]` from the recorded results. Wire into the apply pipeline and the reset clear-out. Ensure parallel-arrays guarantee.

**Files:**
- Modify: `packages/core/src/classes/FormValidator.ts:168-175` (extend `getErrorMessageList`-area helpers)
- Modify: `packages/core/src/classes/FormValidator.ts:683` (reset call site)
- Modify: `packages/core/src/classes/FormValidator.ts:797` (apply call site, now inside `#applyResults`)

- [ ] **Step 1: Write the failing tests**

Append to `FormValidator.test.ts`:

```ts
describe('FormValidator ErrorDetail third arg', () => {
  test('errors[] is parallel to msgs[] for sync invalid result with default subtype', () => {
    document.body.innerHTML = '<form id="ed"><input name="a" data-validation="r"/></form>';
    const form6 = document.getElementById('ed') as HTMLFormElement;
    const onChange = vi.fn();
    new FormValidator({
      form: form6,
      validatorDeclarations: {
        r: {
          init: () => new FormValidatorInitResult({ observableElementList: [], extraData: {} }),
          validate: () => new FormValidatorValidationResult({ isValid: false }),
          errorMessage: 'oops',
        },
      },
      onErrorMessageListChanged: onChange,
    });
    const input = form6.querySelector('input')!;
    input.dispatchEvent(FormValidator.createValidateEvent());
    const lastCall = onChange.mock.calls.at(-1)!;
    expect(lastCall[1]).toEqual(['oops']);
    expect(lastCall[2]).toEqual([{
      validatorName: 'r',
      subtype: '',
      message: 'oops',
      isContextError: false,
    }]);
  });

  test('errors[] surfaces validatorSubtypeList correctly', () => {
    document.body.innerHTML = '<form id="ed2"><input name="a" data-validation="r"/></form>';
    const form7 = document.getElementById('ed2') as HTMLFormElement;
    const onChange = vi.fn();
    new FormValidator({
      form: form7,
      validatorDeclarations: {
        r: {
          init: () => new FormValidatorInitResult({ observableElementList: [], extraData: {} }),
          validate: () => new FormValidatorValidationResult({
            isValid: false,
            validatorSubtypeList: ['too-short', 'no-digit'],
          }),
          errorMessage: { 'too-short': 'short', 'no-digit': 'needs digit' },
        },
      },
      onErrorMessageListChanged: onChange,
    });
    const input = form7.querySelector('input')!;
    input.dispatchEvent(FormValidator.createValidateEvent());
    const lastCall = onChange.mock.calls.at(-1)!;
    expect(lastCall[2]).toHaveLength(lastCall[1].length);
    expect(lastCall[2].map((e: { subtype: string }) => e.subtype)).toEqual(['too-short', 'no-digit']);
  });

  test('errors[] is empty when no errors (reset)', () => {
    document.body.innerHTML = '<form id="ed3"><input name="a" data-validation="r"/></form>';
    const form8 = document.getElementById('ed3') as HTMLFormElement;
    const onChange = vi.fn();
    new FormValidator({
      form: form8,
      validatorDeclarations: {
        r: {
          init: () => new FormValidatorInitResult({ observableElementList: [], extraData: {} }),
          validate: () => new FormValidatorValidationResult({ isValid: false }),
          errorMessage: 'oops',
        },
      },
      onErrorMessageListChanged: onChange,
    });
    const input = form8.querySelector('input')!;
    input.dispatchEvent(FormValidator.createValidateEvent());
    onChange.mockClear();
    form8.reset();
    form8.dispatchEvent(new Event('reset'));
    if (onChange.mock.calls.length > 0) {
      const lastCall = onChange.mock.calls.at(-1)!;
      expect(lastCall[1]).toEqual([]);
      expect(lastCall[2]).toEqual([]);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/src/classes/FormValidator.test.ts -t 'ErrorDetail third arg'`
Expected: FAIL — third arg currently always `[]`.

- [ ] **Step 3: Build ErrorDetail[] from stored ValidationError[]**

Add a helper near `getErrorMessageList` (around line 168):

```ts
function buildErrorDetailList(errorList: ValidationError[]): ErrorDetail[] {
  const out: ErrorDetail[] = [];
  for (const { validatorName, subtype, message } of errorList) {
    if (message == null) continue;
    out.push({
      validatorName,
      subtype,
      message,
      isContextError: false, // filled in by caller if applicable
    });
  }
  return out;
}
```

`isContextError` is a property of the original `FormValidatorValidationResult`, not stored in `ValidationError`. Since the recorded `ValidationError[]` is what we have at apply-time, and the engine uses `isContextError` to decide WHICH element the error attaches to (not what's in the list), the value at the per-message ErrorDetail level should reflect: "did this error end up on a context element rather than its target element?" The simplest correct rule: `isContextError === (the element receiving this callback) !== (the original target the validator was called on)`. We don't track originalTarget per `ValidationError`, so add `isContextError` to `ValidationError` storage.

Update `ValidationError` interface (around line 111):

```ts
interface ValidationError {
  validatorName: string;
  subtype: string;
  message: string | null;
  isContextError: boolean;
}
```

Find `#addError` (around line 435). Where it constructs and pushes new entries, include `isContextError: validationResult.isContextError`. Find the existing push and add the property.

Now update `buildErrorDetailList`:

```ts
function buildErrorDetailList(errorList: ValidationError[]): ErrorDetail[] {
  const out: ErrorDetail[] = [];
  for (const { validatorName, subtype, message, isContextError } of errorList) {
    if (message == null) continue;
    out.push({ validatorName, subtype, message, isContextError });
  }
  return out;
}
```

In `#applyResults`, replace the existing `[]` third arg:

```ts
        this.#onErrorMessageListChanged(
          element,
          after,
          buildErrorDetailList(this.#elementToErrorListMap.get(element) ?? []),
        );
```

In `#removeError` reset path (around line 683), update similarly:

```ts
        this.#onErrorMessageListChanged(element, [], []);
```

Stays as-is (no errors → empty arrays).

- [ ] **Step 4: Run tests + full suite**

Run: `npm test`
Expected: ALL PASS — new tests pass and no regressions.

- [ ] **Step 5: Commit**

Ask the user for commit permission. If granted:
```bash
git add packages/core/src/classes/FormValidator.ts packages/core/src/classes/FormValidator.test.ts
git commit -m "feat(core): emit structured ErrorDetail[] as third arg of onErrorMessageListChanged"
```

---

## Task 15: aria-busy management

Implement `#syncAriaBusy` (the Task 12 stub). Set `aria-busy="true"` on form-control elements while at least one validator on them is pending; remove on resolution. Skip non-form-control elements.

**Files:**
- Modify: `packages/core/src/classes/FormValidator.ts:#syncAriaBusy`

- [ ] **Step 1: Write the failing tests**

Append to `FormValidator.test.ts`:

```ts
describe('FormValidator aria-busy management', () => {
  test('aria-busy set on form control while async pending, removed on resolution', async () => {
    document.body.innerHTML = '<form id="ab"><input name="u" data-validation="a"/></form>';
    const form9 = document.getElementById('ab') as HTMLFormElement;
    let resolveFn!: (r: FormValidatorValidationResult) => void;
    new FormValidator({
      form: form9,
      validatorDeclarations: {
        a: {
          init: () => new FormValidatorInitResult({ observableElementList: [], extraData: {} }),
          validate: () => new Promise<FormValidatorValidationResult>((res) => { resolveFn = res; }),
          errorMessage: 'invalid',
        },
      },
    });
    const input = form9.querySelector('input')!;
    input.dispatchEvent(FormValidator.createValidateEvent());
    expect(input.getAttribute('aria-busy')).toBe('true');

    resolveFn(new FormValidatorValidationResult({ isValid: true }));
    await Promise.resolve(); await Promise.resolve();
    expect(input.hasAttribute('aria-busy')).toBe(false);
  });

  test('aria-busy NOT set on non-form-control context element', async () => {
    document.body.innerHTML = `
      <form id="ab2">
        <fieldset data-validation-context="a">
          <input name="u" data-validation="a"/>
        </fieldset>
      </form>`;
    const form10 = document.getElementById('ab2') as HTMLFormElement;
    new FormValidator({
      form: form10,
      validatorDeclarations: {
        a: {
          init: () => new FormValidatorInitResult({ observableElementList: [], extraData: {} }),
          validate: () => new Promise(() => {}),
          errorMessage: 'invalid',
        },
      },
    });
    const input = form10.querySelector('input')!;
    const fieldset = form10.querySelector('fieldset')!;
    input.dispatchEvent(FormValidator.createValidateEvent());
    expect(input.getAttribute('aria-busy')).toBe('true');
    expect(fieldset.hasAttribute('aria-busy')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/src/classes/FormValidator.test.ts -t 'aria-busy'`
Expected: FAIL — `#syncAriaBusy` is a no-op stub.

- [ ] **Step 3: Implement `#syncAriaBusy`**

In `FormValidator.ts`, replace the stub:

```ts
  #syncAriaBusy = (element: Element, isPending: boolean): void => {
    if (!(element instanceof HTMLInputElement
      || element instanceof HTMLSelectElement
      || element instanceof HTMLTextAreaElement)) {
      return; // skip non-form-controls (mirrors aria-invalid scope)
    }
    if (isPending) {
      element.setAttribute('aria-busy', 'true');
    } else {
      element.removeAttribute('aria-busy');
    }
  };
```

- [ ] **Step 4: Run tests + full suite**

Run: `npm test`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

Ask the user for commit permission. If granted:
```bash
git add packages/core/src/classes/FormValidator.ts packages/core/src/classes/FormValidator.test.ts
git commit -m "feat(core): manage aria-busy on form controls during async validation"
```

---

## Task 16: Submit handler with async pending + `#resolveSubmitPending`

The heart of the feature. Modify `#submitEventHandler` to detect pending state, block via `stopImmediatePropagation` + `preventDefault`, stash the submitter. Implement `#checkSubmitHandoff` (Task 12 stub) and `#resolveSubmitPending` to fire `requestSubmit` after async resolves green.

**Files:**
- Modify: `packages/core/src/classes/FormValidator.ts:#submitEventHandler` and add `#submitPending`, `#submitSubmitter`, `#allowNextSubmit`, `#resolveSubmitPending`

- [ ] **Step 1: Write the failing tests**

Append to `FormValidator.test.ts`:

```ts
describe('FormValidator async submit flow', () => {
  function asyncSubmitForm(opts: {
    validate: () => Promise<FormValidatorValidationResult> | FormValidatorValidationResult;
  }) {
    document.body.innerHTML = '<form id="sf"><input name="u" data-validation="a"/><button type="submit">Go</button></form>';
    const form11 = document.getElementById('sf') as HTMLFormElement;
    new FormValidator({
      form: form11,
      validatorDeclarations: {
        a: {
          init: () => new FormValidatorInitResult({ observableElementList: [], extraData: {} }),
          validate: opts.validate as never,
          errorMessage: 'invalid',
        },
      },
    });
    return form11;
  }

  test('submit blocked while async pending; preventDefault and stopImmediatePropagation called', () => {
    const form12 = asyncSubmitForm({ validate: () => new Promise(() => {}) });
    const after = vi.fn();
    form12.addEventListener('submit', after);

    const submitEvent = new Event('submit', { cancelable: true, bubbles: true });
    form12.dispatchEvent(submitEvent);
    expect(submitEvent.defaultPrevented).toBe(true);
    expect(after).not.toHaveBeenCalled();
  });

  test('submit re-fires via requestSubmit after async resolves valid; AFTER-listener runs on resubmit', async () => {
    let resolveFn!: (r: FormValidatorValidationResult) => void;
    const form13 = asyncSubmitForm({
      validate: () => new Promise<FormValidatorValidationResult>((res) => { resolveFn = res; }),
    });
    const after = vi.fn((e: Event) => e.preventDefault());
    form13.addEventListener('submit', after);

    form13.requestSubmit();
    expect(after).not.toHaveBeenCalled();

    resolveFn(new FormValidatorValidationResult({ isValid: true }));
    await Promise.resolve(); await Promise.resolve();

    expect(after).toHaveBeenCalledTimes(1);
  });

  test('async resolves invalid: no resubmit, downstream submit listener does not fire', async () => {
    let resolveFn!: (r: FormValidatorValidationResult) => void;
    const form14 = asyncSubmitForm({
      validate: () => new Promise<FormValidatorValidationResult>((res) => { resolveFn = res; }),
    });
    const after = vi.fn();
    form14.addEventListener('submit', after);
    form14.requestSubmit();

    resolveFn(new FormValidatorValidationResult({ isValid: false }));
    await Promise.resolve(); await Promise.resolve();

    expect(after).not.toHaveBeenCalled();
  });

  test('user edit during submit pending extends the wait', async () => {
    let counter = 0;
    let lastResolve!: (r: FormValidatorValidationResult) => void;
    const form15 = asyncSubmitForm({
      validate: () => {
        counter += 1;
        return new Promise<FormValidatorValidationResult>((res) => { lastResolve = res; });
      },
    });
    const after = vi.fn();
    form15.addEventListener('submit', after);

    form15.requestSubmit(); // counter=1
    const input = form15.querySelector('input')!;
    input.dispatchEvent(new Event('input', { bubbles: true })); // counter=2 (cycle replaced)

    lastResolve(new FormValidatorValidationResult({ isValid: true }));
    await Promise.resolve(); await Promise.resolve();

    expect(after).toHaveBeenCalledTimes(1);
    expect(counter).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/src/classes/FormValidator.test.ts -t 'async submit flow'`
Expected: FAIL — submit handler doesn't yet handle pending case.

- [ ] **Step 3: Add submit-pending fields and modify `#submitEventHandler`**

In `FormValidator.ts`, add private fields:

```ts
  #submitPending = false;

  #submitSubmitter: HTMLElement | null = null;

  #allowNextSubmit = false;
```

Replace `#submitEventHandler` body (around line 691):

```ts
  #submitEventHandler = (event: Event): void => {
    if (event.target !== this.#form) return;

    if (this.#allowNextSubmit) {
      this.#allowNextSubmit = false;
      return; // post-resolution requestSubmit re-entry — let through.
    }

    const submitter = (event as SubmitEvent).submitter ?? null;

    this.#getValidationTargets().forEach((element) => {
      element.dispatchEvent(FormValidator.createValidateEvent());
    });

    const hasErrorsNow = this.#hasErrors();
    const hasPending = this.#coordinator.hasPending();

    if (!hasErrorsNow && !hasPending) {
      return; // existing path: all sync valid, let event proceed.
    }

    event.stopImmediatePropagation();
    event.preventDefault();

    if (hasPending) {
      this.#submitPending = true;
      this.#submitSubmitter = submitter;
      // resolution will happen via #checkSubmitHandoff once pendingCount hits 0.
    } else {
      if (this.#reportValidityOnSubmit) {
        this.#form.reportValidity();
      }
    }
  };
```

Replace the `#checkSubmitHandoff` stub:

```ts
  #checkSubmitHandoff = (): void => {
    if (!this.#submitPending) return;
    if (this.#coordinator.hasPending()) return;
    this.#resolveSubmitPending();
  };

  #resolveSubmitPending = (): void => {
    this.#submitPending = false;
    const submitter = this.#submitSubmitter;
    this.#submitSubmitter = null;

    if (this.#hasErrors()) {
      if (this.#reportValidityOnSubmit) this.#form.reportValidity();
      return;
    }

    this.#allowNextSubmit = true;
    this.#form.requestSubmit(submitter ?? undefined);
  };
```

Important: existing inline `reportValidityOnSubmit` call inside the original `#submitEventHandler` is now only called in the no-pending branch (lines above). Verify no duplicate call.

- [ ] **Step 4: Run tests + full suite**

Run: `npm test`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

Ask the user for commit permission. If granted:
```bash
git add packages/core/src/classes/FormValidator.ts packages/core/src/classes/FormValidator.test.ts
git commit -m "feat(core): submit handler awaits async; requestSubmit on success with loop guard"
```

---

## Task 17: Reset and destroy abort in-flight async

Wire `#resetEventHandler` to call `coordinator.abortAll()` and clear submit-pending state. Wire `destroy()` to do the same minus the callback firing (call a separate "silent" path or accept that destroy has no observers).

**Files:**
- Modify: `packages/core/src/classes/FormValidator.ts:#resetEventHandler` (around line 670)
- Modify: `packages/core/src/classes/FormValidator.ts:destroy()` method

- [ ] **Step 1: Write the failing tests**

Append to `FormValidator.test.ts`:

```ts
describe('FormValidator reset and destroy with async', () => {
  test('reset aborts in-flight async, fires false transitions, clears submit pending', async () => {
    document.body.innerHTML = '<form id="rd"><input name="u" data-validation="a"/></form>';
    const form16 = document.getElementById('rd') as HTMLFormElement;
    let abortedFlag = false;
    let resolveFn!: (r: FormValidatorValidationResult) => void;
    const onPending = vi.fn();
    const onFormPending = vi.fn();
    new FormValidator({
      form: form16,
      validatorDeclarations: {
        a: {
          init: () => new FormValidatorInitResult({ observableElementList: [], extraData: {} }),
          validate: (_t, _d, opts) => {
            opts!.signal.addEventListener('abort', () => { abortedFlag = true; });
            return new Promise<FormValidatorValidationResult>((res) => { resolveFn = res; });
          },
          errorMessage: 'invalid',
        },
      },
      onPendingChange: onPending,
      onFormPendingChange: onFormPending,
    });
    const input = form16.querySelector('input')!;
    input.dispatchEvent(FormValidator.createValidateEvent());
    expect(abortedFlag).toBe(false);

    form16.dispatchEvent(new Event('reset', { bubbles: true }));
    expect(abortedFlag).toBe(true);
    expect(onPending).toHaveBeenLastCalledWith(input, false);
    expect(onFormPending).toHaveBeenLastCalledWith(false);

    // resolveFn (if called now) should not affect anything because slot is gone.
    resolveFn(new FormValidatorValidationResult({ isValid: false }));
    await Promise.resolve(); await Promise.resolve();
  });

  test('destroy aborts in-flight async without firing pending callbacks', async () => {
    document.body.innerHTML = '<form id="rd2"><input name="u" data-validation="a"/></form>';
    const form17 = document.getElementById('rd2') as HTMLFormElement;
    let abortedFlag = false;
    const onPending = vi.fn();
    const onFormPending = vi.fn();
    const v = new FormValidator({
      form: form17,
      validatorDeclarations: {
        a: {
          init: () => new FormValidatorInitResult({ observableElementList: [], extraData: {} }),
          validate: (_t, _d, opts) => {
            opts!.signal.addEventListener('abort', () => { abortedFlag = true; });
            return new Promise(() => {});
          },
          errorMessage: 'invalid',
        },
      },
      onPendingChange: onPending,
      onFormPendingChange: onFormPending,
    });
    const input = form17.querySelector('input')!;
    input.dispatchEvent(FormValidator.createValidateEvent());
    onPending.mockClear();
    onFormPending.mockClear();

    v.destroy();
    expect(abortedFlag).toBe(true);
    expect(onPending).not.toHaveBeenCalled();
    expect(onFormPending).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/src/classes/FormValidator.test.ts -t 'reset and destroy with async'`
Expected: FAIL — reset/destroy don't talk to coordinator yet.

- [ ] **Step 3: Add a silent abortAll variant + wire reset and destroy**

Add a private flag-based silent path on the coordinator. In `AsyncValidationCoordinator.ts`, add a method:

```ts
  abortAllSilent(): void {
    if (this.#pendingCount === 0) return;
    for (const inner of this.#asyncInFlight.values()) {
      for (const { controller } of inner.values()) {
        controller.abort();
      }
    }
    this.#asyncInFlight.clear();
    this.#pendingCount = 0;
    // No callbacks — caller is doing teardown.
  }
```

In `FormValidator.ts`, modify `#resetEventHandler` (around line 670) — find the existing reset body and prepend the abort:

```ts
  #resetEventHandler = (event: Event): void => {
    if (event.target !== this.#form) return;
    this.#coordinator.abortAll();
    this.#submitPending = false;
    this.#submitSubmitter = null;
    this.#allowNextSubmit = false;
    // ... existing reset body continues unchanged ...
  };
```

In the existing `destroy()` method (around line 250), prepend:

```ts
    this.#coordinator.abortAllSilent();
    this.#submitPending = false;
    this.#submitSubmitter = null;
    this.#allowNextSubmit = false;
    // ... existing destroy body continues ...
```

- [ ] **Step 4: Run tests + full suite**

Run: `npm test`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

Ask the user for commit permission. If granted:
```bash
git add packages/core/src/classes/FormValidator.ts packages/core/src/classes/AsyncValidationCoordinator.ts packages/core/src/classes/FormValidator.test.ts
git commit -m "feat(core): reset and destroy abort in-flight async; silent variant for destroy"
```

---

## Task 18: `retry()` instance method

Add the granular retry method per spec §9. Convenience mode dispatches `createValidateEvent` on the element. Granular mode runs only the named validator.

**Files:**
- Modify: `packages/core/src/classes/FormValidator.ts` (add public `retry` method)

- [ ] **Step 1: Write the failing tests**

Append to `FormValidator.test.ts`:

```ts
describe('FormValidator.retry', () => {
  test('retry(el) re-runs all validators (equivalent to dispatching createValidateEvent)', () => {
    document.body.innerHTML = '<form id="rt"><input name="u" data-validation="a"/></form>';
    const form18 = document.getElementById('rt') as HTMLFormElement;
    const validate = vi.fn(() => new FormValidatorValidationResult({ isValid: true }));
    const v = new FormValidator({
      form: form18,
      validatorDeclarations: {
        a: {
          init: () => new FormValidatorInitResult({ observableElementList: [], extraData: {} }),
          validate,
          errorMessage: 'invalid',
        },
      },
    });
    const input = form18.querySelector('input')!;
    validate.mockClear();
    v.retry(input);
    expect(validate).toHaveBeenCalled();
  });

  test('retry(el, name) granular: re-runs only the named validator, leaves other slots untouched', () => {
    document.body.innerHTML = '<form id="rt2"><input name="u" data-validation="a;b"/></form>';
    const form19 = document.getElementById('rt2') as HTMLFormElement;
    const validateA = vi.fn(() => new FormValidatorValidationResult({ isValid: true }));
    const validateB = vi.fn(() => new FormValidatorValidationResult({ isValid: true }));
    const v = new FormValidator({
      form: form19,
      validatorDeclarations: {
        a: {
          init: () => new FormValidatorInitResult({ observableElementList: [], extraData: {} }),
          validate: validateA,
          errorMessage: 'a',
        },
        b: {
          init: () => new FormValidatorInitResult({ observableElementList: [], extraData: {} }),
          validate: validateB,
          errorMessage: 'b',
        },
      },
    });
    const input = form19.querySelector('input')!;
    input.dispatchEvent(FormValidator.createValidateEvent());
    validateA.mockClear();
    validateB.mockClear();
    v.retry(input, 'a');
    expect(validateA).toHaveBeenCalledTimes(1);
    expect(validateB).not.toHaveBeenCalled();
  });

  test('retry(el, name) throws when validator name is not declared on the element', () => {
    document.body.innerHTML = '<form id="rt3"><input name="u" data-validation="a"/></form>';
    const form20 = document.getElementById('rt3') as HTMLFormElement;
    const v = new FormValidator({
      form: form20,
      validatorDeclarations: {
        a: {
          init: () => new FormValidatorInitResult({ observableElementList: [], extraData: {} }),
          validate: () => new FormValidatorValidationResult({ isValid: true }),
          errorMessage: 'a',
        },
      },
    });
    const input = form20.querySelector('input')!;
    expect(() => v.retry(input, 'nonexistent')).toThrowError(/not declared/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/src/classes/FormValidator.test.ts -t 'FormValidator.retry'`
Expected: FAIL — `v.retry is not a function`.

- [ ] **Step 3: Implement `retry`**

Add as a public method on the `FormValidator` class:

```ts
  retry(element: Element, validatorName?: string): void {
    if (validatorName === undefined) {
      element.dispatchEvent(FormValidator.createValidateEvent());
      return;
    }

    if (!(element instanceof HTMLInputElement
      || element instanceof HTMLSelectElement
      || element instanceof HTMLTextAreaElement)) {
      throw new Error('Element is not a known validation target');
    }

    const storage = this.#getData(element);
    if (!storage.validatorNameToContextMap.has(validatorName)) {
      throw new Error(`Validator "${validatorName}" is not declared on the given element`);
    }
    const definition = this.#validatorNameToDefinitionMap.get(validatorName);
    if (!definition) {
      throw new Error(`Validator "${validatorName}" has no registered definition`);
    }
    const data = storage.validatorNameToDataMap.get(validatorName);
    if (!data) return;

    this.#coordinator.abortSlot(element, validatorName);

    const controller = new AbortController();
    const returnValue = definition.validate(element, data, { signal: controller.signal });

    if (returnValue instanceof Promise) {
      this.#coordinator.startCycle(element, validatorName, returnValue, controller, definition.onError);
      return;
    }
    if (returnValue instanceof FormValidatorValidationResult) {
      const stamped = returnValue;
      stamped.validatorName = validatorName;
      this.#applyResults(element as FormElement, [stamped]);
    }
  }
```

`#getData` is the existing private accessor for the per-target maps; verify its name in the source — adjust if it's spelled differently.

- [ ] **Step 4: Run tests + full suite**

Run: `npm test`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

Ask the user for commit permission. If granted:
```bash
git add packages/core/src/classes/FormValidator.ts packages/core/src/classes/FormValidator.test.ts
git commit -m "feat(core): add retry(element, validatorName?) instance method"
```

---

## Task 19: Update root README with full Async validation section

Replace the existing "Injecting validation results (async checks)" section with comprehensive async docs covering: defining an async validator, the AbortSignal contract, debounce recipe, pending-state callbacks, failure handling, retry pattern, submit semantics. Existing injection pattern recontextualized.

**Files:**
- Modify: `README.md` (replace section starting at line 179, ending at the start of "Validation timing")

- [ ] **Step 1: Read the current section bounds**

Run: `grep -n -E "^## " README.md` to find section anchors. The current async section is at line 179; the next section ("## Validation timing") starts somewhere after line 196.

- [ ] **Step 2: Replace the section**

Replace the entire `## Injecting validation results (async checks)` section (and its body, up to but not including `## Validation timing`) with:

````markdown
## Async validation

Validators may return a `Promise<FormValidatorValidationResult>` instead of a synchronous result. The engine tracks each in-flight (target, validator) cycle, exposes pending state for UX, and blocks form submission until all async checks resolve.

### Defining an async validator

```ts
import { FormValidator, FormValidatorValidationResult, ValidatorDeclarations } from '@form-validator-js/core';

const validators: ValidatorDeclarations = {
  uniqueUsername: {
    init: (target) => ({ observableElementList: [target], extraData: {} }),
    async validate(target, _data, { signal }) {
      const value = (target as HTMLInputElement).value;
      if (value.length < 3) {
        return new FormValidatorValidationResult({ isValid: false });
      }
      const r = await fetch(`/api/username-available?u=${encodeURIComponent(value)}`, { signal });
      const taken = (await r.json()).taken;
      return new FormValidatorValidationResult({ isValid: !taken });
    },
    errorMessage: { '': 'Username taken', error: 'Could not verify, try again' },
  },
};
```

The third arg `{ signal }` is an `AbortSignal` the engine controls. Wire it into your `fetch` (and any other awaitable resource) so cancellation propagates when the engine aborts the cycle — e.g. when the user types another character.

### Cancellation: race-by-latest + AbortSignal

Whenever a new cycle starts for the same `(target, validatorName)`, the engine aborts the previous controller and bumps an internal generation. Stale Promises that resolve late (because the user ignored the signal) are silently dropped — race-by-latest correctness is guaranteed regardless of whether you honor the signal. Honoring it is the polite thing to do (frees server work, cancels in-flight HTTP requests, lets you free heavy local resources).

### Debounce: a recipe, not a feature

The library does not debounce on your behalf. Compose it inside your validate function, and wire the signal into both the wait and the fetch:

```ts
async function uniqueUsernameValidate(target, _data, { signal }) {
  await wait(300, signal);
  const r = await fetch(url(target), { signal });
  return new FormValidatorValidationResult({ isValid: !(await r.json()).taken });
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}
```

> **Important:** wire the signal into the `wait` *and* the `fetch`. If you skip the wait, every keystroke will fire a real fetch even though only the latest result counts.

### Pending state: per-element and form-level

Two new optional callbacks expose pending state:

```ts
new FormValidator({
  form,
  validatorDeclarations: validators,
  onPendingChange: (element, isPending) => {
    spinnerFor(element).hidden = !isPending;
  },
  onFormPendingChange: (isPending) => {
    submitButton.disabled = isPending;
  },
});
```

The engine also automatically sets `aria-busy="true"` on form-control elements while at least one validator on them is pending (removed on resolution). Skipped for non-form-control targets, mirroring the engine's `aria-invalid` scope.

### Failure handling

If an async validate rejects with anything other than `AbortError`, the engine records a synthetic invalid result with `validatorSubtypeList: ['error']`. Provide a message for the reserved `'error'` subtype to surface it:

```ts
errorMessage: { '': 'Username taken', error: 'Could not verify, try again' }
```

For finer-grained error mapping, declare an `onError` hook on the validator:

```ts
{
  validate: async (...) => { /* may throw rate-limited, timeout, server-down, ... */ },
  onError: (err) => {
    if (err instanceof MyRateLimitedError) {
      return new FormValidatorValidationResult({ isValid: false, validatorSubtypeList: ['rateLimited'] });
    }
    return new FormValidatorValidationResult({ isValid: false, validatorSubtypeList: ['error'] });
  },
  errorMessage: { rateLimited: 'Too many checks; please wait', error: 'Could not verify, try again' },
}
```

### Retrying after async failure

`onErrorMessageListChanged` now receives a third arg, `errors: ErrorDetail[]`, parallel to `msgs`. Each `ErrorDetail` is `{ validatorName, subtype, message, isContextError }`. Detect failure structurally on the `(validatorName, subtype)` tuple — never on rendered text:

```ts
new FormValidator({
  form,
  validatorDeclarations: validators,
  onErrorMessageListChanged: (el, _msgs, errors) => {
    const failed = errors.some(
      (e) => e.validatorName === 'uniqueUsername' && e.subtype === 'error',
    );
    retryButtonFor(el).hidden = !failed;
  },
});

retryBtn.addEventListener('click', () => validator.retry(usernameField, 'uniqueUsername'));
```

`validator.retry(element, validatorName)` re-runs only that validator on that element, leaving other validators' recorded results untouched. `validator.retry(element)` (no name) re-runs every validator on the element — a convenience equivalent to dispatching a fresh validate event.

### Submit semantics

When the user submits a form with async validators in flight, the engine calls `event.stopImmediatePropagation()` and `event.preventDefault()`, then waits for resolution:

- **All async resolves valid** → engine programmatically calls `form.requestSubmit(submitter)` (preserving the original submitter); the form submits normally and any `submit` listeners registered after `new FormValidator(...)` fire on the resubmit.
- **Any async resolves invalid** → submit stays blocked; errors are already in the store via `onErrorMessageListChanged`.

A submit listener registered *before* `new FormValidator(...)` cannot rely on `form.checkValidity()` reflecting the final verdict — async hasn't started yet at that point. If those listeners care about the final result, subscribe to `onFormPendingChange` and `onErrorMessageListChanged` instead.

If the user clicks submit again while pending, each click restarts the in-flight async (via the abort/replace rules); the latest `submitter` wins. If the user edits a field while submit is pending, the new edit triggers a fresh cycle and the submit waits for that one. If the user resets the form, all in-flight is aborted and the submit attempt is silently abandoned.

### Injecting an externally-computed result

The original injection pattern still works — useful when your code fully owns the async lifecycle (e.g. a captcha widget you control externally). Dispatch a validate event with a precomputed result:

```ts
field.dispatchEvent(FormValidator.createValidateEvent({
  data: { uniqueUsername: new FormValidatorValidationResult({ isValid: !taken }) },
}));
```

The injected result is used for that validator on that one event instead of running its `validate` function. If an async cycle for the same slot is in-flight, it is aborted and the injected result wins.

````

- [ ] **Step 3: Verify formatting and links**

Run: `grep -n "^## " README.md | head` to confirm section headers are intact and the "Validation timing" section starts properly after the new content.

- [ ] **Step 4: Commit**

Ask the user for commit permission. If granted:
```bash
git add README.md
git commit -m "docs: rewrite async checks section with full async validation guide"
```

---

## Task 20: Mirror new README async snippets in `readme-examples.test.ts`

Each runnable code block in the README async section gets a test that exercises its public-API surface. Failing here means the README is lying. (CLAUDE.md: "CI failures there mean the README is lying.")

**Files:**
- Modify: `packages/validators/src/readme-examples.test.ts`

- [ ] **Step 1: Read the current readme-examples test conventions**

Run: `head -40 packages/validators/src/readme-examples.test.ts` to learn the existing pattern.

- [ ] **Step 2: Add async snippet tests**

Append a new describe block to `packages/validators/src/readme-examples.test.ts`:

```ts
describe('README async-validation snippets', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  test('defining an async validator (uniqueUsername example)', async () => {
    document.body.innerHTML = '<form id="t"><input id="u" data-validation="uniqueUsername"/></form>';
    const form = document.getElementById('t') as HTMLFormElement;
    const input = document.getElementById('u') as HTMLInputElement;

    const fakeFetch = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ taken: true }) });
    (globalThis as { fetch: unknown }).fetch = fakeFetch;

    const onChange = vi.fn();
    new FormValidator({
      form,
      validatorDeclarations: {
        uniqueUsername: {
          init: (target) => new FormValidatorInitResult({ observableElementList: [target], extraData: {} }),
          async validate(target, _data, opts) {
            const value = (target as HTMLInputElement).value;
            if (value.length < 3) return new FormValidatorValidationResult({ isValid: false });
            const r = await fetch(`/api/username-available?u=${encodeURIComponent(value)}`, { signal: opts!.signal });
            const taken = (await r.json()).taken;
            return new FormValidatorValidationResult({ isValid: !taken });
          },
          errorMessage: { '': 'Username taken', error: 'Could not verify, try again' },
        },
      },
      onErrorMessageListChanged: onChange,
    });

    input.value = 'foobar';
    input.dispatchEvent(FormValidator.createValidateEvent());
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

    const lastCall = onChange.mock.calls.at(-1)!;
    expect(lastCall[1]).toContain('Username taken');
  });

  test('debounce recipe: wait helper aborts on signal', async () => {
    function wait(ms: number, signal: AbortSignal): Promise<void> {
      return new Promise((resolve, reject) => {
        const t = setTimeout(resolve, ms);
        signal.addEventListener('abort', () => {
          clearTimeout(t);
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    }
    const ctrl = new AbortController();
    const p = wait(1000, ctrl.signal);
    ctrl.abort();
    await expect(p).rejects.toThrow();
  });

  test('pending callbacks fire as documented', async () => {
    document.body.innerHTML = '<form id="t2"><input id="u2" data-validation="a"/></form>';
    const form = document.getElementById('t2') as HTMLFormElement;
    const input = document.getElementById('u2') as HTMLInputElement;
    let resolveFn!: (r: FormValidatorValidationResult) => void;
    const onPending = vi.fn();
    const onFormPending = vi.fn();
    new FormValidator({
      form,
      validatorDeclarations: {
        a: {
          init: (target) => new FormValidatorInitResult({ observableElementList: [target], extraData: {} }),
          validate: () => new Promise<FormValidatorValidationResult>((res) => { resolveFn = res; }),
          errorMessage: 'invalid',
        },
      },
      onPendingChange: onPending,
      onFormPendingChange: onFormPending,
    });
    input.dispatchEvent(FormValidator.createValidateEvent());
    expect(onPending).toHaveBeenCalledWith(input, true);
    expect(onFormPending).toHaveBeenCalledWith(true);
    resolveFn(new FormValidatorValidationResult({ isValid: true }));
    await Promise.resolve(); await Promise.resolve();
    expect(onPending).toHaveBeenLastCalledWith(input, false);
    expect(onFormPending).toHaveBeenLastCalledWith(false);
  });

  test('default failure subtype "error" lands in errors[]', async () => {
    document.body.innerHTML = '<form id="t3"><input id="u3" data-validation="a"/></form>';
    const form = document.getElementById('t3') as HTMLFormElement;
    const input = document.getElementById('u3') as HTMLInputElement;
    const onChange = vi.fn();
    new FormValidator({
      form,
      validatorDeclarations: {
        a: {
          init: (target) => new FormValidatorInitResult({ observableElementList: [target], extraData: {} }),
          validate: () => Promise.reject(new Error('network')),
          errorMessage: { error: 'Could not verify, try again' },
        },
      },
      onErrorMessageListChanged: onChange,
    });
    input.dispatchEvent(FormValidator.createValidateEvent());
    await Promise.resolve(); await Promise.resolve();
    const lastCall = onChange.mock.calls.at(-1)!;
    const errors = lastCall[2];
    expect(errors.some((e: { subtype: string }) => e.subtype === 'error')).toBe(true);
  });

  test('retry button pattern: validator.retry runs only the named validator', () => {
    document.body.innerHTML = '<form id="t4"><input id="u4" data-validation="a"/></form>';
    const form = document.getElementById('t4') as HTMLFormElement;
    const input = document.getElementById('u4') as HTMLInputElement;
    const validate = vi.fn(() => new FormValidatorValidationResult({ isValid: true }));
    const v = new FormValidator({
      form,
      validatorDeclarations: {
        a: {
          init: (target) => new FormValidatorInitResult({ observableElementList: [target], extraData: {} }),
          validate,
          errorMessage: 'invalid',
        },
      },
    });
    validate.mockClear();
    v.retry(input, 'a');
    expect(validate).toHaveBeenCalledTimes(1);
  });

  test('injection pattern still works (existing behavior preserved)', () => {
    document.body.innerHTML = '<form id="t5"><input id="u5" data-validation="a"/></form>';
    const form = document.getElementById('t5') as HTMLFormElement;
    const input = document.getElementById('u5') as HTMLInputElement;
    const validate = vi.fn(() => new FormValidatorValidationResult({ isValid: true }));
    const onChange = vi.fn();
    new FormValidator({
      form,
      validatorDeclarations: {
        a: {
          init: (target) => new FormValidatorInitResult({ observableElementList: [target], extraData: {} }),
          validate,
          errorMessage: 'invalid',
        },
      },
      onErrorMessageListChanged: onChange,
    });
    input.dispatchEvent(FormValidator.createValidateEvent({
      data: { a: new FormValidatorValidationResult({ isValid: false }) },
    }));
    expect(validate).not.toHaveBeenCalled();
    const lastCall = onChange.mock.calls.at(-1)!;
    expect(lastCall[1]).toContain('invalid');
  });
});
```

- [ ] **Step 3: Run the readme-examples tests**

Run: `npx vitest run packages/validators/src/readme-examples.test.ts -t 'README async-validation'`
Expected: PASS, 6 tests.

- [ ] **Step 4: Run full suite**

Run: `npm test`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

Ask the user for commit permission. If granted:
```bash
git add packages/validators/src/readme-examples.test.ts
git commit -m "test(validators): mirror README async-validation snippets in readme-examples"
```

---

## Task 21: Update `packages/core/README.md` exported types

Add `ErrorDetail` to the exported types list, and mention the new public surface.

**Files:**
- Modify: `packages/core/README.md`

- [ ] **Step 1: Read the current README**

Run: `cat packages/core/README.md` to find the exported-types section.

- [ ] **Step 2: Add `ErrorDetail`**

Locate the section listing exported types (likely a bulleted list near the top). Add `ErrorDetail` to it. Find the section listing constructor params or methods; add mentions of `onPendingChange`, `onFormPendingChange`, the third arg of `onErrorMessageListChanged`, and the `retry()` instance method. Match the existing style — no need to rewrite the file; just add the new items where each topic naturally fits.

If the README is sparse and lacks these sections, append a brief "What changed in 1.1.0" subsection summarizing:

```markdown
## What's new in 1.1.0

- `validate` may return `Promise<FormValidatorValidationResult>` for async checks.
- New optional `onError` hook on validator declarations for custom failure mapping.
- New constructor params: `onPendingChange(element, isPending)`, `onFormPendingChange(isPending)`.
- `onErrorMessageListChanged` gains a third arg `errors: ErrorDetail[]` carrying structured per-error metadata; the existing 2-arg signature still works.
- Auto-managed `aria-busy` on form controls while async is in flight.
- New `retry(element, validatorName?)` instance method.

See the root README's "Async validation" section for the full guide.
```

- [ ] **Step 3: Commit**

Ask the user for commit permission. If granted:
```bash
git add packages/core/README.md
git commit -m "docs(core): note 1.1.0 async additions and ErrorDetail export"
```

---

## Task 22: Update project `CLAUDE.md`

Add an "Async validation" subsection under Architecture. Update the validator contract and lifecycle subsections to reflect the new behavior.

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Locate the relevant sections**

Run: `grep -n -E "^(##|###) " CLAUDE.md` to map the existing structure.

- [ ] **Step 2: Add an "Async validation" subsection**

Insert a new subsection after the "Validation timing" subsection in the "## Architecture" section. Content:

```markdown
### Async validation

`validate` may return a `Promise<FormValidatorValidationResult>`. The engine detects this at runtime via `instanceof Promise` and routes through `AsyncValidationCoordinator` (`packages/core/src/classes/AsyncValidationCoordinator.ts`), which owns:

- `#asyncInFlight: Map<Element, Map<string, { generation, controller }>>` — per (target, validatorName) tracking.
- `#pendingCount: number` — form-level counter; invariant: equals `sum of inner-Map sizes`. Maintained by mutating only on add/remove, never on replace (see T1).

The state machine has five transitions (T1–T5) detailed in the design spec at `docs/superpowers/specs/2026-05-11-async-validation-design.md`. Key invariants:

- **Race-by-latest:** every cycle has a `generation`; resolves/rejects with stale generation drop silently. This is the only correctness guarantee — works even if user code ignores `AbortSignal`.
- **Reserved subtype `'error'`:** non-AbortError rejection without a custom `onError` lands as `{ isValid: false, validatorSubtypeList: ['error'] }`. Consumers map `errorMessage: { error: '...' }` to render.
- **Submit hand-off:** when the form is submit-pending and `pendingCount` hits 0, FormValidator's `#checkSubmitHandoff` runs. If verdict is valid, calls `form.requestSubmit(submitter)` with the `#allowNextSubmit` loop guard set so the resubmit doesn't re-trigger validation.
- **Reset and destroy abort all in-flight.** Reset fires per-element + form pending-change(false). Destroy is silent (calls `coordinator.abortAllSilent()` — no callbacks during teardown).

`onErrorMessageListChanged` now receives a third arg `errors: ErrorDetail[]`, parallel to `msgs[]`. Detection should key on `(validatorName, subtype)` tuples, not on rendered text. Reserved subtype `'error'` is the synthetic-failure marker.

`aria-busy` is auto-managed on form-control elements while at least one validator is pending (mirrors `aria-invalid` scope; skipped for non-form-controls).

Public API additions: `onPendingChange`, `onFormPendingChange`, `onError` (validator field), `retry(element, validatorName?)` instance method. `validate` third arg `{ signal: AbortSignal }`.
```

- [ ] **Step 3: Update existing subsections**

In the "How validation actually works" subsection, after the description of `#validateEventHandler`, add a sentence:

> When a validator's `validate` returns a Promise, the engine routes it through `AsyncValidationCoordinator` instead of pushing the result to the apply pipeline directly. Sync results that supersede in-flight async (e.g. injection, sync return after async) call `coordinator.abortSlot` to tear down the in-flight cleanly.

In the "validator contract" subsection, update the bullet describing `validate` to include:

> `validate` may also return `Promise<FormValidatorValidationResult>`. When async, the third arg `{ signal: AbortSignal }` is provided — wire it into `fetch` and any other awaitable resource. The validator declaration may also include `onError?: (err) => Result` to map non-Abort rejections to a specific result; the default fallback is `{ isValid: false, validatorSubtypeList: ['error'] }`.

In the "Lifecycle" subsection, after the existing description of `destroy()`:

> Both `reset` and `destroy()` abort all in-flight async via `coordinator.abortAll()` / `coordinator.abortAllSilent()`. Reset fires `onPendingChange(false)` per element and `onFormPendingChange(false)`; destroy fires no callbacks (tear-down is invisible to the consumer).

In the existing "Three places list the built-in validators" rule, no change needed.

- [ ] **Step 4: Commit**

Ask the user for commit permission. If granted:
```bash
git add CLAUDE.md
git commit -m "docs(claude): document async validation architecture and contract changes"
```

---

## Task 23: Version bump + peerDep update

Both packages move to `1.1.0` together. Validators' `peerDependency` on core updates to `"1.1.0"` exact.

**Files:**
- Modify: `packages/core/package.json`
- Modify: `packages/validators/package.json`

- [ ] **Step 1: Bump core's version**

Edit `packages/core/package.json`:
```json
  "version": "1.1.0",
```

- [ ] **Step 2: Bump validators' version and peerDep**

Edit `packages/validators/package.json`:
```json
  "version": "1.1.0",
```
and:
```json
  "peerDependencies": {
    "@form-validator-js/core": "1.1.0"
  },
```

- [ ] **Step 3: Reinstall lockfile so npm picks up the new peerDep pin**

Run: `npm install`
Expected: `package-lock.json` updates without errors.

- [ ] **Step 4: Run full suite + lint + typecheck + build to confirm green ship**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

Ask the user for commit permission. If granted:
```bash
git add packages/core/package.json packages/validators/package.json package-lock.json
git commit -m "chore: bump core and validators to 1.1.0 for async validation"
```

---

## Final verification

- [ ] Run the full pipeline one more time: `npm run lint && npm run typecheck && npm test && npm run build`
- [ ] Verify all spec sections are covered. Spec → task mapping:
  - §3 (non-goals) — no tasks needed; documented in spec only
  - §4 API surface — Tasks 10, 13, 14, 18 (declaration field, params, ErrorDetail, retry)
  - §5 state machine — Tasks 1–9 (coordinator)
  - §6 validate handler changes — Tasks 11 (factor), 13 (async branch)
  - §7 submit flow — Task 16 (with Task 17 for reset)
  - §8 ErrorDetail — Task 14
  - §9 retry — Task 18
  - §10 module organization — Task 1 (creates the file split)
  - §11 testing — distributed across all coordinator tasks (1–9) and FormValidator task tests + Task 20
  - §12 versioning + docs — Tasks 19, 20, 21, 22, 23
  - §13 out of scope — no tasks (intentionally excluded)
- [ ] Confirm the commit log on `spec/async-validation` branch is clean and tells a coherent story.

When all tasks complete, ask the user whether to push the branch and open a PR.
