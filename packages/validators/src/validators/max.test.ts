import { FormValidator, type FormValidatorValidationResult } from '@form-validator-js/core';
import { max } from '@form-validator-js/validators';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('max.init', () => {
  test('rejects non-numeric argument', () => {
    document.body.innerHTML = `<form id="f">
      <input type="number" data-validation="max(abc)">
    </form>`;
    const form = document.getElementById('f') as HTMLFormElement;
    expect(() => {
      new FormValidator({ trigger: 'input',
        form,
        validatorDeclarations: { max },
      });
    }).toThrowError('Invalid validator arguments');
  });

  test('rejects unsupported element type', () => {
    document.body.innerHTML = `<form id="f">
      <input type="text" data-validation="max(10)">
    </form>`;
    const form = document.getElementById('f') as HTMLFormElement;
    expect(() => {
      new FormValidator({ trigger: 'input',
        form,
        validatorDeclarations: { max },
      });
    }).toThrowError('Unsupported element type');
  });
});

describe('max.validate', () => {
  test('values <= bound pass; above fails; empty passes', () => {
    document.body.innerHTML = `<form id="f">
      <input type="number" data-validation="max(10)">
    </form>`;
    const form = document.getElementById('f') as HTMLFormElement;
    const input = document.querySelector<HTMLInputElement>('input')!;
    const maxMock = {
      init: vi.fn(max.init),
      validate: vi.fn(max.validate),
    };

    new FormValidator({ trigger: 'input',
      form,
      validatorDeclarations: { max: maxMock },
    });

    const cases: Array<[string, boolean]> = [
      ['', true],
      ['9', true],
      ['10', true],
      ['10.5', false],
      ['-5', true],
    ];

    for (const [value] of cases) {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    expect(
      maxMock.validate.mock.results.map(
        (r) => (r.value as FormValidatorValidationResult).isValid,
      ),
    ).toEqual(cases.map(([, expected]) => expected));
  });

  test.each([
    ['date', 'max(2026-12-31)', '2027-01-01', false],
    ['date', 'max(2026-12-31)', '2026-12-31', true],
    ['time', 'max(17:00)', '17:00:01', false],
    ['time', 'max(17:00)', '17:00', true],
    ['month', 'max(2026-12)', '2027-01', false],
    ['month', 'max(2026-12)', '2026-12', true],
    ['week', 'max(2026-W52)', '2027-W01', false],
    ['week', 'max(2026-W52)', '2026-W52', true],
    ['datetime-local', 'max(2026-12-31T23:59)', '2027-01-01T00:00', false],
    ['datetime-local', 'max(2026-12-31T23:59)', '2026-12-31T23:59', true],
  ])('%s with %s and value %s → isValid=%s', (type, dsl, value, expected) => {
    document.body.innerHTML = `<form id="f">
      <input type="${type}" data-validation="${dsl}">
    </form>`;
    const form = document.getElementById('f') as HTMLFormElement;
    const input = document.querySelector<HTMLInputElement>('input')!;
    const maxMock = {
      init: vi.fn(max.init),
      validate: vi.fn(max.validate),
    };

    new FormValidator({ trigger: 'input',
      form,
      validatorDeclarations: { max: maxMock },
    });

    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));

    const last = maxMock.validate.mock.results.at(-1)!.value as FormValidatorValidationResult;
    expect(last.isValid).toBe(expected);
  });
});
