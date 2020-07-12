/**
 * @typedef {Object} FormValidatorInitResult_t
 * @property {string} [validatorName='']
 * @property {Array.<string>} [validatorSubtypeList=[]]
 * @property {boolean} [isContextError=false]
 * @property {boolean} [isValid=true]
 */

/**
 * @class FormValidatorValidationResult
 * @param {FormValidatorInitResult_t} params
 */
export default class FormValidatorValidationResult {
  constructor({
    validatorName = '',
    validatorSubtypeList = [],
    isContextError = false,
    isValid = true,
  } = {}) {
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
        value: isContextError,
      },
      isValid: {
        enumerable: true,
        value: isValid,
      },
    });
  }
}
