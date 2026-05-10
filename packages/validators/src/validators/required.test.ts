import { FormValidator, type FormValidatorInitResult, type FormValidatorValidationResult } from '@form-validator-js/core';
import { required } from '@form-validator-js/validators';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('required.init', () => {
  test('text input', () => {
    document.body.innerHTML = `<form id="attrs-test">
  <input type="text" id="that" data-validation="required">
  </form>`;

    const form = document.getElementById('attrs-test') as HTMLFormElement;
    const requiredMock = {
      init: vi.fn(required.init),
      validate: vi.fn(required.validate),
    };

    new FormValidator({ trigger: 'input',
      form,
      validatorDeclarations: { required: requiredMock },
    });

    const that = form.querySelector<HTMLInputElement>('#that');

    expect(requiredMock.init.mock.calls.length).toBe(1);
    expect(requiredMock.init.mock.calls[0][0]).toBe(that);
    expect((requiredMock.init.mock.results[0].value as FormValidatorInitResult).observableElementList)
      .toEqual([that]);
  });

  test('checkbox input', () => {
    document.body.innerHTML = `<form id="attrs-test">
  <input type="checkbox" id="that" name="required" data-validation="required">
  <input type="checkbox" id="other" name="required">
  </form>`;

    const form = document.getElementById('attrs-test') as HTMLFormElement;
    const requiredMock = {
      init: vi.fn(required.init),
      validate: vi.fn(required.validate),
    };

    new FormValidator({ trigger: 'input',
      form,
      validatorDeclarations: { required: requiredMock },
    });

    const that = form.querySelector<HTMLInputElement>('#that');
    const other = form.querySelector<HTMLInputElement>('#other');

    expect(requiredMock.init.mock.calls.length).toBe(1);
    expect(requiredMock.init.mock.calls[0][0]).toBe(that);
    expect((requiredMock.init.mock.results[0].value as FormValidatorInitResult).observableElementList)
      .toEqual([that, other]);
  });

  test('non-form-control element with data-validation is silently skipped', () => {
    // The engine iterates form.elements (the standard HTMLFormControlsCollection),
    // which excludes plain elements like <div>. data-validation on a non-control
    // is a no-op: no validators run, no errors thrown.
    document.body.innerHTML = `<form id="attrs-test">
  <div data-validation="required">
  </form>`;

    const form = document.getElementById('attrs-test') as HTMLFormElement;

    expect(() => {
      new FormValidator({ trigger: 'input',
        form,
        validatorDeclarations: { required },
      });
    }).not.toThrow();
  });

  test('checkbox with CSS-special-character name resolves the group', () => {
    // `name="opts[]"` (PHP array style) is invalid in a CSS attribute selector
    // but valid for getElementsByName.
    document.body.innerHTML = `<form id="attrs-test">
      <input type="checkbox" id="that" name="opts[]" data-validation="required">
      <input type="checkbox" id="other" name="opts[]">
    </form>`;
    const form = document.getElementById('attrs-test') as HTMLFormElement;
    const that = document.getElementById('that') as HTMLInputElement;
    const other = document.getElementById('other') as HTMLInputElement;
    const requiredMock = {
      init: vi.fn(required.init),
      validate: vi.fn(required.validate),
    };

    new FormValidator({ trigger: 'input', form, validatorDeclarations: { required: requiredMock } });

    expect(
      (requiredMock.init.mock.results[0].value as FormValidatorInitResult).observableElementList,
    ).toEqual([that, other]);
  });

  test('checkbox without a name attribute is treated as a one-element group', () => {
    document.body.innerHTML = `<form id="attrs-test">
      <input type="checkbox" id="lonely" data-validation="required">
    </form>`;
    const form = document.getElementById('attrs-test') as HTMLFormElement;
    const lonely = document.getElementById('lonely') as HTMLInputElement;
    const requiredMock = {
      init: vi.fn(required.init),
      validate: vi.fn(required.validate),
    };

    new FormValidator({ trigger: 'input', form, validatorDeclarations: { required: requiredMock } });

    expect(
      (requiredMock.init.mock.results[0].value as FormValidatorInitResult).observableElementList,
    ).toEqual([lonely]);

    lonely.checked = true;
    lonely.dispatchEvent(new Event('input', { bubbles: true }));
    lonely.checked = false;
    lonely.dispatchEvent(new Event('input', { bubbles: true }));

    expect(
      requiredMock.validate.mock.results.map(
        (r) => (r.value as FormValidatorValidationResult).isValid,
      ),
    ).toEqual([true, false]);
  });
});

