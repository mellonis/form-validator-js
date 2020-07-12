import { FormValidator } from '@form-validator-js/core';
import { equalTo } from '@form-validator-js/validators';

describe('equalTo.init', () => {
  test('valid parameters', () => {
    document.body.innerHTML = `<form id="attrs-test">
  <input type="text" id="that" name="equal-to" data-validation="equal-to(other)">
  <input type="text" id="other">
  </form>`;

    const form = document.getElementById('attrs-test');
    const equalToMock = {
      init: jest.fn(equalTo.init),
      validate: jest.fn(equalTo.validate),
    };

    // eslint-disable-next-line no-new
    new FormValidator({
      form,
      validatorDeclarations: {
        'equal-to': {
          ...equalToMock,
        },
      },
    });

    const that = form.querySelector('#that');
    const other = form.querySelector('#other');

    expect(equalToMock.init.mock.calls.length)
      .toBe(1);
    expect(equalToMock.init.mock.calls[0][0])
      .toBe(that);
    expect(equalToMock.init.mock.results[0].value.observableElementList)
      .toEqual([that, other]);
  });
  test('invalid parameters', () => {
    document.body.innerHTML = `<form id="attrs-test">
  <input type="text" id="that" name="equal-to" data-validation="equal-to(other)">
  <input type="text" id="notother">
  </form>`;

    const form = document.getElementById('attrs-test');

    expect(() => {
      // eslint-disable-next-line no-new
      new FormValidator({
        form,
        validatorDeclarations: {
          'equal-to': equalTo,
        },
      });
    })
      .toThrowError('There is no \'#other\' element');
  });
});

describe('equalTo.validate', () => {
  test('validator called', () => {
    document.body.innerHTML = `<form id="attrs-test">
    <input type="text" id="that" name="equal-to" data-validation="equal-to(other)">
    <input type="text" id="other">
    </form>`;

    const form = document.getElementById('attrs-test');
    const equalToMock = {
      init: jest.fn(equalTo.init),
      validate: jest.fn(equalTo.validate),
    };

    // eslint-disable-next-line no-new
    new FormValidator({
      form,
      validatorDeclarations: {
        'equal-to': {
          ...equalToMock,
        },
      },
    });

    const that = form.querySelector('#that');
    const other = form.querySelector('#other');

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

    expect(equalToMock.validate.mock.results.map((result) => result.value.isValid))
      .toEqual([true, false, true]);
  });
});
