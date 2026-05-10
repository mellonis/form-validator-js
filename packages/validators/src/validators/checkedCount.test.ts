import { type Mock } from 'vitest';
import { FormValidator, type FormValidatorInitResult } from '@form-validator-js/core';
import { checkedCount } from '@form-validator-js/validators';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('checkedCount.init', () => {
  const validParametersList: Array<[string, { minCount: number; maxCount: number }]> = [
    ['1', { minCount: 1, maxCount: 1 }],
    ['1,', { minCount: 1, maxCount: Infinity }],
    ['1,2', { minCount: 1, maxCount: 2 }],
    [',2', { minCount: 0, maxCount: 2 }],
    ['a,1', { minCount: 0, maxCount: 1 }],
    ['1,a', { minCount: 1, maxCount: Infinity }],
  ];

  validParametersList.forEach(([validParameter, validResult]) => {
    test(`valid parameters (${validParameter})`, () => {
      document.body.innerHTML = `<form id="attrs-test">
  <input type="checkbox" name="checked-count1" data-validation="checked-count(${validParameter})">
  <input type="checkbox" name="checked-count1">
  <input type="checkbox" name="checked-count1">
  <input type="checkbox" name="checked-count1">
  </form>`;

      const form = document.getElementById('attrs-test') as HTMLFormElement;
      const checkedCountMock = {
        init: vi.fn(checkedCount.init),
        validate: vi.fn(checkedCount.validate),
      };
      const dataValidationCheckboxList = Array.from(
        form.querySelectorAll<HTMLInputElement>('input[name="checked-count1"]'),
      );

      new FormValidator({ trigger: 'input',
        form,
        validatorDeclarations: { 'checked-count': checkedCountMock },
      });

      const initResult = checkedCountMock.init.mock.results[0].value as FormValidatorInitResult;
      expect(checkedCountMock.init.mock.calls.length).toBe(1);
      expect(checkedCountMock.init.mock.calls[0][0]).toBe(dataValidationCheckboxList[0]);
      expect(initResult.observableElementList).toEqual(dataValidationCheckboxList);
      expect({
        minCount: initResult.extraData.minCount,
        maxCount: initResult.extraData.maxCount,
      }).toEqual(validResult);
    });
  });

  const invalidParametersList = ['', ',', 'a', 'a,', ',a', 'a,a'];

  invalidParametersList.forEach((invalidParameter) => {
    test(`invalid parameters (${invalidParameter})`, () => {
      document.body.innerHTML = `<form id="attrs-test">
    <input type="checkbox" name="checked-count1" data-validation="checked-count(${invalidParameter})">
    <input type="checkbox" name="checked-count1">
    <input type="checkbox" name="checked-count1">
    <input type="checkbox" name="checked-count1">
    </form>`;

      const form = document.getElementById('attrs-test') as HTMLFormElement;

      expect(() => {
        new FormValidator({ trigger: 'input',
          form,
          validatorDeclarations: { 'checked-count': checkedCount },
        });
      }).toThrowError('Invalid validator arguments');
    });
  });

  test('invalid element type', () => {
    document.body.innerHTML = `<form id="attrs-test">
    <input type="text" data-validation="checked-count(1)">
    </form>`;

    const form = document.getElementById('attrs-test') as HTMLFormElement;

    expect(() => {
      new FormValidator({ trigger: 'input',
        form,
        validatorDeclarations: { 'checked-count': checkedCount },
      });
    }).toThrowError('Unsupported element type');
  });

  test('CSS-special-character name resolves the group correctly', () => {
    document.body.innerHTML = `<form id="attrs-test">
      <input type="checkbox" name="opts[]" data-validation="checked-count(1,3)">
      <input type="checkbox" name="opts[]">
      <input type="checkbox" name="opts[]">
    </form>`;
    const form = document.getElementById('attrs-test') as HTMLFormElement;
    const all = Array.from(form.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
    const checkedCountMock = {
      init: vi.fn(checkedCount.init),
      validate: vi.fn(checkedCount.validate),
    };

    new FormValidator({ trigger: 'input', form, validatorDeclarations: { 'checked-count': checkedCountMock } });

    expect(
      (checkedCountMock.init.mock.results[0].value as FormValidatorInitResult).observableElementList,
    ).toEqual(all);
  });

  test('without a name attribute, falls back to a one-element group', () => {
    document.body.innerHTML = `<form id="attrs-test">
      <input type="checkbox" id="lonely" data-validation="checked-count(1)">
    </form>`;
    const form = document.getElementById('attrs-test') as HTMLFormElement;
    const lonely = document.getElementById('lonely') as HTMLInputElement;
    const checkedCountMock = {
      init: vi.fn(checkedCount.init),
      validate: vi.fn(checkedCount.validate),
    };

    new FormValidator({ trigger: 'input', form, validatorDeclarations: { 'checked-count': checkedCountMock } });

    expect(
      (checkedCountMock.init.mock.results[0].value as FormValidatorInitResult).observableElementList,
    ).toEqual([lonely]);
  });
});

describe('checkedCount.validate', () => {
  let checkedCountMock: { init: Mock<typeof checkedCount.init>; validate: Mock<typeof checkedCount.validate> };

  beforeEach(() => {
    document.body.innerHTML = `<form id="attrs-test">
    <input type="checkbox" name="checked-count1" data-validation="checked-count(1)">
    <input type="checkbox" name="checked-count1">
    <input type="checkbox" name="checked-count1">
    <input type="checkbox" name="checked-count1">
    </form>`;

    const form = document.getElementById('attrs-test') as HTMLFormElement;
    checkedCountMock = {
      init: vi.fn(checkedCount.init),
      validate: vi.fn(checkedCount.validate),
    };

    new FormValidator({ trigger: 'input',
      form,
      validatorDeclarations: { 'checked-count': checkedCountMock },
    });
  });

  test('validator called', () => {
    expect(checkedCountMock.validate.mock.calls.length).toBe(0);

    const input = document.querySelector<HTMLInputElement>('[data-validation]')!;

    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(checkedCountMock.validate.mock.calls.length).toBe(1);

    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(checkedCountMock.validate.mock.calls.length).toBe(2);
  });
});