describe('required on extended input types', () => {
  // Each type has its own value-acceptance rules — pick a sample value the
  // platform will accept for the given input type.
  const samples: Array<[string, string]> = [
    ['email', 'a@b.co'],
    ['url', 'https://example.com'],
    ['search', 'something'],
    ['number', '42'],
    ['date', '2024-01-01'],
  ];

  test.each(samples)('works on input type=%s', (type, validValue) => {
    document.body.innerHTML = `<form id="attrs-test">
      <input type="${type}" id="i" data-validation="required">
    </form>`;
    const form = document.getElementById('attrs-test') as HTMLFormElement;
    const input = document.getElementById('i') as HTMLInputElement;
    const calls: Array<[Element, string[]]> = [];

    new FormValidator({ trigger: 'input',
      form,
      validatorDeclarations: { required: { ...required, errorMessage: 'r' } },
      onErrorMessageListChanged(el, m) { calls.push([el, m]); },
    });

    input.dispatchEvent(FormValidator.createValidateEvent());
    input.value = validValue;
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(calls).toEqual([
      [input, ['r']],
      [input, []],
    ]);
  });

  test('required on type=hidden — value-emptiness check applies', () => {
    // Hidden fields are not user-editable, but `required` still checks
    // their string value, useful for ensuring server-set fields exist.
    document.body.innerHTML = `<form id="attrs-test">
      <input type="hidden" id="h" data-validation="required">
    </form>`;
    const form = document.getElementById('attrs-test') as HTMLFormElement;
    const hidden = document.getElementById('h') as HTMLInputElement;
    const calls: Array<[Element, string[]]> = [];

    new FormValidator({ trigger: 'input',
      form,
      validatorDeclarations: { required: { ...required, errorMessage: 'r' } },
      onErrorMessageListChanged(el, m) { calls.push([el, m]); },
    });

    hidden.dispatchEvent(FormValidator.createValidateEvent());
    hidden.value = 'token-abc';
    hidden.dispatchEvent(FormValidator.createValidateEvent());

    expect(calls.map(([, m]) => m)).toEqual([['r'], []]);
  });

  test('required on type=file — value-emptiness check maps to file selection', () => {
    document.body.innerHTML = `<form id="attrs-test">
      <input type="file" id="f" data-validation="required">
    </form>`;
    const form = document.getElementById('attrs-test') as HTMLFormElement;
    const file = document.getElementById('f') as HTMLInputElement;

    expect(() => new FormValidator({ trigger: 'input',
      form,
      validatorDeclarations: { required: { ...required, errorMessage: 'choose a file' } },
    })).not.toThrow();

    // Empty value === no file selected → invalid.
    file.dispatchEvent(FormValidator.createValidateEvent());
    expect(file.validity.customError).toBe(true);
    expect(file.validationMessage).toBe('choose a file');
  });

  test('required on type=color — always passes (browser guarantees a value)', () => {
    document.body.innerHTML = `<form id="attrs-test">
      <input type="color" id="c" data-validation="required">
    </form>`;
    const form = document.getElementById('attrs-test') as HTMLFormElement;
    const color = document.getElementById('c') as HTMLInputElement;

    new FormValidator({ trigger: 'input',
      form,
      validatorDeclarations: { required },
    });

    color.dispatchEvent(FormValidator.createValidateEvent());
    expect(color.validity.customError).toBe(false);
  });
});

describe('required.validate', () => {
  test('input type = text', () => {
    document.body.innerHTML = `<form id="attrs-test">
  <input type="text" id="that" name="username" data-validation="required">
  </form>`;

    const form = document.getElementById('attrs-test') as HTMLFormElement;
    const requiredMock = {
      init: vi.fn(required.init),
      validate: vi.fn(required.validate),
    };

    new FormValidator({ trigger: 'input',
      form,
      validatorDeclarations: { required: requiredMock },
    });

    const that = form.querySelector<HTMLInputElement>('#that')!;

    that.value = '';
    that.dispatchEvent(new Event('input', { bubbles: true }));
    that.value = 'some text';
    that.dispatchEvent(new Event('input', { bubbles: true }));
    that.value = '';
    that.dispatchEvent(new Event('input', { bubbles: true }));

    expect(
      requiredMock.validate.mock.results.map(
        (result) => (result.value as FormValidatorValidationResult).isValid,
      ),
    ).toEqual([false, true, false]);
  });

  test('input type = checkbox', () => {
    document.body.innerHTML = `<form id="attrs-test">
  <input type="checkbox" id="that" name="required" data-validation="required">
  <input type="checkbox" id="other" name="required">
  </form>`;

    const form = document.getElementById('attrs-test') as HTMLFormElement;
    const requiredMock = {
      init: vi.fn(required.init),
      validate: vi.fn(required.validate),
    };

    new FormValidator({ trigger: 'input',
      form,
      validatorDeclarations: { required: requiredMock },
    });

    const that = form.querySelector<HTMLInputElement>('#that')!;
    const other = form.querySelector<HTMLInputElement>('#other')!;

    that.checked = true;
    that.dispatchEvent(new Event('input', { bubbles: true }));
    that.checked = false;
    that.dispatchEvent(new Event('input', { bubbles: true }));
    other.checked = true;
    other.dispatchEvent(new Event('input', { bubbles: true }));
    other.checked = false;
    other.dispatchEvent(new Event('input', { bubbles: true }));

    expect(
      requiredMock.validate.mock.results.map(
        (result) => (result.value as FormValidatorValidationResult).isValid,
      ),
    ).toEqual([true, false, true, false]);
  });
});
