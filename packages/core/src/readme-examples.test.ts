// Each test below mirrors a code example in packages/core/README.md.
// If you change a README example, change the corresponding test (and vice versa).
// CI failures here mean packages/core/README.md is lying.

import {
  FormValidator,
  FormValidatorInitResult,
  FormValidatorValidationResult,
  type ValidatorDeclaration,
} from '@form-validator-js/core';

afterEach(() => {
  document.body.innerHTML = '';
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
        <input id="i" type="text" data-validation="isAlice">
      </form>
    `;
    const form = document.querySelector('form')!;
    const input = document.getElementById('i') as HTMLInputElement;

    const isAlice: ValidatorDeclaration = {
      init: (target) => new FormValidatorInitResult({ observableElementList: [target] }),
      validate: (target) => new FormValidatorValidationResult({
        isValid: (target as HTMLInputElement).value === 'alice',
      }),
      errorMessage: 'Must be alice.',
    };

    const calls: string[][] = [];
    const validator = new FormValidator({
      form,
      validatorDeclarations: { isAlice },
      onErrorMessageListChanged(_el, m) { calls.push(m); },
    });

    validator.ignoreValidationResult = true;
    input.dispatchEvent(FormValidator.createValidateEvent());
    expect(calls).toEqual([]);

    validator.ignoreValidationResult = false;
    input.dispatchEvent(FormValidator.createValidateEvent());
    expect(calls).toEqual([['Must be alice.']]);
  });
});

describe('README async-validation snippets', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  test('defining an async validator (uniqueUsername example)', async () => {
    document.body.innerHTML = '<form id="t"><input id="u" data-validation="uniqueUsername"/></form>';
    const form = document.getElementById('t') as HTMLFormElement;
    const input = document.getElementById('u') as HTMLInputElement;

    const fakeFetch = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ taken: true }) });
    (globalThis as { fetch: unknown }).fetch = fakeFetch;

    const onChange = vi.fn();
    new FormValidator({
      form,
      validatorDeclarations: {
        uniqueUsername: {
          init: (target) => new FormValidatorInitResult({ observableElementList: [target], extraData: {} }),
          async validate(target, _data, opts) {
            const value = (target as HTMLInputElement).value;
            if (value.length < 3) return new FormValidatorValidationResult({ isValid: false });
            const r = await fetch(`/api/username-available?u=${encodeURIComponent(value)}`, { signal: opts!.signal });
            const taken = (await r.json()).taken;
            return new FormValidatorValidationResult({ isValid: !taken });
          },
          errorMessage: { '': 'Username taken', error: 'Could not verify, try again' },
        },
      },
      onErrorMessageListChanged: onChange,
    });

    input.value = 'foobar';
    input.dispatchEvent(FormValidator.createValidateEvent());
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

    const lastCall = onChange.mock.calls.at(-1)!;
    expect(lastCall[1]).toContain('Username taken');
  });

  test('debounce recipe: wait helper aborts on signal', async () => {
    function wait(ms: number, signal: AbortSignal): Promise<void> {
      return new Promise((resolve, reject) => {
        const t = setTimeout(resolve, ms);
        signal.addEventListener('abort', () => {
          clearTimeout(t);
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    }
    const ctrl = new AbortController();
    const p = wait(1000, ctrl.signal);
    ctrl.abort();
    await expect(p).rejects.toThrow();
  });

  test('pending callbacks fire as documented', async () => {
    document.body.innerHTML = '<form id="t2"><input id="u2" data-validation="a"/></form>';
    const form = document.getElementById('t2') as HTMLFormElement;
    const input = document.getElementById('u2') as HTMLInputElement;
    let resolveFn!: (r: FormValidatorValidationResult) => void;
    const onPending = vi.fn();
    const onFormPending = vi.fn();
    new FormValidator({
      form,
      validatorDeclarations: {
        a: {
          init: (target) => new FormValidatorInitResult({ observableElementList: [target], extraData: {} }),
          validate: () => new Promise<FormValidatorValidationResult>((res) => { resolveFn = res; }),
          errorMessage: 'invalid',
        },
      },
      onPendingChange: onPending,
      onFormPendingChange: onFormPending,
    });
    input.dispatchEvent(FormValidator.createValidateEvent());
    expect(onPending).toHaveBeenCalledWith(input, true);
    expect(onFormPending).toHaveBeenCalledWith(true);
    resolveFn(new FormValidatorValidationResult({ isValid: true }));
    await Promise.resolve(); await Promise.resolve();
    expect(onPending).toHaveBeenLastCalledWith(input, false);
    expect(onFormPending).toHaveBeenLastCalledWith(false);
  });

  test('default failure subtype "error" lands in errors[]', async () => {
    document.body.innerHTML = '<form id="t3"><input id="u3" data-validation="a"/></form>';
    const form = document.getElementById('t3') as HTMLFormElement;
    const input = document.getElementById('u3') as HTMLInputElement;
    const onChange = vi.fn();
    new FormValidator({
      form,
      validatorDeclarations: {
        a: {
          init: (target) => new FormValidatorInitResult({ observableElementList: [target], extraData: {} }),
          validate: () => Promise.reject(new Error('network')),
          errorMessage: { error: 'Could not verify, try again' },
        },
      },
      onErrorMessageListChanged: onChange,
    });
    input.dispatchEvent(FormValidator.createValidateEvent());
    await Promise.resolve(); await Promise.resolve();
    const lastCall = onChange.mock.calls.at(-1)!;
    const errors = lastCall[2];
    expect(errors.some((e: { subtype: string }) => e.subtype === 'error')).toBe(true);
  });

  test('retry button pattern: validator.retry runs only the named validator', () => {
    document.body.innerHTML = '<form id="t4"><input id="u4" data-validation="a"/></form>';
    const form = document.getElementById('t4') as HTMLFormElement;
    const input = document.getElementById('u4') as HTMLInputElement;
    const validate = vi.fn(() => new FormValidatorValidationResult({ isValid: true }));
    const v = new FormValidator({
      form,
      validatorDeclarations: {
        a: {
          init: (target) => new FormValidatorInitResult({ observableElementList: [target], extraData: {} }),
          validate,
          errorMessage: 'invalid',
        },
      },
    });
    validate.mockClear();
    v.retry(input, 'a');
    expect(validate).toHaveBeenCalledTimes(1);
  });

  test('injection pattern still works (existing behavior preserved)', () => {
    document.body.innerHTML = '<form id="t5"><input id="u5" data-validation="a"/></form>';
    const form = document.getElementById('t5') as HTMLFormElement;
    const input = document.getElementById('u5') as HTMLInputElement;
    const validate = vi.fn(() => new FormValidatorValidationResult({ isValid: true }));
    const onChange = vi.fn();
    new FormValidator({
      form,
      validatorDeclarations: {
        a: {
          init: (target) => new FormValidatorInitResult({ observableElementList: [target], extraData: {} }),
          validate,
          errorMessage: 'invalid',
        },
      },
      onErrorMessageListChanged: onChange,
    });
    input.dispatchEvent(FormValidator.createValidateEvent({
      data: { a: new FormValidatorValidationResult({ isValid: false }) },
    }));
    expect(validate).not.toHaveBeenCalled();
    const lastCall = onChange.mock.calls.at(-1)!;
    expect(lastCall[1]).toContain('invalid');
  });
});
