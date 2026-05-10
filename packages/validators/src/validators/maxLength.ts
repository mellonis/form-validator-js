import {
  FormValidator,
  FormValidatorInitResult,
  FormValidatorValidationResult,
  type ValidatorDeclaration,
} from '@form-validator-js/core';

interface MaxLengthData extends Record<string, unknown> {
  maxLength: number;
}

const maxLength: Required<Pick<ValidatorDeclaration, 'init' | 'validate'>> = {
  init(targetElement, data) {
    const length = Number(data.argumentString);
    if (Number.isNaN(length)) {
      throw new Error('Invalid validator arguments');
    }

    switch (FormValidator.getElementType(targetElement)) {
      case 'text':
      case 'password':
      case 'tel':
      case 'email':
      case 'url':
      case 'search':
      case 'number':
      case 'date':
      case 'time':
      case 'datetime-local':
      case 'month':
      case 'week':
      case 'color':
      case 'range':
      case 'hidden':
      case 'textarea':
        return new FormValidatorInitResult({
          observableElementList: [targetElement],
          extraData: { maxLength: length } as MaxLengthData,
        });
      default:
        throw new Error('Unsupported element type');
    }
  },

  validate(targetElement, data) {
    const { maxLength: max } = data as MaxLengthData;
    const { length } = (targetElement as HTMLInputElement | HTMLTextAreaElement).value;
    return new FormValidatorValidationResult({
      isValid: length <= max,
    });
  },
};

export default maxLength;
