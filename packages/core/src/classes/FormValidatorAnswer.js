export default class FormValidatorAnswer {
  constructor({
    validatorName = '',
    validatorSubtypeList = [],
    isContextError = false,
    isValid = true,
  }) {
    const subtypeList = [...validatorSubtypeList];
    this.validatorName = validatorName;

    Object.defineProperties(this, {
      validatorSubtypeList: {
        enumerable: true,
        get() {
          return [...subtypeList];
        },
      },
      isContextError: {
        enumerable: true,
        get() {
          return isContextError;
        },
      },
      isValid: {
        enumerable: true,
        get() {
          return isValid;
        },
      },
    });
  }
}
