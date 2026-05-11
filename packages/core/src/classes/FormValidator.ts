import FormValidatorInitResult, { type FormElement } from './FormValidatorInitResult';
import FormValidatorValidationResult from './FormValidatorValidationResult';
import AsyncValidationCoordinator from './AsyncValidationCoordinator';

// Namespaced custom event type — chosen to avoid collisions with consumer or
// third-party listeners that might also use a generic name like 'validate'.
const VALIDATE_EVENT_TYPE = 'fvjs:validate';

export type ElementType =
  | 'text'
  | 'password'
  | 'tel'
  | 'email'
  | 'url'
  | 'search'
  | 'number'
  | 'date'
  | 'time'
  | 'datetime-local'
  | 'month'
  | 'week'
  | 'color'
  | 'range'
  | 'hidden'
  | 'file'
  | 'checkbox'
  | 'radio'
  | 'textarea'
  | 'select';

export type ErrorMessage = string | Record<string, string>;

export interface ErrorDetail {
  validatorName: string;
  subtype: string;
  message: string;
  isContextError: boolean;
}

export type ValidatorInitFunction = (
  target: FormElement,
  params: { argumentString: string },
) => FormValidatorInitResult | undefined;

export type ValidatorValidateFunction = (
  target: FormElement,
  data: Record<string, unknown>,
  options?: { signal: AbortSignal },
) => FormValidatorValidationResult | Promise<FormValidatorValidationResult> | undefined;

export interface ValidatorDeclaration {
  init?: ValidatorInitFunction;
  validate?: ValidatorValidateFunction;
  errorMessage?: ErrorMessage;
  onError?: (err: unknown) => FormValidatorValidationResult;
}

export type ValidatorDeclarations = Record<string, ValidatorDeclaration>;

export interface FormValidatorParams {
  form: HTMLFormElement;
  validatorDeclarations?: ValidatorDeclarations;
  onErrorMessageListChanged?: (
    element: Element,
    errorMessages: string[],
    errors: ErrorDetail[],
  ) => void;
  /**
   * Whether the engine should call `target.setCustomValidity(...)` on form
   * controls as their error state changes, integrating with the HTML
   * Constraint Validation API (`:invalid` CSS, `validationMessage`,
   * `form.checkValidity()`, screen-reader exposure).
   * Defaults to `true`. Set `false` if you manage custom validity yourself.
   */
  manageValidity?: boolean;
  /**
   * When validation fails on submit, also call `form.reportValidity()` so
   * the browser surfaces its native tooltip on the first invalid field.
   * Only fires when there are errors. Defaults to `false`; most consumers
   * render their own UI via `onErrorMessageListChanged` and don't want
   * native tooltips on top. Pairs well with `manageValidity: true` (the
   * default) — `reportValidity` shows whatever `setCustomValidity` set.
   */
  reportValidityOnSubmit?: boolean;
  /**
   * When per-field validation should fire.
   * - `'input'`: on every `input` event — eager, character-by-character.
   * - `'blur'`: on `focusout` (when the field loses focus) — calmer UX.
   * - `'blur-then-input'` (default): on `focusout` until a field has been
   *   shown an error, then eagerly on `input` so the user sees fixes register
   *   live. The transition is one-way per field; `reset` returns fields to
   *   "untouched". This is the modern UX recommendation.
   * - `'submit-only'`: skip per-field validation entirely; only submit
   *   (and explicit `createValidateEvent` dispatches) trigger validation.
   *
   * Individual fields can override this engine-level setting via the
   * `data-validation-trigger="…"` HTML attribute (one of the four values
   * above). Invalid attribute values fall back to the engine default.
   *
   * Cross-field reactivity (e.g. `equalsTo` re-validating its dependent on
   * the observed field changing) follows each dependent's effective trigger.
   * Submit-time validation always runs regardless.
   */
  trigger?: TriggerMode;
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
}

export type TriggerMode = 'input' | 'blur' | 'blur-then-input' | 'submit-only';

interface ValidatorDefinition {
  init: ValidatorInitFunction;
  validate: ValidatorValidateFunction;
  errorMessage: Record<string, string>;
  onError?: (err: unknown) => FormValidatorValidationResult;
}

