import { FormValidator, type FormValidatorValidationResult } from '@form-validator-js/core';
import { numeric } from '@form-validator-js/validators';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('numeric.init', () => {
  test.each(['number', 'date', 'time', 'month', 'week', 'datetime-local'])(
    'accepts type=%s',
    (type) => {
      document.body.innerHTML = `<form id="f">
        <input type="${type}" data-validation="numeric">
      </form>`;
      const form = document.getElementById('f') as HTMLFormElement;

      expect(() => {
        new FormValidator({ trigger: 'input',
          form,
          validatorDeclarations: { numeric },
        });
      }).not.toThrow();
    },
  );

  test('rejects unsupported element types', () => {
    document.body.innerHTML = `<form id="f">
      <input type="text" data-validation="numeric">
    </form>`;
    const form = document.getElementById('f') as HTMLFormElement;

    expect(() => {
      new FormValidator({ trigger: 'input',
        form,
        validatorDeclarations: { numeric },
      });
    }).toThrowError('Unsupported element type');
  });
});

describe('numeric.validate', () => {
  test('empty value passes; parseable values pass', () => {
    document.body.innerHTML = `<form id="f">
      <input type="number" data-validation="numeric">
    </form>`;
    const form = document.getElementById('f') as HTMLFormElement;
    const input = document.querySelector<HTMLInputElement>('input')!;
    const numericMock = {
      init: vi.fn(numeric.init),
      validate: vi.fn(numeric.validate),
    };

    new FormValidator({ trigger: 'input',
      form,
      validatorDeclarations: { numeric: numericMock },
    });

    const cases: Array<[string, boolean]> = [
      ['', true],
      ['0', true],
      ['42', true],
      ['-3.14', true],
      ['1e5', true],
    ];

    for (const [value] of cases) {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    expect(
      numericMock.validate.mock.results.map(
        (r) => (r.value as FormValidatorValidationResult).isValid,
      ),
    ).toEqual(cases.map(([, expected]) => expected));
  });

  test('rejects when validity.badInput is true (browser typing path)', () => {
    // In real browsers, typing "12abc" into a number field sanitizes
    // `value` to '' and sets `validity.badInput = true`. Setting `value` from
    // JS is also sanitized but does not flip badInput, so we mock it here to
    // simulate the typing path that jsdom can't reproduce on its own.
    document.body.innerHTML = `<form id="f">
      <input type="number" data-validation="numeric">
    </form>`;
    const form = document.getElementById('f') as HTMLFormElement;
    const input = document.querySelector<HTMLInputElement>('input')!;
    const numericMock = {
      init: vi.fn(numeric.init),
      validate: vi.fn(numeric.validate),
    };

    new FormValidator({ trigger: 'input',
      form,
      validatorDeclarations: { numeric: numericMock },
    });

    Object.defineProperty(input, 'validity', {
      configurable: true,
      get: () => ({ badInput: true }),
    });
    input.dispatchEvent(FormValidator.createValidateEvent());

    const last = numericMock.validate.mock.results.at(-1)!.value as FormValidatorValidationResult;
    expect(last.isValid).toBe(false);
  });

  test.each([
    ['date', '2026-05-10', true],
    ['date', '2026-13-99', false],
    ['date', '2026/05/10', false],
    ['time', '09:30', true],
    ['time', '25:00', false],
    ['month', '2026-05', true],
    ['month', '2026-13', false],
    ['week', '2026-W10', true],
    ['week', '2026-W99', false],
    ['datetime-local', '2026-05-10T09:30', true],
    ['datetime-local', '2026-05-10', false],
  ])('type=%s with value %s → isValid=%s', (type, value, expected) => {
    document.body.innerHTML = `<form id="f">
      <input type="${type}" data-validation="numeric">
    </form>`;
    const form = document.getElementById('f') as HTMLFormElement;
    const input = document.querySelector<HTMLInputElement>('input')!;
    const numericMock = {
      init: vi.fn(numeric.init),
      validate: vi.fn(numeric.validate),
    };

    new FormValidator({ trigger: 'input',
      form,
      validatorDeclarations: { numeric: numericMock },
    });

    // Some browsers / jsdom versions sanitize unparseable values for date-like
    // inputs to ''. Override the getter so the defensive parse-side check is
    // exercised regardless of sanitization behavior.
    Object.defineProperty(input, 'value', {
      configurable: true,
      get: () => value,
    });
    input.dispatchEvent(FormValidator.createValidateEvent());

    const last = numericMock.validate.mock.results.at(-1)!.value as FormValidatorValidationResult;
    expect(last.isValid).toBe(expected);
  });

  test('rejects unparseable string when value is not sanitized (defensive parse path)', () => {
    // Belt-and-braces guard: if a value somehow gets through without
    // sanitization (test runner, future spec change, custom element), the
    // Number()-NaN check rejects it.
    document.body.innerHTML = `<form id="f">
      <input type="number" data-validation="numeric">
    </form>`;
    const form = document.getElementById('f') as HTMLFormElement;
    const input = document.querySelector<HTMLInputElement>('input')!;
    const numericMock = {
      init: vi.fn(numeric.init),
      validate: vi.fn(numeric.validate),
    };

    new FormValidator({ trigger: 'input',
      form,
      validatorDeclarations: { numeric: numericMock },
    });

    Object.defineProperty(input, 'value', {
      configurable: true,
      get: () => 'abc',
    });
    input.dispatchEvent(FormValidator.createValidateEvent());

    const last = numericMock.validate.mock.results.at(-1)!.value as FormValidatorValidationResult;
    expect(last.isValid).toBe(false);
  });
});
