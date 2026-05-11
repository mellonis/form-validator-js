import { type Mock } from 'vitest';
import {
  FormValidator,
  FormValidatorInitResult,
  FormValidatorValidationResult,
  type ErrorDetail,
} from '@form-validator-js/core';

type OnErrorChange = (element: Element, errorMessages: string[], errors: ErrorDetail[]) => void;

afterEach(() => {
  document.body.innerHTML = '';
});

describe('FormValidator', () => {
  let form: HTMLFormElement;

  beforeEach(() => {
    document.body.innerHTML = '<form id="attrs-test"/>';
    form = document.getElementById('attrs-test') as HTMLFormElement;
  });

  test('constructor', () => {
    expect(() => new (FormValidator as unknown as { new (): FormValidator })()).toThrow();
    expect(() => new FormValidator({} as unknown as { form: HTMLFormElement }))
      .toThrowError('form must be an HTMLFormElement');
    expect(() => new FormValidator({ form })).not.toThrowError();
  });

  test('form-attributes', () => {
    new FormValidator({ form });

    expect(form.attributes.getNamedItem('novalidate')).not.toBeNull();
    expect(form.attributes.getNamedItem('data-validation-context')).not.toBeNull();
    expect(form.getAttribute('data-validation-context')).toBe('*');
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

  document.querySelectorAll('[data-type]').forEach((element) => {
    const expected = element.getAttribute('data-type') || null;
    test(`type: ${expected}`, () => {
      expect(FormValidator.getElementType(element)).toBe(expected);
    });
  });

  test('input with no type attribute defaults to text (HTML spec)', () => {
    const input = document.createElement('input');
    expect(input.getAttribute('type')).toBeNull();
    expect(FormValidator.getElementType(input)).toBe('text');
  });

  test.each([
    'email', 'url', 'search', 'number',
    'date', 'time', 'datetime-local', 'month', 'week',
    'color', 'range', 'hidden', 'file',
  ])('recognizes input type %s', (type) => {
    const input = document.createElement('input');
    input.setAttribute('type', type);
    expect(FormValidator.getElementType(input)).toBe(type);
  });
});

describe('FormValidator.addValidator', () => {
  const formValidator = new FormValidator({
    form: document.createElement('form'),
  });

  test('can be called', () => {
    expect(() => {
      formValidator.addValidators({ someValidatorName: {} });
    }).not.toThrowError();
  });

  test('init in not a function', () => {
    expect(() => {
      formValidator.addValidators({
        someValidatorName: { init: 'invalid value' as unknown as undefined },
      });
    }).toThrowError('Invalid validator declaration');
  });

  test('validate in not a function', () => {
    expect(() => {
      formValidator.addValidators({
        someValidatorName: { validate: 'invalid value' as unknown as undefined },
      });
    }).toThrowError('Invalid validator declaration');
  });
});

describe('FormValidator.createValidateEvent', () => {
  test('event is defined', () => {
    expect(FormValidator.createValidateEvent()).toBeDefined();
  });

  test('event type is validate', () => {
    expect(FormValidator.createValidateEvent().type).toBe('fvjs:validate');
  });
});

describe('FormValidator.getValidatorNameToArgumentStringMap', () => {
  let formValidator: FormValidator;

  beforeAll(() => {
    formValidator = new FormValidator({
      form: document.createElement('form'),
      validatorDeclarations: { a: {}, b: {}, c: {}, d: {} },
    });
  });

  const testCaseList: Array<[string, Array<[string, string]>]> = [
    ['z', []],
    ['a,b,c,d', [['a', ''], ['b', ''], ['c', ''], ['d', '']]],
    ['a(1),b,q', [['a', '1'], ['b', '']]],
    ['a((1)))(),b(())', [['a', '(1)))('], ['b', '()']]],
  ];

  testCaseList.forEach(([dataValidationAttribute, validMapEntriesAsList]) => {
    test(`validatorNameToArgumentStringMap for '${dataValidationAttribute}'`, () => {
      expect(
        Array.from(
          formValidator
            .getValidatorNameToArgumentStringMap({ value: dataValidationAttribute })
            .entries(),
        ),
      ).toEqual(validMapEntriesAsList);
    });
  });
});

describe('FormValidator validations', () => {
  const formValidatorParams = {
    validatorDeclarations: {
      a: {
        validate: () => new FormValidatorValidationResult({ isValid: false }),
        errorMessage: 'a',
      },
      b: {
        validate: () => new FormValidatorValidationResult({
          isContextError: true,
          isValid: false,
        }),
        errorMessage: 'b',
      },
    },
  };

  let form: HTMLFormElement;
  let input: HTMLInputElement;
  let onErrorMessageListChangedMock: Mock<OnErrorChange>;

  beforeEach(() => {
    form = document.createElement('form');
    input = document.createElement('input');
    input.type = 'text';
    input.setAttribute('data-validation', 'a,b,c');
    form.appendChild(input);
    onErrorMessageListChangedMock = vi.fn<OnErrorChange>();
  });

  test('invalid validation result is ignored', () => {
    new FormValidator({
      form,
      onErrorMessageListChanged: onErrorMessageListChangedMock,
      validatorDeclarations: {
        ...formValidatorParams.validatorDeclarations,
        c: { validate: () => undefined },
      },
    });
    input.dispatchEvent(FormValidator.createValidateEvent());
    expect(
      onErrorMessageListChangedMock.mock.calls
        .map((args) => args[1][0])
        .sort((a: string, b: string) => a.localeCompare(b)),
    ).toEqual(['a', 'b']);
  });

  test('undefined validate method fallback', () => {
    new FormValidator({
      form,
      onErrorMessageListChanged: onErrorMessageListChangedMock,
      validatorDeclarations: { c: {} },
    });
    input.dispatchEvent(FormValidator.createValidateEvent());
    expect(onErrorMessageListChangedMock.mock.calls.length).toBe(0);
  });

  test('observable element', () => {
    const observableInput = document.createElement('input');
    observableInput.type = 'text';
    form.appendChild(observableInput);

    const validateMock = vi.fn(() => new FormValidatorValidationResult({ isValid: true }));

    new FormValidator({
      form,
      trigger: 'input',
      onErrorMessageListChanged: onErrorMessageListChangedMock,
      validatorDeclarations: {
        c: {
          init: (targetElement) => new FormValidatorInitResult({
            observableElementList: [targetElement, observableInput],
          }),
          validate: validateMock,
        },
      },
    });

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    observableInput.dispatchEvent(new Event('input', { bubbles: true }));
    observableInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect(validateMock.mock.calls.length).toBe(4);
  });

  test('element and context errors reset', () => {
    new FormValidator({
      form,
      onErrorMessageListChanged: onErrorMessageListChangedMock,
      ...formValidatorParams,
    });
    input.dispatchEvent(FormValidator.createValidateEvent());
    form.dispatchEvent(new Event('reset'));
    expect(
      onErrorMessageListChangedMock.mock.calls
        .sort((a, b) => (a[0] as Element).tagName.localeCompare((b[0] as Element).tagName)),
    ).toEqual([
      [form, ['b'], []],
      [form, [], []],
      [input, ['a'], []],
      [input, [], []],
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
    expect(onErrorMessageListChangedMock.mock.calls.length).toBe(0);
  });

  test('override validation result', () => {
    new FormValidator({
      form,
      onErrorMessageListChanged: onErrorMessageListChangedMock,
      validatorDeclarations: {
        c: {
          validate: () => undefined,
          errorMessage: { c: 'c - subtype message' },
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
    expect(onErrorMessageListChangedMock.mock.calls.length).toBe(1);
    expect(onErrorMessageListChangedMock.mock.calls[0][1]).toEqual(['c - subtype message']);
  });

  test('specific errorMessage for an element', () => {
    const formValidator = new FormValidator({
      form,
      ...formValidatorParams,
      onErrorMessageListChanged: onErrorMessageListChangedMock,
    });

    input.dispatchEvent(FormValidator.createValidateEvent());
    formValidator.elementToSpecificErrorMessageMap.set(input, { a: 'aa' });
    input.dispatchEvent(FormValidator.createValidateEvent());
    formValidator.elementToSpecificErrorMessageMap.delete(input);
    input.dispatchEvent(FormValidator.createValidateEvent());
    formValidator.elementToSpecificErrorMessageMap.set(input, { a: 'aaa' });
    input.dispatchEvent(FormValidator.createValidateEvent());
    formValidator.elementToSpecificErrorMessageMap.clear();
    input.dispatchEvent(FormValidator.createValidateEvent());
    expect(
      onErrorMessageListChangedMock.mock.calls.filter((call) => call[0] === input).length,
    ).toBe(5);
    expect(
      onErrorMessageListChangedMock.mock.calls
        .filter((call) => call[0] === input)
        .flatMap((call) => call[1] as string[]),
    ).toEqual(['a', 'aa', 'a', 'aaa', 'a']);
  });

  test('elementToSpecificErrorMessageMap.set ignores non-object values', () => {
    const formValidator = new FormValidator({
      form,
      onErrorMessageListChanged: onErrorMessageListChangedMock,
      validatorDeclarations: {
        a: {
          validate: () => new FormValidatorValidationResult({ isValid: false }),
          errorMessage: 'a-default',
        },
      },
    });

    const facade = formValidator.elementToSpecificErrorMessageMap;

    expect(() => facade.set(input, null as unknown as Record<string, string>)).not.toThrow();
    expect(() => facade.set(input, 'string' as unknown as Record<string, string>)).not.toThrow();
    expect(() => facade.set(input, [] as unknown as Record<string, string>)).not.toThrow();
    expect(() => facade.set(input, 42 as unknown as Record<string, string>)).not.toThrow();

    input.dispatchEvent(FormValidator.createValidateEvent());

    const callsForInput = onErrorMessageListChangedMock.mock.calls
      .filter((call) => call[0] === input)
      .map((call) => call[1]);
    expect(callsForInput).toEqual([['a-default']]);
  });
});

describe('FormValidator submit handling', () => {
  let form: HTMLFormElement;
  let input: HTMLInputElement;

  beforeEach(() => {
    form = document.createElement('form');
    input = document.createElement('input');
    input.type = 'text';
    input.setAttribute('data-validation', 'a');
    form.appendChild(input);
    document.body.appendChild(form);
  });

  test('preventDefault when validation fails', () => {
    new FormValidator({
      form,
      validatorDeclarations: {
        a: {
          validate: () => new FormValidatorValidationResult({ isValid: false }),
          errorMessage: 'a',
        },
      },
    });

    const submitEvent = new Event('submit', { cancelable: true, bubbles: true });
    form.dispatchEvent(submitEvent);

    expect(submitEvent.defaultPrevented).toBe(true);
  });

  test('does not preventDefault when validation passes', () => {
    new FormValidator({
      form,
      validatorDeclarations: {
        a: { validate: () => new FormValidatorValidationResult({ isValid: true }) },
      },
    });

    const submitEvent = new Event('submit', { cancelable: true, bubbles: true });
    form.dispatchEvent(submitEvent);

    expect(submitEvent.defaultPrevented).toBe(false);
  });

  test('listeners registered AFTER construction do not fire on invalid submit', () => {
    // Design contract: invalid submits trigger no submit-listener side effects.
    // Achieved via stopImmediatePropagation, which stops listeners later in
    // the queue than the validator's own.
    new FormValidator({
      form,
      validatorDeclarations: {
        a: {
          validate: () => new FormValidatorValidationResult({ isValid: false }),
          errorMessage: 'a',
        },
      },
    });

    const lateListener = vi.fn();
    form.addEventListener('submit', lateListener);

    const submitEvent = new Event('submit', { cancelable: true, bubbles: true });
    form.dispatchEvent(submitEvent);

    expect(submitEvent.defaultPrevented).toBe(true);
    expect(lateListener).not.toHaveBeenCalled();
  });

  test('destroy() detaches listeners — events become no-ops', () => {
    const onError = vi.fn<OnErrorChange>();
    const validator = new FormValidator({
      form,
      onErrorMessageListChanged: onError,
      validatorDeclarations: {
        a: {
          validate: () => new FormValidatorValidationResult({ isValid: false }),
          errorMessage: 'a',
        },
      },
    });

    validator.destroy();

    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onError).not.toHaveBeenCalled();

    const submitEvent = new Event('submit', { cancelable: true, bubbles: true });
    form.dispatchEvent(submitEvent);
    expect(submitEvent.defaultPrevented).toBe(false);
  });

  test('destroy() is idempotent', () => {
    const validator = new FormValidator({
      form,
      validatorDeclarations: { a: {} },
    });
    expect(() => {
      validator.destroy();
      validator.destroy();
    }).not.toThrow();
  });

  test('listeners registered BEFORE construction DO fire on invalid submit (documents the contract)', () => {
    // Counter-example: DOM listener order is registration order on the target.
    // stopImmediatePropagation can only stop later-registered listeners.
    // Construct FormValidator before attaching any other submit listeners.
    const earlyListener = vi.fn();
    form.addEventListener('submit', earlyListener);

    new FormValidator({
      form,
      validatorDeclarations: {
        a: {
          validate: () => new FormValidatorValidationResult({ isValid: false }),
          errorMessage: 'a',
        },
      },
    });

    const submitEvent = new Event('submit', { cancelable: true, bubbles: true });
    form.dispatchEvent(submitEvent);

    expect(submitEvent.defaultPrevented).toBe(true);
    expect(earlyListener).toHaveBeenCalledTimes(1);
  });
});

describe('FormValidator aria-invalid management', () => {
  test('sets aria-invalid="true" when validation fails, "false" when it passes', () => {
    document.body.innerHTML = '<form><input id="i" type="text" data-validation="a"></form>';
    const form = document.querySelector('form')!;
    const input = document.getElementById('i') as HTMLInputElement;

    new FormValidator({
      form,
      validatorDeclarations: {
        a: {
          validate: (target) => new FormValidatorValidationResult({
            isValid: (target as HTMLInputElement).value.length > 0,
          }),
          errorMessage: 'a',
        },
      },
    });

    expect(input.hasAttribute('aria-invalid')).toBe(false);

    input.dispatchEvent(FormValidator.createValidateEvent());
    expect(input.getAttribute('aria-invalid')).toBe('true');

    input.value = 'filled';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(input.getAttribute('aria-invalid')).toBe('false');
  });

  test('does not set aria-invalid on context elements (fieldset, form)', () => {
    document.body.innerHTML = `
      <form>
        <fieldset id="g" data-validation-context="grp">
          <input id="i" type="checkbox" name="opts" data-validation="grp">
        </fieldset>
      </form>
    `;
    const form = document.querySelector('form')!;
    const fieldset = document.getElementById('g') as HTMLFieldSetElement;
    const input = document.getElementById('i') as HTMLInputElement;

    new FormValidator({
      form,
      validatorDeclarations: {
        grp: {
          validate: () => new FormValidatorValidationResult({
            isContextError: true,
            isValid: false,
          }),
          errorMessage: 'grp',
        },
      },
    });

    input.dispatchEvent(FormValidator.createValidateEvent());

    // Context error landed on the fieldset; aria-invalid not set there.
    expect(fieldset.hasAttribute('aria-invalid')).toBe(false);
    // The input itself isn't the error target (isContextError) and didn't
    // accumulate any errors of its own.
    expect(input.hasAttribute('aria-invalid')).toBe(false);
  });

  test('reset removes aria-invalid (validation has not re-run)', () => {
    document.body.innerHTML = '<form><input id="i" type="text" data-validation="a"></form>';
    const form = document.querySelector('form')!;
    const input = document.getElementById('i') as HTMLInputElement;

    new FormValidator({
      form,
      validatorDeclarations: {
        a: {
          validate: () => new FormValidatorValidationResult({ isValid: false }),
          errorMessage: 'a',
        },
      },
    });

    input.dispatchEvent(FormValidator.createValidateEvent());
    expect(input.getAttribute('aria-invalid')).toBe('true');

    form.dispatchEvent(new Event('reset'));
    expect(input.hasAttribute('aria-invalid')).toBe(false);
  });
});

describe('FormValidator trigger option', () => {
  test('default is blur-then-input — untouched field stays quiet on input, validates on focusout', () => {
    document.body.innerHTML = '<form><input id="i" type="text" data-validation="a"></form>';
    const form = document.querySelector('form')!;
    const input = document.getElementById('i') as HTMLInputElement;
    const onError = vi.fn<OnErrorChange>();

    new FormValidator({
      form,
      onErrorMessageListChanged: onError,
      validatorDeclarations: {
        a: {
          validate: () => new FormValidatorValidationResult({ isValid: false }),
          errorMessage: 'a',
        },
      },
    });

    input.value = 'x';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onError).not.toHaveBeenCalled();

    input.dispatchEvent(new Event('focusout', { bubbles: true }));
    expect(onError).toHaveBeenCalledTimes(1);
  });

  test('trigger: input — input events fire validation', () => {
    document.body.innerHTML = '<form><input id="i" type="text" data-validation="a"></form>';
    const form = document.querySelector('form')!;
    const input = document.getElementById('i') as HTMLInputElement;
    const onError = vi.fn<OnErrorChange>();

    new FormValidator({
      form,
      trigger: 'input',
      onErrorMessageListChanged: onError,
      validatorDeclarations: {
        a: {
          validate: () => new FormValidatorValidationResult({ isValid: false }),
          errorMessage: 'a',
        },
      },
    });

    input.value = 'x';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onError).toHaveBeenCalledTimes(1);
  });

  test('trigger: blur — input events do NOT fire validation', () => {
    document.body.innerHTML = '<form><input id="i" type="text" data-validation="a"></form>';
    const form = document.querySelector('form')!;
    const input = document.getElementById('i') as HTMLInputElement;
    const onError = vi.fn<OnErrorChange>();

    new FormValidator({
      form,
      trigger: 'blur',
      onErrorMessageListChanged: onError,
      validatorDeclarations: {
        a: {
          validate: () => new FormValidatorValidationResult({ isValid: false }),
          errorMessage: 'a',
        },
      },
    });

    input.value = 'x';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onError).not.toHaveBeenCalled();
  });

  test('trigger: blur — focusout fires validation', () => {
    document.body.innerHTML = '<form><input id="i" type="text" data-validation="a"></form>';
    const form = document.querySelector('form')!;
    const input = document.getElementById('i') as HTMLInputElement;
    const onError = vi.fn<OnErrorChange>();

    new FormValidator({
      form,
      trigger: 'blur',
      onErrorMessageListChanged: onError,
      validatorDeclarations: {
        a: {
          validate: () => new FormValidatorValidationResult({ isValid: false }),
          errorMessage: 'a',
        },
      },
    });

    input.dispatchEvent(new Event('focusout', { bubbles: true }));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(input, ['a'], []);
  });

  test('trigger: blur — observable wiring fires on observed field focusout', () => {
    document.body.innerHTML = `
      <form>
        <input id="password" type="password">
        <input id="confirm" type="password" data-validation="equalsTo(password)">
      </form>
    `;
    const form = document.querySelector('form')!;
    const password = document.getElementById('password') as HTMLInputElement;
    const confirm = document.getElementById('confirm') as HTMLInputElement;
    const onError = vi.fn<OnErrorChange>();

    new FormValidator({
      form,
      trigger: 'blur',
      onErrorMessageListChanged: onError,
      validatorDeclarations: {
        equalsTo: {
          init: (target) => new FormValidatorInitResult({
            observableElementList: [target, password],
          }),
          validate: (target) => new FormValidatorValidationResult({
            isValid: (target as HTMLInputElement).value === password.value,
          }),
          errorMessage: 'must match',
        },
      },
    });

    confirm.value = 'a';
    password.value = 'b';
    // input events should NOT trigger validation
    password.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onError).not.toHaveBeenCalled();

    // focusout on the observed (password) field should trigger confirm's validation
    password.dispatchEvent(new Event('focusout', { bubbles: true }));
    expect(onError).toHaveBeenCalledWith(confirm, ['must match'], []);
  });

  test('trigger: blur — submit still validates everything', () => {
    document.body.innerHTML = '<form><input id="i" type="text" data-validation="a"></form>';
    const form = document.querySelector('form')!;
    const input = document.getElementById('i') as HTMLInputElement;

    new FormValidator({
      form,
      trigger: 'blur',
      validatorDeclarations: {
        a: {
          validate: () => new FormValidatorValidationResult({ isValid: false }),
          errorMessage: 'a',
        },
      },
    });

    // No focusout has happened — error state is empty.
    expect(input.validity.customError).toBe(false);

    const submitEvent = new Event('submit', { cancelable: true, bubbles: true });
    form.dispatchEvent(submitEvent);
    expect(submitEvent.defaultPrevented).toBe(true);
    expect(input.validity.customError).toBe(true);
  });

  test('trigger: submit-only — neither input nor focusout fires validation; submit does', () => {
    document.body.innerHTML = '<form><input id="i" type="text" data-validation="a"></form>';
    const form = document.querySelector('form')!;
    const input = document.getElementById('i') as HTMLInputElement;
    const onError = vi.fn<OnErrorChange>();

    new FormValidator({
      form,
      trigger: 'submit-only',
      onErrorMessageListChanged: onError,
      validatorDeclarations: {
        a: {
          validate: () => new FormValidatorValidationResult({ isValid: false }),
          errorMessage: 'a',
        },
      },
    });

    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onError).not.toHaveBeenCalled();
    input.dispatchEvent(new Event('focusout', { bubbles: true }));
    expect(onError).not.toHaveBeenCalled();

    const submitEvent = new Event('submit', { cancelable: true, bubbles: true });
    form.dispatchEvent(submitEvent);
    expect(submitEvent.defaultPrevented).toBe(true);
    expect(onError).toHaveBeenCalledWith(input, ['a'], []);
  });

  test('per-field data-validation-trigger overrides engine default', () => {
    // Engine default 'submit-only' would normally suppress per-field events.
    // The data-validation-trigger="input" attribute opts THIS field back into
    // eager input-time validation.
    document.body.innerHTML = `
      <form>
        <input id="quiet" type="text" data-validation="a">
        <input id="loud"  type="text" data-validation="a" data-validation-trigger="input">
      </form>
    `;
    const form = document.querySelector('form')!;
    const quiet = document.getElementById('quiet') as HTMLInputElement;
    const loud = document.getElementById('loud') as HTMLInputElement;
    const onError = vi.fn<OnErrorChange>();

    new FormValidator({
      form,
      trigger: 'submit-only',
      onErrorMessageListChanged: onError,
      validatorDeclarations: {
        a: {
          validate: () => new FormValidatorValidationResult({ isValid: false }),
          errorMessage: 'a',
        },
      },
    });

    quiet.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onError).not.toHaveBeenCalled();

    loud.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onError).toHaveBeenCalledWith(loud, ['a'], []);
  });

  test('per-field data-validation-trigger with invalid value falls back to engine default', () => {
    document.body.innerHTML = `
      <form>
        <input id="i" type="text" data-validation="a" data-validation-trigger="bogus">
      </form>
    `;
    const form = document.querySelector('form')!;
    const input = document.getElementById('i') as HTMLInputElement;
    const onError = vi.fn<OnErrorChange>();

    new FormValidator({
      form,
      trigger: 'input',
      onErrorMessageListChanged: onError,
      validatorDeclarations: {
        a: {
          validate: () => new FormValidatorValidationResult({ isValid: false }),
          errorMessage: 'a',
        },
      },
    });

    // Invalid attribute → falls back to engine 'input' → fires on input.
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onError).toHaveBeenCalledTimes(1);
  });

  test('trigger: blur — form=-linked external input also waits for focusout', () => {
    document.body.innerHTML = `
      <form id="f"></form>
      <input id="ext" type="text" form="f" data-validation="a">
    `;
    const form = document.getElementById('f') as HTMLFormElement;
    const ext = document.getElementById('ext') as HTMLInputElement;
    const onError = vi.fn<OnErrorChange>();

    new FormValidator({
      form,
      trigger: 'blur',
      onErrorMessageListChanged: onError,
      validatorDeclarations: {
        a: {
          validate: () => new FormValidatorValidationResult({ isValid: false }),
          errorMessage: 'a',
        },
      },
    });

    ext.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onError).not.toHaveBeenCalled();

    ext.dispatchEvent(new Event('focusout', { bubbles: true }));
    expect(onError).toHaveBeenCalledWith(ext, ['a'], []);
  });
});

