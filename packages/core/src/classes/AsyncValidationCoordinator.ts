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

  startCycle(
    element: Element,
    name: string,
    promise: Promise<FormValidatorValidationResult>,
    controller: AbortController,
    _onError?: (err: unknown) => FormValidatorValidationResult,
  ): void {
    let inner = this.#asyncInFlight.get(element);
    const previous = inner?.get(name);

    if (previous) {
      previous.controller.abort();
      const newGeneration = previous.generation + 1;
      // inner is non-null here because previous was found inside inner.
      inner!.set(name, { generation: newGeneration, controller });
      promise.then(
        (result) => this.#handleResolve(element, name, newGeneration, result),
        // T3 (reject handler) implemented in Task 5; until then, a rejection is silently dropped.
        (_err) => { /* T3 implemented in Task 5 */ },
      );
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
      // Reject handler implemented in Task 5; until then, a rejection is silently dropped.
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
    if (!inner || !current || current.generation !== generation) return; // stale or cleared

    this.#callbacks.onApplyResult(element, name, result);

    inner.delete(name);
    if (inner.size === 0) this.#asyncInFlight.delete(element);
    this.#pendingCount -= 1;

    if (!inner.size) this.#callbacks.onElementPendingChange(element, false);
    if (this.#pendingCount === 0) this.#callbacks.onFormPendingChange(false);
    this.#callbacks.onSlotResolved();
  }
}
