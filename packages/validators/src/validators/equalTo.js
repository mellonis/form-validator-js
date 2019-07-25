import { FormValidatorValidationResult } from '@form-validator-js/core';

export default {
  init(targetElement, parameters) {
    const id = parameters.argumentString;

    // eslint-disable-next-line no-param-reassign
    parameters.otherElement = document.getElementById(id);

    if (parameters.otherElement == null) {
      throw new Error(`There is no '#${id}' element`);
    }

    return [targetElement, parameters.otherElement];
  },
  validate(targetElement, parameters) {
    return new FormValidatorValidationResult({
      isValid: targetElement.value === parameters.otherElement.value,
      elements: [targetElement],
    });
  },
};
