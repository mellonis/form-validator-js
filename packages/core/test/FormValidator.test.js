import FormValidator from '@form-validator-js/core';

describe('FormValidator', () => {
  let form;

  beforeEach(() => {
    document.body.innerHTML = '<form id="attrs-test"/>';

    form = document.getElementById('attrs-test');
  });

  test('constructor', () => {
    expect(() => new FormValidator())
      .toThrowError('Cannot destructure property `form` of \'undefined\' or \'null\'.');
    expect(() => new FormValidator({}))
      .toThrowError('form must be an HTMLFormElement');
    expect(() => new FormValidator({ form }))
      .not
      .toThrowError();
  });

  test('form-attributes', () => {
    // eslint-disable-next-line no-new
    new FormValidator({
      form,
    });

    expect(form.attributes.novalidate)
      .toBeDefined();
    expect(form.attributes['data-validation-context'])
      .toBeDefined();
    expect(form.attributes['data-validation-context'].value)
      .toBe('*');
  });
});

describe('FormValidator.getElementType', () => {
  document.body.innerHTML = `<div>
      <div data-type/>      
      <input data-type="text" type="text">
      <input data-type="password" type="password">
      <input data-type="tel" type="tel">
      <input data-type="checkbox" type="checkbox">
      <input data-type="radio" type="radio">
      <input data-type type="zz">
      <textarea data-type="textarea">
      <select data-type="select">
      </div>`;

  document.querySelectorAll('[data-type]')
    .forEach((element) => {
      test(`type: ${element.attributes['data-type'].value || null}`, () => {
        expect(FormValidator.getElementType(element))
          .toBe(element.attributes['data-type'].value || null);
      });
    });
});

describe('FormValidator.addValidator', () => {
  const formValidator = new FormValidator({
    form: document.createElement('form'),
  });

  test('ok', () => {
    expect(() => {
      formValidator.addValidators({
        someValidatorName: {},
      });
    })
      .not
      .toThrowError();
  });

  test('init in not a function', () => {
    expect(() => {
      formValidator.addValidators({
        someValidatorName: {
          init: 'invalid value',
        },
      });
    })
      .toThrowError('Invalid validator declaration');
  });

  test('validate in not a function', () => {
    expect(() => {
      formValidator.addValidators({
        someValidatorName: {
          validate: 'invalid value',
        },
      });
    })
      .toThrowError('Invalid validator declaration');
  });
});

describe('FormValidator.createValidateEvent', () => {
  test('event is defined', () => {
    const event = FormValidator.createValidateEvent();

    expect(event)
      .toBeDefined();
  });

  test('event type is validate', () => {
    const event = FormValidator.createValidateEvent();

    expect(event.type)
      .toBe('validate');
  });
});

describe('FormValidator.getValidatorNameToArgumentStringMap', () => {
  let formValidator;

  beforeAll(() => {
    formValidator = new FormValidator({
      form: document.createElement('form'),
      validatorDeclarations: {
        a: {},
        b: {},
        c: {},
        d: {},
      },
    });
  });

  const testCaseList = [
    [
      'z',
      [],
    ],
    [
      'a,b,c,d',
      [
        ['a', ''],
        ['b', ''],
        ['c', ''],
        ['d', ''],
      ],
    ],
    [
      'a(1),b,q',
      [
        ['a', '1'],
        ['b', ''],
      ],
    ],
    [
      'a((1)))(),b(())',
      [
        ['a', '(1)))('],
        ['b', '()'],
      ],
    ],
  ];

  testCaseList.forEach(([dataValidationAttribute, validMapEntrinesAsList]) => {
    test(`validatorNameToArgumentStringMap for '${dataValidationAttribute}'`, () => {
      expect(
        Array.from(
          formValidator
            .getValidatorNameToArgumentStringMap({ value: dataValidationAttribute })
            .entries(),
        ),
      )
        .toEqual(validMapEntrinesAsList);
    });
  });
});
