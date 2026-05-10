import {
  FormValidator,
  FormValidatorInitResult,
  FormValidatorValidationResult,
  type ValidatorDeclaration,
} from '@form-validator-js/core';
import {
  DEFAULT_BASE,
  SCALE,
  isSupportedType,
  parseValue,
  readElementValue,
  type SupportedType,
} from '../internal/temporalValue';

interface StepData extends Record<string, unknown> {
  type: SupportedType;
  step: number;
  base: number;
}

const step: Required<Pick<ValidatorDeclaration, 'init' | 'validate'>> = {
  init(targetElement, data) {
    const elementType = FormValidator.getElementType(targetElement);
    if (!isSupportedType(elementType)) {
      throw new Error('Unsupported element type');
    }
    const [stepRaw, baseRaw = ''] = data.argumentString.split(',').map((s) => s.trim());
    const stepArg = Number(stepRaw);
    if (!Number.isFinite(stepArg) || stepArg <= 0) {
      throw new Error('Invalid validator arguments');
    }
    let baseValue: number;
    if (baseRaw === '') {
      baseValue = DEFAULT_BASE[elementType];
    } else {
      baseValue = parseValue(elementType, baseRaw);
      if (Number.isNaN(baseValue)) {
        throw new Error('Invalid validator arguments');
      }
    }
    return new FormValidatorInitResult({
      observableElementList: [targetElement],
      extraData: {
        type: elementType,
        step: stepArg * SCALE[elementType],
        base: baseValue,
      } as StepData,
    });
  },

  validate(targetElement, data) {
    const { type, step: stepValue, base: baseValue } = data as StepData;
    const num = readElementValue(targetElement as HTMLInputElement, type);
    if (Number.isNaN(num)) {
      return new FormValidatorValidationResult({ isValid: true });
    }
    // Tolerance accounts for accumulated FP error (e.g. 0.1 + 0.1 + 0.1 ≠ 0.3).
    // Number.EPSILON is too tight; 1e-9 lines up with what native UAs use.
    const q = (num - baseValue) / stepValue;
    const isValid = Math.abs(q - Math.round(q)) < 1e-9;
    return new FormValidatorValidationResult({ isValid });
  },
};

export default step;
