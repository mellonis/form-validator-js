/**
 * @typedef {Object} FormValidatorInitResult_t
 * @property {string} [validatorName='']
 * @property {Array.<string>} [validatorSubtypeList=[]]
 * @property {boolean} [isContextError=false]
 * @property {boolean} [isValid=true]
 */

/**
 * @class FormValidatorInitResult
 * @param {FormValidatorInitResult_t} params
 */
export default class FormValidatorInitResult {
  constructor({
    observableElementList,
    extraData = {},
  }) {
    const elementList = [...observableElementList];

    Object.defineProperties(this, {
      observableElementList: {
        enumerable: true,
        get() {
          return [...elementList];
        },
      },
      extraData: {
        enumerable: true,
        value: Object.freeze({ ...extraData }),
      },
    });
  }
}
