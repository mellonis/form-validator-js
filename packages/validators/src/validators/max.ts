import {
  FormValidator,
  FormValidatorInitResult,
  FormValidatorValidationResult,
  type ValidatorDeclaration,
} from '@form-validator-js/core';
import {
  isSupportedType,
  parseValue,
  readElementValue,
  type SupportedType,
} from '../internal/temporalValue';

interface MaxData extends Record<string, unknown> {
  type: SupportedType;
  max: number;
}

const max: Required<Pick<ValidatorDeclaration, 'init' | 'validate'>> = {
  init(targetElement, data) {
    const elementType = FormValidator.getElementType(targetElement);
    if (!isSupportedType(elementType)) {
      throw new Error('Unsupported element type');
    }
    const bound = parseValue(elementType, data.argumentString.trim());
    if (Number.isNaN(bound)) {
      throw new Error('Invalid validator arguments');
    }
    return new FormValidatorInitResult({
      observableElementList: [targetElement],
      extraData: { type: elementType, max: bound } as MaxData,
    });
  },

  validate(targetElement, data) {
    const { type, max: bound } = data as MaxData;
    const num = readElementValue(targetElement as HTMLInputElement, type);
    if (Number.isNaN(num)) {
      return new FormValidatorValidationResult({ isValid: true });
    }
    return new FormValidatorValidationResult({ isValid: num <= bound });
  },
};

export default max;
