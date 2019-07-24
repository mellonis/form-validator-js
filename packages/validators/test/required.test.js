import FormValidator from '@form-validator-js/core';
import validators from '@form-validator-js/validators';

describe('init', () => {
  test('text input', () => {
    document.body.innerHTML = `<form id="attrs-test">
  <input type="text" id="that" data-validation="required">
  </form>`;

    const form = document.getElementById('attrs-test');
    const requiredMock = {
      init: jest.fn(validators.required.init),
      validate: jest.fn(validators.required.validate),
    };

    // eslint-disable-next-line no-new
    new FormValidator({
      form,
      validatorDeclarations: {
        required: {
          ...requiredMock,
        },
      },
    });

    const that = form.querySelector('#that');

    expect(requiredMock.init.mock.calls.length)
      .toBe(1);
    expect(requiredMock.init.mock.calls[0][0])
      .toBe(that);
    expect(requiredMock.init.mock.results[0].value)
      .toEqual([that]);
  });

  test('checkbox input', () => {
    document.body.innerHTML = `<form id="attrs-test">
  <input type="checkbox" id="that" name="required" data-validation="required">
  <input type="checkbox" id="other" name="required">
  </form>`;

    const form = document.getElementById('attrs-test');
    const requiredMock = {
      init: jest.fn(validators.required.init),
      validate: jest.fn(validators.required.validate),
    };

    // eslint-disable-next-line no-new
    new FormValidator({
      form,
      validatorDeclarations: {
        required: {
          ...requiredMock,
        },
      },
    });

    const that = form.querySelector('#that');
    const other = form.querySelector('#other');

    expect(requiredMock.init.mock.calls.length)
      .toBe(1);
    expect(requiredMock.init.mock.calls[0][0])
      .toBe(that);
    expect(requiredMock.init.mock.results[0].value)
      .toEqual([that, other]);
  });

  test('unsupported type', () => {
    document.body.innerHTML = `<form id="attrs-test">
  <div data-validation="required">
  </form>`;

    const form = document.getElementById('attrs-test');

    expect(() => {
      // eslint-disable-next-line no-new
      new FormValidator({
        form,
        validatorDeclarations: {
          required: validators.required,
        },
      });
    }).toThrowError();
  });
});

describe('validate', () => {
  test('text input', () => {
    document.body.innerHTML = `<form id="attrs-test">
  <input type="text" id="that" name="equal-to" data-validation="required">
  </form>`;

    const form = document.getElementById('attrs-test');
    const requiredMock = {
      init: jest.fn(validators.required.init),
      validate: jest.fn(validators.required.validate),
    };

    // eslint-disable-next-line no-new
    new FormValidator({
      form,
      validatorDeclarations: {
        required: {
          ...requiredMock,
        },
      },
    });

    const that = form.querySelector('#that');

    that.value = '';
    that.dispatchEvent(new Event('input', { bubbles: true }));
    that.value = 'some text';
    that.dispatchEvent(new Event('input', { bubbles: true }));
    that.value = '';
    that.dispatchEvent(new Event('input', { bubbles: true }));
    expect(requiredMock.validate.mock.results.map(result => result.value.isValid))
      .toEqual([false, true, false]);
  });

  test('checkbox input', () => {
    document.body.innerHTML = `<form id="attrs-test">
  <input type="checkbox" id="that" name="required" data-validation="required">
  <input type="checkbox" id="other" name="required">
  </form>`;

    const form = document.getElementById('attrs-test');
    const requiredMock = {
      init: jest.fn(validators.required.init),
      validate: jest.fn(validators.required.validate),
    };

    // eslint-disable-next-line no-new
    new FormValidator({
      form,
      validatorDeclarations: {
        required: {
          ...requiredMock,
        },
      },
    });

    const that = form.querySelector('#that');
    const other = form.querySelector('#other');

    that.checked = true;
    that.dispatchEvent(new Event('input', { bubbles: true }));
    that.checked = false;
    that.dispatchEvent(new Event('input', { bubbles: true }));
    other.checked = true;
    other.dispatchEvent(new Event('input', { bubbles: true }));
    other.checked = false;
    other.dispatchEvent(new Event('input', { bubbles: true }));

    expect(requiredMock.validate.mock.results.map(result => result.value.isValid))
      .toEqual([true, false, true, false]);
  });
});
