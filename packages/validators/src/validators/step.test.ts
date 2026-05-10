import { FormValidator, type FormValidatorValidationResult } from '@form-validator-js/core';
import { step } from '@form-validator-js/validators';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('step.init', () => {
  test('accepts step(N)', () => {
    document.body.innerHTML = `<form id="f">
      <input type="number" data-validation="step(0.5)">
    </form>`;
    const form = document.getElementById('f') as HTMLFormElement;
    expect(() => {
      new FormValidator({ trigger: 'input',
        form,
        validatorDeclarations: { step },
      });
    }).not.toThrow();
  });

  test('accepts step(N, base)', () => {
    document.body.innerHTML = `<form id="f">
      <input type="number" data-validation="step(0.5, 1)">
    </form>`;
    const form = document.getElementById('f') as HTMLFormElement;
    expect(() => {
      new FormValidator({ trigger: 'input',
        form,
        validatorDeclarations: { step },
      });
    }).not.toThrow();
  });

  test('rejects zero or negative step', () => {
    document.body.innerHTML = `<form id="f">
      <input type="number" data-validation="step(0)">
    </form>`;
    const form = document.getElementById('f') as HTMLFormElement;
    expect(() => {
      new FormValidator({ trigger: 'input',
        form,
        validatorDeclarations: { step },
      });
    }).toThrowError('Invalid validator arguments');
  });

  test('rejects non-numeric step', () => {
    document.body.innerHTML = `<form id="f">
      <input type="number" data-validation="step(abc)">
    </form>`;
    const form = document.getElementById('f') as HTMLFormElement;
    expect(() => {
      new FormValidator({ trigger: 'input',
        form,
        validatorDeclarations: { step },
      });
    }).toThrowError('Invalid validator arguments');
  });

  test('rejects unsupported element type', () => {
    document.body.innerHTML = `<form id="f">
      <input type="text" data-validation="step(1)">
    </form>`;
    const form = document.getElementById('f') as HTMLFormElement;
    expect(() => {
      new FormValidator({ trigger: 'input',
        form,
        validatorDeclarations: { step },
      });
    }).toThrowError('Unsupported element type');
  });

  test('rejects malformed temporal base', () => {
    document.body.innerHTML = `<form id="f">
      <input type="date" data-validation="step(1, not-a-date)">
    </form>`;
    const form = document.getElementById('f') as HTMLFormElement;
    expect(() => {
      new FormValidator({ trigger: 'input',
        form,
        validatorDeclarations: { step },
      });
    }).toThrowError('Invalid validator arguments');
  });
});

describe('step.validate', () => {
  test('multiples of step pass; off-grid values fail', () => {
    document.body.innerHTML = `<form id="f">
      <input type="number" data-validation="step(0.5)">
    </form>`;
    const form = document.getElementById('f') as HTMLFormElement;
    const input = document.querySelector<HTMLInputElement>('input')!;
    const stepMock = {
      init: vi.fn(step.init),
      validate: vi.fn(step.validate),
    };

    new FormValidator({ trigger: 'input',
      form,
      validatorDeclarations: { step: stepMock },
    });

    const cases: Array<[string, boolean]> = [
      ['', true],
      ['0', true],
      ['0.5', true],
      ['1', true],
      ['1.5', true],
      ['0.3', false],
      ['1.1', false],
      ['-1', true],
      ['-0.5', true],
    ];

    for (const [value] of cases) {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    expect(
      stepMock.validate.mock.results.map(
        (r) => (r.value as FormValidatorValidationResult).isValid,
      ),
    ).toEqual(cases.map(([, expected]) => expected));
  });

  test('base shifts the grid', () => {
    document.body.innerHTML = `<form id="f">
      <input type="number" data-validation="step(2, 1)">
    </form>`;
    const form = document.getElementById('f') as HTMLFormElement;
    const input = document.querySelector<HTMLInputElement>('input')!;
    const stepMock = {
      init: vi.fn(step.init),
      validate: vi.fn(step.validate),
    };

    new FormValidator({ trigger: 'input',
      form,
      validatorDeclarations: { step: stepMock },
    });

    const cases: Array<[string, boolean]> = [
      ['1', true],
      ['3', true],
      ['5', true],
      ['0', false],
      ['2', false],
      ['4', false],
    ];

    for (const [value] of cases) {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    expect(
      stepMock.validate.mock.results.map(
        (r) => (r.value as FormValidatorValidationResult).isValid,
      ),
    ).toEqual(cases.map(([, expected]) => expected));
  });

  test.each([
    // Date: step(1) = 1-day grid anchored at 1970-01-01 (default base 0).
    ['date', 'step(1)', '2026-05-10', true],
    ['date', 'step(7, 2026-01-05)', '2026-01-05', true],
    ['date', 'step(7, 2026-01-05)', '2026-01-12', true],
    ['date', 'step(7, 2026-01-05)', '2026-01-06', false],
    // Time: step(60) = 1-minute grid anchored at midnight.
    ['time', 'step(60)', '09:30:00', true],
    ['time', 'step(60)', '09:30:30', false],
    ['time', 'step(900)', '09:00', true], // 15-min grid
    ['time', 'step(900)', '09:15', true],
    ['time', 'step(900)', '09:10', false],
    // Month: step(3) = quarter grid from 1970-01.
    ['month', 'step(3)', '2026-01', true],
    ['month', 'step(3)', '2026-04', true],
    ['month', 'step(3)', '2026-02', false],
    // Week: critical case — default base must align with a Monday so any
    // valid week value passes step(1). Without the per-type base table this
    // would fail.
    ['week', 'step(1)', '1970-W01', true],
    ['week', 'step(1)', '2026-W01', true],
    ['week', 'step(1)', '2026-W53', true],
    ['week', 'step(2)', '2026-W01', true],
    ['week', 'step(2)', '2026-W02', false],
    // Datetime-local: step(900) = 15-minute grid from 1970-01-01T00:00.
    ['datetime-local', 'step(900)', '2026-05-10T09:00', true],
    ['datetime-local', 'step(900)', '2026-05-10T09:15', true],
    ['datetime-local', 'step(900)', '2026-05-10T09:10', false],
  ])('%s with %s and value %s → isValid=%s', (type, dsl, value, expected) => {
    document.body.innerHTML = `<form id="f">
      <input type="${type}" data-validation="${dsl}">
    </form>`;
    const form = document.getElementById('f') as HTMLFormElement;
    const input = document.querySelector<HTMLInputElement>('input')!;
    const stepMock = {
      init: vi.fn(step.init),
      validate: vi.fn(step.validate),
    };

    new FormValidator({ trigger: 'input',
      form,
      validatorDeclarations: { step: stepMock },
    });

    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));

    const last = stepMock.validate.mock.results.at(-1)!.value as FormValidatorValidationResult;
    expect(last.isValid).toBe(expected);
  });

  test('handles floating-point accumulated error within tolerance', () => {
    document.body.innerHTML = `<form id="f">
      <input type="number" data-validation="step(0.1)">
    </form>`;
    const form = document.getElementById('f') as HTMLFormElement;
    const input = document.querySelector<HTMLInputElement>('input')!;
    const stepMock = {
      init: vi.fn(step.init),
      validate: vi.fn(step.validate),
    };

    new FormValidator({ trigger: 'input',
      form,
      validatorDeclarations: { step: stepMock },
    });

    // 0.3 / 0.1 in JS is 2.9999..., not 3. Tolerance must accept it.
    input.value = '0.3';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    const last = stepMock.validate.mock.results.at(-1)!.value as FormValidatorValidationResult;
    expect(last.isValid).toBe(true);
  });
});
