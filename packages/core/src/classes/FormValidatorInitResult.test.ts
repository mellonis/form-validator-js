import { FormValidatorInitResult } from '@form-validator-js/core';

describe('FormValidatorInitResult', () => {
  test('constructor', () => {
    expect(() => {
      new (FormValidatorInitResult as unknown as { new (): FormValidatorInitResult })();
    }).toThrow();

    expect(() => {
      new FormValidatorInitResult({} as unknown as { observableElementList: never[] });
    }).toThrow();

    expect(new FormValidatorInitResult({ observableElementList: [] }).observableElementList).toEqual([]);

    expect(new FormValidatorInitResult({ observableElementList: [] }).extraData).toEqual({});

    expect(
      new FormValidatorInitResult({
        observableElementList: [],
        extraData: { someData: 'someValue' },
      }).extraData,
    ).toEqual({ someData: 'someValue' });
  });

  test('immutability', () => {
    const initResult = new FormValidatorInitResult({
      observableElementList: [],
      extraData: { someData: 'someValue' },
    });

    expect(() => {
      (initResult as unknown as { observableElementList: never[] }).observableElementList = [];
    }).toThrowError();

    expect(() => {
      (initResult as unknown as { extraData: object }).extraData = {};
    }).toThrowError();

    expect(() => {
      (initResult.extraData as Record<string, unknown>).someNewData = 'someValue';
    }).toThrowError();
  });
});