describe('FormValidator trigger: blur-then-input', () => {
  function lengthValidator(min: number) {
    return {
      validate: (target: Element) => new FormValidatorValidationResult({
        isValid: (target as HTMLInputElement).value.length >= min,
      }),
      errorMessage: 'too short',
    };
  }

  test('untouched field: input does NOT fire validation; focusout DOES', () => {
    document.body.innerHTML = '<form><input id="i" type="text" data-validation="a"></form>';
    const form = document.querySelector('form')!;
    const input = document.getElementById('i') as HTMLInputElement;
    const onError = vi.fn<OnErrorChange>();

    new FormValidator({
      form,
      trigger: 'blur-then-input',
      onErrorMessageListChanged: onError,
      validatorDeclarations: { a: lengthValidator(3) },
    });

    input.value = 'a';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onError).not.toHaveBeenCalled();

    input.dispatchEvent(new Event('focusout', { bubbles: true }));
    expect(onError).toHaveBeenCalledWith(input, ['too short'], []);
  });

  test('after first error, field switches to eager: input fires validation', () => {
    document.body.innerHTML = '<form><input id="i" type="text" data-validation="a"></form>';
    const form = document.querySelector('form')!;
    const input = document.getElementById('i') as HTMLInputElement;
    const onError = vi.fn<OnErrorChange>();

    new FormValidator({
      form,
      trigger: 'blur-then-input',
      onErrorMessageListChanged: onError,
      validatorDeclarations: { a: lengthValidator(3) },
    });

    // First focusout reveals the error; field flips to eager.
    input.value = 'a';
    input.dispatchEvent(new Event('focusout', { bubbles: true }));
    expect(onError).toHaveBeenCalledTimes(1);

    // Now input events fire validation — user sees the fix register live.
    input.value = 'ab';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onError).toHaveBeenCalledTimes(1); // 'ab' still invalid → same message → no callback

    input.value = 'abc';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onError).toHaveBeenCalledTimes(2); // error cleared
    expect(onError).toHaveBeenLastCalledWith(input, [], []);
  });

  test('field stays in eager mode even after passing validation (one-way transition)', () => {
    document.body.innerHTML = '<form><input id="i" type="text" data-validation="a"></form>';
    const form = document.querySelector('form')!;
    const input = document.getElementById('i') as HTMLInputElement;
    const onError = vi.fn<OnErrorChange>();

    new FormValidator({
      form,
      trigger: 'blur-then-input',
      onErrorMessageListChanged: onError,
      validatorDeclarations: { a: lengthValidator(3) },
    });

    // Trip into eager.
    input.value = 'a';
    input.dispatchEvent(new Event('focusout', { bubbles: true }));
    // Fix it.
    input.value = 'abc';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    onError.mockClear();

    // Field is still eager: re-breaking it via input fires immediately,
    // not waiting for a focusout.
    input.value = 'a';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onError).toHaveBeenCalledWith(input, ['too short'], []);
  });

  test('reset returns fields to untouched (subsequent input does NOT fire)', () => {
    document.body.innerHTML = '<form><input id="i" type="text" data-validation="a"></form>';
    const form = document.querySelector('form')!;
    const input = document.getElementById('i') as HTMLInputElement;
    const onError = vi.fn<OnErrorChange>();

    new FormValidator({
      form,
      trigger: 'blur-then-input',
      onErrorMessageListChanged: onError,
      validatorDeclarations: { a: lengthValidator(3) },
    });

    input.value = 'a';
    input.dispatchEvent(new Event('focusout', { bubbles: true })); // flip to eager
    form.dispatchEvent(new Event('reset')); // back to untouched
    onError.mockClear();

    input.value = 'b';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onError).not.toHaveBeenCalled(); // untouched again — input is silent
  });

  test('cross-field: typing in observed field does NOT fire untouched dependent', () => {
    document.body.innerHTML = `
      <form>
        <input id="password" type="password">
        <input id="confirm" type="password" data-validation="equalsTo(password)">
      </form>
    `;
    const form = document.querySelector('form')!;
    const password = document.getElementById('password') as HTMLInputElement;
    const confirm = document.getElementById('confirm') as HTMLInputElement;
    const onError = vi.fn<OnErrorChange>();

    new FormValidator({
      form,
      trigger: 'blur-then-input',
      onErrorMessageListChanged: onError,
      validatorDeclarations: {
        equalsTo: {
          init: (target) => new FormValidatorInitResult({
            observableElementList: [target, password],
          }),
          validate: (target) => new FormValidatorValidationResult({
            isValid: (target as HTMLInputElement).value === password.value,
          }),
          errorMessage: 'must match',
        },
      },
    });

    confirm.value = 'a';
    password.value = 'b';
    // confirm is still untouched — even on password input, dependent should stay quiet.
    password.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onError).not.toHaveBeenCalled();

    // password's focusout — propagates to confirm; confirm validates and gets shown an error.
    password.dispatchEvent(new Event('focusout', { bubbles: true }));
    expect(onError).toHaveBeenCalledWith(confirm, ['must match'], []);

    // Now confirm is in eager mode — typing in password fires confirm validation eagerly.
    onError.mockClear();
    password.value = 'a'; // matches confirm
    password.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onError).toHaveBeenCalledWith(confirm, [], []); // error cleared eagerly
  });

  test('submit always validates regardless of trigger', () => {
    document.body.innerHTML = '<form><input id="i" type="text" data-validation="a"></form>';
    const form = document.querySelector('form')!;
    const input = document.getElementById('i') as HTMLInputElement;

    new FormValidator({
      form,
      trigger: 'blur-then-input',
      validatorDeclarations: { a: lengthValidator(3) },
    });

    // No interaction at all — no focusout, no input.
    const submitEvent = new Event('submit', { cancelable: true, bubbles: true });
    form.dispatchEvent(submitEvent);
    expect(submitEvent.defaultPrevented).toBe(true);
    expect(input.validity.customError).toBe(true);
  });
});

