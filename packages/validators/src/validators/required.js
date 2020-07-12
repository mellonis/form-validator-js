import { FormValidator, FormValidatorInitResult, FormValidatorValidationResult } from '@form-validator-js/core';

export default {
  init(targetElement) {
    const elementType = FormValidator.getElementType(targetElement);
    const elementList = [];

    switch (elementType) {
      case 'text':
      case 'password':
      case 'tel':
      case 'textarea':
      case 'select':
        elementList.push(targetElement);
        break;
      case 'checkbox':
      case 'radio':
        elementList.push(...Array.from(document.querySelectorAll(`[name="${targetElement.name}"]`)));
        break;
      default:
        throw new Error('Unsupported element type');
    }

    return new FormValidatorInitResult({
      observableElementList: elementList,
      extraData: {
        elementType,
        elementList,
      },
    });
  },
  validate(targetElement, data) {
    let isContextError;
    let isValid;

    switch (data.elementType) {
      case 'text':
      case 'password':
      case 'tel':
      case 'textarea':
      case 'select':
        isContextError = false;
        isValid = data.elementList[0].value.length > 0;
        break;
      case 'checkbox':
      case 'radio':
        isContextError = true;
        isValid = data.elementList.filter((el) => el.checked).length > 0;
        break;
      // no default
    }

    return new FormValidatorValidationResult({
      isContextError,
      isValid,
    });
  },
};
