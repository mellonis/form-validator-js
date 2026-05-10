# Async validation — design

**Status:** approved (brainstorming complete, ready for implementation plan)
**Target version:** `@form-validator-js/core` `1.0.0` → `1.1.0`, `@form-validator-js/validators` `1.0.0` → `1.1.0`
**Date:** 2026-05-11

## 1. Problem

Today the engine is fully synchronous. The README documents an "async checks" pattern via `FormValidator.createValidateEvent({ data: { ... } })` — but this is a *display* channel only: the consumer runs the async work themselves and injects the result. The library has no first-class async story, which means:

- **Submit-time race:** if the user clicks submit before an async check resolves, no error is in the store, and the form goes through.
- **Stale `isValid: true` survives:** the previously injected "valid" result for an old field value remains in the store across edits, since nothing re-runs on submit unless the consumer also registered a real (sync) `validate` function — which can't do real async work.
- **No "checking…" UX:** there's no way to know an async check is in progress.
- **No retry primitive:** if an async check fails (network down, server error), the only way to retry is for the user to edit the field or re-submit.

This spec adds first-class async support: validators may return Promises, the engine tracks in-flight cycles, the submit handler awaits resolution before letting the form go through, and the library exposes pending-state and retry primitives.

## 2. Goals

- Async validators participate at every trigger, exactly like sync validators do (per the existing `TriggerMode`).
- Submit blocks until all async resolves; if all valid, the engine programmatically re-submits.
- Race-by-latest correctness: a stale Promise resolving late cannot corrupt state.
- Cancellation via standard `AbortSignal`, wired into user-supplied `validate`.
- Per-element and form-level pending callbacks for UI feedback.
- Automatic `aria-busy` management on form controls during in-flight async.
- Failure handling with sensible default + per-validator escape hatch.
- Granular retry method for the failed-validator case.
- Backwards compatible: no signature breaks, no required type changes for existing sync validators.

## 3. Non-goals

- **Library-side debounce.** Consumer composes via `validate` + the AbortSignal contract. The library documents a recipe (the `wait(ms, signal)` helper) but ships no `debounceMs` field.
- **Library-side submit-button disable.** Consumer wires button state via `onFormPendingChange`. The library never touches DOM beyond the existing Constraint Validation API integration.
- **Async `init`.** Init stays synchronous. If a use case emerges, future work.
- **Library-side request timeout.** Consumer wraps `validate` if needed (`Promise.race` with their own timer).
- **MutationObserver-based cleanup of removed fields.** Consumer must call `destroy()` when removing the form. Same contract as today.
- **Auto-discovery of submit-eligible elements (multi-button forms, form-associated outside buttons).** Out of scope; consumer's onFormPendingChange handler decides what to disable.

## 4. Public API surface

### 4.1 Validator declaration

Additions marked `+`:

```ts
type ValidatorDeclaration<...> = {
  init: ValidatorInitFunction<...>;
  validate: (
    target: FormElement,
    data: Readonly<ExtraData>,
+   options?: { signal: AbortSignal },              // present whenever validate is called; sync validators ignore
  ) => FormValidatorValidationResult
+   | Promise<FormValidatorValidationResult>;       // return type widened
  errorMessage?: string | { [subtype: string]: string };
+ onError?: (err: unknown) => FormValidatorValidationResult;  // opt-in custom failure mapping
};
```

The third arg `{ signal }` is passed unconditionally — sync validators ignore it. The library detects async by `instanceof Promise` on the return value at runtime; no constructor option to "enable async."

### 4.2 `FormValidator` constructor params

Additions marked `+`:

