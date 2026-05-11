import FormValidatorValidationResult from './FormValidatorValidationResult';

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
    onError?: (err: unknown) => FormValidatorValidationResult,
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
        (err) => this.#handleReject(element, name, newGeneration, err, onError),
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
      (err) => this.#handleReject(element, name, generation, err, onError),
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
}
