import {
  FormValidator,
  FormValidatorInitResult,
  FormValidatorValidationResult,
} from '@form-validator-js/core';

describe('FormValidator', () => {
  let form;

  beforeEach(() => {
    document.body.innerHTML = '<form id="attrs-test"/>';

    form = document.getElementById('attrs-test');
  });

  test('constructor', () => {
    expect(() => new FormValidator())
      .toThrowError(/^Cannot destructure property/);
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

  test('can be called', () => {
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

describe('FormValidator validations', () => {
  const formValidatorParams = {
    validatorDeclarations: {
      a: {
        validate() {
          return new FormValidatorValidationResult({
            isValid: false,
          });
        },
        errorMessage: 'a',
      },
      b: {
        validate() {
          return new FormValidatorValidationResult({
            isContextError: true,
            isValid: false,
          });
        },
        errorMessage: 'b',
      },
    },
  };
  let form;
  let input;
  let onErrorMessageListChangedMock;

  beforeEach(() => {
    form = document.createElement('form');
    input = document.createElement('input');
    input.type = 'text';
    input.setAttribute('data-validation', 'a,b,c');
    form.appendChild(input);
    onErrorMessageListChangedMock = jest.fn(() => {
    });
  });

  test('invalid validation result is ignored', () => {
    // eslint-disable-next-line no-new
    new FormValidator({
      form,
      onErrorMessageListChanged: onErrorMessageListChangedMock,
      validatorDeclarations: {
        ...formValidatorParams.validatorDeclarations,
        c: {
          validate() {
            return null;
          },
        },
      },
    });
    input.dispatchEvent(FormValidator.createValidateEvent());
    expect(
      onErrorMessageListChangedMock.mock.calls
        .map((args) => args[1][0])
        .sort((a, b) => a.localeCompare(b)),
    )
      .toEqual(['a', 'b']);
  });

  test('undefined validate method fallback', () => {
    // eslint-disable-next-line no-new
    new FormValidator({
      form,
      onErrorMessageListChanged: onErrorMessageListChangedMock,
      validatorDeclarations: {
        c: {},
      },
    });
    input.dispatchEvent(FormValidator.createValidateEvent());
    expect(
      onErrorMessageListChangedMock.mock.calls.length,
    )
      .toBe(0);
  });

  test('observable element', () => {
    const observableInput = document.createElement('input');

    observableInput.type = 'text';
    form.appendChild(observableInput);

    const validateMock = jest.fn(() => new FormValidatorValidationResult({
      isValid: true,
    }));

    // eslint-disable-next-line no-new
    new FormValidator({
      form,
      onErrorMessageListChanged: onErrorMessageListChangedMock,
      validatorDeclarations: {
        c: {
          init(targetElement) {
            return new FormValidatorInitResult({
              observableElementList: [targetElement, observableInput],
            });
          },
          validate: validateMock,
        },
      },
    });

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    observableInput.dispatchEvent(new Event('input', { bubbles: true }));
    observableInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect(validateMock.mock.calls.length)
      .toBe(4);
  });

  test('element and context errors reset', () => {
    // eslint-disable-next-line no-new
    new FormValidator({
      form,
      onErrorMessageListChanged: onErrorMessageListChangedMock,
      ...formValidatorParams,
    });
    input.dispatchEvent(FormValidator.createValidateEvent());
    form.dispatchEvent(new Event('reset'));
    expect(
      onErrorMessageListChangedMock.mock.calls
        .sort((a, b) => a[0].tagName.localeCompare(b[0].tagName)),
    )
      .toEqual([
        [form, ['b']],
        [form, []],
        [input, ['a']],
        [input, []],
      ]);
  });

  test('ignoreValidationResult = true', () => {
    const formValidator = new FormValidator({
      form,
      onErrorMessageListChanged: onErrorMessageListChangedMock,
      ...formValidatorParams,
    });

    formValidator.ignoreValidationResult = true;
    input.dispatchEvent(FormValidator.createValidateEvent());
    expect(onErrorMessageListChangedMock.mock.calls.length)
      .toBe(0);
  });

  test('override validation result', () => {
    // eslint-disable-next-line no-new
    new FormValidator({
      form,
      onErrorMessageListChanged: onErrorMessageListChangedMock,
      validatorDeclarations: {
        c: {
          validate() {

          },
          errorMessage: {
            c: 'c - subtype message',
          },
        },
      },
    });

    input.dispatchEvent(FormValidator.createValidateEvent({
      data: {
        c: new FormValidatorValidationResult({
          isValid: false,
          validatorSubtypeList: ['c'],
        }),
      },
    }));
    expect(
      onErrorMessageListChangedMock.mock.calls.length,
    )
      .toBe(1);
    expect(
      onErrorMessageListChangedMock.mock.calls[0][1],
    )
      .toEqual(['c - subtype message']);
  });

  test('specific errorMessage for an element', () => {
    const formValidator = new FormValidator({
      form,
      ...formValidatorParams,
      onErrorMessageListChanged: onErrorMessageListChangedMock,
    });

    input.dispatchEvent(FormValidator.createValidateEvent());
    formValidator.elementToSpecificErrorMessageMap.set(input, {
      a: 'aa',
    });
    input.dispatchEvent(FormValidator.createValidateEvent());
    formValidator.elementToSpecificErrorMessageMap.delete(input);
    input.dispatchEvent(FormValidator.createValidateEvent());
    formValidator.elementToSpecificErrorMessageMap.set(input, {
      a: 'aaa',
    });
    input.dispatchEvent(FormValidator.createValidateEvent());
    formValidator.elementToSpecificErrorMessageMap.clear();
    input.dispatchEvent(FormValidator.createValidateEvent());
    expect(
      onErrorMessageListChangedMock.mock.calls
        .filter((call) => call[0] === input).length,
    )
      .toBe(5);
    expect(
      onErrorMessageListChangedMock.mock.calls
        .filter((call) => call[0] === input)
        .flatMap((call) => call[1]),
    )
      .toEqual(['a', 'aa', 'a', 'aaa', 'a']);
  });
});
