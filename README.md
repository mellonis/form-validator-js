# form-validator-js

Declarative form validation for vanilla TypeScript / JavaScript, driven by `data-` attributes on HTML form fields. Bring your own rendering — the library only manages validity state and error messages.

> **Status:** `1.1.0`.

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

- **Per field** — on `input` and/or `focusout`, depending on the [`trigger`](./packages/core/README.md#validation-timing) option. Default is `'blur-then-input'`: validate on focusout until a field has been shown an error, then eagerly on input. Cross-field reactivity (e.g. password change re-validating `confirm` via `equalsTo`) follows the same rule.
- **On `submit`** — every field is validated. If any validator returns `isValid: false`, the submit is `preventDefault`'d.
- **On `reset`** — every error is cleared.

Inputs linked to the form via the `form="formId"` attribute (outside the form element in the DOM) are also picked up — both for validation and for submit blocking.

> **Construct `FormValidator` before attaching other `submit` listeners on the same form.** On an invalid submit, the validator calls `stopImmediatePropagation` so other submit handlers (analytics, save, integrations) don't observe the failed attempt. DOM listener order is registration order on the target — listeners attached **before** `new FormValidator(...)` will still fire. Register the validator first.

## Project structure

```
packages/core/        Engine. FormValidator, result types, the validator contract.
packages/validators/  Ten built-in validators (required, minLength, …, step).
```

- Full engine API (custom validators, async, timing, accessibility, lifecycle) → [`packages/core/README.md`](./packages/core/README.md).
- Built-in validators (table, DSL, file-input support) → [`packages/validators/README.md`](./packages/validators/README.md).

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
