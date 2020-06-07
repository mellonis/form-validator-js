import FormValidator from '@form-validator-js/core';
import { maxLength } from '@form-validator-js/validators';

describe('maxLength.init', () => {
  const validParametersList = [
    ['', {
      maxLength: 0,
    }],
    ['1', {
      maxLength: 1,
    }],
    ['2', {
      maxLength: 2,
    }],
  ];

  validParametersList.forEach(([validParameter, validResult]) => {
    test(`valid parameters (${validParameter})`, () => {
      document.body.innerHTML = `<form id="attrs-test">
  <input type="text" data-validation="max-length(${validParameter})">
  </form>`;

      const form = document.getElementById('attrs-test');
      const maxLengthMock = {
        init: jest.fn(maxLength.init),
        validate: jest.fn(maxLength.validate),
      };
      const input = form.querySelector('input');

      // eslint-disable-next-line no-new
      new FormValidator({
        form,
        validatorDeclarations: {
          'max-length': {
            ...maxLengthMock,
          },
        },
      });

      expect(maxLengthMock.init.mock.calls.length)
        .toBe(1);
      expect(maxLengthMock.init.mock.calls[0][0])
        .toBe(input);
      expect(maxLengthMock.init.mock.results[0].value.observableElementList)
        .toEqual([input]);
      expect({
        maxLength: maxLengthMock.init.mock.results[0].value.extraData.maxLength,
      })
        .toEqual(validResult);
    });
  });

  const invalidParametersList = [
    'a',
  ];

  invalidParametersList.forEach((invalidParameter) => {
    test(`invalid parameters (${invalidParameter})`, () => {
      document.body.innerHTML = `<form id="attrs-test">
  <input type="text" data-validation="max-length(${invalidParameter})">
  </form>`;

      const form = document.getElementById('attrs-test');

      expect(() => {
        // eslint-disable-next-line no-new
        new FormValidator({
          form,
          validatorDeclarations: {
            'max-length': {
              ...maxLength,
            },
          },
        });
      })
        .toThrowError('Invalid validator arguments');
    });
  });

  test('invalid element type', () => {
    document.body.innerHTML = `<form id="attrs-test">
    <input type="checkbox" data-validation="max-length(1)">
    </form>`;

    const form = document.getElementById('attrs-test');

    expect(() => {
      // eslint-disable-next-line no-new
      new FormValidator({
        form,
        validatorDeclarations: {
          'max-length': {
            ...maxLength,
          },
        },
      });
    })
      .toThrowError('Unsupported element type');
  });
});

describe('maxLength.validate', () => {
  test('validator called', () => {
    const maxLengthValue = 3;

    document.body.innerHTML = `<form id="attrs-test">    
    <input type="text" data-validation="max-length(${maxLengthValue})">
    </form>`;
    const form = document.getElementById('attrs-test');
    const maxLengthMock = {
      init: jest.fn(maxLength.init),
      validate: jest.fn(maxLength.validate),
    };

    // eslint-disable-next-line no-new
    new FormValidator({
      form,
      validatorDeclarations: {
        'max-length': {
          ...maxLengthMock,
        },
      },
    });

    const input = document.querySelector('input');

    const validList = ['', '1', '22', '333', '4444', '333', '22', '1', ''].map((value) => {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));

      return value.length <= maxLengthValue;
    });

    expect(maxLengthMock.validate.mock.results.map((result) => result.value.isValid))
      .toEqual(validList);
  });
});