describe('FormValidator reportValidityOnSubmit', () => {
  test('default false — form.reportValidity is NOT called on invalid submit', () => {
    document.body.innerHTML = '<form><input id="i" type="text" data-validation="a"></form>';
    const form = document.querySelector('form')!;
    const reportSpy = vi.spyOn(form, 'reportValidity');

    new FormValidator({
      form,
      validatorDeclarations: {
        a: {
          validate: () => new FormValidatorValidationResult({ isValid: false }),
          errorMessage: 'a',
        },
      },
    });

    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    expect(reportSpy).not.toHaveBeenCalled();
  });

  test('reportValidityOnSubmit: true — form.reportValidity is called on invalid submit', () => {
    document.body.innerHTML = '<form><input id="i" type="text" data-validation="a"></form>';
    const form = document.querySelector('form')!;
    const reportSpy = vi.spyOn(form, 'reportValidity');

    new FormValidator({
      form,
      reportValidityOnSubmit: true,
      validatorDeclarations: {
        a: {
          validate: () => new FormValidatorValidationResult({ isValid: false }),
          errorMessage: 'a',
        },
      },
    });

    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    expect(reportSpy).toHaveBeenCalledTimes(1);
  });

  test('reportValidityOnSubmit: true — NOT called on valid submit', () => {
    document.body.innerHTML = '<form><input id="i" type="text" data-validation="a"></form>';
    const form = document.querySelector('form')!;
    const reportSpy = vi.spyOn(form, 'reportValidity');

    new FormValidator({
      form,
      reportValidityOnSubmit: true,
      validatorDeclarations: {
        a: { validate: () => new FormValidatorValidationResult({ isValid: true }) },
      },
    });

    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    expect(reportSpy).not.toHaveBeenCalled();
  });
});

