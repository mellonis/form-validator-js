import { FormValidator } from '@form-validator-js/core';
import { minLength } from '@form-validator-js/validators';

describe('minLength.init', () => {
  const validParametersList = [
    ['', {
      minLength: 0,
    }],
    ['1', {
      minLength: 1,
    }],
    ['2', {
      minLength: 2,
    }],
  ];

  validParametersList.forEach(([validParameter, validResult]) => {
    test(`valid parameters (${validParameter})`, () => {
      document.body.innerHTML = `<form id="attrs-test">
  <input type="text" data-validation="min-length(${validParameter})">
  </form>`;

      const form = document.getElementById('attrs-test');
      const minLengthMock = {
        init: jest.fn(minLength.init),
        validate: jest.fn(minLength.validate),
      };
      const input = form.querySelector('input');

      // eslint-disable-next-line no-new
      new FormValidator({
        form,
        validatorDeclarations: {
          'min-length': {
            ...minLengthMock,
          },
        },
      });

      expect(minLengthMock.init.mock.calls.length)
        .toBe(1);
      expect(minLengthMock.init.mock.calls[0][0])
        .toBe(input);
      expect(minLengthMock.init.mock.results[0].value.observableElementList)
        .toEqual([input]);
      expect({
        minLength: minLengthMock.init.mock.results[0].value.extraData.minLength,
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
  <input type="text" data-validation="min-length(${invalidParameter})">
  </form>`;

      const form = document.getElementById('attrs-test');

      expect(() => {
        // eslint-disable-next-line no-new
        new FormValidator({
          form,
          validatorDeclarations: {
            'min-length': {
              ...minLength,
            },
          },
        });
      })
        .toThrowError('Invalid validator arguments');
    });
  });

  test('invalid element type', () => {
    document.body.innerHTML = `<form id="attrs-test">
    <input type="checkbox" data-validation="min-length(1)">
    </form>`;

    const form = document.getElementById('attrs-test');

    expect(() => {
      // eslint-disable-next-line no-new
      new FormValidator({
        form,
        validatorDeclarations: {
          'min-length': {
            ...minLength,
          },
        },
      });
    })
      .toThrowError('Unsupported element type');
  });
});

describe('minLength.validate', () => {
  test('validator called', () => {
    const minLengthValue = 3;

    document.body.innerHTML = `<form id="attrs-test">
    <input type="text" data-validation="min-length(${minLengthValue})">
    </form>`;
    const form = document.getElementById('attrs-test');
    const minLengthMock = {
      init: jest.fn(minLength.init),
      validate: jest.fn(minLength.validate),
    };

    // eslint-disable-next-line no-new
    new FormValidator({
      form,
      validatorDeclarations: {
        'min-length': {
          ...minLengthMock,
        },
      },
    });

    const input = document.querySelector('input');

    const validList = ['', '1', '22', '333', '4444', '333', '22', '1', ''].map((value) => {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));

      return value.length >= minLengthValue;
    });

    expect(minLengthMock.validate.mock.results.map((result) => result.value.isValid))
      .toEqual(validList);
  });
});
