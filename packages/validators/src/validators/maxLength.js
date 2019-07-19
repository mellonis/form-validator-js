import { utilities } from '@form-validator-js/core';

export default {
  init(targetElement, parameters) {
    // eslint-disable-next-line no-param-reassign
    parameters.maxLength = Number(parameters.argumentString);

    switch (utilities.getElementType(targetElement)) {
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
    return {
      isValid: targetElement.value.length <= parameters.maxLength,
      elements: [targetElement],
    };
  },
};
