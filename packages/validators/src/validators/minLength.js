import FormValidator, { FormValidatorInitResult, FormValidatorValidationResult } from '@form-validator-js/core';

export default {
  init(targetElement, data) {
    const minLength = Number(data.argumentString);

    if (Number.isNaN(minLength)) {
      throw new Error('Invalid validator arguments');
    }

    switch (FormValidator.getElementType(targetElement)) {
      case 'text':
      case 'password':
      case 'tel':
      case 'textarea':
        return new FormValidatorInitResult({
          observableElementList: [targetElement],
          extraData: {
            minLength,
          },
        });
      default:
        throw new Error('Unsupported element type');
    }
  },
  validate(targetElement, data) {
    return new FormValidatorValidationResult({
      isValid: targetElement.value.length >= data.minLength,
      elements: [targetElement],
    });
  },
};
