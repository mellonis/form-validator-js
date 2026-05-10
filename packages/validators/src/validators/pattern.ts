import {
  FormValidator,
  FormValidatorInitResult,
  FormValidatorValidationResult,
  type ValidatorDeclaration,
} from '@form-validator-js/core';

interface PatternData extends Record<string, unknown> {
  regExp: RegExp;
}

const pattern: Required<Pick<ValidatorDeclaration, 'init' | 'validate'>> = {
  init(targetElement, data) {
    // Match native HTML `pattern`: the regex must match the entire value.
    const regExp = new RegExp(`^(?:${data.argumentString})$`);

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
          extraData: { regExp } as PatternData,
        });
      default:
        throw new Error('Unsupported element type');
    }
  },

  validate(targetElement, data) {
    const { regExp } = data as PatternData;
    const { value } = targetElement as HTMLInputElement | HTMLTextAreaElement;
    return new FormValidatorValidationResult({
      isValid: value.length === 0 || regExp.test(value),
    });
  },
};

export default pattern;
