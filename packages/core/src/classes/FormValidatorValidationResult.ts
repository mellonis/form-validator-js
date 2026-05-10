export interface FormValidatorValidationResultParams {
  validatorName?: string;
  validatorSubtypeList?: string[];
  isContextError?: boolean;
  isValid?: boolean;
}

export default class FormValidatorValidationResult {
  validatorName: string;

  declare readonly isContextError: boolean;

  declare readonly isValid: boolean;

  readonly #subtypeList: string[];

  constructor({
    validatorName = '',
    validatorSubtypeList = [],
    isContextError = false,
    isValid = true,
  }: FormValidatorValidationResultParams = {}) {
    this.validatorName = validatorName;
    this.#subtypeList = [...validatorSubtypeList];
    Object.defineProperty(this, 'isContextError', {
      enumerable: true,
      value: isContextError,
    });
    Object.defineProperty(this, 'isValid', {
      enumerable: true,
      value: isValid,
    });
  }

  get validatorSubtypeList(): string[] {
    return [...this.#subtypeList];
  }
}
