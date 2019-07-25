import { FormValidatorValidationResult } from '../src';

describe('FormValidatorValidationResult', () => {
  test('constructor', () => {
    expect(new FormValidatorValidationResult({
      validatorName: 'test',
    }).validatorName)
      .toEqual('test');

    expect(new FormValidatorValidationResult({
      validatorName: 'test',
    }).isContextError)
      .toEqual(false);

    expect(new FormValidatorValidationResult({
      validatorName: 'test',
      isContextError: false,
    }).isContextError)
      .toEqual(false);

    expect(new FormValidatorValidationResult({
      validatorName: 'test',
      isContextError: true,
    }).isContextError)
      .toEqual(true);

    expect(new FormValidatorValidationResult({
      validatorName: 'test',
    }).isValid)
      .toEqual(true);

    expect(new FormValidatorValidationResult({
      validatorName: 'test',
      isValid: false,
    }).isValid)
      .toEqual(false);

    expect(new FormValidatorValidationResult({
      validatorName: 'test',
      isValid: true,
    }).isValid)
      .toEqual(true);

    expect(new FormValidatorValidationResult({
      validatorName: 'test',
    }).validatorSubtypeList)
      .toEqual([]);

    expect(new FormValidatorValidationResult({
      validatorName: 'test',
      validatorSubtypeList: [],
    }).validatorSubtypeList)
      .toEqual([]);

    expect(new FormValidatorValidationResult({
      validatorName: 'test',
      validatorSubtypeList: ['subtype1', 'subtype2'],
    }).validatorSubtypeList)
      .toEqual(['subtype1', 'subtype2']);
  });

  test('immutability', () => {
    const formValidatorAnswer = new FormValidatorValidationResult({
      validatorName: 'test',
    });

    expect(() => {
      formValidatorAnswer.validatorSubtypeList = [];
    })
      .toThrowError();

    expect(() => {
      formValidatorAnswer.isContextError = true;
    })
      .toThrowError();

    expect(() => {
      formValidatorAnswer.isValid = true;
    })
      .toThrowError();
  });
});
