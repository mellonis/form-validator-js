# form-validator-js

Declarative form validation for vanilla TypeScript / JavaScript, driven by `data-` attributes on HTML form fields. Bring your own rendering — the library only manages validity state and error messages.

> **Status:** `1.0.0`.

## When this fits, when it doesn't

This is the Parsley.js / jQuery Validate style: rules go in HTML, JS just wires up the engine. Good for:

- Server-rendered apps with light JS (Rails/Hotwire, Django, Laravel, plain HTML + HTMX, Alpine).
- No-build static sites.
- Codebases that don't already have a form-state library.

If you're on a component framework with state-managed forms (React, Vue, Svelte, Solid), reach for `react-hook-form` + `zod`, `@tanstack/form` + `valibot`, or similar. Schema-first validation with full TypeScript inference is a better fit there.

## Install

```sh
npm install @form-validator-js/core @form-validator-js/validators
```

`@form-validator-js/validators` declares `core` as a `peerDependency` pinned to the same version. They are versioned together.

## Minimal example

```html
<form id="signup">
  <input id="username" name="username" type="text"     data-validation="required;minLength(3)">
  <input id="password" name="password" type="password" data-validation="required;minLength(8)">
  <input id="confirm"  name="confirm"  type="password" data-validation="required;equalsTo(password)">
  <ul id="errors"></ul>
  <button>Sign up</button>
</form>
```

```ts
import { FormValidator } from '@form-validator-js/core';
import { required, minLength, equalsTo } from '@form-validator-js/validators';

const form = document.getElementById('signup') as HTMLFormElement;
const errorList = document.getElementById('errors') as HTMLUListElement;

new FormValidator({
  form,
  validatorDeclarations: {
    required:  { ...required,  errorMessage: 'This field is required.' },
    minLength: { ...minLength, errorMessage: 'Too short.' },
    equalsTo:  { ...equalsTo,  errorMessage: 'Passwords must match.' },
  },
  onErrorMessageListChanged(element, messages) {
    // Called whenever an element's error-message list changes.
    // Render however you like; here we dump them into a single list.
    // Cross-field: typing in `password` triggers re-validation of `confirm`
    // through equalsTo's observable wiring.
    if (element === form) return;
    errorList.innerHTML = messages.map((m) => `<li>${m}</li>`).join('');
  },
});
```

The form gets `novalidate` set automatically, so the browser's built-in validation UI is suppressed.

Validation runs:

