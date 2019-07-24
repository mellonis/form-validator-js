import FormValidator, { FormValidatorAnswer } from '@form-validator-js/core';

export default {
  init(targetElement, parameters) {
    // eslint-disable-next-line no-param-reassign
    parameters.maxLength = Number(parameters.argumentString);

    if (Number.isNaN(parameters.maxLength)) {
      throw new Error('Invalid validator arguments');
    }

    switch (FormValidator.getElementType(targetElement)) {
      case 'text':
      case 'password':
      case 'tel':
      case 'textarea':
        return [targetElement];
      default:
        throw new Error('Unsupported element type');
    }
  },
  validate(targetElement, parameters) {
    return new FormValidatorAnswer({
      isValid: targetElement.value.length <= parameters.maxLength,
      elements: [targetElement],
    });
  },
};