interface ValidationContext {
  element: Element;
  parent: ValidationContext | null;
  validatorNameList: string[];
  contextList: ValidationContext[];
}

interface ValidationError {
  validatorName: string;
  subtype: string;
  message: string | null;
  isContextError: boolean;
}

interface TargetStorage {
  validatorNameToContextMap: Map<string, ValidationContext>;
  validatorNameToDataMap: Map<string, Record<string, unknown>>;
}

type StoredErrorMessages = Record<string, Record<string, string>>;
type SpecificErrorMessageInput = Record<string, ErrorMessage>;

class ElementErrorMessageFacade {
  readonly #map: Map<Element, StoredErrorMessages>;

  readonly #isKnownValidator: (name: string) => boolean;

  constructor(
    map: Map<Element, StoredErrorMessages>,
    isKnownValidator: (name: string) => boolean,
  ) {
    this.#map = map;
    this.#isKnownValidator = isKnownValidator;
  }

  set(element: Element, errorMessage: SpecificErrorMessageInput): void {
    if (
      !errorMessage
      || Object.prototype.toString.call(errorMessage) !== '[object Object]'
    ) {
      return;
    }
    const normalized: StoredErrorMessages = {};
    for (const [validatorName, message] of Object.entries(errorMessage)) {
      if (!this.#isKnownValidator(validatorName)) continue;
      normalized[validatorName] = normalizeErrorMessage(message);
    }
    this.#map.set(element, normalized);
  }

  delete(element: Element): void {
    this.#map.delete(element);
  }

  clear(): void {
    this.#map.clear();
  }
}

function normalizeErrorMessage(input: ErrorMessage | undefined): Record<string, string> {
  if (input == null) return {};
  if (typeof input === 'string') return { '': input };
  return input;
}

function getErrorMessageList(errorList: ValidationError[]): string[] {
  return errorList
    .map((error) => error.message)
    .filter((message): message is string => message != null && message.length > 0);
}

function buildErrorDetailList(errorList: ValidationError[]): ErrorDetail[] {
  const out: ErrorDetail[] = [];
  for (const { validatorName, subtype, message, isContextError } of errorList) {
    if (message == null || message.length === 0) continue;
    out.push({ validatorName, subtype, message, isContextError });
  }
  return out;
}

export default class FormValidator {
  ignoreValidationResult = false;

  #elementToErrorListMap = new Map<Element, ValidationError[]>();

  readonly #specificErrorMessages = new Map<Element, StoredErrorMessages>();

  readonly #specificErrorMessagesFacade: ElementErrorMessageFacade;

  readonly #form: HTMLFormElement;

  readonly #contextElementToContextMap = new Map<Element, ValidationContext>();

  #observableToTargetSetMap = new Map<Element, Set<FormElement>>();

  readonly #onErrorMessageListChanged: (
    element: Element,
    errorMessages: string[],
    errors: ErrorDetail[],
  ) => void;

  readonly #manageValidity: boolean;

  readonly #reportValidityOnSubmit: boolean;

  readonly #trigger: TriggerMode;

  // For `'blur-then-input'`: tracks which fields have been shown an error at
  // least once. Those fields fire validation eagerly on `input`; fields not
  // yet in this set wait for `focusout`. Cleared on form reset.
  readonly #fieldsShownError = new Set<FormElement>();

  #targetElementToStorageMap = new Map<FormElement, TargetStorage>();

  // Inputs linked to the form via `form="formId"` rather than DOM containment.
  // Events on these don't bubble to the form, so the engine attaches per-element
  // input/validate listeners and tracks them here for cleanup.
  readonly #externalControls = new Set<FormElement>();

  readonly #validatorNameToDefinitionMap = new Map<string, ValidatorDefinition>();

  readonly #onPendingChange: (element: Element, isPending: boolean) => void;

  readonly #onFormPendingChange: (isPending: boolean) => void;

  readonly #coordinator: AsyncValidationCoordinator;

