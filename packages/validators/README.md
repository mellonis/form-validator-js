# @form-validator-js/validators

Built-in validators for [`form-validator-js`](https://github.com/mellonis/form-validator-js): `required`, `minLength`, `maxLength`, `pattern`, `equalsTo`, `checkedCount`, `numeric`, `min`, `max`, `step`. Peer-depends on [`@form-validator-js/core`](https://www.npmjs.com/package/@form-validator-js/core), pinned to the exact same version.

## Install

```sh
npm install @form-validator-js/core @form-validator-js/validators
```

## Quick start

```html
<form id="signin">
  <input id="email"    name="email"    type="email"
         data-validation="required;maxLength(254)">
  <input id="password" name="password" type="password"
         data-validation="required;minLength(8)">
  <p id="errors"></p>
  <button>Sign in</button>
</form>
```

```ts
import { FormValidator } from '@form-validator-js/core';
import { required, minLength, maxLength } from '@form-validator-js/validators';

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
```

For the `FormValidator` constructor, the validator contract, async validation, validation timing, and accessibility, see [`@form-validator-js/core`](https://www.npmjs.com/package/@form-validator-js/core).

## "Text-like input" vocabulary

In the table below, "text-like input" means any of: `text`, `password`, `tel`, `email`, `url`, `search`, `number`, `date`, `time`, `datetime-local`, `month`, `week`, `color`, `range`, `hidden`. An `<input>` without a `type` attribute defaults to `text`.

## File inputs

`<input type="file">` is supported by `required` only (`value` non-empty maps to "file is selected"). For real file validation — size, MIME type, count — write a custom validator that reads `target.files`. `minLength` / `maxLength` / `pattern` reject `type="file"` because they would otherwise check the browser's fake-path string (`'C:\fakepath\…'`), which isn't useful. `numeric` / `min` / `max` / `step` likewise reject `type="file"`.

## Built-in validators

| Name | DSL | Argument | Notes |
| --- | --- | --- | --- |
| `required` | `required` | none | Text-like input, `<textarea>`, `<select>`: non-empty value. Checkbox/radio: at least one in the group is checked. `type="file"`: at least one file selected. |
| `minLength` | `minLength(3)` | min character count | Text-like input or `<textarea>`. Counts UTF-16 code units (matches native `minlength`). |
| `maxLength` | `maxLength(20)` | max character count | Text-like input or `<textarea>`. Counts UTF-16 code units (matches native `maxlength`). |
| `pattern` | `pattern(\d{4})` | regex source | Text-like input or `<textarea>`. The regex is auto-anchored (`^(?:…)$`) so it must match the entire value, matching native `pattern`. Empty value passes — combine with `required` to forbid empty. |
| `equalsTo` | `equalsTo(password)` | id of another field | Cross-field equality, e.g. password confirmation. Strict `===` — Unicode normalization is **not** applied (`'café'` in NFC and NFD are not equal). Intentional, so password matching is byte-exact. |
| `checkedCount` | `checkedCount(1,3)` | `min`, `max`, or `min,max` | Group min/max for checkboxes / radios. `,N` means up to N. `N,` means N or more. |
| `numeric` | `numeric` | none | `type="number"`, `date`, `time`, `month`, `week`, `datetime-local`. Rejects unparseable input (`validity.badInput`, plus a defensive parse-side check). Empty value passes — compose with `required`. |
| `min` | `min(10)` / `min(2026-01-01)` | lower bound | `type="number"`, `date`, `time`, `month`, `week`, `datetime-local`. Bound is parsed in the input's own format. Empty / bad-input passes (compose with `required` / `numeric`). |
| `max` | `max(100)` / `max(2026-12-31)` | upper bound | Same types as `min`. Empty / bad-input passes. |
| `step` | `step(0.5)` / `step(7, 2026-01-05)` / `step(900, 09:00)` | `step` or `step,base` | Same types as `min`. The `step` argument is in the type's natural unit (number: 1; date: 1 day; time: 1 s; month: 1 month; week: 1 week; datetime-local: 1 s) and is scaled to compare against the value. Default base is `0` — except `week`, where default base is the Monday of `1970-W01` so the grid lines up with valid week values. Compared within `1e-9` to absorb FP error. Empty / bad-input passes. |

## DSL syntax

Validators are declared on a control via the `data-validation` attribute. Names are separated by `;`, `,`, or whitespace; arguments live inside parentheses immediately after the name. Examples:

```
required
required;minLength(3)
required, minLength(3)
checkedCount(1,3)
pattern(\d{4}-\d{2}-\d{2})
```

Inside `(...)`, `;` and `,` are allowed (e.g. in regex sources or in `checkedCount(1,3)`) — the parser only treats them as separators outside the parentheses. The closing `)` must be followed by `;`, `,`, or whitespace; if the attribute value ends right after `)`, a trailing separator is appended automatically.

## License

MIT.
