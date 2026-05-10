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

interface MinData extends Record<string, unknown> {
  type: SupportedType;
  min: number;
}

const min: Required<Pick<ValidatorDeclaration, 'init' | 'validate'>> = {
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
      extraData: { type: elementType, min: bound } as MinData,
    });
  },

  validate(targetElement, data) {
    const { type, min: bound } = data as MinData;
    const num = readElementValue(targetElement as HTMLInputElement, type);
    // Empty / bad-input pass — defer to `required` / `numeric`.
    if (Number.isNaN(num)) {
      return new FormValidatorValidationResult({ isValid: true });
    }
    return new FormValidatorValidationResult({ isValid: num >= bound });
  },
};

export default min;