  constructor({
    form,
    validatorDeclarations = {},
    onErrorMessageListChanged = () => {},
    manageValidity = true,
    reportValidityOnSubmit = false,
    trigger = 'blur-then-input',
    onPendingChange = () => {},
    onFormPendingChange = () => {},
  }: FormValidatorParams) {
    if (!(form instanceof HTMLFormElement)) {
      throw new Error('form must be an HTMLFormElement');
    }

    this.#form = form;
    this.#onErrorMessageListChanged = onErrorMessageListChanged;
    this.#manageValidity = manageValidity;
    this.#reportValidityOnSubmit = reportValidityOnSubmit;
    this.#trigger = trigger;
    this.#onPendingChange = onPendingChange;
    this.#onFormPendingChange = onFormPendingChange;
    this.#coordinator = new AsyncValidationCoordinator({
      onApplyResult: (element, name, result) => {
        result.validatorName = name;
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
    this.#form.setAttribute('novalidate', '');
    this.#form.setAttribute('data-validation-context', '*');
    this.#specificErrorMessagesFacade = new ElementErrorMessageFacade(
      this.#specificErrorMessages,
      (name) => this.#validatorNameToDefinitionMap.has(name),
    );
    this.addValidators(validatorDeclarations);
    this.#form.addEventListener('submit', this.#submitEventHandler);
    for (const eventName of this.#listenerEventNames()) {
      this.#form.addEventListener(eventName, this.#inputEventHandler);
    }
    this.#form.addEventListener('reset', this.#resetEventHandler);
    this.#form.addEventListener(VALIDATE_EVENT_TYPE, this.#validateEventHandler as EventListener);
  }

  get elementToSpecificErrorMessageMap(): ElementErrorMessageFacade {
    return this.#specificErrorMessagesFacade;
  }

  destroy(): void {
    // Removes all listeners attached by the constructor and clears internal state.
    // The `novalidate` and `data-validation-context="*"` attributes the constructor
    // set on the form are intentionally left in place — removing them risks
    // clobbering attributes the consumer set independently.
    // Idempotent: calling twice is safe. Behavior of any other method after
    // destroy() is undefined.
    this.#form.removeEventListener('submit', this.#submitEventHandler);
    for (const eventName of this.#listenerEventNames()) {
      this.#form.removeEventListener(eventName, this.#inputEventHandler);
    }
    this.#form.removeEventListener('reset', this.#resetEventHandler);
    this.#form.removeEventListener(VALIDATE_EVENT_TYPE, this.#validateEventHandler as EventListener);
    for (const el of this.#externalControls) {
      for (const eventName of this.#listenerEventNames()) {
        el.removeEventListener(eventName, this.#inputEventHandler);
      }
      el.removeEventListener(VALIDATE_EVENT_TYPE, this.#validateEventHandler as EventListener);
    }
    this.#externalControls.clear();
    this.#fieldsShownError.clear();
    this.#elementToErrorListMap.clear();
    this.#contextElementToContextMap.clear();
    this.#observableToTargetSetMap.clear();
    this.#targetElementToStorageMap.clear();
    this.#validatorNameToDefinitionMap.clear();
    this.#specificErrorMessages.clear();
    // Abort any in-flight async validators so their callbacks don't fire after
    // the instance is torn down (filled out further in Task 17).
    this.#coordinator.abortAll();
  }

  static getElementType(element: Element): ElementType | null {
    const tagName = element.tagName.toLowerCase();

    if (tagName === 'input') {
      const typeAttr = element.getAttribute('type');
      if (typeAttr === null) return 'text';
      switch (typeAttr.toLowerCase()) {
        case 'text':
        case 'password':
        case 'tel':
        case 'email':
        case 'url':
        case 'search':
        case 'number':
        case 'date':
        case 'time':
        case 'datetime-local':
        case 'month':
        case 'week':
        case 'color':
        case 'range':
        case 'hidden':
        case 'file':
        case 'checkbox':
        case 'radio':
          return typeAttr.toLowerCase() as ElementType;
        default:
          return null;
      }
    }

    if (tagName === 'textarea' || tagName === 'select') {
      return tagName;
    }

    return null;
  }

  static createValidateEvent({ data = null }: { data?: Record<string, unknown> | null } = {}): CustomEvent {
    return new CustomEvent(VALIDATE_EVENT_TYPE, {
      bubbles: true,
      detail: {
        ...data,
      },
    });
  }

  addValidators(validatorDeclarations: ValidatorDeclarations): this {
    for (const key of Object.keys(validatorDeclarations)) {
      const declaration = validatorDeclarations[key] ?? {};
      const init = declaration.init ?? ((element) => new FormValidatorInitResult({
        observableElementList: [element],
      }));
      const validate = declaration.validate ?? (() => new FormValidatorValidationResult({
        isValid: true,
      }));

      if (typeof init !== 'function' || typeof validate !== 'function') {
        throw new Error('Invalid validator declaration');
      }

      this.#validatorNameToDefinitionMap.set(key, {
        init,
        validate,
        errorMessage: normalizeErrorMessage(declaration.errorMessage),
        onError: declaration.onError,
      });
    }

    this.updateValidationParameters();

    return this;
  }

