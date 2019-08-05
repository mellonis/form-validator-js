import { FormValidatorInitResult } from '../src';

describe('FormValidatorInitResult', () => {
  test('constructor', () => {
    expect(() => {
      // eslint-disable-next-line no-new
      new FormValidatorInitResult();
    })
      .toThrowError('Cannot destructure property `observableElementList` of \'undefined\' or \'null\'.');

    expect(() => {
      // eslint-disable-next-line no-new
      new FormValidatorInitResult({});
    })
      .toThrowError(/is not iterable/);

    expect(new FormValidatorInitResult({
      observableElementList: [],
    }).observableElementList)
      .toEqual([]);

    expect(new FormValidatorInitResult({
      observableElementList: [],
    }).extraData)
      .toEqual({});

    expect(new FormValidatorInitResult({
      observableElementList: [],
      extraData: {
        someData: 'someValue',
      },
    }).extraData)
      .toEqual({
        someData: 'someValue',
      });
  });

  test('immutability', () => {
    const initResult = new FormValidatorInitResult({
      observableElementList: [],
      extraData: {
        someData: 'someValue',
      },
    });

    expect(() => {
      initResult.observableElementList = [];
    })
      .toThrowError();

    expect(() => {
      initResult.extraData = {};
    })
      .toThrowError();

    expect(() => {
      initResult.extraData.someNewData = 'someValue';
    })
      .toThrowError();
  });
});
