import FormValidator, { FormValidatorAnswer } from '@form-validator-js/core';

describe('FormValidator', () => {
  let form;

  beforeEach(() => {
    document.body.innerHTML = '<form id="attrs-test"/>';

    form = document.getElementById('attrs-test');
  });

  test('constructor', () => {
    expect(() => new FormValidator()).toThrowError('Cannot destructure property `form` of \'undefined\' or \'null\'.');
    expect(() => new FormValidator({})).toThrowError('form should be an HTMLFormElement');
    expect(() => new FormValidator({ form })).not.toThrowError();
  });

  test('form-attributes', () => {
    // eslint-disable-next-line no-new
    new FormValidator({
      form,
    });

    expect(form.attributes.novalidate).toBeDefined();
    expect(form.attributes['data-validation-context']).toBeDefined();
    expect(form.attributes['data-validation-context'].value).toBe('*');
  });
});

describe('FormValidatorAnswer', () => {
  test('constructor', () => {
    expect(() => new FormValidatorAnswer()).toThrowError('Cannot destructure property `validatorName` of \'undefined\' or \'null\'.');

    expect(new FormValidatorAnswer({
      validatorName: 'test',
    }).validatorName).toEqual('test');

    expect(new FormValidatorAnswer({
      validatorName: 'test',
    }).isContextError).toEqual(false);

    expect(new FormValidatorAnswer({
      validatorName: 'test',
      isContextError: false,
    }).isContextError).toEqual(false);

    expect(new FormValidatorAnswer({
      validatorName: 'test',
      isContextError: true,
    }).isContextError).toEqual(true);

    expect(new FormValidatorAnswer({
      validatorName: 'test',
    }).isValid).toEqual(true);

    expect(new FormValidatorAnswer({
      validatorName: 'test',
      isValid: false,
    }).isValid).toEqual(false);

    expect(new FormValidatorAnswer({
      validatorName: 'test',
      isValid: true,
    }).isValid).toEqual(true);

    expect(new FormValidatorAnswer({
      validatorName: 'test',
    }).validatorSubtypeList).toEqual([]);

    expect(new FormValidatorAnswer({
      validatorName: 'test',
      validatorSubtypeList: [],
    }).validatorSubtypeList).toEqual([]);

    expect(new FormValidatorAnswer({
      validatorName: 'test',
      validatorSubtypeList: ['subtype1', 'subtype2'],
    }).validatorSubtypeList).toEqual(['subtype1', 'subtype2']);
  });

  test('immutability', () => {
    const formValidatorAnswer = new FormValidatorAnswer({
      validatorName: 'test',
    });

    expect(() => {
      formValidatorAnswer.validatorSubtypeList = [];
    }).toThrowError();

    expect(() => {
      formValidatorAnswer.isContextError = true;
    }).toThrowError();

    expect(() => {
      formValidatorAnswer.isValid = true;
    }).toThrowError();
  });
});