  getValidatorNameToArgumentStringMap({ value = '' }: { value?: string } = {}): Map<string, string> {
    const regExp = /([a-z0-9-_]+)(?:\((.*?)\)(?=[;, ]+))?/gi;
    const result = new Map<string, string>();

    let normalizedValue = value;
    if (normalizedValue.length && normalizedValue[normalizedValue.length - 1] !== ';') {
      normalizedValue += ';';
    }

    const validatorParameters: Record<string, { ix: number; argumentString: string }> = {};

    for (
      let ix = 0, temp = regExp.exec(normalizedValue);
      temp;
      ix += 1, temp = regExp.exec(normalizedValue)
    ) {
      const [, name, argumentString = ''] = temp;
      if (name == null) continue;
      validatorParameters[name] = { ix, argumentString };
    }

    Object.keys(validatorParameters)
      .filter((name) => this.#validatorNameToDefinitionMap.has(name))
      .sort((a, b) => validatorParameters[a]!.ix - validatorParameters[b]!.ix)
      .forEach((name) => {
        result.set(name, validatorParameters[name]!.argumentString);
      });

    return result;
  }

  updateValidationParameters(): void {
    // Detach per-element listeners attached for previously-tracked externals;
    // a fresh set is rebuilt below.
    for (const el of this.#externalControls) {
      for (const eventName of this.#listenerEventNames()) {
        el.removeEventListener(eventName, this.#inputEventHandler);
      }
      el.removeEventListener(VALIDATE_EVENT_TYPE, this.#validateEventHandler as EventListener);
    }
    this.#externalControls.clear();
    this.#targetElementToStorageMap = new Map();
    this.#elementToErrorListMap = new Map();
    this.#observableToTargetSetMap = new Map();
    this.#buildContextTree(this.#form);

    this.#getValidationTargets().forEach((targetElement) => {
      this.#elementToErrorListMap.set(targetElement, []);

      const { validatorNameToContextMap, validatorNameToDataMap } = this.#getData(targetElement);
      const validation = targetElement.getAttribute('data-validation') ?? '';
      const validatorNameToArgumentStringMap = this.getValidatorNameToArgumentStringMap({ value: validation });

      validatorNameToArgumentStringMap.forEach((argumentString, validatorName) => {
        const definition = this.#validatorNameToDefinitionMap.get(validatorName);
        if (!definition) return;

        const initResult = definition.init(targetElement, { argumentString });

        if (initResult instanceof FormValidatorInitResult) {
          validatorNameToContextMap.set(validatorName, this.#getContext(targetElement, validatorName));
          validatorNameToDataMap.set(validatorName, {
            ...initResult.extraData,
            argumentString,
          });
          initResult.observableElementList
            .filter((observableElement) => observableElement !== targetElement)
            .forEach((observableElement) => this.#addObservableElement(targetElement, observableElement));
        }
      });

      // form=-linked controls don't bubble events to the form — attach
      // per-element listeners so input and validate handlers still fire.
      if (!this.#form.contains(targetElement)) {
        this.#externalControls.add(targetElement);
        for (const eventName of this.#listenerEventNames()) {
          targetElement.addEventListener(eventName, this.#inputEventHandler);
        }
        targetElement.addEventListener(VALIDATE_EVENT_TYPE, this.#validateEventHandler as EventListener);
      }
    });
  }

  #addError = (element: Element, validationResult: FormValidatorValidationResult): void => {
    this.#removeError(element, validationResult);
    const errorList = this.#elementToErrorListMap.get(element);
    if (!errorList) return;

    const { validatorName } = validationResult;
    let { validatorSubtypeList } = validationResult;

    if (validatorSubtypeList.length === 0) {
      validatorSubtypeList = [''];
    }

    const definition = this.#validatorNameToDefinitionMap.get(validatorName);
    const baseMessages = definition?.errorMessage ?? {};
    const overrides = this.#specificErrorMessages.get(element)?.[validatorName] ?? {};
    const messages = { ...baseMessages, ...overrides };

    for (const subtype of validatorSubtypeList) {
      errorList.push({
        validatorName,
        subtype,
        message: messages[subtype] ?? null,
        isContextError: validationResult.isContextError,
      });
    }
  };

  #addObservableElement = (target: FormElement, observable: Element): void => {
    let targetSet = this.#observableToTargetSetMap.get(observable);
    if (!targetSet) {
      targetSet = new Set();
      this.#observableToTargetSetMap.set(observable, targetSet);
    }
    targetSet.add(target);
  };

  #buildContextTree = (root: Element, parent: ValidationContext | null = null): ValidationContext => {
    const contextAttr = root.getAttribute('data-validation-context') ?? '';
    const validatorNameList = contextAttr
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name.length > 0);

    const context: ValidationContext = {
      element: root,
      parent,
      validatorNameList,
      contextList: [],
    };

    this.#elementToErrorListMap.set(context.element, []);
    this.#contextElementToContextMap.set(context.element, context);

    context.contextList = Array.from(context.element.querySelectorAll('[data-validation-context]'))
      .filter((descendant) => descendant.parentElement?.closest('[data-validation-context]') === context.element)
      .map((child) => this.#buildContextTree(child, context));

    return context;
  };

  // Both event listeners are always attached. Trigger gating happens at
  // handler time via `#getEffectiveTrigger` so per-field overrides work
  // without re-attaching listeners. The cost is negligible — focusout fires
  // rarely and the handler short-circuits when no firing is required.
  #listenerEventNames = (): readonly ('input' | 'focusout')[] => ['input', 'focusout'];

  // Resolves a field's effective trigger: a `data-validation-trigger="…"`
  // attribute on the field overrides the engine-level setting. Unknown or
  // missing values fall back to the engine default.
  #getEffectiveTrigger = (field: Element): TriggerMode => {
    const attr = field.getAttribute('data-validation-trigger');
    if (
      attr === 'input'
      || attr === 'blur'
      || attr === 'blur-then-input'
      || attr === 'submit-only'
    ) return attr;
    return this.#trigger;
  };

  // form.elements is the standard HTMLFormControlsCollection — includes
  // descendants AND form controls outside the form linked via `form="formId"`.
  // Filtered to elements that actually carry data-validation and are one of
  // the supported control types.
  #getValidationTargets = (): FormElement[] => Array.from(this.#form.elements).filter(
    (el): el is FormElement => (
      el.hasAttribute('data-validation')
      && (el instanceof HTMLInputElement
        || el instanceof HTMLSelectElement
        || el instanceof HTMLTextAreaElement)
    ),
  );

