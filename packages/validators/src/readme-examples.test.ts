// Each test below mirrors a code example in packages/validators/README.md
// or the root README's minimal example.
// CI failures here mean those READMEs are lying.

import { FormValidator } from '@form-validator-js/core';
import {
  required,
  minLength,
  maxLength,
  equalsTo,
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

describe('README: validators quick-start (signin form)', () => {
  test('blocks empty submit, allows submit when filled', () => {
    document.body.innerHTML = `
      <form id="signin">
        <input id="email" name="email" type="email"
               data-validation="required;maxLength(254)">
        <input id="password" name="password" type="password"
               data-validation="required;minLength(8)">
        <p id="errors"></p>
        <button>Sign in</button>
      </form>
    `;
    const form = document.getElementById('signin') as HTMLFormElement;
    const errors = document.getElementById('errors') as HTMLElement;

    new FormValidator({
      form,
      validatorDeclarations: { required, minLength, maxLength },
      onErrorMessageListChanged: (el, msgs) => {
        if (el === form) return;
        errors.textContent = msgs.join('; ');
      },
    });

    // Empty → blocked.
    const blocked = new Event('submit', { cancelable: true, bubbles: true });
    form.dispatchEvent(blocked);
    expect(blocked.defaultPrevented).toBe(true);

    // Fill valid values.
    const email = document.getElementById('email') as HTMLInputElement;
    const password = document.getElementById('password') as HTMLInputElement;
    email.value = 'alice@example.com';
    password.value = 'super-secret-pass';
    email.dispatchEvent(new Event('input', { bubbles: true }));
    password.dispatchEvent(new Event('input', { bubbles: true }));

    const allowed = new Event('submit', { cancelable: true, bubbles: true });
    form.dispatchEvent(allowed);
    expect(allowed.defaultPrevented).toBe(false);
  });
});