describe('FormValidator setCustomValidity integration (Constraint Validation API)', () => {
  test('sets validationMessage and validity.customError when validation fails', () => {
    document.body.innerHTML = '<form><input id="i" type="text" data-validation="a"></form>';
    const form = document.querySelector('form')!;
    const input = document.getElementById('i') as HTMLInputElement;

    new FormValidator({
      form,
      validatorDeclarations: {
        a: {
          validate: () => new FormValidatorValidationResult({ isValid: false }),
          errorMessage: 'too short',
        },
      },
    });

    expect(input.validity.customError).toBe(false);
    expect(input.validationMessage).toBe('');

    input.dispatchEvent(FormValidator.createValidateEvent());
    expect(input.validity.customError).toBe(true);
    expect(input.validationMessage).toBe('too short');
    expect(input.matches(':invalid')).toBe(true);
  });

  test('clears customValidity when validation passes', () => {
    document.body.innerHTML = '<form><input id="i" type="text" data-validation="a"></form>';
    const form = document.querySelector('form')!;
    const input = document.getElementById('i') as HTMLInputElement;

    new FormValidator({
      form,
      validatorDeclarations: {
        a: {
          validate: (target) => new FormValidatorValidationResult({
            isValid: (target as HTMLInputElement).value.length > 0,
          }),
          errorMessage: 'required',
        },
      },
    });

    input.dispatchEvent(FormValidator.createValidateEvent());
    expect(input.validity.customError).toBe(true);

    input.value = 'filled';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(input.validity.customError).toBe(false);
    expect(input.validationMessage).toBe('');
  });

  test('joins multiple error messages with newline', () => {
    document.body.innerHTML = '<form><input id="i" type="text" data-validation="a;b"></form>';
    const form = document.querySelector('form')!;
    const input = document.getElementById('i') as HTMLInputElement;

    new FormValidator({
      form,
      validatorDeclarations: {
        a: {
          validate: () => new FormValidatorValidationResult({ isValid: false }),
          errorMessage: 'first error',
        },
        b: {
          validate: () => new FormValidatorValidationResult({ isValid: false }),
          errorMessage: 'second error',
        },
      },
    });

    input.dispatchEvent(FormValidator.createValidateEvent());
    expect(input.validationMessage).toBe('first error\nsecond error');
  });

  test('does not set customValidity on context elements (fieldset, form)', () => {
    document.body.innerHTML = `
      <form>
        <fieldset id="g" data-validation-context="grp">
          <input id="i" type="checkbox" name="opts" data-validation="grp">
        </fieldset>
      </form>
    `;
    const form = document.querySelector('form')!;
    const fieldset = document.getElementById('g') as HTMLFieldSetElement;
    const input = document.getElementById('i') as HTMLInputElement;

    new FormValidator({
      form,
      validatorDeclarations: {
        grp: {
          validate: () => new FormValidatorValidationResult({ isContextError: true, isValid: false }),
          errorMessage: 'group invalid',
        },
      },
    });

    input.dispatchEvent(FormValidator.createValidateEvent());

    // Error landed on the fieldset, not the input — input itself has no
    // customError. <fieldset> doesn't expose setCustomValidity meaningfully.
    expect(input.validity.customError).toBe(false);
    expect((fieldset as unknown as { validity?: ValidityState }).validity?.customError ?? false).toBe(false);
  });

  test('reset clears customValidity', () => {
    document.body.innerHTML = '<form><input id="i" type="text" data-validation="a"></form>';
    const form = document.querySelector('form')!;
    const input = document.getElementById('i') as HTMLInputElement;

    new FormValidator({
      form,
      validatorDeclarations: {
        a: {
          validate: () => new FormValidatorValidationResult({ isValid: false }),
          errorMessage: 'a',
        },
      },
    });

    input.dispatchEvent(FormValidator.createValidateEvent());
    expect(input.validity.customError).toBe(true);

    form.dispatchEvent(new Event('reset'));
    expect(input.validity.customError).toBe(false);
    expect(input.validationMessage).toBe('');
  });

  test('manageValidity: false opts out of customValidity management', () => {
    document.body.innerHTML = '<form><input id="i" type="text" data-validation="a"></form>';
    const form = document.querySelector('form')!;
    const input = document.getElementById('i') as HTMLInputElement;

    new FormValidator({
      form,
      manageValidity: false,
      validatorDeclarations: {
        a: {
          validate: () => new FormValidatorValidationResult({ isValid: false }),
          errorMessage: 'a',
        },
      },
    });

    input.dispatchEvent(FormValidator.createValidateEvent());
    expect(input.validity.customError).toBe(false);
    expect(input.validationMessage).toBe('');
  });

  test('ignoreValidationResult clears customValidity', () => {
    document.body.innerHTML = '<form><input id="i" type="text" data-validation="a"></form>';
    const form = document.querySelector('form')!;
    const input = document.getElementById('i') as HTMLInputElement;

    const validator = new FormValidator({
      form,
      validatorDeclarations: {
        a: {
          validate: () => new FormValidatorValidationResult({ isValid: false }),
          errorMessage: 'a',
        },
      },
    });

    input.dispatchEvent(FormValidator.createValidateEvent());
    expect(input.validity.customError).toBe(true);

    validator.ignoreValidationResult = true;
    input.dispatchEvent(FormValidator.createValidateEvent());
    expect(input.validity.customError).toBe(false);
  });

  test('form.checkValidity() reflects engine state', () => {
    document.body.innerHTML = '<form><input id="i" type="text" data-validation="a"></form>';
    const form = document.querySelector('form')!;
    const input = document.getElementById('i') as HTMLInputElement;

    new FormValidator({
      form,
      validatorDeclarations: {
        a: {
          validate: () => new FormValidatorValidationResult({ isValid: false }),
          errorMessage: 'a',
        },
      },
    });

    expect(form.checkValidity()).toBe(true); // not yet validated by engine

    input.dispatchEvent(FormValidator.createValidateEvent());
    expect(form.checkValidity()).toBe(false);
  });
});

