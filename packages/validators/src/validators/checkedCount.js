import FormValidator, { FormValidatorInitResult, FormValidatorValidationResult } from '@form-validator-js/core';

export default {
  init(targetElement, data) {
    const elementType = FormValidator.getElementType(targetElement);
    let observableElementList;

    switch (elementType) {
      case 'checkbox':
      case 'radio':
        observableElementList = Array.from(document.querySelectorAll(`[type="${elementType}"][name="${targetElement.name}"]`));
        break;
      default:
        throw new Error('Unsupported element type');
    }

    const boundList = data.argumentString
      .trim()
      .split(',')
      .slice(0, 2)
      .map((bound) => parseInt(bound, 10) || null);

    switch (boundList.length) {
      case 1:
        if (boundList[0] == null) {
          throw new Error('Invalid validator arguments');
        }

        boundList.push(boundList[0]);
        break;
      case 2:
        if (boundList[0] == null && boundList[1] == null) {
          throw new Error('Invalid validator arguments');
        }

        if (boundList[0] == null) {
          boundList[0] = 0;
        }

        if (boundList[1] == null) {
          boundList[1] = Infinity;
        }
        break;
      // no default
    }

    return new FormValidatorInitResult({
      observableElementList,
      extraData: {
        elementList: observableElementList,
        minCount: boundList[0],
        maxCount: boundList[1],
      },
    });
  },
  validate(targetElement, data) {
    const checkedCount = data.elementList.filter((element) => element.checked).length;

    return new FormValidatorValidationResult({
      isContextError: true,
      isValid: data.minCount <= checkedCount && checkedCount <= data.maxCount,
    });
  },
};
