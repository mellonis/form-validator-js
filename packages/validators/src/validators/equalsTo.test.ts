import { FormValidator, type FormValidatorInitResult, type FormValidatorValidationResult } from '@form-validator-js/core';
import { equalsTo } from '@form-validator-js/validators';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('equalTo.init', () => {
  test('valid parameters', () => {
    document.body.innerHTML = `<form id="attrs-test">
  <input type="text" id="that" name="equal-to" data-validation="equal-to(other)">
  <input type="text" id="other">
  </form>`;

    const form = document.getElementById('attrs-test') as HTMLFormElement;
    const equalToMock = {
      init: vi.fn(equalsTo.init),
      validate: vi.fn(equalsTo.validate),
    };

    new FormValidator({ trigger: 'input',
      form,
      validatorDeclarations: { 'equal-to': equalToMock },
    });

    const that = form.querySelector<HTMLInputElement>('#that');
    const other = form.querySelector<HTMLInputElement>('#other');

    expect(equalToMock.init.mock.calls.length).toBe(1);
    expect(equalToMock.init.mock.calls[0][0]).toBe(that);
    expect((equalToMock.init.mock.results[0].value as FormValidatorInitResult).observableElementList)
      .toEqual([that, other]);
  });

  test('invalid parameters', () => {
    document.body.innerHTML = `<form id="attrs-test">
  <input type="text" id="that" name="equal-to" data-validation="equal-to(other)">
  <input type="text" id="notother">
  </form>`;

    const form = document.getElementById('attrs-test') as HTMLFormElement;

    expect(() => {
      new FormValidator({ trigger: 'input',
        form,
        validatorDeclarations: { 'equal-to': equalsTo },
      });
    }).toThrowError('There is no \'#other\' element');
  });
});

describe('equalTo.validate', () => {
  test('validator called', () => {
    document.body.innerHTML = `<form id="attrs-test">
    <input type="text" id="that" name="equal-to" data-validation="equal-to(other)">
    <input type="text" id="other">
    </form>`;

    const form = document.getElementById('attrs-test') as HTMLFormElement;
    const equalToMock = {
      init: vi.fn(equalsTo.init),
      validate: vi.fn(equalsTo.validate),
    };

    new FormValidator({ trigger: 'input',
      form,
      validatorDeclarations: { 'equal-to': equalToMock },
    });

    const that = form.querySelector<HTMLInputElement>('#that')!;
    const other = form.querySelector<HTMLInputElement>('#other')!;

    that.value = 'val1';
    other.value = that.value;

    that.dispatchEvent(FormValidator.createValidateEvent());
    other.dispatchEvent(FormValidator.createValidateEvent());

    other.value = 'val2';

    that.dispatchEvent(FormValidator.createValidateEvent());
    other.dispatchEvent(FormValidator.createValidateEvent());

    that.value = other.value;

    that.dispatchEvent(FormValidator.createValidateEvent());
    other.dispatchEvent(FormValidator.createValidateEvent());

    expect(
      equalToMock.validate.mock.results.map(
        (result) => (result.value as FormValidatorValidationResult).isValid,
      ),
    ).toEqual([true, false, true]);
  });
});
