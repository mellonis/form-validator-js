import { FormValidatorAnswer } from '../src';

describe('FormValidatorAnswer', () => {
  test('constructor', () => {
    expect(new FormValidatorAnswer({
      validatorName: 'test',
    }).validatorName)
      .toEqual('test');

    expect(new FormValidatorAnswer({
      validatorName: 'test',
    }).isContextError)
      .toEqual(false);

    expect(new FormValidatorAnswer({
      validatorName: 'test',
      isContextError: false,
    }).isContextError)
      .toEqual(false);

    expect(new FormValidatorAnswer({
      validatorName: 'test',
      isContextError: true,
    }).isContextError)
      .toEqual(true);

    expect(new FormValidatorAnswer({
      validatorName: 'test',
    }).isValid)
      .toEqual(true);

    expect(new FormValidatorAnswer({
      validatorName: 'test',
      isValid: false,
    }).isValid)
      .toEqual(false);

    expect(new FormValidatorAnswer({
      validatorName: 'test',
      isValid: true,
    }).isValid)
      .toEqual(true);

    expect(new FormValidatorAnswer({
      validatorName: 'test',
    }).validatorSubtypeList)
      .toEqual([]);

    expect(new FormValidatorAnswer({
      validatorName: 'test',
      validatorSubtypeList: [],
    }).validatorSubtypeList)
      .toEqual([]);

    expect(new FormValidatorAnswer({
      validatorName: 'test',
      validatorSubtypeList: ['subtype1', 'subtype2'],
    }).validatorSubtypeList)
      .toEqual(['subtype1', 'subtype2']);
  });

  test('immutability', () => {
    const formValidatorAnswer = new FormValidatorAnswer({
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
