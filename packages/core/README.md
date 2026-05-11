# @form-validator-js/core

The validation engine for [`form-validator-js`](https://github.com/mellonis/form-validator-js) — a declarative form-validation library for vanilla TypeScript / JavaScript, driven by `data-` attributes on HTML form fields.

This package provides `FormValidator` and the supporting result types. For ready-made rules (`required`, `minLength`, `maxLength`, `pattern`, `equalsTo`, `checkedCount`), install [`@form-validator-js/validators`](https://www.npmjs.com/package/@form-validator-js/validators) alongside.

## Install

```sh
npm install @form-validator-js/core @form-validator-js/validators
```

## Documentation

See the [project README](https://github.com/mellonis/form-validator-js#readme) for usage, the validator contract, and examples.

## What's new in 1.1.0

- `validate` may return `Promise<FormValidatorValidationResult>` for async checks.
- New optional `onError` hook on validator declarations for custom failure mapping.
- New constructor params: `onPendingChange(element, isPending)`, `onFormPendingChange(isPending)`.
- `onErrorMessageListChanged` gains a third arg `errors: ErrorDetail[]` carrying structured per-error metadata; the existing 2-arg signature still works.
- Auto-managed `aria-busy` on form controls while async is in flight.
- New `retry(element, validatorName?)` instance method.

See the root README's "Async validation" section for the full guide.

## License

MIT.