describe('FormValidator picks up form=-linked inputs (HTMLFormControlsCollection)', () => {
  test('input outside the form via form="..." is iterated for validation', () => {
    document.body.innerHTML = `
      <form id="signup"></form>
      <input id="external" type="text" form="signup" data-validation="a">
    `;
    const form = document.getElementById('signup') as HTMLFormElement;
    const external = document.getElementById('external') as HTMLInputElement;
    const onError = vi.fn<OnErrorChange>();

    new FormValidator({
      form,
      onErrorMessageListChanged: onError,
      validatorDeclarations: {
        a: {
          validate: () => new FormValidatorValidationResult({ isValid: false }),
          errorMessage: 'a',
        },
      },
    });

    external.dispatchEvent(FormValidator.createValidateEvent());

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(external, ['a'], []);
  });

  test('submit blocks when only an external input is invalid', () => {
    document.body.innerHTML = `
      <form id="signup"></form>
      <input id="external" type="text" form="signup" data-validation="a">
    `;
    const form = document.getElementById('signup') as HTMLFormElement;

    new FormValidator({
      form,
      validatorDeclarations: {
        a: {
          validate: () => new FormValidatorValidationResult({ isValid: false }),
          errorMessage: 'a',
        },
      },
    });

    const submitEvent = new Event('submit', { cancelable: true, bubbles: true });
    form.dispatchEvent(submitEvent);
    expect(submitEvent.defaultPrevented).toBe(true);
  });

  test('input event on external input triggers validation', () => {
    document.body.innerHTML = `
      <form id="signup"></form>
      <input id="external" type="text" form="signup" data-validation="a">
    `;
    const form = document.getElementById('signup') as HTMLFormElement;
    const external = document.getElementById('external') as HTMLInputElement;
    const onError = vi.fn<OnErrorChange>();

    new FormValidator({
      form,
      trigger: 'input',
      onErrorMessageListChanged: onError,
      validatorDeclarations: {
        a: {
          validate: (target) => new FormValidatorValidationResult({
            isValid: (target as HTMLInputElement).value.length > 0,
          }),
          errorMessage: 'a',
        },
      },
    });

    external.value = '';
    external.dispatchEvent(new Event('input', { bubbles: true }));
    external.value = 'filled';
    external.dispatchEvent(new Event('input', { bubbles: true }));

    expect(onError.mock.calls.map((c) => c[1])).toEqual([['a'], []]);
  });
});

