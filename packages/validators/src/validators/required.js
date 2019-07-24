import FormValidator, { FormValidatorAnswer } from '@form-validator-js/core';

export default {
  init(targetElement, parameters) {
    // eslint-disable-next-line no-param-reassign
    parameters.elementType = FormValidator.getElementType(targetElement);

    switch (parameters.elementType) {
      case 'text':
      case 'password':
      case 'tel':
      case 'textarea':
      case 'select':
        // eslint-disable-next-line no-param-reassign
        parameters.elementList = [targetElement];
        break;
      case 'checkbox':
      case 'radio':
        // eslint-disable-next-line no-param-reassign
        parameters.elementList = Array.from(document.querySelectorAll(`[name="${targetElement.name}"]`));
        break;
      default:
        throw new Error('Unsupported element type');
    }

    return parameters.elementList;
  },
  validate(targetElement, parameters) {
    let isContextError;
    let isValid;

    switch (parameters.elementType) {
      case 'text':
      case 'password':
      case 'tel':
      case 'textarea':
      case 'select':
        isContextError = false;
        isValid = parameters.elementList[0].value.length > 0;
        break;
      case 'checkbox':
      case 'radio':
        isContextError = true;
        isValid = parameters.elementList.filter(el => el.checked).length > 0;
        break;
      // no default
    }

    return new FormValidatorAnswer({
      isContextError,
      isValid,
      elements: parameters.elementList,
    });
  },
};
