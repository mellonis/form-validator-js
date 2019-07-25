import FormValidator, { FormValidatorValidationResult } from '@form-validator-js/core';

export default {
  init(targetElement, parameters) {
    // eslint-disable-next-line no-param-reassign
    parameters.regExp = new RegExp(parameters.argumentString);

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
    const { value } = targetElement;

    return new FormValidatorValidationResult({
      isValid: value.length === 0 || parameters.regExp.test(value),
      elements: [targetElement],
    });
  },
};
