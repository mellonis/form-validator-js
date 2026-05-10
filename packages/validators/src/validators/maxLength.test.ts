import { FormValidator, type FormValidatorInitResult, type FormValidatorValidationResult } from '@form-validator-js/core';
import { maxLength } from '@form-validator-js/validators';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('maxLength.init', () => {
  const validParametersList: Array<[string, { maxLength: number }]> = [
    ['', { maxLength: 0 }],
    ['1', { maxLength: 1 }],
    ['2', { maxLength: 2 }],
  ];

  validParametersList.forEach(([validParameter, validResult]) => {
    test(`valid parameters (${validParameter})`, () => {
      document.body.innerHTML = `<form id="attrs-test">
  <input type="text" data-validation="max-length(${validParameter})">
  </form>`;

      const form = document.getElementById('attrs-test') as HTMLFormElement;
      const maxLengthMock = {
        init: vi.fn(maxLength.init),
        validate: vi.fn(maxLength.validate),
      };
      const input = form.querySelector<HTMLInputElement>('input');

      new FormValidator({ trigger: 'input',
        form,
        validatorDeclarations: { 'max-length': maxLengthMock },
      });

      const initResult = maxLengthMock.init.mock.results[0].value as FormValidatorInitResult;
      expect(maxLengthMock.init.mock.calls.length).toBe(1);
      expect(maxLengthMock.init.mock.calls[0][0]).toBe(input);
      expect(initResult.observableElementList).toEqual([input]);
      expect({ maxLength: initResult.extraData.maxLength }).toEqual(validResult);
    });
  });

  const invalidParametersList = ['a'];

  invalidParametersList.forEach((invalidParameter) => {
    test(`invalid parameters (${invalidParameter})`, () => {
      document.body.innerHTML = `<form id="attrs-test">
  <input type="text" data-validation="max-length(${invalidParameter})">
  </form>`;

      const form = document.getElementById('attrs-test') as HTMLFormElement;

      expect(() => {
        new FormValidator({ trigger: 'input',
          form,
          validatorDeclarations: { 'max-length': maxLength },
        });
      }).toThrowError('Invalid validator arguments');
    });
  });

  test('invalid element type', () => {
    document.body.innerHTML = `<form id="attrs-test">
    <input type="checkbox" data-validation="max-length(1)">
    </form>`;

    const form = document.getElementById('attrs-test') as HTMLFormElement;

    expect(() => {
      new FormValidator({ trigger: 'input',
        form,
        validatorDeclarations: { 'max-length': maxLength },
      });
    }).toThrowError('Unsupported element type');
  });

  test('rejects type=file (fake-path value would be misleading)', () => {
    document.body.innerHTML = `<form id="attrs-test">
      <input type="file" data-validation="max-length(10)">
    </form>`;
    const form = document.getElementById('attrs-test') as HTMLFormElement;

    expect(() => {
      new FormValidator({ trigger: 'input',
        form,
        validatorDeclarations: { 'max-length': maxLength },
      });
    }).toThrowError('Unsupported element type');
  });
});

describe('maxLength.validate', () => {
  test('validator called', () => {
    const maxLengthValue = 3;

    document.body.innerHTML = `<form id="attrs-test">
    <input type="text" data-validation="max-length(${maxLengthValue})">
    </form>`;
    const form = document.getElementById('attrs-test') as HTMLFormElement;
    const maxLengthMock = {
      init: vi.fn(maxLength.init),
      validate: vi.fn(maxLength.validate),
    };

    new FormValidator({ trigger: 'input',
      form,
      validatorDeclarations: { 'max-length': maxLengthMock },
    });

    const input = document.querySelector<HTMLInputElement>('input')!;

    const validList = ['', '1', '22', '333', '4444', '333', '22', '1', ''].map((value) => {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return value.length <= maxLengthValue;
    });

    expect(
      maxLengthMock.validate.mock.results.map(
        (result) => (result.value as FormValidatorValidationResult).isValid,
      ),
    ).toEqual(validList);
  });

  test('counts UTF-16 code units (matches native maxlength)', () => {
    // Native HTML maxlength counts code units via `.length`. A non-BMP code
    // point like '😀' is two code units, so maxLength(3) rejects '😀😀'.
    document.body.innerHTML = `<form id="attrs-test">
      <input type="text" data-validation="max-length(3)">
    </form>`;
    const form = document.getElementById('attrs-test') as HTMLFormElement;
    const input = document.querySelector<HTMLInputElement>('input')!;
    const maxLengthMock = {
      init: vi.fn(maxLength.init),
      validate: vi.fn(maxLength.validate),
    };

    new FormValidator({ trigger: 'input',
      form,
      validatorDeclarations: { 'max-length': maxLengthMock },
    });

    const cases: Array<[string, boolean]> = [
      ['😀', true],      // 2 code units ≤ 3
      ['😀a', true],     // 3 code units ≤ 3
      ['😀😀', false],   // 4 code units > 3
    ];

    for (const [value] of cases) {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    expect(
      maxLengthMock.validate.mock.results.map(
        (r) => (r.value as FormValidatorValidationResult).isValid,
      ),
    ).toEqual(cases.map(([, expected]) => expected));
  });
});
