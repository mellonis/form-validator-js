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
  // Stored now; consumed by the resolve/reject/abort methods added in subsequent tasks.
  // eslint-disable-next-line no-unused-private-class-members
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
