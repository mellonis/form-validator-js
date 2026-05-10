import {
  FormValidator,
  FormValidatorInitResult,
  FormValidatorValidationResult,
  type FormElement,
  type ValidatorDeclaration,
} from '@form-validator-js/core';

interface CheckedCountData extends Record<string, unknown> {
  minCount: number;
  maxCount: number;
  elementList: FormElement[];
}

const checkedCount: Required<Pick<ValidatorDeclaration, 'init' | 'validate'>> = {
  init(targetElement, data) {
    const elementType = FormValidator.getElementType(targetElement);
    let observableElementList: FormElement[];

    switch (elementType) {
      case 'checkbox':
      case 'radio': {
        const name = targetElement.getAttribute('name');
        if (name) {
          observableElementList = Array.from(document.getElementsByName(name)).filter(
            (el): el is HTMLInputElement => (
              el instanceof HTMLInputElement && el.type === elementType
            ),
          );
        } else {
          observableElementList = [targetElement];
        }
        break;
      }
      default:
        throw new Error('Unsupported element type');
    }

    const boundList: Array<number | null> = data.argumentString
      .trim()
      .split(',')
      .slice(0, 2)
      .map((bound) => {
        const parsed = parseInt(bound, 10);
        return Number.isNaN(parsed) ? null : parsed;
      });

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
        if (boundList[0] == null) boundList[0] = 0;
        if (boundList[1] == null) boundList[1] = Infinity;
        break;
      default:
        break;
    }

    const extraData: CheckedCountData = {
      minCount: boundList[0] as number,
      maxCount: boundList[1] as number,
      elementList: [],
    };
    Object.defineProperty(extraData, 'elementList', {
      enumerable: true,
      get() {
        return [...observableElementList];
      },
    });

    return new FormValidatorInitResult({
      observableElementList,
      extraData,
    });
  },

  validate(_targetElement, data) {
    const { minCount, maxCount, elementList } = data as CheckedCountData;
    const checked = elementList.filter((element) => (element as HTMLInputElement).checked).length;
    return new FormValidatorValidationResult({
      isContextError: true,
      isValid: minCount <= checked && checked <= maxCount,
    });
  },
};

export default checkedCount;