```ts
type FormValidatorParams = {
  form: HTMLFormElement;
  trigger?: TriggerMode;
  manageValidity?: boolean;
  reportValidityOnSubmit?: boolean;
  onErrorMessageListChanged?: (
    element: Element,
    msgs: string[],
+   errors: ErrorDetail[],                              // parallel to msgs, same length, same order
  ) => void;
+ onPendingChange?: (element: Element, isPending: boolean) => void;
+ onFormPendingChange?: (isPending: boolean) => void;
};

type ErrorDetail = {
  validatorName: string;     // e.g. "uniqueUsername"
  subtype: string;           // '' for default; 'error' for async failure; or whatever the validator emitted
  message: string;           // same as msgs[i]
  isContextError: boolean;   // mirrors the result flag
};
```

### 4.3 `FormValidator` instance

Additions marked `+`:

```ts
class FormValidator {
  // existing methods unchanged
+ retry(element: Element, validatorName?: string): void;
}
```

### 4.4 Reserved subtype name

`'error'` — synthetic failure result emits `validatorSubtypeList: ['error']`. Consumers map a message via `errorMessage: { error: 'Could not verify, try again' }`. Detection in `onErrorMessageListChanged` should key on the `(validatorName, subtype)` tuple, not on subtype alone (cf. §8 ErrorDetail rationale).

### 4.5 Static surface

`FormValidator.createValidateEvent(...)` keeps its current signature. The injection pattern still works exactly as today; async is an additional path. When an injected result arrives for a (target, validatorName) slot with an in-flight async, the in-flight is aborted and the injected result wins.

## 5. Internal state machine

Lives in `AsyncValidationCoordinator` (see §10 for module split). Owns:

```ts
#asyncInFlight: Map<Element, Map<string, {
  generation: number;
  controller: AbortController;
}>>;
#pendingCount: number;
```

Element-level "is pending?" is derived from `#asyncInFlight.get(el)?.size > 0` — no separate counter.

### 5.1 Transitions

**Counter invariant:** at every observable state, `#pendingCount === sum of all inner-Map sizes across #asyncInFlight`. Maintained by mutating the counter only when slots are added or removed — never when slots are replaced. This is the key correctness invariant; the rules below are derived from it.

**(T1) New cycle starts** for `(target, validatorName)`:
1. Look up `#asyncInFlight.get(target)?.get(name)`.
2. **Replace path** (previous exists):
   - Call `previous.controller.abort()` (signals user code; their Promise will reject with `AbortError` as a future microtask).
   - Update slot in place: same key, new `AbortController`, `generation = previous.generation + 1`.
   - **No counter change. No callbacks fired.** Slot is replaced, not added; element is still pending.
3. **New-slot path** (no previous):
   - Create new `AbortController`. `generation = 0`.
   - `wasEmpty = !#asyncInFlight.get(target)` (element had no in-flight before).
   - Add slot. Increment `#pendingCount`.
   - If `wasEmpty`: fire `onElementPendingChange(target, true)`, set `aria-busy="true"` on target.
   - If `#pendingCount` transitioned 0 → 1: fire `onFormPendingChange(true)`.
4. Hook `promise.then(resolveHandler, rejectHandler)` to T2 / T3.

