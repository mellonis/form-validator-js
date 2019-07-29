import FormValidator, { FormValidatorInitResult, FormValidatorValidationResult } from '@form-validator-js/core';

export default {
  init(targetElement, data) {
    const regExp = new RegExp(data.argumentString);

    switch (FormValidator.getElementType(targetElement)) {
      case 'text':
      case 'password':
      case 'tel':
      case 'textarea':
        return new FormValidatorInitResult({
          observableElementList: [targetElement],
          extraData: {
            regExp,
          },
        });
      default:
        throw new Error('Unsupported element type');
    }
  },
  validate(targetElement, data) {
    const { value } = targetElement;

    return new FormValidatorValidationResult({
      isValid: value.length === 0 || data.regExp.test(value),
      elements: [targetElement],
    });
  },
};
