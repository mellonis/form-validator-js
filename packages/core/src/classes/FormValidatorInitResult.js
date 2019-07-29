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
    const immutableExtraData = { ...extraData };

    Object.freeze(immutableExtraData);

    Object.defineProperties(this, {
      observableElementList: {
        enumerable: true,
        get() {
          return [...elementList];
        },
      },
      extraData: {
        enumerable: true,
        get() {
          return immutableExtraData;
        },
      },
    });
  }
}