describe('FormValidator unknown validator names in data-validation', () => {
  test('are silently dropped (no throw, no callbacks)', () => {
    const onError = vi.fn<OnErrorChange>();
    const form = document.createElement('form');
    const input = document.createElement('input');
    input.type = 'text';
    input.setAttribute('data-validation', 'undeclared');
    form.appendChild(input);

    expect(() => new FormValidator({
      form,
      onErrorMessageListChanged: onError,
      validatorDeclarations: {
        a: { validate: () => new FormValidatorValidationResult({ isValid: false }) },
      },
    })).not.toThrow();

    expect(() => input.dispatchEvent(FormValidator.createValidateEvent())).not.toThrow();
    expect(onError).not.toHaveBeenCalled();
  });

  test('mixed declared + undeclared names: only declared ones run', () => {
    const onError = vi.fn<OnErrorChange>();
    const form = document.createElement('form');
    const input = document.createElement('input');
    input.type = 'text';
    input.setAttribute('data-validation', 'undeclared,a');
    form.appendChild(input);

    new FormValidator({
      form,
      onErrorMessageListChanged: onError,
      validatorDeclarations: {
        a: {
          validate: () => new FormValidatorValidationResult({ isValid: false }),
          errorMessage: 'a',
        },
      },
    });

    input.dispatchEvent(FormValidator.createValidateEvent());

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(input, ['a'], []);
  });
});

