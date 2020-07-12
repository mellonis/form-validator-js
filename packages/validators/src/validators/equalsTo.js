import { FormValidatorInitResult, FormValidatorValidationResult } from '@form-validator-js/core';

export default {
  init(targetElement, data) {
    const id = data.argumentString;
    const otherElement = document.getElementById(id);

    if (otherElement == null) {
      throw new Error(`There is no '#${id}' element`);
    }

    return new FormValidatorInitResult({
      observableElementList: [targetElement, otherElement],
      extraData: {
        otherElement,
      },
    });
  },
  validate(targetElement, data) {
    return new FormValidatorValidationResult({
      isValid: targetElement.value === data.otherElement.value,
    });
  },
};