- **Per field** — on `input` and/or `focusout`, depending on the [`trigger`](#validation-timing) option. Default is `'blur-then-input'`: validate on focusout until a field has been shown an error, then eagerly on input. Cross-field reactivity (e.g. password change re-validating `confirm` via `equalsTo`) follows the same rule.
- **On `submit`** — every field is validated. If any validator returns `isValid: false`, the submit is `preventDefault`'d.
- **On `reset`** — every error is cleared.

Inputs linked to the form via the `form="formId"` attribute (outside the form element in the DOM) are also picked up — both for validation and for submit blocking.

> **Construct `FormValidator` before attaching other `submit` listeners on the same form.** On an invalid submit, the validator calls `stopImmediatePropagation` so other submit handlers (analytics, save, integrations) don't observe the failed attempt. DOM listener order is registration order on the target — listeners attached **before** `new FormValidator(...)` will still fire. Register the validator first.

## Built-in validators

"Text-like input" below means any of: `text`, `password`, `tel`, `email`, `url`, `search`, `number`, `date`, `time`, `datetime-local`, `month`, `week`, `color`, `range`, `hidden`. An `<input>` without a `type` attribute defaults to `text`.

`<input type="file">` is supported by `required` only (`value` non-empty maps to "file is selected"). For real file validation — size, MIME type, count — write a custom validator that reads `target.files`. `minLength`/`maxLength`/`pattern` reject `type="file"` because they would otherwise check the browser's fake-path string (`'C:\fakepath\…'`), which isn't useful.

| Name | DSL | Argument | Notes |
| --- | --- | --- | --- |
| `required` | `required` | none | Text-like input, `<textarea>`, `<select>`: non-empty value. Checkbox/radio: at least one in the group is checked. |
| `minLength` | `minLength(3)` | min character count | Text-like input or `<textarea>`. Counts UTF-16 code units (matches native `minlength`). |
| `maxLength` | `maxLength(20)` | max character count | Text-like input or `<textarea>`. Counts UTF-16 code units (matches native `maxlength`). |
| `pattern` | `pattern(\d{4})` | regex source | Text-like input or `<textarea>`. The regex is auto-anchored (`^(?:…)$`) so it must match the entire value, matching native `pattern`. Empty value passes — combine with `required` to forbid empty. |
| `equalsTo` | `equalsTo(password)` | id of another field | Cross-field equality, e.g. password confirmation. Strict `===` — Unicode normalization is **not** applied (`'café'` in NFC and NFD are not equal). Intentional, so password matching is byte-exact. |
| `checkedCount` | `checkedCount(1,3)` | `min`, `max`, or `min,max` | Group min/max for checkboxes / radios. `,N` means up to N. `N,` means N or more. |
| `numeric` | `numeric` | none | `type="number"`, `date`, `time`, `month`, `week`, `datetime-local`. Rejects unparseable input (`validity.badInput`, plus a defensive parse-side check). Empty value passes — compose with `required`. |
| `min` | `min(10)` / `min(2026-01-01)` | lower bound | `type="number"`, `date`, `time`, `month`, `week`, `datetime-local`. Bound is parsed in the input's own format. Empty / bad-input passes (compose with `required` / `numeric`). |
| `max` | `max(100)` / `max(2026-12-31)` | upper bound | Same types as `min`. Empty / bad-input passes. |
| `step` | `step(0.5)` / `step(7, 2026-01-05)` / `step(900, 09:00)` | `step` or `step,base` | Same types as `min`. The `step` argument is in the type's natural unit (number: 1; date: 1 day; time: 1 s; month: 1 month; week: 1 week; datetime-local: 1 s) and is scaled to compare against the value. Default base is `0` — except `week`, where default base is the Monday of `1970-W01` so the grid lines up with valid week values. Compared within `1e-9` to absorb FP error. Empty / bad-input passes. |

## Custom validators

A validator declaration is `{ init, validate, errorMessage? }`:

```ts
import {
  FormValidator,
  FormValidatorInitResult,
  FormValidatorValidationResult,
  type ValidatorDeclaration,
} from '@form-validator-js/core';

const noWhitespace: ValidatorDeclaration = {
  init: (target) => new FormValidatorInitResult({ observableElementList: [target] }),
  validate: (target) => new FormValidatorValidationResult({
    isValid: !/\s/.test((target as HTMLInputElement).value),
  }),
  errorMessage: 'Cannot contain whitespace.',
};

new FormValidator({
  form,
  validatorDeclarations: { noWhitespace },
});
```

`init` returns `observableElementList` — every other element whose `input` event should re-trigger this field's validation. `validate` returns `isValid`, with optional `isContextError` (see [Validation contexts](#validation-contexts)) and `validatorSubtypeList` (lets one validator emit multiple distinct error keys). See `packages/validators/src/` for the built-ins as reference implementations.

### Multiple rules in one validator (subtypes)

`validatorSubtypeList` paired with a `{ subtype: message }` map for `errorMessage` lets one validator emit several errors at once — useful for rules that decompose into independent checks, like password complexity:

```ts
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
```

For `abc` the rendered error list contains three messages (uppercase, digit, symbol missing); for `Abc1!` it's empty. Each subtype maps to its own message, and `onErrorMessageListChanged` receives the union.

## Validation contexts

By default, errors attach to the field that produced them. For group-level errors (radio/checkbox groups, fieldsets, multi-step sections), set `isContextError: true` and the error attaches to the nearest ancestor whose `data-validation-context` covers the validator name.

```html
<fieldset data-validation-context="checkedCount">
  <input type="checkbox" name="opts" data-validation="checkedCount(1,3)">
  <input type="checkbox" name="opts">
  <input type="checkbox" name="opts">
</fieldset>
```

The form gets `data-validation-context="*"` (matches any validator) automatically, so any context-error without a more specific ancestor lands on the form.

## Per-field error message overrides

```ts
const validator = new FormValidator({ /* ... */ });

validator.elementToSpecificErrorMessageMap.set(usernameInput, {
  required: 'Choose a username.',
  minLength: 'Usernames must be at least 3 characters.',
});

validator.elementToSpecificErrorMessageMap.delete(usernameInput);
validator.elementToSpecificErrorMessageMap.clear();
```

## Injecting validation results (async checks)

For async or server-side checks (uniqueness, captcha, virus scan), dispatch a validation event via `FormValidator.createValidateEvent` and supply the result inline:

```ts
import { FormValidator, FormValidatorValidationResult } from '@form-validator-js/core';

async function checkUsernameUniqueness(value: string) {
  const taken = await fetch(`/api/username-available?u=${value}`).then((r) => r.json());

  usernameInput.dispatchEvent(FormValidator.createValidateEvent({
    data: {
      uniqueUsername: new FormValidatorValidationResult({ isValid: !taken }),
    },
  }));
}
```

The injected result is used for that validator on that one event instead of running its `validate` function.

## Validation timing

By default, the engine waits to validate until a field loses focus, then switches to eager validation once an error has been shown. The `trigger` constructor option chooses among four modes:

```ts
new FormValidator({
  form,
  trigger: 'input' | 'blur' | 'blur-then-input' | 'submit-only',
  // default 'blur-then-input'
});
```

- **`'blur-then-input'`** (default): validate on `focusout` until a field has been shown an error; once it has, validate eagerly on `input` for that field. The transition is one-way per field — fixing the error keeps the field in eager mode. `reset` returns all fields to untouched. The modern UX recommendation: don't shame users while they type their first attempt; once an error has been shown, give live feedback as they fix it.
- **`'input'`**: validate on every `input` event. Errors appear character-by-character.
- **`'blur'`**: validate on `focusout` only. Quiet while typing; the user has to leave the field to see feedback.
- **`'submit-only'`**: skip per-field validation entirely. Only `submit` (and explicit `createValidateEvent` dispatches) trigger validation.

### Per-field overrides

Individual fields can opt out of the engine default via the `data-validation-trigger` HTML attribute:

```html
<input data-validation="required" data-validation-trigger="input">
```

The four mode names above are accepted; invalid values silently fall back to the engine default.

Cross-field reactivity (e.g. `confirm` observing `password` via `equalsTo`) follows each dependent's effective trigger. Submit-time validation always runs regardless of the trigger.

## Disabling validation temporarily

```ts
validator.ignoreValidationResult = true;
// init/validate still run, but every result is rewritten to `isValid: true`.
// Useful for read-only previews where validators have side effects you still want.
validator.ignoreValidationResult = false;
```

## Browser integration (Constraint Validation API)

The library calls `target.setCustomValidity(message)` on form controls as their error state changes. This wires the engine into the **HTML Constraint Validation API**, so without any extra work:

- `:invalid` and `:valid` CSS pseudo-classes match — style invalid fields with `input:invalid { border-color: red }`.
- `target.validationMessage` exposes the error text to assistive technology.
- `form.checkValidity()` returns `false` when the engine considers the form invalid; pairs naturally with `form.reportValidity()` for native error UI.

Multiple errors on a single field are joined with `\n` (the platform convention for tooltip rendering). Your `onErrorMessageListChanged` callback is the canonical render path; the browser's tooltips are suppressed by the `novalidate` attribute set on the form.

Native HTML validation attributes (`required`, `minlength`, `pattern`, `type="email"`, etc.) coexist — the browser populates its own `validity` flags (`valueMissing`, `tooShort`, etc.); the library adds `customError` on top. They compose on `:invalid`.

If you're managing custom validity yourself, opt out:
```ts
new FormValidator({ form, manageValidity: false /* default true */ });
```

To layer the browser's native tooltip on top of your custom rendering when a submit is blocked:
```ts
new FormValidator({ form, reportValidityOnSubmit: true /* default false */ });
```
On invalid submit the engine calls `form.reportValidity()`, which tooltips the first invalid field using the message we set via `setCustomValidity` (or the browser's native validity message if `manageValidity: false`). Off by default — most consumers render their own UI and don't want native tooltips on top.

## Accessibility

The library manages **`aria-invalid`** on form controls automatically:

- When a control becomes invalid → `aria-invalid="true"`.
- When a control becomes valid → `aria-invalid="false"`.
- After a `reset` → attribute is removed (validation hasn't re-run, so "false" would over-claim).
- Set only on form controls (`<input>`, `<select>`, `<textarea>`). Context errors on a `<fieldset>` or the form do **not** set `aria-invalid` — the attribute is meaningful only on form controls per WAI-ARIA.

Combined with `setCustomValidity` integration above, screen readers see both the invalid state and the error message text via the standard platform channels — no manual ARIA wiring needed for the basic case.

`aria-describedby` (linking a control to its error message rendered by your code) and `aria-live` on the error region are **still your job** — the library doesn't render messages, so it can't know what id to point at or where the live region is. The recommended pattern: render each field's error list in a sibling element with a stable id, set `aria-describedby` on the field to that id, and make the container `aria-live="polite"`.

## Cleanup

```ts
validator.destroy();
```

Removes all listeners (form-level and per-external-input) and clears internal state. Idempotent. Behavior of any other method after `destroy()` is undefined. The `novalidate`, `data-validation-context="*"`, and any `aria-invalid` attributes the validator added are intentionally left in place — removing them risks clobbering attributes you may have set independently.

## Project structure

```
packages/
  core/         engine + base classes (FormValidator, FormValidatorInitResult, FormValidatorValidationResult)
  validators/   ten built-in validators (peer-depends on core)
```

## Development

```sh
npm install
npm run lint        # ESLint flat config + typescript-eslint
npm run typecheck   # tsc --noEmit
npm test            # Vitest (jsdom)
npm run build       # tsup, emits dist/index.{cjs,mjs,d.ts,d.mts}
```

CI runs lint → typecheck → coverage → build on Node 24.

## License

MIT — see [`LICENSE`](./LICENSE).
