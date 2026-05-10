import {
  FormValidator,
  FormValidatorInitResult,
  FormValidatorValidationResult,
  type ValidatorDeclaration,
} from '@form-validator-js/core';
import {
  isSupportedType,
  parseValue,
  type SupportedType,
} from '../internal/temporalValue';

interface NumericData extends Record<string, unknown> {
  type: SupportedType;
}

const numeric: Required<Pick<ValidatorDeclaration, 'init' | 'validate'>> = {
  init(targetElement) {
    const elementType = FormValidator.getElementType(targetElement);
    if (!isSupportedType(elementType)) {
      throw new Error('Unsupported element type');
    }
    return new FormValidatorInitResult({
      observableElementList: [targetElement],
      extraData: { type: elementType } as NumericData,
    });
  },

  validate(targetElement, data) {
    const { type } = data as NumericData;
    const input = targetElement as HTMLInputElement;
    // Real browsers sanitize unparseable input to '' and surface it via
    // validity.badInput. Check that first so the empty-passes shortcut below
    // doesn't mask bad input. In environments that keep the raw string (jsdom,
    // some test harnesses) the parse-side check catches it.
    if (input.validity.badInput) {
      return new FormValidatorValidationResult({ isValid: false });
    }
    if (input.value === '') {
      return new FormValidatorValidationResult({ isValid: true });
    }
    return new FormValidatorValidationResult({
      isValid: !Number.isNaN(parseValue(type, input.value)),
    });
  },
};

export default numeric;
