import { FormValidator, type FormValidatorInitResult, type FormValidatorValidationResult } from '@form-validator-js/core';
import { minLength } from '@form-validator-js/validators';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('minLength.init', () => {
  const validParametersList: Array<[string, { minLength: number }]> = [
    ['', { minLength: 0 }],
    ['1', { minLength: 1 }],
    ['2', { minLength: 2 }],
  ];

  validParametersList.forEach(([validParameter, validResult]) => {
    test(`valid parameters (${validParameter})`, () => {
      document.body.innerHTML = `<form id="attrs-test">
  <input type="text" data-validation="min-length(${validParameter})">
  </form>`;

      const form = document.getElementById('attrs-test') as HTMLFormElement;
      const minLengthMock = {
        init: vi.fn(minLength.init),
        validate: vi.fn(minLength.validate),
      };
      const input = form.querySelector<HTMLInputElement>('input');

      new FormValidator({ trigger: 'input',
        form,
        validatorDeclarations: { 'min-length': minLengthMock },
      });

      const initResult = minLengthMock.init.mock.results[0].value as FormValidatorInitResult;
      expect(minLengthMock.init.mock.calls.length).toBe(1);
      expect(minLengthMock.init.mock.calls[0][0]).toBe(input);
      expect(initResult.observableElementList).toEqual([input]);
      expect({ minLength: initResult.extraData.minLength }).toEqual(validResult);
    });
  });

  const invalidParametersList = ['a'];

  invalidParametersList.forEach((invalidParameter) => {
    test(`invalid parameters (${invalidParameter})`, () => {
      document.body.innerHTML = `<form id="attrs-test">
  <input type="text" data-validation="min-length(${invalidParameter})">
  </form>`;

      const form = document.getElementById('attrs-test') as HTMLFormElement;

      expect(() => {
        new FormValidator({ trigger: 'input',
          form,
          validatorDeclarations: { 'min-length': minLength },
        });
      }).toThrowError('Invalid validator arguments');
    });
  });

  test('invalid element type', () => {
    document.body.innerHTML = `<form id="attrs-test">
    <input type="checkbox" data-validation="min-length(1)">
    </form>`;

    const form = document.getElementById('attrs-test') as HTMLFormElement;

    expect(() => {
      new FormValidator({ trigger: 'input',
        form,
        validatorDeclarations: { 'min-length': minLength },
      });
    }).toThrowError('Unsupported element type');
  });
});

describe('minLength.validate', () => {
  test('validator called', () => {
    const minLengthValue = 3;

    document.body.innerHTML = `<form id="attrs-test">
    <input type="text" data-validation="min-length(${minLengthValue})">
    </form>`;
    const form = document.getElementById('attrs-test') as HTMLFormElement;
    const minLengthMock = {
      init: vi.fn(minLength.init),
      validate: vi.fn(minLength.validate),
    };

    new FormValidator({ trigger: 'input',
      form,
      validatorDeclarations: { 'min-length': minLengthMock },
    });

    const input = document.querySelector<HTMLInputElement>('input')!;

    const validList = ['', '1', '22', '333', '4444', '333', '22', '1', ''].map((value) => {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return value.length >= minLengthValue;
    });

    expect(
      minLengthMock.validate.mock.results.map(
        (result) => (result.value as FormValidatorValidationResult).isValid,
      ),
    ).toEqual(validList);
  });

  test('counts UTF-16 code units (matches native minlength)', () => {
    // Native HTML minlength counts code units via `.length`. A non-BMP code
    // point like '😀' is two code units, so minLength(3) accepts '😀😀'.
    document.body.innerHTML = `<form id="attrs-test">
      <input type="text" data-validation="min-length(3)">
    </form>`;
    const form = document.getElementById('attrs-test') as HTMLFormElement;
    const input = document.querySelector<HTMLInputElement>('input')!;
    const minLengthMock = {
      init: vi.fn(minLength.init),
      validate: vi.fn(minLength.validate),
    };

    new FormValidator({ trigger: 'input',
      form,
      validatorDeclarations: { 'min-length': minLengthMock },
    });

    const cases: Array<[string, boolean]> = [
      ['😀', false],     // 2 code units < 3
      ['😀a', true],     // 3 code units ≥ 3
      ['😀😀', true],    // 4 code units ≥ 3
    ];

    for (const [value] of cases) {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    expect(
      minLengthMock.validate.mock.results.map(
        (r) => (r.value as FormValidatorValidationResult).isValid,
      ),
    ).toEqual(cases.map(([, expected]) => expected));
  });
});
