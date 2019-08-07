import FormValidator, { FormValidatorInitResult, FormValidatorValidationResult } from '@form-validator-js/core';

export default {
  init(targetElement, data) {
    const maxLength = Number(data.argumentString);

    if (Number.isNaN(maxLength)) {
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
            maxLength,
          },
        });
      default:
        throw new Error('Unsupported element type');
    }
  },
  validate(targetElement, data) {
    return new FormValidatorValidationResult({
      isValid: targetElement.value.length <= data.maxLength,
    });
  },
};
