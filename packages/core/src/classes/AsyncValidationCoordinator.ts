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
}
