// Each test below mirrors a code example in the project README.
// If you change a README example, change the corresponding test (and vice versa).
// CI failures here mean the README is lying.

import {
  FormValidator,
  FormValidatorInitResult,
  FormValidatorValidationResult,
  type ValidatorDeclaration,
} from '@form-validator-js/core';
import {
  required,
  minLength,
  equalsTo,
  checkedCount,
} from '@form-validator-js/validators';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('README: minimal example (signup form)', () => {
  test('blocks submit while invalid; allows submit once filled correctly', () => {
    document.body.innerHTML = `
      <form id="signup">
        <input id="username" name="username" type="text"     data-validation="required;minLength(3)">
        <input id="password" name="password" type="password" data-validation="required;minLength(8)">
        <input id="confirm"  name="confirm"  type="password" data-validation="required;equalsTo(password)">
        <ul id="errors"></ul>
        <button>Sign up</button>
      </form>
    `;
    const form = document.getElementById('signup') as HTMLFormElement;
    const errorList = document.getElementById('errors') as HTMLUListElement;

    new FormValidator({
      form,
      validatorDeclarations: {
        required: { ...required, errorMessage: 'This field is required.' },
        minLength: { ...minLength, errorMessage: 'Too short.' },
        equalsTo: { ...equalsTo, errorMessage: 'Passwords must match.' },
      },
      onErrorMessageListChanged(element, messages) {
        if (element === form) return;
        errorList.innerHTML = messages.map((m) => `<li>${m}</li>`).join('');
      },
    });

    // Empty form: submit blocked.
    const blocked = new Event('submit', { cancelable: true, bubbles: true });
    form.dispatchEvent(blocked);
    expect(blocked.defaultPrevented).toBe(true);

    // Fill in valid values.
    const username = document.getElementById('username') as HTMLInputElement;
    const password = document.getElementById('password') as HTMLInputElement;
    const confirm = document.getElementById('confirm') as HTMLInputElement;
    username.value = 'alice';
    username.dispatchEvent(new Event('input', { bubbles: true }));
    password.value = 'super-secret';
    password.dispatchEvent(new Event('input', { bubbles: true }));
    confirm.value = 'super-secret';
    confirm.dispatchEvent(new Event('input', { bubbles: true }));

    const allowed = new Event('submit', { cancelable: true, bubbles: true });
    form.dispatchEvent(allowed);
    expect(allowed.defaultPrevented).toBe(false);
  });

  test('equalsTo re-validates confirm when password changes', () => {
    // README claim: "the password field re-validates `confirm` via `equalsTo`."
    document.body.innerHTML = `
      <form>
        <input id="password" type="password">
        <input id="confirm" type="password" data-validation="equalsTo(password)">
      </form>
    `;
    const form = document.querySelector('form')!;
    const password = document.getElementById('password') as HTMLInputElement;
    const confirm = document.getElementById('confirm') as HTMLInputElement;

    const calls: Array<[Element, string[]]> = [];
    new FormValidator({
      form,
      validatorDeclarations: { equalsTo: { ...equalsTo, errorMessage: 'must match' } },
      onErrorMessageListChanged(el, m) { calls.push([el, m]); },
    });

    // Default trigger is 'blur-then-input': flip confirm into eager mode by
    // first triggering a focusout that surfaces the mismatch error. Subsequent
    // input on either field then propagates eagerly through observable wiring.
    confirm.value = 'a';
    confirm.dispatchEvent(new Event('focusout', { bubbles: true })); // mismatch → error, confirm now eager
    password.value = 'a';
    password.dispatchEvent(new Event('input', { bubbles: true })); // observable input clears confirm

    expect(calls).toEqual([
      [confirm, ['must match']],
      [confirm, []],
    ]);
  });
});

describe('README: custom validator (noWhitespace)', () => {
  test('rejects values containing whitespace, accepts ones without', () => {
    document.body.innerHTML = `
      <form>
        <input id="i" type="text" data-validation="noWhitespace">
      </form>
    `;
    const form = document.querySelector('form')!;
    const input = document.getElementById('i') as HTMLInputElement;

    const noWhitespace: ValidatorDeclaration = {
      init: (target) => new FormValidatorInitResult({ observableElementList: [target] }),
      validate: (target) => new FormValidatorValidationResult({
        isValid: !/\s/.test((target as HTMLInputElement).value),
      }),
      errorMessage: 'Cannot contain whitespace.',
    };

    const calls: string[][] = [];
    // Test uses trigger:'input' for deterministic per-input assertions.
    // Custom-validator example in the README is about the validator shape,
    // not the trigger UX, so this divergence from the default is benign.
    new FormValidator({
      form,
      trigger: 'input',
      validatorDeclarations: { noWhitespace },
      onErrorMessageListChanged(_el, m) { calls.push(m); },
    });

    input.value = 'has space';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.value = 'nospaces';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(calls).toEqual([
      ['Cannot contain whitespace.'],
      [],
    ]);
  });
});