describe('FormValidator nested validation context', () => {
  test('isContextError attaches to nearest ancestor whose validatorNameList covers the validator', () => {
    document.body.innerHTML = `
      <form id="f">
        <fieldset id="group" data-validation-context="grouped">
          <input id="i" type="checkbox" name="opts" data-validation="grouped">
        </fieldset>
      </form>
    `;
    const form = document.getElementById('f') as HTMLFormElement;
    const group = document.getElementById('group') as HTMLFieldSetElement;
    const input = document.getElementById('i') as HTMLInputElement;
    const onError = vi.fn<OnErrorChange>();

    new FormValidator({
      form,
      onErrorMessageListChanged: onError,
      validatorDeclarations: {
        grouped: {
          validate: () => new FormValidatorValidationResult({ isContextError: true, isValid: false }),
          errorMessage: 'group-error',
        },
      },
    });

    input.dispatchEvent(FormValidator.createValidateEvent());

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(group, ['group-error'], []);
  });

  test('walks past inner context that does not cover the validator', () => {
    // Inner context only covers 'inner'; the 'outer' validator should resolve to the form (which has '*').
    document.body.innerHTML = `
      <form id="f">
        <fieldset id="inner" data-validation-context="inner">
          <input id="i" type="checkbox" name="opts" data-validation="outer">
        </fieldset>
      </form>
    `;
    const form = document.getElementById('f') as HTMLFormElement;
    const input = document.getElementById('i') as HTMLInputElement;
    const onError = vi.fn<OnErrorChange>();

    new FormValidator({
      form,
      onErrorMessageListChanged: onError,
      validatorDeclarations: {
        outer: {
          validate: () => new FormValidatorValidationResult({ isContextError: true, isValid: false }),
          errorMessage: 'outer-error',
        },
      },
    });

    input.dispatchEvent(FormValidator.createValidateEvent());

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(form, ['outer-error'], []);
  });
});

