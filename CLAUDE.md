# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Run from the repo root unless noted.

- Install: `npm install` (npm workspaces; do not use yarn)
- Lint: `npm run lint` (ESLint 10 flat config + `typescript-eslint`, `max-len: 150`)
- Typecheck: `npm run typecheck` (`tsc --noEmit` against the root `tsconfig.json`)
- Test all packages: `npm test` (Vitest with `projects` config — runs both packages in one command)
- Coverage: `npm run test:coverage` (V8 provider)
- Run a single test file: `npx vitest run packages/core/src/classes/FormValidator.test.ts`
- Filter by test name: `npx vitest -t 'getElementType'`
- Run tests in one package only: `npx vitest run --project core` (or `--project validators`), or `npm test -w @form-validator-js/core`
- Build all packages: `npm run build` (runs `tsup` in each workspace via `--workspaces --if-present`; emits minified `dist/index.cjs`, `dist/index.mjs`, `dist/index.d.ts`, `dist/index.d.mts`, plus sourcemaps)
- Build one package: `npm run build -w @form-validator-js/core`

CI (`.github/workflows/main.yml`) runs Node 24 only (single job, no matrix): `npm ci` → `npm run lint` → `npm run typecheck` → `npm run test:coverage` → `npm run build` → Coveralls.

## Architecture

npm-workspaces monorepo with two TypeScript packages that ship together. Tests are **co-located with source** (`Foo.test.ts` next to `Foo.ts`).

- **`@form-validator-js/core`** — the engine. Exports `FormValidator`, `FormValidatorInitResult`, `FormValidatorValidationResult`, plus the public types (`FormValidatorParams`, `ValidatorDeclaration`, `ValidatorInitFunction`, `ValidatorValidateFunction`, `ElementType`, `FormElement`, etc.).
- **`@form-validator-js/validators`** — ten built-in validators: `required` (text-like, radio/checkbox group, or `type="file"` for "file selected"), `minLength` / `maxLength` (UTF-16 code units, matching native `minlength` / `maxlength`), `pattern` (regex source, auto-anchored to `^(?:…)$` to match the entire value like native `pattern`), `equalsTo` (cross-field equality by id), `checkedCount` (group min/max), `numeric` / `min` / `max` / `step` (work on `type="number"` plus `date`, `time`, `month`, `week`, `datetime-local`; bounds and bases are parsed in each input's own format via the shared `internal/temporalValue.ts` helper. `numeric` rejects `validity.badInput` plus unparseable values. `min` / `max` / `step` defer empty and bad-input to `required` / `numeric` and only judge parseable values. `step` argument is in the type's natural unit (1 day / 1 s / 1 month / 1 week / 1 s) and is multiplied by `SCALE[type]` to land in `valueAsNumber`-equivalent space; default base is `0` for everything except `week`, which defaults to `-259_200_000` (Monday of `1970-W01`) so the grid aligns with valid week values). `type="file"` is only supported by `required` — the other validators throw `'Unsupported element type'` for it because the browser's fake-path `value` would mislead. Declares `core` as a `peerDependency` pinned to the exact same version — bump both packages together.

Both packages share `tsconfig.json` and `eslint.config.mjs` from the root, and use a per-package `tsup.config.js` (CommonJS) for builds.

### How validation actually works (the non-obvious parts)

Validation is **driven by HTML `data-` attributes**, not by a JS schema:

