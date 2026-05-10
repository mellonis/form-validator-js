import {
  FormValidator,
  FormValidatorInitResult,
  FormValidatorValidationResult,
  type FormElement,
  type ValidatorDeclaration,
} from '@form-validator-js/core';

interface RequiredData extends Record<string, unknown> {
  elementType: string;
  elementList: FormElement[];
}

const required: Required<Pick<ValidatorDeclaration, 'init' | 'validate'>> = {
  init(targetElement) {
    const elementType = FormValidator.getElementType(targetElement);
    const elementList: FormElement[] = [];

    switch (elementType) {
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
      case 'file':
      case 'textarea':
      case 'select':
        elementList.push(targetElement);
        break;
      case 'checkbox':
      case 'radio': {
        const name = targetElement.getAttribute('name');
        if (name) {
          elementList.push(
            ...Array.from(document.getElementsByName(name)).filter(
              (el): el is FormElement => (
                el instanceof HTMLInputElement
                || el instanceof HTMLSelectElement
                || el instanceof HTMLTextAreaElement
              ),
            ),
          );
        } else {
          elementList.push(targetElement);
        }
        break;
      }
      default:
        throw new Error('Unsupported element type');
    }

    const extraData = { elementType } as RequiredData;
    Object.defineProperty(extraData, 'elementList', {
      enumerable: true,
      get() {
        return [...elementList];
      },
    });

    return new FormValidatorInitResult({
      observableElementList: elementList,
      extraData,
    });
  },

  validate(targetElement, data) {
    const { elementType, elementList } = data as RequiredData;
    let isContextError = false;
    let isValid = false;

    switch (elementType) {
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
      case 'file':
      case 'textarea':
      case 'select':
        isContextError = false;
        isValid = (elementList[0] as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value.length > 0;
        break;
      case 'checkbox':
      case 'radio':
        isContextError = true;
        isValid = elementList.filter((el) => (el as HTMLInputElement).checked).length > 0;
        break;
      default:
        break;
    }

    return new FormValidatorValidationResult({ isContextError, isValid });
  },
};

export default required;