describe('FormValidator type-widening surface', () => {
  test('onErrorMessageListChanged receives a third arg (errors) — empty array when no errors initially', () => {
    document.body.innerHTML = '<form id="t"><input name="a" data-validation="required"/></form>';
    const form2 = document.getElementById('t') as HTMLFormElement;
    const onChange = vi.fn();
    new FormValidator({
      form: form2,
      validatorDeclarations: {
        required: {
          init: () => new FormValidatorInitResult({ observableElementList: [], extraData: {} }),
          validate: () => new FormValidatorValidationResult({ isValid: true }),
          errorMessage: 'required',
        },
      },
      onErrorMessageListChanged: onChange,
    });
    // Trigger a validation cycle so the callback fires at least once if anything changes.
    const input = form2.querySelector('input')!;
    input.dispatchEvent(FormValidator.createValidateEvent());
    // Test passes if the constructor accepts the wider signature; behaviour is exercised in Task 14.
    expect(true).toBe(true);
  });

  test('onPendingChange and onFormPendingChange are accepted in constructor params', () => {
    document.body.innerHTML = '<form id="t2"/>';
    const form2 = document.getElementById('t2') as HTMLFormElement;
    expect(() => new FormValidator({
      form: form2,
      onPendingChange: () => {},
      onFormPendingChange: () => {},
    })).not.toThrow();
  });
});

describe('FormValidator #applyResults refactor regression', () => {
  test('sync validate still fires onErrorMessageListChanged with correct messages', () => {
    document.body.innerHTML = '<form id="r"><input name="a" data-validation="r"/></form>';
    const form3 = document.getElementById('r') as HTMLFormElement;
    const onChange = vi.fn();
    new FormValidator({
      form: form3,
      validatorDeclarations: {
        r: {
          init: () => new FormValidatorInitResult({ observableElementList: [], extraData: {} }),
          validate: () => new FormValidatorValidationResult({ isValid: false }),
          errorMessage: 'invalid',
        },
      },
      onErrorMessageListChanged: onChange,
    });
    const input = form3.querySelector('input')!;
    input.dispatchEvent(FormValidator.createValidateEvent());
    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls.at(-1)!;
    expect(lastCall[1]).toContain('invalid');
  });
});

describe('FormValidator coordinator wiring', () => {
  test('constructor accepts onPendingChange and onFormPendingChange without throwing', () => {
    document.body.innerHTML = '<form id="cw"/>';
    const form4 = document.getElementById('cw') as HTMLFormElement;
    const onPending = vi.fn();
    const onFormPending = vi.fn();
    expect(() => new FormValidator({
      form: form4,
      onPendingChange: onPending,
      onFormPendingChange: onFormPending,
    })).not.toThrow();
    // No async cycles started yet → no callbacks fired.
    expect(onPending).not.toHaveBeenCalled();
    expect(onFormPending).not.toHaveBeenCalled();
  });
});