- `data-validation="required;minLength(3)"` on an input declares the rule chain. The argument string inside `(...)` is parsed by `getValidatorNameToArgumentStringMap` with regex `/([a-z0-9-_]+)(?:\((.*?)\)(?=[;, ]+))?/gi` — note the lookahead requires a `;`, `,`, or whitespace **after the closing paren**, which is why the parser appends `;` if missing. **Constraint:** `;` and `,` outside `(...)` delimit validators; inside `(...)` they are allowed as long as the closing `)` is followed by `;`, `,`, or whitespace. Tests in `FormValidator.test.ts` cover edge cases like `'a((1)))(),b(())'`.
- `data-validation-context="*"` (or a comma-separated validator-name list) on an ancestor scopes errors. The form gets `data-validation-context="*"` automatically. A **context tree** is built at init (`#buildContextTree`) and `#getContext` walks up to find the nearest ancestor whose `validatorNameList` covers the validator (or contains `*`). For `form=`-linked inputs (no DOM ancestor with the attribute), `#getContext` falls back to the form's own context.
- Constructing `FormValidator` sets `novalidate` on the form and attaches listeners for `submit`, `input`, `focusout`, `reset`, and a custom `fvjs:validate` event (defined as the `VALIDATE_EVENT_TYPE` constant at the top of `FormValidator.ts` — single source of truth for the event name; rename there if you ever change it). Both `input` and `focusout` are always attached; gating per trigger mode happens at handler time (see Validation timing below). Inputs trigger validation by dispatching `FormValidator.createValidateEvent()`. Submits with errors are blocked via `stopImmediatePropagation` + `preventDefault` (`#submitEventHandler`). The `stopImmediatePropagation` is **deliberate**: the design contract is that an invalid submit triggers no submit-listener side effects. This holds for submit listeners registered **after** `new FormValidator(...)`; earlier listeners still fire because DOM listener order is registration order on the target. The contract is asserted by two tests in `FormValidator.test.ts` ("listeners registered AFTER…" and "BEFORE…") — don't change the constructor's listener-attach order without updating them.
- `form=`-linked inputs (controls outside the form's DOM subtree, associated via the `form` attribute) are picked up by iterating `form.elements` (the standard `HTMLFormControlsCollection`). Since events on these don't bubble to the form, the engine attaches per-element `input`, `focusout`, and `validate` listeners and tracks them in `#externalControls` for cleanup.

### The validator contract

Each validator is a `{ init, validate, errorMessage? }` object:

- `init(targetElement, { argumentString })` must return a `FormValidatorInitResult` with `observableElementList` (which elements should re-trigger validation when they change — e.g. `equalsTo` returns both fields, `checkedCount`/`required` return the whole radio/checkbox group via `document.getElementsByName(name)`) and `extraData` (frozen, passed back to `validate`). `init` may also throw on bad arguments — that propagates out of `addValidators` / `updateValidationParameters`.
- `validate(targetElement, data)` returns a `FormValidatorValidationResult` with `isValid`, optional `isContextError` (true → error attaches to the context element instead of the field; used for any case where the error logically belongs to a group/section, e.g. radio/checkbox groups, fieldsets, multi-step sections), and optional `validatorSubtypeList` (lets one validator emit multiple distinct error keys — paired with a `{ subtype: message }` map for `errorMessage`).
- `errorMessage` may be a string (becomes `{ '': string }`) or a `{ subtype: message }` map. Per-field overrides go through the `elementToSpecificErrorMessageMap` facade exposed on the instance, which has `set(element, msgs)` / `delete(element)` / `clear()`. The facade is a small `ElementErrorMessageFacade` class — when changing this surface, edit it in `FormValidator.ts`, not via `Object.defineProperty`.

### Observable-element wiring

`#observableToTargetSetMap` is the reverse index of all `init`-returned observables. When the trigger event (`input` or `focusout`, depending on mode) fires on any observed element, every dependent target is told to revalidate — subject to its own effective trigger via `shouldFire(observer)`. This is how `equalsTo("password")` re-validates the confirmation field when the password field changes, and how a single click in a radio group revalidates the whole group's `required` / `checkedCount`.

### Programmatic validation

Code can dispatch `FormValidator.createValidateEvent({ data: { validatorName: precomputedResult } })` on a field to inject a `FormValidatorValidationResult` for a specific validator instead of running the validator function — useful for async/server-side checks. `formValidator.ignoreValidationResult = true` rewrites every validation result to `isValid: true` after the fact — `init` and `validate` still run, but their results are discarded. Useful for previewing field state without blocking submit.

### Validation timing

The constructor accepts `trigger?: TriggerMode` (default `'blur-then-input'`). `TriggerMode` is exported and is one of `'input' | 'blur' | 'blur-then-input' | 'submit-only'`. Per-field overrides via the `data-validation-trigger="…"` HTML attribute take precedence over the engine setting; unknown values fall back silently.

**Listener attachment.** Both `input` and `focusout` listeners are always attached (form-level and per-external-input). Gating happens entirely at handler time via `#getEffectiveTrigger(field)`, so per-field overrides work without re-attaching listeners. The cost is negligible (focusout fires rarely; gating short-circuits when no firing is required).

**Gating logic** in `#inputEventHandler`'s `shouldFire(field)`: looks up the field's effective trigger, then:
- `'submit-only'` → never fires (input or focusout).
- `'input'` → fires on input only (focusout is a no-op since input already covered everything).
- `'blur'` → fires on focusout only.
- `'blur-then-input'` → fires on focusout always; fires on input only if the field is in `#fieldsShownError`.

**`#fieldsShownError`** tracks fields that have been shown an error at least once (in `'blur-then-input'` mode). After each cycle in `#validateEventHandler`, if any validator returned invalid, `targetElement` is added to the set when its effective trigger is `'blur-then-input'` — a one-way transition until reset. `#resetEventHandler` clears the set.

Submit-time validation in `#submitEventHandler` is independent of trigger and always fires. Adding a future fifth mode is one switch case in `#getEffectiveTrigger` plus a `shouldFire` clause.

### Lifecycle

`formValidator.destroy()` removes all listeners (form-level and per-external-input) and clears internal maps. Idempotent. Behavior of any other method after `destroy()` is undefined. The `novalidate` and `data-validation-context="*"` attributes the constructor set on the form are intentionally left in place — removing them risks clobbering attributes the consumer set independently. Same rationale for any `aria-invalid` attributes the engine has set on form controls.

### Browser integration (Constraint Validation API)

The engine calls `target.setCustomValidity(...)` on form controls as their error state changes — joins messages with `\n`, mirrors the same change-detection path as `aria-invalid` and `onErrorMessageListChanged`. Cleared on reset. Skipped for non-form-control elements (mirrors `aria-invalid` scope). `novalidate` is still set on the form so browser tooltips don't auto-fire. Opt out of `setCustomValidity` management via `new FormValidator({ form, manageValidity: false })`. Default `true`.

To surface the browser's native tooltip on the first invalid field on submit, pass `reportValidityOnSubmit: true` (default `false`). The engine calls `form.reportValidity()` after `preventDefault` when there are errors; the message comes from our `setCustomValidity` call (or from native HTML validity flags if `manageValidity: false`). Independent of `manageValidity`.

### Accessibility

The engine manages `aria-invalid` automatically on form controls: `"true"` when validation produces errors for that control, `"false"` when validation produces none, and removed entirely on `reset` (since validation hasn't re-run). Skipped for non-form-control elements — context errors landing on a `<fieldset>` or the form don't set `aria-invalid`, since the attribute is meaningful only on form controls per WAI-ARIA. `aria-describedby` and `aria-live` are intentionally left to the consumer because the library doesn't render error messages. With `setCustomValidity` integration (above) plus `aria-invalid`, the basic ARIA story is fully covered via standard platform channels.

## Repo-specific quirks

- **Tests are co-located with source** (`Foo.test.ts` next to `Foo.ts`). Vitest's `include` glob is `'src/**/*.test.ts'`. tsup only follows imports from `src/index.ts`, so test files don't end up in `dist/`. `"files": ["dist"]` further gates publishing. The `readme-examples.test.ts` file in `packages/validators/src/` mirrors each runnable code block in the root README; CI failures there mean the README is lying.
- **Vitest cross-package resolution**: `vitest.config.ts` defines `projects` for `core` and `validators`, each with `resolve.alias` mapping `@form-validator-js/core` and `@form-validator-js/validators` to the source `index.ts` files. Tests run against raw TS — no build needed first.
- **Type-checking from root** uses path mapping in `tsconfig.json` (`paths: { "@form-validator-js/core": ["./packages/core/src/index.ts"] }`). For `tsup`'s `dts` step in `validators`, workspace order matters — `core` must build first so its `dist/*.d.ts` exists. `npm run build` runs alphabetically, which currently works because `core < validators`. **If you add a third package that depends on `validators`, alphabetical order won't be topological** — enforce build order explicitly (split CI into stages, or use a tool that resolves the dep graph).
- **`tsup` requires `typescript`** as a runtime dependency even when source files are JS — its `dist/index.js` does an unconditional `require('typescript')` at startup. Don't drop `typescript` from devDeps.
- **Native private fields** (`#field`) survive untouched into the bundled output (`target: 'es2022'` in each `tsup.config.js`). If you change the build target lower, esbuild will down-level them to closures-with-WeakMap, which changes runtime semantics — verify with `grep '#' packages/*/dist/index.mjs` after a target change.
- **Runtime immutability is via `Object.defineProperty`, not just TS `readonly`**: `FormValidatorInitResult.extraData`, `FormValidatorValidationResult.{isContextError,isValid}` are defined with `defineProperty` so reassignment throws at runtime (TS `readonly` is compile-time only). Tests assert this — don't replace with plain `readonly` fields without breaking the tests.
- **`vi.fn` in TS strict**: `vi.fn(implementation)` infers `Mock<Procedure | Constructable>` (overly broad) and won't satisfy specific function types. Use `vi.fn<F>()` with an explicit generic, and type mock variables as `Mock<F>` (imported from `vitest`). See `FormValidator.test.ts` for the pattern.
- **Several branches in `FormValidator.ts` are intentionally untested defensive guards** that protect invariants the public API shouldn't be able to violate (e.g. `throw new Error('Form context not registered')` — the form's own context is always registered by `#buildContextTree` at construction). Don't bend the API to reach them in tests — either delete them or leave them uncovered.
- **Three places list the built-in validators**: the validators table in the root `README.md`, the package summary in `packages/validators/README.md`, and the validators bullet in this CLAUDE.md (`## Architecture`). Adding or renaming a validator means updating all three.
- **Versioning**: per-package `version` fields and the validators package's `peerDependency` on core must stay in lockstep. There is no Lerna; bump them together by hand or with a release tool.
- **CI runs `npm ci`** (lockfile committed). Don't run `npm install --no-package-lock` or hand-edit `package-lock.json`.
