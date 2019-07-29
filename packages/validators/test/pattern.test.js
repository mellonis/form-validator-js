import FormValidator from '@form-validator-js/core';
import { pattern } from '@form-validator-js/validators';

const validParametersList = [
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

      const form = document.getElementById('attrs-test');
      const patternMock = {
        init: jest.fn(pattern.init),
        validate: jest.fn(pattern.validate),
      };
      const input = form.querySelector('input');

      // eslint-disable-next-line no-new
      new FormValidator({
        form,
        validatorDeclarations: {
          pattern: {
            ...patternMock,
          },
        },
      });

      expect(patternMock.init.mock.calls.length)
        .toBe(1);
      expect(patternMock.init.mock.calls[0][0])
        .toBe(input);
      expect(patternMock.init.mock.results[0].value.observableElementList)
        .toEqual([input]);
      expect(
        testCaseList
          .map(testCase => patternMock.init.mock.results[0].value.extraData.regExp
            .test(testCase[0])),
      )
        .toEqual(testCaseList.map(testCase => testCase[1]));
    });
  });

  test('invalid element type', () => {
    document.body.innerHTML = `<form id="attrs-test">
  <input type="checkbox" data-validation="pattern(some.pattern)">
  </form>`;

    const form = document.getElementById('attrs-test');

    expect(() => {
      // eslint-disable-next-line no-new
      new FormValidator({
        form,
        validatorDeclarations: {
          pattern: {
            ...pattern,
          },
        },
      });
    })
      .toThrowError('Unsupported element type');
  });
});

describe('pattern.validate', () => {
  validParametersList.forEach(([validParameter, testCaseList]) => {
    test('validator called', () => {
      document.body.innerHTML = `<form id="attrs-test">
  <input type="text" data-validation="pattern(${validParameter})">
  </form>`;

      const form = document.getElementById('attrs-test');
      const patternMock = {
        init: jest.fn(pattern.init),
        validate: jest.fn(pattern.validate),
      };
      const input = form.querySelector('input');

      // eslint-disable-next-line no-new
      new FormValidator({
        form,
        validatorDeclarations: {
          pattern: {
            ...patternMock,
          },
        },
      });

      const validList = testCaseList.map(([value, correctResult]) => {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));

        return value === '' || correctResult;
      });

      expect(patternMock.validate.mock.results.map(result => result.value.isValid))
        .toEqual(validList);
    });
  });
});
