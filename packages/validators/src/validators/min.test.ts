import { FormValidator, type FormValidatorValidationResult } from '@form-validator-js/core';
import { min } from '@form-validator-js/validators';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('min.init', () => {
  test('accepts integer and float arguments', () => {
    document.body.innerHTML = `<form id="f">
      <input type="number" data-validation="min(1.5)">
    </form>`;
    const form = document.getElementById('f') as HTMLFormElement;
    expect(() => {
      new FormValidator({ trigger: 'input',
        form,
        validatorDeclarations: { min },
      });
    }).not.toThrow();
  });

  test('rejects non-numeric argument', () => {
    document.body.innerHTML = `<form id="f">
      <input type="number" data-validation="min(abc)">
    </form>`;
    const form = document.getElementById('f') as HTMLFormElement;
    expect(() => {
      new FormValidator({ trigger: 'input',
        form,
        validatorDeclarations: { min },
      });
    }).toThrowError('Invalid validator arguments');
  });

  test('rejects unsupported element type', () => {
    document.body.innerHTML = `<form id="f">
      <input type="text" data-validation="min(1)">
    </form>`;
    const form = document.getElementById('f') as HTMLFormElement;
    expect(() => {
      new FormValidator({ trigger: 'input',
        form,
        validatorDeclarations: { min },
      });
    }).toThrowError('Unsupported element type');
  });

  test('rejects malformed date argument', () => {
    document.body.innerHTML = `<form id="f">
      <input type="date" data-validation="min(2026-13-99)">
    </form>`;
    const form = document.getElementById('f') as HTMLFormElement;
    expect(() => {
      new FormValidator({ trigger: 'input',
        form,
        validatorDeclarations: { min },
      });
    }).toThrowError('Invalid validator arguments');
  });
});

describe('min.validate', () => {
  test('values >= bound pass; below fails; empty passes', () => {
    document.body.innerHTML = `<form id="f">
      <input type="number" data-validation="min(10)">
    </form>`;
    const form = document.getElementById('f') as HTMLFormElement;
    const input = document.querySelector<HTMLInputElement>('input')!;
    const minMock = {
      init: vi.fn(min.init),
      validate: vi.fn(min.validate),
    };

    new FormValidator({ trigger: 'input',
      form,
      validatorDeclarations: { min: minMock },
    });

    const cases: Array<[string, boolean]> = [
      ['', true],
      ['9', false],
      ['10', true],
      ['10.5', true],
      ['-5', false],
    ];

    for (const [value] of cases) {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    expect(
      minMock.validate.mock.results.map(
        (r) => (r.value as FormValidatorValidationResult).isValid,
      ),
    ).toEqual(cases.map(([, expected]) => expected));
  });

  test.each([
    ['date', 'min(2026-01-01)', '2025-12-31', false],
    ['date', 'min(2026-01-01)', '2026-01-01', true],
    ['date', 'min(2026-01-01)', '2026-06-15', true],
    ['time', 'min(09:00)', '08:59', false],
    ['time', 'min(09:00)', '09:00', true],
    ['time', 'min(17:30)', '17:30:00', true],
    ['month', 'min(2026-01)', '2025-12', false],
    ['month', 'min(2026-01)', '2026-01', true],
    ['week', 'min(2026-W10)', '2026-W09', false],
    ['week', 'min(2026-W10)', '2026-W10', true],
    ['datetime-local', 'min(2026-01-01T09:00)', '2026-01-01T08:59', false],
    ['datetime-local', 'min(2026-01-01T09:00)', '2026-01-01T09:00', true],
  ])('%s with %s and value %s → isValid=%s', (type, dsl, value, expected) => {
    document.body.innerHTML = `<form id="f">
      <input type="${type}" data-validation="${dsl}">
    </form>`;
    const form = document.getElementById('f') as HTMLFormElement;
    const input = document.querySelector<HTMLInputElement>('input')!;
    const minMock = {
      init: vi.fn(min.init),
      validate: vi.fn(min.validate),
    };

    new FormValidator({ trigger: 'input',
      form,
      validatorDeclarations: { min: minMock },
    });

    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));

    const last = minMock.validate.mock.results.at(-1)!.value as FormValidatorValidationResult;
    expect(last.isValid).toBe(expected);
  });

  test('badInput passes (defers to numeric)', () => {
    document.body.innerHTML = `<form id="f">
      <input type="number" data-validation="min(10)">
    </form>`;
    const form = document.getElementById('f') as HTMLFormElement;
    const input = document.querySelector<HTMLInputElement>('input')!;
    const minMock = {
      init: vi.fn(min.init),
      validate: vi.fn(min.validate),
    };

    new FormValidator({ trigger: 'input',
      form,
      validatorDeclarations: { min: minMock },
    });

    Object.defineProperty(input, 'validity', {
      configurable: true,
      get: () => ({ badInput: true }),
    });
    input.value = '';
    input.dispatchEvent(FormValidator.createValidateEvent());

    const last = minMock.validate.mock.results.at(-1)!.value as FormValidatorValidationResult;
    expect(last.isValid).toBe(true);
  });
});