  #initData = (targetElement: FormElement): TargetStorage => {
    const storage: TargetStorage = {
      validatorNameToContextMap: new Map(),
      validatorNameToDataMap: new Map(),
    };
    this.#targetElementToStorageMap.set(targetElement, storage);
    return storage;
  };

  // Listens to `input` AND `focusout`. Whether a given field should validate
  // for the given event depends on the field's *effective* trigger — engine
  // default unless overridden by `data-validation-trigger="…"`.
  #inputEventHandler = (event: Event): void => {
    const target = event.target as Element;
    const isInputEvent = event.type === 'input';

    const shouldFire = (field: Element): boolean => {
      const effective = this.#getEffectiveTrigger(field);
      if (effective === 'submit-only') return false;
      if (!isInputEvent) {
        // focusout: fires for blur and blur-then-input. 'input' mode skips
        // focusout (its input handler already covers everything).
        return effective === 'blur' || effective === 'blur-then-input';
      }
      // input event:
      if (effective === 'input') return true;
      if (effective === 'blur-then-input') {
        return this.#fieldsShownError.has(field as FormElement);
      }
      return false; // 'blur' mode: only focusout fires
    };

    if (target instanceof HTMLInputElement
      || target instanceof HTMLSelectElement
      || target instanceof HTMLTextAreaElement) {
      if (this.#targetElementToStorageMap.has(target) && shouldFire(target)) {
        target.dispatchEvent(FormValidator.createValidateEvent());
      }
    }

    if (this.#observableToTargetSetMap.has(target)) {
      this.#observableToTargetSetMap.get(target)?.forEach((observer) => {
        if (shouldFire(observer)) {
          observer.dispatchEvent(FormValidator.createValidateEvent());
        }
      });
    }
  };

  #hasErrors = (): boolean => {
    for (const errorList of this.#elementToErrorListMap.values()) {
      if (errorList.length > 0) return true;
    }
    return false;
  };

  // Sync `aria-invalid` on form controls when their error state changes.
  // Skipped for non-form-control elements (a context error landing on a
  // <fieldset> or the form itself doesn't get aria-invalid — that attribute
  // is meaningful only on form controls per WAI-ARIA).
  #syncAriaInvalid = (element: Element, hasErrors: boolean): void => {
    if (
      element instanceof HTMLInputElement
      || element instanceof HTMLSelectElement
      || element instanceof HTMLTextAreaElement
    ) {
      element.setAttribute('aria-invalid', hasErrors ? 'true' : 'false');
    }
  };

  // On reset, validation hasn't re-run — remove the attribute rather than
  // assert "false" (which would imply we'd checked and found it valid).
  #clearAriaInvalid = (element: Element): void => {
    if (
      element instanceof HTMLInputElement
      || element instanceof HTMLSelectElement
      || element instanceof HTMLTextAreaElement
    ) {
      element.removeAttribute('aria-invalid');
    }
  };

  // HTML Constraint Validation API integration: when error state changes,
  // call setCustomValidity() so :invalid CSS, validationMessage, and
  // form.checkValidity() reflect the engine's verdict. Messages are joined
  // with '\n' (the platform convention for tooltips with multiple errors).
  // Skipped for non-form-control elements (mirrors aria-invalid scope) and
  // skipped entirely when `manageValidity: false`.
  #syncCustomValidity = (element: Element, errorMessages: string[]): void => {
    if (!this.#manageValidity) return;
    if (
      element instanceof HTMLInputElement
      || element instanceof HTMLSelectElement
      || element instanceof HTMLTextAreaElement
    ) {
      element.setCustomValidity(errorMessages.join('\n'));
    }
  };

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
        this.#onErrorMessageListChanged(
          element,
          after,
          buildErrorDetailList(this.#elementToErrorListMap.get(element) ?? []),
        );
      }
    }

    // For fields whose effective trigger is 'blur-then-input': mark the
    // targetElement as having been shown an error if any validator on this
    // cycle returned invalid (regardless of where the error landed — direct
    // or context). The transition is one-way until form reset.
    if (
      this.#getEffectiveTrigger(targetElement) === 'blur-then-input'
      && validationResultList.some((r) => !r.isValid)
    ) {
      this.#fieldsShownError.add(targetElement);
    }
  };

  #clearCustomValidity = (element: Element): void => {
    if (!this.#manageValidity) return;
    if (
      element instanceof HTMLInputElement
      || element instanceof HTMLSelectElement
      || element instanceof HTMLTextAreaElement
    ) {
      element.setCustomValidity('');
    }
  };

  #getContext = (target: Element, validatorName: string): ValidationContext => {
    // For DOM-nested controls, the closest data-validation-context ancestor
    // resolves the context. For form=-linked controls outside the form's
    // subtree, closest() returns null (or an ancestor outside our tree);
    // fall back to the form's own context.
    const closestContextElement = target.closest('[data-validation-context]');
    let context = closestContextElement
      ? this.#contextElementToContextMap.get(closestContextElement)
      : undefined;
    if (!context) context = this.#contextElementToContextMap.get(this.#form);
    if (!context) {
      throw new Error('Form context not registered');
    }

    while (
      context.validatorNameList.indexOf(validatorName) < 0
      && context.validatorNameList.indexOf('*') < 0
    ) {
      if (!context.parent) {
        throw new Error(`No matching context for validator: ${validatorName}`);
      }
      context = context.parent;
    }

    return context;
  };

  #getData = (targetElement: FormElement): TargetStorage => (
    this.#targetElementToStorageMap.get(targetElement) ?? this.#initData(targetElement)
  );

  #removeError = (element: Element, validationResult: FormValidatorValidationResult): void => {
    const errorList = this.#elementToErrorListMap.get(element);
    if (!errorList) return;
    this.#elementToErrorListMap.set(
      element,
      errorList.filter((error) => error.validatorName !== validationResult.validatorName),
    );
  };

  #resetEventHandler = (event: Event): void => {
    if (event.target === this.#form) {
      for (const element of this.#elementToErrorListMap.keys()) {
        this.#elementToErrorListMap.set(element, []);
        this.#clearAriaInvalid(element);
        this.#clearCustomValidity(element);
        this.#onErrorMessageListChanged(element, [], []);
      }
      // Returns all fields to "untouched" — subsequent input won't fire
      // validation in 'blur-then-input' mode until each field is shown an error again.
      this.#fieldsShownError.clear();
    }
  };

  #submitEventHandler = (event: Event): void => {
    if (event.target !== this.#form) return;

    this.#getValidationTargets().forEach((element) => {
      element.dispatchEvent(FormValidator.createValidateEvent());
    });

    if (this.#hasErrors()) {
      event.stopImmediatePropagation();
      event.preventDefault();
      if (this.#reportValidityOnSubmit) {
        // Surface the browser's native tooltip on the first invalid field.
        // With `manageValidity: true` (default), the message comes from our
        // setCustomValidity calls; otherwise from any native HTML validity.
        this.#form.reportValidity();
      }
    }
  };

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

  #checkSubmitHandoff = (): void => {
    // Filled in Task 16.
  };

  #validateEventHandler = (event: CustomEvent): void => {
    const targetElement = event.target;
    const eventData = (event.detail ?? {}) as Record<string, unknown>;

    if (targetElement === this.#form || !(targetElement instanceof Element)) {
      event.stopPropagation();
      return;
    }

    if (!(targetElement instanceof HTMLInputElement
      || targetElement instanceof HTMLSelectElement
      || targetElement instanceof HTMLTextAreaElement)) {
      event.stopPropagation();
      return;
    }

    const elementType = FormValidator.getElementType(targetElement);
    if (!elementType) {
      event.stopPropagation();
      return;
    }

    const { validatorNameToContextMap, validatorNameToDataMap } = this.#getData(targetElement);

    const validationResultList: FormValidatorValidationResult[] = [];

    const pushResult = (r: FormValidatorValidationResult, name: string): void => {
      r.validatorName = name;
      if (this.ignoreValidationResult) {
        validationResultList.push(new FormValidatorValidationResult({
          ...r,
          validatorSubtypeList: r.validatorSubtypeList,
          isValid: true,
        }));
      } else {
        validationResultList.push(r);
      }
    };

    for (const validatorName of validatorNameToContextMap.keys()) {
      const data = validatorNameToDataMap.get(validatorName);
      if (!data) continue;

      const injected = eventData[validatorName];
      if (injected instanceof FormValidatorValidationResult) {
        // Injection path — abort any in-flight async for this slot first.
        this.#coordinator.abortSlot(targetElement, validatorName);
        pushResult(injected, validatorName);
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
        // async result will land via coordinator's onApplyResult → #applyResults
      } else if (returnValue instanceof FormValidatorValidationResult) {
        // Sync result supersedes any in-flight async for this slot.
        this.#coordinator.abortSlot(targetElement, validatorName);
        pushResult(returnValue, validatorName);
      }
      // else (undefined / non-Result): silent skip, existing behavior.
    }

    this.#applyResults(targetElement, validationResultList);

    event.stopPropagation();
  };
}
