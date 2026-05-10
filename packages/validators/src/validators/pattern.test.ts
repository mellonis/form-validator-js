import { FormValidator, type FormValidatorInitResult, type FormValidatorValidationResult } from '@form-validator-js/core';
import { pattern } from '@form-validator-js/validators';

afterEach(() => {
  document.body.innerHTML = '';
});

const validParametersList: Array<[string, Array<[string, boolean]>]> = [
  ['^a{3}b{3}$', [
    ['ab', false],
    ['aabb', false],
    ['aaabbb', true],
    ['aaaabbbb', false],
  ]],
  ['^a{0,3}(c)?b{0,3}$', [
    ['', true],
    ['c', true],
    ['ac', true],
    ['cb', true],
    ['acb', true],
    ['aaacbbb', true],
    ['aaaacbbbb', false],
    ['aaaabbbb', false],
    ['aaabbb', true],
  ]],
  ['^(abc){1,3}$', [
    ['abc', true],
    ['abcabcabc', true],
    ['bacabcabc', false],
    ['', false],
  ]],
];

describe('pattern.init', () => {
  validParametersList.forEach(([validParameter, testCaseList]) => {
    test(`valid parameters (${validParameter})`, () => {
      document.body.innerHTML = `<form id="attrs-test">
  <input type="text" data-validation="pattern(${validParameter})">
  </form>`;

      const form = document.getElementById('attrs-test') as HTMLFormElement;
      const patternMock = {
        init: vi.fn(pattern.init),
        validate: vi.fn(pattern.validate),
      };
      const input = form.querySelector<HTMLInputElement>('input');

      new FormValidator({ trigger: 'input',
        form,
        validatorDeclarations: { pattern: patternMock },
      });

      const initResult = patternMock.init.mock.results[0].value as FormValidatorInitResult;
      expect(patternMock.init.mock.calls.length).toBe(1);
      expect(patternMock.init.mock.calls[0][0]).toBe(input);
      expect(initResult.observableElementList).toEqual([input]);
      expect(
        testCaseList.map((testCase) => (initResult.extraData.regExp as RegExp).test(testCase[0])),
      ).toEqual(testCaseList.map((testCase) => testCase[1]));
    });
  });

  test('invalid element type', () => {
    document.body.innerHTML = `<form id="attrs-test">
  <input type="checkbox" data-validation="pattern(some.pattern)">
  </form>`;

    const form = document.getElementById('attrs-test') as HTMLFormElement;

    expect(() => {
      new FormValidator({ trigger: 'input',
        form,
        validatorDeclarations: { pattern: pattern },
      });
    }).toThrowError('Unsupported element type');
  });
});

describe('pattern auto-anchoring (matches native HTML pattern attribute)', () => {
  // Native `pattern` requires the regex to match the entire value. Library
  // auto-wraps the source in `^(?:...)$` so an unanchored pattern still rejects
  // values with extra characters around the match.
  test('unanchored pattern is treated as whole-value match', () => {
    document.body.innerHTML = `<form id="attrs-test">
      <input type="text" data-validation="pattern(\\d{4})">
    </form>`;
    const form = document.getElementById('attrs-test') as HTMLFormElement;
    const patternMock = {
      init: vi.fn(pattern.init),
      validate: vi.fn(pattern.validate),
    };
    const input = document.querySelector<HTMLInputElement>('input')!;

    new FormValidator({ trigger: 'input',
      form,
      validatorDeclarations: { pattern: patternMock },
    });

    const cases: Array<[string, boolean]> = [
      ['1234', true],
      ['12345', false],
      ['abc1234', false],
      ['1234abc', false],
    ];

    for (const [value] of cases) {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    expect(
      patternMock.validate.mock.results.map(
        (r) => (r.value as FormValidatorValidationResult).isValid,
      ),
    ).toEqual(cases.map(([, expected]) => expected));
  });
});

describe('pattern.validate', () => {
  validParametersList.forEach(([validParameter, testCaseList]) => {
    test(`validator called for pattern(${validParameter})`, () => {
      document.body.innerHTML = `<form id="attrs-test">
  <input type="text" data-validation="pattern(${validParameter})">
  </form>`;

      const form = document.getElementById('attrs-test') as HTMLFormElement;
      const patternMock = {
        init: vi.fn(pattern.init),
        validate: vi.fn(pattern.validate),
      };
      const input = form.querySelector<HTMLInputElement>('input')!;

      new FormValidator({ trigger: 'input',
        form,
        validatorDeclarations: { pattern: patternMock },
      });

      const validList = testCaseList.map(([value, correctResult]) => {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return value === '' || correctResult;
      });

      expect(
        patternMock.validate.mock.results.map(
          (result) => (result.value as FormValidatorValidationResult).isValid,
        ),
      ).toEqual(validList);
    });
  });
});
