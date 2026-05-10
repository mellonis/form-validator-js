import {
  FormValidatorInitResult,
  FormValidatorValidationResult,
  type ValidatorDeclaration,
} from '@form-validator-js/core';

interface EqualsToData extends Record<string, unknown> {
  otherElement: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
}

const equalsTo: Required<Pick<ValidatorDeclaration, 'init' | 'validate'>> = {
  init(targetElement, data) {
    const id = data.argumentString;
    const otherElement = document.getElementById(id) as
      | HTMLInputElement
      | HTMLTextAreaElement
      | HTMLSelectElement
      | null;

    if (otherElement == null) {
      throw new Error(`There is no '#${id}' element`);
    }

    return new FormValidatorInitResult({
      observableElementList: [targetElement, otherElement],
      extraData: { otherElement } as EqualsToData,
    });
  },

  validate(targetElement, data) {
    const { otherElement } = data as EqualsToData;
    // Strict (===) byte-equality. Unicode normalization is intentionally NOT
    // applied — visually identical strings in NFC vs NFD will compare unequal.
    // This matters for password matching, where byte-exactness is correct.
    return new FormValidatorValidationResult({
      isValid: (targetElement as HTMLInputElement).value === otherElement.value,
    });
  },
};

export default equalsTo;
