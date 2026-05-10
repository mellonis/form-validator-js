import {
  FormValidator,
  FormValidatorInitResult,
  FormValidatorValidationResult,
  type ValidatorDeclaration,
} from '@form-validator-js/core';

interface MinLengthData extends Record<string, unknown> {
  minLength: number;
}

const minLength: Required<Pick<ValidatorDeclaration, 'init' | 'validate'>> = {
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
          extraData: { minLength: length } as MinLengthData,
        });
      default:
        throw new Error('Unsupported element type');
    }
  },

  validate(targetElement, data) {
    const { minLength: min } = data as MinLengthData;
    // Counts Unicode code points, not UTF-16 code units — `'😀'` reads as 1, not 2.
    const length = [...(targetElement as HTMLInputElement | HTMLTextAreaElement).value].length;
    return new FormValidatorValidationResult({
      isValid: length >= min,
    });
  },
};

export default minLength;
