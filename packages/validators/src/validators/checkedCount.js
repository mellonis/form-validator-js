import FormValidator, { FormValidatorValidationResult } from '@form-validator-js/core';

export default {
  init(targetElement, parameters) {
    const elementType = FormValidator.getElementType(targetElement);

    switch (elementType) {
      case 'checkbox':
      case 'radio':
        // eslint-disable-next-line no-param-reassign
        parameters.elementList = Array.from(document.querySelectorAll(`[type="${elementType}"][name="${targetElement.name}"]`));
        break;
      default:
        throw new Error('Unsupported element type');
    }

    const boundList = parameters.argumentString
      .trim()
      .split(',')
      .slice(0, 2)
      .map(bound => parseInt(bound, 10) || null);

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

    Object.assign(parameters, {
      minCount: boundList[0],
      maxCount: boundList[1],
    });

    return parameters.elementList;
  },
  validate(targetElement, parameters) {
    const checkedCount = parameters.elementList.filter(element => element.checked).length;

    return new FormValidatorValidationResult({
      validatorName: 'checked-count',
      isContextError: true,
      isValid: parameters.minCount <= checkedCount && checkedCount <= parameters.maxCount,
    });
  },
};
