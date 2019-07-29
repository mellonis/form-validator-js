import FormValidator from '@form-validator-js/core';
import { checkedCount } from '@form-validator-js/validators';

describe('checkedCount.init', () => {
  const validParametersList = [
    ['1', {
      minCount: 1,
      maxCount: 1,
    }],
    ['1,', {
      minCount: 1,
      maxCount: Infinity,
    }],
    ['1,2', {
      minCount: 1,
      maxCount: 2,
    }],
    [',2', {
      minCount: 0,
      maxCount: 2,
    }],
    ['a,1', {
      minCount: 0,
      maxCount: 1,
    }],
    ['1,a', {
      minCount: 1,
      maxCount: Infinity,
    }],
  ];

  validParametersList.forEach(([validParameter, validResult]) => {
    test(`valid parameters (${validParameter})`, () => {
      document.body.innerHTML = `<form id="attrs-test">
  <input type="checkbox" name="checked-count1" data-validation="checked-count(${validParameter})">
  <input type="checkbox" name="checked-count1">
  <input type="checkbox" name="checked-count1">
  <input type="checkbox" name="checked-count1">
  </form>`;

      const form = document.getElementById('attrs-test');
      const checkedCountMock = {
        init: jest.fn(checkedCount.init),
        validate: jest.fn(checkedCount.validate),
      };
      const dataValidationCheckboxLost = Array.from(form.querySelectorAll('input[name="checked-count1"]'));

      // eslint-disable-next-line no-new
      new FormValidator({
        form,
        validatorDeclarations: {
          'checked-count': {
            ...checkedCountMock,
          },
        },
      });

      expect(checkedCountMock.init.mock.calls.length)
        .toBe(1);
      expect(checkedCountMock.init.mock.calls[0][0])
        .toBe(dataValidationCheckboxLost[0]);
      expect(checkedCountMock.init.mock.results[0].value.observableElementList)
        .toEqual(dataValidationCheckboxLost);
      expect({
        minCount: checkedCountMock.init.mock.results[0].value.extraData.minCount,
        maxCount: checkedCountMock.init.mock.results[0].value.extraData.maxCount,
      })
        .toEqual(validResult);
    });
  });

  const invalidParametersList = [
    '',
    ',',
    'a',
    'a,',
    ',a',
    'a,a',
  ];

  invalidParametersList.forEach((invalidParameter) => {
    test(`invalid parameters (${invalidParameter})`, () => {
      document.body.innerHTML = `<form id="attrs-test">
    <input type="checkbox" name="checked-count1" data-validation="checked-count(${invalidParameter})">
    <input type="checkbox" name="checked-count1">
    <input type="checkbox" name="checked-count1">
    <input type="checkbox" name="checked-count1">
    </form>`;

      const form = document.getElementById('attrs-test');

      expect(() => {
        // eslint-disable-next-line no-new
        new FormValidator({
          form,
          validatorDeclarations: {
            'checked-count': {
              ...checkedCount,
            },
          },
        });
      })
        .toThrowError('Invalid validator arguments');
    });
  });

  test('invalid element type', () => {
    document.body.innerHTML = `<form id="attrs-test">
    <input type="text" data-validation="checked-count(1)">
    </form>`;

    const form = document.getElementById('attrs-test');

    expect(() => {
      // eslint-disable-next-line no-new
      new FormValidator({
        form,
        validatorDeclarations: {
          'checked-count': {
            ...checkedCount,
          },
        },
      });
    })
      .toThrowError('Unsupported element type');
  });
});

describe('checkedCount.validate', () => {
  let checkedCountMock;

  beforeEach(() => {
    document.body.innerHTML = `<form id="attrs-test">
    <input type="checkbox" name="checked-count1" data-validation="checked-count(1)">
    <input type="checkbox" name="checked-count1">
    <input type="checkbox" name="checked-count1">
    <input type="checkbox" name="checked-count1">
    </form>`;

    const form = document.getElementById('attrs-test');
    checkedCountMock = {
      init: jest.fn(checkedCount.init),
      validate: jest.fn(checkedCount.validate),
    };

    // eslint-disable-next-line no-new
    new FormValidator({
      form,
      validatorDeclarations: {
        'checked-count': {
          ...checkedCountMock,
        },
      },
    });
  });

  test('validator called', () => {
    expect(checkedCountMock.validate.mock.calls.length)
      .toBe(0);

    const input = document.querySelector('[data-validation]');

    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(checkedCountMock.validate.mock.calls.length)
      .toBe(1);
    expect(checkedCountMock.validate.mock.results[0].value.isValid)
      .toBe(false);

    input.dispatchEvent(new Event('click'));

    expect(checkedCountMock.validate.mock.calls.length)
      .toBe(2);
    expect(checkedCountMock.validate.mock.results[1].value.isValid)
      .toBe(true);
  });
});
