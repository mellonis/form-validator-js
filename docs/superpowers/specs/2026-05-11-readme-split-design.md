# README split: root → packages

**Date:** 2026-05-11
**Status:** Approved, ready for implementation plan
**Scope:** Documentation reorganization. No source code changes; only `README.md` files, `CLAUDE.md` notes, and the `readme-examples.test.ts` files that pin the README examples.

## Goal

The root `README.md` (425 lines today) carries the entire API surface — engine, built-in validators, async, contexts, accessibility, the lot. The two package READMEs are 19- and 30-line redirects.

Invert that. The root becomes an **elevator pitch** that's enough to evaluate whether the library fits and run a minimal example. Per-package READMEs become the **standalone references** — each one's npm landing page covers everything a reader of that package needs without bouncing to the other.

## Non-goals

- No content rewrites beyond what the split forces (example code must use the standalone package's own surface — see Content rules below).
- No CHANGELOG.md introduction. The "What's new in 1.1.0" block stays in `packages/core/README.md` for now.
- No version bumps; this is a docs-only change.
- No publish-flow changes. `"files": ["dist"]` already gates what goes to npm; READMEs are picked up via standard npm conventions.

## Content map

### Root `README.md` (~80–110 lines)

Reader: someone discovering the library. Goal: decide if it fits, and run one example.

Sections, in order:
- Title + one-paragraph tagline (unchanged).
- Status line — bump to `1.1.0` (current is `1.0.0` in text).
- "When this fits, when it doesn't" (unchanged).
- Install (both packages, unchanged).
- Minimal example (the existing signup form, unchanged) with the surrounding paragraph about `novalidate`, listener attachment order, and the per-field / submit / reset trigger summary.
- The "construct FormValidator before other submit listeners" warning block.
- Project structure — two-line table:
  ```
  packages/core/        Engine. FormValidator, result types, the validator contract.
  packages/validators/  Ten built-in validators (required, minLength, …, step).
  ```
- Links out:
  > For the engine API, custom validators, async, timing, accessibility, see [`@form-validator-js/core`](./packages/core/README.md).
  > For the built-in validators and their DSL syntax, see [`@form-validator-js/validators`](./packages/validators/README.md).
- Development commands (unchanged).
- License.

Removed from root: the built-in validators table, custom validators, subtypes, contexts, per-field overrides, async validation (full), validation timing, `ignoreValidationResult`, Constraint Validation API, accessibility, cleanup. All move to package READMEs.

### `packages/core/README.md` (~280–320 lines)

Reader: someone using `@form-validator-js/core`. Goal: full engine reference, standalone — no need to read `packages/validators` to follow.

Sections, in order:
- Title + tagline ("validation engine for form-validator-js").
- Install (both packages).
- "What's new in 1.1.0" (existing block, kept here).
- FormValidator: what it does, `novalidate`, `form=`-linked inputs, submit / reset semantics, the listener-order contract.
- The validator contract: `init`, `validate`, `errorMessage`, the observable-element wiring, the immutability of `extraData` / `isValid` / `isContextError`.
- Custom validator example (`noWhitespace` — already in current root README).
- Subtypes (`strongPassword` example, already in current root README).
- **Validation contexts — rewritten.** Current root example uses `checkedCount` from the validators package. Replace with a custom group validator (e.g. a "checkbox group needs at least one" custom validator that returns `isContextError: true`) so the example imports nothing but `@form-validator-js/core`. The conceptual content of the section is unchanged.
- **Per-field error message overrides — rewritten.** Current example uses `required` / `minLength`. Replace with overrides on a custom validator from the noWhitespace / strongPassword example earlier in the README.
- Async validation: defining (`uniqueUsername`), `AbortSignal`, debounce recipe, pending callbacks, failure handling (`onError`, reserved `'error'` subtype), retry pattern, submit semantics, injection. All these examples already use a custom validator (`uniqueUsername`) — they move over as-is.
- Validation timing: `trigger` modes, `data-validation-trigger`, cross-field reactivity, submit-time invariance.
- `ignoreValidationResult`.
- Browser integration: `setCustomValidity` joining, `:invalid` / `:valid`, `validationMessage`, `form.checkValidity()`, `manageValidity` and `reportValidityOnSubmit` opt-outs.
- Accessibility: `aria-invalid` management, `aria-busy` on pending, what the library leaves to the consumer.
- Cleanup: `destroy()`, idempotency, attributes intentionally left in place.
- License.

### `packages/validators/README.md` (~90–120 lines)

Reader: someone using `@form-validator-js/validators`. Goal: pick built-ins, know their syntax and semantics, install. Engine usage links out to core.

Sections, in order:
- Title + tagline.
- Install (both packages).
- A short quick-start: one HTML form with two or three `data-validation="…"` rules and the minimal JS to wire it (declarations only — keep it under ~25 lines). The point is "here's what using built-ins looks like."
- "Text-like input" vocabulary block (the paragraph at the top of the current validators table).
- File-input note (which validators support `type="file"`, why the others reject it).
- Built-in validators table — the full table from the current root README.
- DSL syntax notes: the parsing rule about `;` / `,` / whitespace after `)`, and the constraint that `;` / `,` outside `(...)` delimit. Brief — one paragraph plus the regex snippet.
- Link out:
  > For `FormValidator` setup, custom validators, async, contexts, timing, and accessibility, see [`@form-validator-js/core`](https://www.npmjs.com/package/@form-validator-js/core).
- License.

## Content rules

Two rules drop out of the standalone constraint:

1. **`packages/core/README.md` must not import `@form-validator-js/validators` in any example.** Every illustrative validator is a custom declaration defined inline.
2. **`packages/validators/README.md` may show `new FormValidator({ … })` setup but should not document engine surface area beyond what's needed to make a built-in fire.** Trigger modes, async, contexts, accessibility, lifecycle — link to core.

The root README is exempt; its minimal example uses both packages and that is the point.

### Intentional duplication

One block is duplicated on purpose between the root and core READMEs: the **"Validation runs:" bullet list** (per-field / on-submit / on-reset) and the form=-linked-inputs note that follows it.

- In the root README, it follows the minimal example and gives a reader enough to picture the engine's behavior without leaving the page (the elevator-pitch reason for keeping it).
- In the core README, it sits inside the `## FormValidator` overview as part of the standalone engine reference (a core reader can't be expected to bounce to root for the basics).

Future edits should update both copies together. If they drift apart, the standalone constraint or the elevator-pitch promise is breaking — pick one as canonical and reconcile.

`packages/core/README.md`'s "Validation timing" section gives the full picture (`trigger` modes, per-field overrides, cross-field reactivity). The duplicated bullet list does not.

## Test reorganization

The current `packages/validators/src/readme-examples.test.ts` is the "lies detector" for all 425 lines of the current root README. After the split, each README needs its own pinned tests, near the README it verifies.

### New file: `packages/core/src/readme-examples.test.ts`

Mirrors `packages/core/README.md`. Imports only `@form-validator-js/core`. Top comment:

```
// Each test below mirrors a code example in packages/core/README.md.
// If you change a README example, change the corresponding test (and vice versa).
// CI failures here mean packages/core/README.md is lying.
```

Tests to include (mostly moved from current `validators/src/readme-examples.test.ts`):

- Custom validator (`noWhitespace`)
- Subtypes (`strongPassword`)
- Validation contexts — **new test for the rewritten example** (custom group validator returning `isContextError: true`)
- Per-field error message overrides — **rewritten** to use a custom validator (matches the rewritten README example)
- `createValidateEvent` injection
- `ignoreValidationResult`
- All async snippets:
  - Defining an async validator (`uniqueUsername`)
  - Debounce recipe — `wait` helper aborts on signal
  - Pending callbacks fire as documented
  - Default failure subtype `'error'` lands in `errors[]`
  - Retry button pattern: `validator.retry(el, 'name')` runs only the named validator
  - Injection pattern still works alongside async

### Refocused file: `packages/validators/src/readme-examples.test.ts`

Mirrors `packages/validators/README.md` and the root README's minimal example. Imports both packages. Top comment updated:

```
// Each test below mirrors a code example in packages/validators/README.md
// or the root README's minimal example.
// CI failures here mean those READMEs are lying.
```

Tests retained / refocused:
- Validators README quick-start (new — small two-rule form using the new quick-start snippet)
- Root README minimal signup form (existing "blocks submit while invalid…" test, unchanged)
- `equalsTo` re-validates `confirm` when password changes (existing, unchanged)

Tests removed from this file (they migrate to `packages/core/src/readme-examples.test.ts`): all custom-validator, subtypes, contexts, per-field-overrides, injection, `ignoreValidationResult`, and async tests.

### Verification

`npm test` continues to run both project configs and find both files (Vitest `include` glob is `'src/**/*.test.ts'` per project). No `vitest.config.ts` change needed.

## CLAUDE.md updates

`form-validator-js/CLAUDE.md` has two notes that go stale:

1. The "Three places list the built-in validators" bullet:
   > Three places list the built-in validators: the validators table in the root `README.md`, the package summary in `packages/validators/README.md`, and the validators bullet in this CLAUDE.md (`## Architecture`). Adding or renaming a validator means updating all three.

   After the split, the root README no longer carries the table. Rewrite as:
   > Two places list the built-in validators: `packages/validators/README.md` (table) and this CLAUDE.md (`## Architecture` bullet). Adding or renaming a validator means updating both.

2. The repo-quirks bullet about `readme-examples.test.ts`:
   > The `readme-examples.test.ts` file in `packages/validators/src/` mirrors each runnable code block in the root README; CI failures there mean the README is lying.

   Rewrite as:
   > Two `readme-examples.test.ts` files pin the README code blocks: `packages/core/src/readme-examples.test.ts` mirrors `packages/core/README.md`, and `packages/validators/src/readme-examples.test.ts` mirrors `packages/validators/README.md` plus the root README's minimal example. CI failures there mean the corresponding README is lying.

Nothing else in CLAUDE.md is affected — the architecture section is package-internal and unaware of where the prose docs live.

## Cross-linking

Within the monorepo, links use relative paths so they work on GitHub:
- Root → packages: `./packages/core/README.md`, `./packages/validators/README.md`.
- Package → package: `../validators/README.md`, `../core/README.md`.
- Package → root: `../../README.md`.

On npm, relative paths don't resolve to README files. Where a package README links to the other package or to the root, use the npm URL as a parallel:
- `packages/core/README.md` → validators: `[@form-validator-js/validators](https://www.npmjs.com/package/@form-validator-js/validators)`.
- `packages/validators/README.md` → core: `[@form-validator-js/core](https://www.npmjs.com/package/@form-validator-js/core)`.
- Both → root: `[the form-validator-js repo](https://github.com/mellonis/form-validator-js)` for the GitHub overview.

This pattern is already used in the current `packages/core/README.md` and `packages/validators/README.md` — keep it.

### Anchors moving out of root

The current root README has same-page anchor links (e.g. `[\`trigger\`](#validation-timing)` in the post-example paragraph) that point to sections that move to `packages/core/README.md` after the split. Two rules:

1. **Drop the anchor or rewrite the link.** Same-page anchors to sections that no longer exist must not survive in the new root. If a cross-reference is still useful, rewrite as a link to the section in `./packages/core/README.md` (relative path + GitHub-style fragment, e.g. `./packages/core/README.md#validation-timing`). On npm these don't resolve, but the root README isn't published, so that's fine — root is GitHub-only.
2. **Within a single package README, anchors stay anchors.** Section moves happen only across READMEs; sections inside `packages/core/README.md` cross-link to each other with `#section-name` as before.

## Out of scope (deferred)

- Splitting the validators table into per-validator sections with longer explanations. The table is already dense; if a validator needs more space, that's a follow-up.
- A separate CHANGELOG.md. The 1.1.0 note stays in-line in core's README.
- Validators README's own "What's new" section. The 1.1.0 surface area is engine-side only; validators 1.1.0 is a version-pin bump.
- Touching `packages/*/LICENSE`, the root `LICENSE`, or `package.json` `description` / `homepage` fields — they're correct.

## Delivery

One PR. Order of changes within the PR is internal — reviewers see three README files, two test files, and a CLAUDE.md edit. No new dependencies, no config changes.

Verification before requesting review:
- `npm run lint` (none of the changes touch source, but ESLint covers test files).
- `npm run typecheck` (test files are typechecked).
- `npm test` (both `readme-examples.test.ts` files run and pass).
- Visual inspection of each rewritten README on GitHub's preview to confirm relative links resolve.

No git operation runs without explicit instruction (per project CLAUDE.md global rules).