**(T2) Promise resolves** with a `FormValidatorValidationResult`:
1. Look up current slot for `(target, name)`. If absent OR `generation !== current.generation` → drop silently. **No counter change, no callbacks.** (T1's replace path already advanced generation; T4/T5 already cleared.)
2. Apply result via `onApplyResult(target, name, result)` — FormValidator routes through `#applyResults` (existing pipeline: `#addError`/`#removeError`, aria-invalid sync, setCustomValidity sync, `onErrorMessageListChanged` firing).
3. Delete `#asyncInFlight.get(target).get(name)`. If inner Map now empty, delete `#asyncInFlight.get(target)`.
4. Decrement `#pendingCount`.
5. If element transitioned to not-pending (inner Map removed): fire `onElementPendingChange(target, false)`, remove `aria-busy`.
6. If `#pendingCount` transitioned 1 → 0: fire `onFormPendingChange(false)`.
7. Submit hand-off: `onSlotResolved()` callback fires; FormValidator checks `#submitPending && pendingCount === 0` and runs `#resolveSubmitPending` (§7).

**(T3) Promise rejects:**
1. If `err.name === 'AbortError'` → drop silently. **No counter change, no callbacks, no apply.** The counter was already maintained correctly by whichever site triggered the abort: T1's replace path (which doesn't change the counter because the slot is replaced, not removed), or T4/T5 (which zeroed the counter directly).
2. Else (genuine failure):
   - Look up current slot for `(target, name)`. If absent OR `generation !== current.generation` → drop silently, no counter change. (User's Promise rejected naturally after T1 already replaced the slot — this rejection is for a stale generation.)
   - If validator declared `onError`: result = `validator.onError(err)`. If `onError` itself throws or returns a non-Result, fall back to default.
   - Else: result = `new FormValidatorValidationResult({ isValid: false, validatorSubtypeList: ['error'] })`.
   - Apply via T2.2 onward.

**(T4) Reset:**
- For each `(target, innerMap)` in `#asyncInFlight`, for each `(name, { controller })` in `innerMap`: `controller.abort()`. (User's Promises will reject as `AbortError` in future microtasks; T3.1 will drop them silently.)
- Clear `#asyncInFlight`, set `#pendingCount = 0`.
- For every element that had pending: fire `onElementPendingChange(el, false)`, remove `aria-busy`.
- If form was pending: fire `onFormPendingChange(false)`.
- **`onSlotResolved` is NOT fired** — submit hand-off would be wrong here (we're abandoning, not resolving).
- FormValidator additionally clears `#submitPending`, `#submitSubmitter`, `#allowNextSubmit`.
- Existing reset behavior (`#fieldsShownError.clear()`, etc.) still runs.

**(T5) Destroy:**
- Same abort/clear loops as T4 but **no callbacks fired at all** (no `onElementPendingChange`, no `onFormPendingChange`, no `onSlotResolved`) — listeners are about to be torn down, post-mortem callbacks would be confusing.
- Existing destroy behavior follows.

### 5.1.1 Worked traces (correctness check for §5.1)

**Trace A — typical replace + resolve:**
1. `T1(E, 'x')`, no previous → new-slot path. Slot added at gen 0. `#pendingCount = 1`. Fires onElementPendingChange(true), onFormPendingChange(true).
2. User types another char → `T1(E, 'x')` again, previous at gen 0. Replace path. Abort previous controller. Slot updated to gen 1. **Counter unchanged at 1.** No callbacks.
3. Microtask: previous Promise rejects with AbortError → T3.1 drops silently. **Counter unchanged at 1.**
4. New Promise eventually resolves → T2. Lookup matches gen 1. Apply. Remove slot. `#pendingCount = 0`. Fire onElementPendingChange(false), onFormPendingChange(false). onSlotResolved fires.

**Trace B — natural rejection of a stale generation:**
1. `T1(E, 'x')` no prev → slot at gen 0. `#pendingCount = 1`.
2. `T1(E, 'x')` again, replace → gen 1. Counter still 1.
3. Old Promise rejects naturally with NetworkError → T3.2. Lookup finds slot at gen 1; rejection is for gen 0 → drop silently. Counter still 1.
4. New Promise settles → handled per gen 1.

**Trace C — reset while pending:**
1. `T1(E, 'x')` no prev → slot at gen 0. `#pendingCount = 1`.
2. T4 reset → abort controller, clear map, counter to 0, callbacks fire (per-element + form).
3. Microtask: Promise rejects with AbortError → T3.1 drops silently. Counter unchanged at 0.

All counter values match the invariant at every observable state.

### 5.2 Why generation matters when abort exists

Two reasons it's not redundant:
1. **User doesn't honor signal.** Their fetch resolves; `.then` fires. Generation check is the only correctness guarantee.
2. **Race between abort and resolve.** If the Promise has already started resolving when `controller.abort()` is called, the `.then` callback still runs. Generation check filters it out.

## 6. Validate event handler changes

Modified region of `#validateEventHandler` (preamble unchanged):

```ts
const validationResultList: FormValidatorValidationResult[] = [];

for (const validatorName of validatorNameToContextMap.keys()) {
  const data = validatorNameToDataMap.get(validatorName);
  if (!data) continue;

  const injected = eventData[validatorName];
  if (injected instanceof FormValidatorValidationResult) {
    // Injection wins. Abort any in-flight async for this slot — injected
    // result is the answer; in-flight is wasted.
    this.#coordinator.abortSlot(targetElement, validatorName);
    validationResultList.push(this.#stampName(injected, validatorName));
    continue;
  }

  const definition = this.#validatorNameToDefinitionMap.get(validatorName);
  if (!definition) continue;

  const controller = new AbortController();
  const returnValue = definition.validate(
    targetElement,
    data,
    { signal: controller.signal },
  );

  if (returnValue instanceof Promise) {
    this.#coordinator.startCycle(
      targetElement,
      validatorName,
      returnValue,
      controller,
      definition.onError,
    );
    // Don't push to validationResultList — async result lands via T2.
  } else if (returnValue instanceof FormValidatorValidationResult) {
    // Sync result supersedes any in-flight async for this slot.
    this.#coordinator.abortSlot(targetElement, validatorName);
    validationResultList.push(this.#stampName(returnValue, validatorName));
  }
  // Otherwise (undefined / non-Result): existing silent-skip behavior.
}

this.#applyResults(targetElement, validationResultList);
```

**`#applyResults`** is the existing apply pipeline, factored out so both the sync loop above and the coordinator's `onApplyResult` callback feed into the same code (single source of truth for callback firing, ARIA sync, setCustomValidity sync).

**`#fieldsShownError` (blur-then-input transitions).** Currently set in `#validateEventHandler` after the loop. Move into `#applyResults` so it fires after each result lands, sync or async. Same semantic, two entry points.

**Synchronous `validate` throws.** Existing behavior: propagates and kills the cycle. Documented as programmer error. Unchanged.

## 7. Submit flow

### 7.1 Modified `#submitEventHandler`

```ts
#submitEventHandler = (event: SubmitEvent): void => {
  if (event.target !== this.#form) return;

  // Loop guard: post-resolution requestSubmit re-enters here.
  if (this.#allowNextSubmit) {
    this.#allowNextSubmit = false;
    return;  // let event proceed; no validates dispatched, no preventDefault.
  }

  const submitter = event.submitter as HTMLElement | null;

  this.#getValidationTargets().forEach((el) => {
    el.dispatchEvent(FormValidator.createValidateEvent());
  });

  const hasErrorsNow = this.#hasErrors();
  const hasPending = this.#coordinator.hasPending();

  if (!hasErrorsNow && !hasPending) {
    return;  // existing path: all sync valid, let event proceed.
  }

  event.stopImmediatePropagation();
  event.preventDefault();

  if (hasPending) {
    this.#submitPending = true;
    this.#submitSubmitter = submitter;
  } else {
    if (this.#reportValidityOnSubmit) this.#form.reportValidity();
  }
};
```

### 7.2 New `#resolveSubmitPending`

Called from coordinator's `onSlotResolved` callback when `#submitPending && pendingCount === 0`:

```ts
#resolveSubmitPending(): void {
  this.#submitPending = false;
  const submitter = this.#submitSubmitter;
  this.#submitSubmitter = null;

  if (this.#hasErrors()) {
    if (this.#reportValidityOnSubmit) this.#form.reportValidity();
    return;
  }

  this.#allowNextSubmit = true;
  this.#form.requestSubmit(submitter ?? undefined);
}
```

### 7.3 Behavioral specifics

- **Submitter preservation.** `event.submitter` captured at step 1 of §7.1, stashed in `#submitSubmitter`, replayed in `requestSubmit(submitter)`. Determines which button's `name=value` ends up in submitted form data.
- **Concurrent submit while pending.** User clicks submit again → handler runs, dispatches validate events → T1 aborts in-flight, starts new cycles; net `#pendingCount` change is zero per slot, so no premature 0-transition. `hasPending` still true → enters block branch again. `#submitSubmitter` overwritten with new submitter. Last click wins.
- **User edits field while submit pending.** Input event fires → new validate cycle → T1 aborts old, starts new. `#submitPending` waits for the new cycle. Submit resolves against the latest values, not the values at click time.
- **Reset while submit pending.** T4 clears in-flight + resets `#submitPending`, `#submitSubmitter`, `#allowNextSubmit`. Submit silently abandoned.
- **`reportValidityOnSubmit` placement.** Two call sites: §7.1 sync-error branch (existing behavior); §7.2 error branch (final verdict known). Never on the still-pending branch.
- **`ignoreValidationResult: true`.** Async still runs; results rewritten to valid in `#validateEventHandler` / `#applyResults` (existing logic). `#hasErrors()` returns false → §7.2 takes the requestSubmit path. Submit proceeds.

### 7.4 Listener-order contract

- **AFTER-construction submit listeners** keep their existing contract: don't fire on invalid submits, do fire on valid submits. Step §7.1's `stopImmediatePropagation` blocks them on the initial attempt; §7.2's `requestSubmit` re-fires the submit event cleanly when the verdict is valid; the post-resubmit handler invocation reads `#allowNextSubmit` and skips its blocking branch entirely; downstream listeners run.
- **BEFORE-construction submit listeners** see the initial submit event before our handler. They can no longer rely on `form.checkValidity()` reflecting the final verdict when async validators are involved — async hasn't started yet at that point. If they care about the final verdict, they must subscribe to `onFormPendingChange` and `onErrorMessageListChanged`. **This is a documented behavioral shift, not a bug.**

## 8. `onErrorMessageListChanged` structured detail

The third arg `errors: ErrorDetail[]` is parallel to `msgs: string[]` — same length, same order. Built from `#elementToErrorListMap`:

```ts
function buildErrorDetails(results: FormValidatorValidationResult[]): ErrorDetail[] {
  return results.flatMap((r) => {
    const subtypes = r.validatorSubtypeList?.length ? r.validatorSubtypeList : [''];
    return subtypes.map((subtype) => ({
      validatorName: r.validatorName,
      subtype,
      message: messageFor(r, subtype),
      isContextError: r.isContextError,
    }));
  });
}
```

**Parallel-arrays guarantee.** `getErrorMessageList` (which produces `msgs`) and `buildErrorDetails` share one walk via a common helper to prevent drift.

**Why a third arg, not a separate channel.** Adding `onAsyncError(...)` was considered (Q8 alt c) and rejected: it would surface the same event in two places, inviting wire-one-miss-the-other bugs. The widening keeps a single channel, structurally enriched.

**Why detection on `(validatorName, subtype)`, not subtype alone.** Subtype names (`'error'`, etc.) can collide across validators. The tuple `(validatorName, subtype)` is unique by construction. Reserved subtype name `'error'` stays short and ergonomic; collision risk dissolves.

**Backwards compat.** Existing 2-arg callbacks keep working (JS ignores extra args; TS parameter-contravariance: `(el, msgs) => void` is assignable to `(el, msgs, errors) => void`).

## 9. Retry mechanism

```ts
retry(element: Element, validatorName?: string): void
```

- **`retry(el)` (no name)** — equivalent to `el.dispatchEvent(FormValidator.createValidateEvent())`. Re-runs every validator declared on the element. Convenience.
- **`retry(el, name)` (granular)** — re-runs only the specified validator; other validators on the element keep their currently recorded results untouched.

### 9.1 Granular implementation

```ts
retry(element: Element, validatorName?: string): void {
  if (validatorName === undefined) {
    element.dispatchEvent(FormValidator.createValidateEvent());
    return;
  }

  const { validatorNameToContextMap, validatorNameToDataMap } = this.#getData(element);
  if (!validatorNameToContextMap.has(validatorName)) {
    throw new Error(`Validator "${validatorName}" is not declared on the given element`);
  }
  const definition = this.#validatorNameToDefinitionMap.get(validatorName);
  if (!definition) {
    throw new Error(`Validator "${validatorName}" has no registered definition`);
  }
  const data = validatorNameToDataMap.get(validatorName);
  if (!data) return;  // shouldn't happen

  this.#coordinator.abortSlot(element, validatorName);

  const controller = new AbortController();
  const returnValue = definition.validate(element, data, { signal: controller.signal });

  if (returnValue instanceof Promise) {
    this.#coordinator.startCycle(element, validatorName, returnValue, controller, definition.onError);
    return;
  }
  if (returnValue instanceof FormValidatorValidationResult) {
    this.#applyResults(element, [this.#stampName(returnValue, validatorName)]);
  }
}
```

### 9.2 Interaction notes

- The result lands via `#applyResults`, firing all the same callbacks as a typing-driven cycle.
- Async start fires `onPendingChange` and `onFormPendingChange` per Section 5 rules.
- If `#submitPending && retry's async resolves all green` → submit hand-off (§7.2) fires. A retry can complete a pending submit without another click.
- After `destroy()`, behavior is undefined per existing contract; no new guards.
- Throws are programmer errors (unknown validator name on element); they fail loud.

## 10. Module organization

Extract `AsyncValidationCoordinator` to its own file. `FormValidator.ts` is already 814 lines; adding async inline pushes past 1000. Project's own CLAUDE.md flags large files as a smell.

```
packages/core/src/classes/
  FormValidator.ts                  // event wiring, DOM integration, sync apply pipeline
  AsyncValidationCoordinator.ts     // in-flight tracking, generation, abort, pending counters
```

Coordinator API:

```ts
export class AsyncValidationCoordinator {
  constructor(opts: {
    onApplyResult: (element: Element, name: string, result: FormValidatorValidationResult) => void;
    onElementPendingChange: (element: Element, isPending: boolean) => void;
    onFormPendingChange: (isPending: boolean) => void;
    onSlotResolved: () => void;
  });

  startCycle(
    element: Element,
    name: string,
    promise: Promise<FormValidatorValidationResult>,
    controller: AbortController,
    onError?: (err: unknown) => FormValidatorValidationResult,
  ): void;

  abortSlot(element: Element, name: string): void;
  abortAll(): void;
  hasPending(): boolean;
  hasPendingFor(element: Element): boolean;
}
```

`FormValidator` instantiates one in its constructor, wires callbacks to its existing `#applyResults`, the user's `onPendingChange`, the user's `onFormPendingChange`, and a private `#checkSubmitHandoff`. The async state machine lives entirely inside the coordinator — `FormValidator` never touches `#asyncInFlight` directly.

## 11. Testing strategy

### 11.1 `AsyncValidationCoordinator.test.ts` (new)

- T1: `startCycle` registers, increments counters, fires onElementPendingChange(true) on 0→1, fires onFormPendingChange(true) on 0→1.
- T1 with prior in-flight: aborts previous, generations advance, no double-firing.
- T2: resolve with matching generation applies; stale generation drops; aborted controller drops.
- T3: AbortError drops silently; other error → default `{ isValid: false, subtypeList: ['error'] }`; `onError` defined uses its return; `onError` that throws falls back to default; `onError` returning non-Result falls back.
- T4: `abortAll` aborts every controller, fires per-element onElementPendingChange(false), fires onFormPendingChange(false), clears all state.
- `hasPending` / `hasPendingFor` correctness across transitions.
- Callback ordering: `onApplyResult` fires before counter decrements (callbacks observe consistent intermediate state).
- Multiple elements with overlapping validators: counters and per-element callbacks track correctly.

### 11.2 `FormValidator.test.ts` additions

- Async validate Promise routes through coordinator; sync return doesn't.
- Submit with sync errors only: existing path unchanged.
- Submit with async pending: `stopImmediatePropagation`, `preventDefault`, await, `requestSubmit` on success.
- Submit hand-off: `requestSubmit` fires real submit event, downstream AFTER-listeners fire on the resubmit.
- Loop guard: `requestSubmit` doesn't re-trigger validates.
- Submitter preservation across `requestSubmit`.
- Concurrent submit while pending: last-submitter-wins, single hand-off.
- User edits during submit pending: new cycle aborts old, submit waits for new.
- Reset during submit pending: clears pending, aborts in-flight.
- `retry(el)` and `retry(el, name)`: granular re-run, no other validators touched in granular case, throws on unknown validator.
- `onErrorMessageListChanged` third arg: parallel arrays, validatorName/subtype/message/isContextError correct, includes synthetic `'error'` subtype on async failure, includes user-defined subtypes.
- Injection while async in-flight: aborts in-flight, applies injected result.
- `aria-busy`: set on element while pending, removed on resolution; never set on non-form-control targets (consistent with `aria-invalid` scope).
- `manageValidity: false` + async: setCustomValidity not called (existing opt-out honored).
- `reportValidityOnSubmit` fires only at terminal verdicts, not on still-pending branch.
- `ignoreValidationResult: true` rewrites async results to valid; submit proceeds.

### 11.3 `readme-examples.test.ts` additions

Mirror every async snippet that lands in the README:
- Defining an async validator
- The `wait(ms, signal)` debounce helper
- Pending-state wiring (per-element + form-level)
- Failure handling with default `'error'` subtype
- Failure handling with custom `onError`
- Retry button pattern with structured `errors[]`
- Existing injection pattern (still documented)

### 11.4 Vitest specifics for async

- `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })` for the debounce-recipe test; advance with `vi.advanceTimersByTime`.
- Hand-rolled Deferred (`{ promise, resolve, reject }`) for async validate functions in coordinator tests — gives the test full control over when each cycle resolves.
- `await Promise.resolve()` / `await vi.waitFor(...)` to flush microtask queue between `startCycle` and assertions.
- No real `fetch` — mock via `vi.fn().mockResolvedValue(...)` or hand-rolled deferreds.

## 12. Versioning, breaking changes, docs

### 12.1 Compatibility audit

| Change | Breaking? | Notes |
|---|---|---|
| `validate` return widened to `Result \| Promise<Result>` | No | Existing sync validators still satisfy. |
| `validate` gains optional 3rd arg `{ signal }` | No | Optional param; sync validators ignore. |
| `onErrorMessageListChanged` gains 3rd arg `errors[]` | No | Parameter contravariance; existing 2-arg callbacks keep working. |
| New `onPendingChange`, `onFormPendingChange` constructor params | No | Additive. |
| New `retry()` method | No | Additive. |
| New optional `onError` field on validator | No | Additive. |
| Reserved subtype `'error'` for async failure | Soft | If a validator already uses `'error'` for unrelated reasons, results render under the same key. UX overlap, not a code break. Document. |
| BEFORE-listener semantic shift | Behavioral | `form.checkValidity()` from a BEFORE submit listener no longer reflects final verdict under async. Document in CHANGELOG. |
| Auto `aria-busy` management | Behavioral | If consumer was setting `aria-busy` themselves on form controls, the engine overwrites during async cycles. Document. |

**Net: no signature/type breaks. Two soft behavioral shifts (BEFORE-listener, aria-busy), both documented.**

### 12.2 Version bump

`@form-validator-js/core`: `1.0.0` → `1.1.0`
`@form-validator-js/validators`: `1.0.0` → `1.1.0`, peerDependency on core updated to `"1.1.0"` (exact pin, matching existing convention).

Validators package source is unchanged; it bumps only to keep the peerDep in lockstep, per the existing rule.

`2.0.0` would be defensible if the team wants to be conservative about the BEFORE-listener and aria-busy shifts. Recommendation: `1.1.0` minor — both shifts are well-scoped and documented; `1.0.0` shipped recently and a major bump so soon would be heavy.

### 12.3 Documentation changes

- **`README.md`** — replace the current "Injecting validation results (async checks)" section with a full "Async validation" section:
  - Defining an async validator (`async validate(target, data, { signal })`)
  - The `AbortSignal` contract; the wait/fetch composition pattern
  - Debounce recipe (the `wait(ms, signal)` helper) — the "wire signal into both wait and fetch" warning highlighted
  - Pending-state callbacks: per-element + form-level, submit-button-disable example
  - Failure handling: default `'error'` subtype, custom `onError`, retry button pattern using structured `errors[]`
  - Submit semantics: blocking, re-firing after resolution, BEFORE/AFTER listener note
  - Existing injection pattern recontextualized as one of two paths, still documented.

- **`packages/core/README.md`** — update exported-types list to include `ErrorDetail`, mention new params/methods.

- **`packages/validators/README.md`** — no changes (no new built-ins).

- **`CLAUDE.md` (project)** — substantial updates:
  - New "Async validation" subsection under Architecture: coordinator class, T1–T5 transitions, reserved subtype, retry mechanism, third-arg of `onErrorMessageListChanged`.
  - Update "How validation actually works" with the async branch in `#validateEventHandler` and submit-pending hand-off.
  - Update validator-contract section: `validate` may return Promise; new optional `onError`; mention the `signal` arg.
  - Update "Lifecycle" subsection: reset and destroy now also abort in-flight async.
  - Add the "Three places that list built-in validators" rule's analog: "Three places that document async semantics" if it grows that complex (probably not).

- **`readme-examples.test.ts`** — see §11.3.

## 13. Out of scope (explicit)

These came up during brainstorming and were explicitly excluded:

- **Library debounce** (`debounceMs` field). Consumer composes via `validate` + signal.
- **Engine-side submit-button disable** (`disableSubmitWhilePending` flag). Consumer wires via `onFormPendingChange`.
- **Async `init`.** Init stays sync.
- **Library-side request timeout.** Consumer wraps `validate`.
- **MutationObserver cleanup** of removed fields. Consumer must `destroy()`.
- **`onAsyncError` parallel callback.** Failures surface via existing error-message channel + structured `errors[]`.
- **Multi-button submit-eligible discovery.** Out of scope; consumer handles in `onFormPendingChange`.

## 14. Brainstorming decision log

For traceability:

| Q | Decision |
|---|---|
| Q1 (trigger scope) | (b) Any trigger, like sync. |
| Q2 (API shape) | (a) Same `validate`, return `Result \| Promise<Result>`. |
| Q3 (cancellation) | (b) Race-by-latest + `AbortSignal` as 3rd arg. |
| Q4 (debounce) | (a) Library does nothing; consumer composes; recipe documented. |
| Q5 (pending surface) | (b1) Per-element + form-level callbacks; auto `aria-busy`. |
| Q6 (submit flow) | Block + await + `requestSubmit` on success with loop guard. |
| Q7 (failure semantics) | (a) + (d) hybrid: default `{ isValid: false, subtypeList: ['error'] }`, `onError` opt-in escape hatch. |
| Q8 (retry) | (b) Granular `validator.retry(element, validatorName?)` instance method. |
| Q5b (failure detection) | Add `errors: ErrorDetail[]` as 3rd arg to `onErrorMessageListChanged`. |