describe('README: multi-rule validator (strongPassword subtypes)', () => {
  test('emits one message per failing requirement; empty when all pass', () => {
    document.body.innerHTML = `
      <form>
        <input id="p" type="password" data-validation="strongPassword">
      </form>
    `;
    const form = document.querySelector('form')!;
    const input = document.getElementById('p') as HTMLInputElement;

    const strongPassword: ValidatorDeclaration = {
      init: (target) => new FormValidatorInitResult({ observableElementList: [target] }),
      validate: (target) => {
        const value = (target as HTMLInputElement).value;
        const missing: string[] = [];
        if (!/[A-Z]/.test(value)) missing.push('uppercase');
        if (!/[a-z]/.test(value)) missing.push('lowercase');
        if (!/\d/.test(value)) missing.push('digit');
        if (!/[!@#$%^&*]/.test(value)) missing.push('symbol');
        return new FormValidatorValidationResult({
          isValid: missing.length === 0,
          validatorSubtypeList: missing,
        });
      },
      errorMessage: {
        uppercase: 'Add an uppercase letter.',
        lowercase: 'Add a lowercase letter.',
        digit: 'Add a digit.',
        symbol: 'Add a symbol (!@#$%^&*).',
      },
    };

    const calls: string[][] = [];
    // trigger:'input' for deterministic per-input assertions; the README
    // example is about subtype emission, not trigger UX.
    new FormValidator({
      form,
      trigger: 'input',
      validatorDeclarations: { strongPassword },
      onErrorMessageListChanged(_el, m) { calls.push(m); },
    });

    input.value = 'abc';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.value = 'Abc1!';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(calls).toEqual([
      ['Add an uppercase letter.', 'Add a digit.', 'Add a symbol (!@#$%^&*).'],
      [],
    ]);
  });
});

describe('README: validation contexts', () => {
  test('isContextError attaches to the fieldset, not the field', () => {
    document.body.innerHTML = `
      <form>
        <fieldset id="opts" data-validation-context="checkedCount">
          <input type="checkbox" name="opts" data-validation="checkedCount(1,3)">
          <input type="checkbox" name="opts">
          <input type="checkbox" name="opts">
        </fieldset>
      </form>
    `;
    const form = document.querySelector('form')!;
    const fieldset = document.getElementById('opts') as HTMLFieldSetElement;
    const first = fieldset.querySelector<HTMLInputElement>('input')!;

    const calls: Array<[Element, string[]]> = [];
    new FormValidator({
      form,
      validatorDeclarations: { checkedCount: { ...checkedCount, errorMessage: 'pick 1 to 3' } },
      onErrorMessageListChanged(el, m) { calls.push([el, m]); },
    });

    first.dispatchEvent(FormValidator.createValidateEvent());

    expect(calls).toEqual([[fieldset, ['pick 1 to 3']]]);
  });
});

describe('README: per-field error message overrides', () => {
  test('set, delete, clear cycle', () => {
    document.body.innerHTML = `
      <form>
        <input id="u" type="text" data-validation="required">
      </form>
    `;
    const form = document.querySelector('form')!;
    const username = document.getElementById('u') as HTMLInputElement;

    const calls: string[][] = [];
    const validator = new FormValidator({
      form,
      validatorDeclarations: { required: { ...required, errorMessage: 'default' } },
      onErrorMessageListChanged(el, m) { if (el === username) calls.push(m); },
    });

    username.dispatchEvent(FormValidator.createValidateEvent());
    validator.elementToSpecificErrorMessageMap.set(username, { required: 'Choose a username.' });
    username.dispatchEvent(FormValidator.createValidateEvent());
    validator.elementToSpecificErrorMessageMap.delete(username);
    username.dispatchEvent(FormValidator.createValidateEvent());
    validator.elementToSpecificErrorMessageMap.set(username, { required: 'Pick one.' });
    username.dispatchEvent(FormValidator.createValidateEvent());
    validator.elementToSpecificErrorMessageMap.clear();
    username.dispatchEvent(FormValidator.createValidateEvent());

    expect(calls).toEqual([
      ['default'],
      ['Choose a username.'],
      ['default'],
      ['Pick one.'],
      ['default'],
    ]);
  });
});

describe('README: injecting validation results (createValidateEvent { data })', () => {
  test('injected result replaces the validator\'s own output for that event', () => {
    document.body.innerHTML = `
      <form>
        <input id="u" type="text" data-validation="uniqueUsername">
      </form>
    `;
    const form = document.querySelector('form')!;
    const usernameInput = document.getElementById('u') as HTMLInputElement;

    const localValidate = vi.fn(() => new FormValidatorValidationResult({ isValid: false }));
    const calls: string[][] = [];

    new FormValidator({
      form,
      validatorDeclarations: {
        uniqueUsername: { validate: localValidate, errorMessage: 'taken' },
      },
      onErrorMessageListChanged(_el, m) { calls.push(m); },
    });

    usernameInput.dispatchEvent(FormValidator.createValidateEvent({
      data: {
        uniqueUsername: new FormValidatorValidationResult({ isValid: true }),
      },
    }));

    // Local validator is bypassed; injected isValid:true means no error.
    expect(localValidate).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });
});

describe('README: ignoreValidationResult', () => {
  test('rewrites results to isValid: true, and toggling back restores blocking', () => {
    document.body.innerHTML = `
      <form>
        <input id="i" type="text" data-validation="required">
      </form>
    `;
    const form = document.querySelector('form')!;
    const input = document.getElementById('i') as HTMLInputElement;

    const calls: string[][] = [];
    const validator = new FormValidator({
      form,
      validatorDeclarations: { required: { ...required, errorMessage: 'required' } },
      onErrorMessageListChanged(_el, m) { calls.push(m); },
    });

    validator.ignoreValidationResult = true;
    input.dispatchEvent(FormValidator.createValidateEvent());
    expect(calls).toEqual([]);

    validator.ignoreValidationResult = false;
    input.dispatchEvent(FormValidator.createValidateEvent());
    expect(calls).toEqual([['required']]);
  });
});
