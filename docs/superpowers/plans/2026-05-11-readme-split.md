# README Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the body of `README.md` into `packages/core/README.md` and `packages/validators/README.md`, leaving the root as an elevator pitch. Each package README is standalone (its npm landing page works without bouncing to the other). Tests that pin README examples follow each example into the same package.

**Architecture:** Tests move first (they are unchanged behavior against unchanged engine code, so they keep passing throughout the reorg). New tests are added for the two examples that get rewritten to satisfy the standalone constraint (`packages/core/README.md` must not import the validators package). READMEs are rewritten to match the tests. CLAUDE.md notes that referenced the old structure are updated last.

**Tech Stack:** TypeScript, Vitest (jsdom), npm workspaces. No source changes. All work is in `*.md` and `*.test.ts` files.

**Spec:** [`docs/superpowers/specs/2026-05-11-readme-split-design.md`](../specs/2026-05-11-readme-split-design.md)

**Commit policy:** Per project CLAUDE.md, **no `git commit` is run without explicit user permission**. Every task ends with "Stop. Show the diff. Wait for the user to authorize a commit." If the user says "commit", run the commit; otherwise leave changes staged or unstaged per their instruction.

**Branching:** This branch is **stacked on `spec/async-validation`** (PR #41), not branched from master. The user chose this because the async work is in review and the README split builds on top of it. Branch `docs/split-readme-per-package` was created from the `spec/async-validation` tip (commit `d7e686c`). When opening the PR, target `spec/async-validation` as the base; rebase onto `master` after #41 merges.

---

## Task 0: Prerequisites (branch + spec/plan commit)

**Files:**
- Track and commit: `docs/superpowers/specs/2026-05-11-readme-split-design.md`, `docs/superpowers/plans/2026-05-11-readme-split.md`

- [ ] **Step 1: Confirm branch state**

```bash
git status
git rev-parse --abbrev-ref HEAD
git log --oneline -1
```

Expected: on `docs/split-readme-per-package`; HEAD matches `spec/async-validation`'s tip; two untracked files in `docs/superpowers/` (the spec and plan written for this work). If state differs, stop and ask the user.

- [ ] **Step 2: Stage and commit the spec and plan**

```bash
git add docs/superpowers/specs/2026-05-11-readme-split-design.md docs/superpowers/plans/2026-05-11-readme-split.md
git status
```

Show the staged diff to the user. Suggested commit message (do not run until authorized):

```
docs(superpowers): spec and plan for README split per package
```

Stop. Wait for explicit commit authorization before running `git commit`.

- [ ] **Step 3: Run baseline verification**

```bash
npm run lint && npm run typecheck && npm test
```

Expected: all pass. This is the green baseline; every later task must keep it green.

---

## Task 1: Create `packages/core/src/readme-examples.test.ts` and migrate tests that use only core

**Files:**
- Create: `packages/core/src/readme-examples.test.ts`
- Modify: `packages/validators/src/readme-examples.test.ts` (remove the migrated `describe` blocks)

**What moves:** every `describe` block in `packages/validators/src/readme-examples.test.ts` whose tests don't import from `@form-validator-js/validators`, *plus* the contexts and per-field overrides blocks (which currently do import validators but will be rewritten in Task 2 to use only core).

Specifically the existing blocks at the line offsets identified in the source today:
- `'README: custom validator (noWhitespace)'` (around line 104)
- `'README: multi-rule validator (strongPassword subtypes)'` (around line 145)
- `'README: injecting validation results (createValidateEvent { data })'` (around line 264)
- `'README: ignoreValidationResult'` (around line 297) — uses `required` from validators today; **rewrite to use a custom validator** when moving (see Step 3 of this task)
- `'README async-validation snippets'` (around line 324) — all six tests inside

Stays in `packages/validators/src/readme-examples.test.ts` after this task:
- `'README: minimal example (signup form)'`
- `'README: minimal example (signup form)' / 'equalsTo re-validates confirm when password changes'`

Removed entirely in this task (rewritten in Task 2):
- `'README: validation contexts'`
- `'README: per-field error message overrides'`

- [ ] **Step 1: Create the new test file with the header comment and a placeholder smoke test**

Create `packages/core/src/readme-examples.test.ts` with this content:

```ts
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

describe('packages/core/README — smoke', () => {
  test('FormValidator import is available', () => {
    expect(typeof FormValidator).toBe('function');
  });
});
```

- [ ] **Step 2: Run the new file to verify it picks up under the `core` vitest project**

Run: `npx vitest run --project core packages/core/src/readme-examples.test.ts`

Expected: 1 test passes. If vitest doesn't find the file, recheck the `include` glob in `vitest.config.ts` and the `--project core` filter.

- [ ] **Step 3: Migrate the `noWhitespace` block**

Cut the `describe('README: custom validator (noWhitespace)', ...)` block from `packages/validators/src/readme-examples.test.ts` (the block that begins around line 104 in the current file). Paste it into `packages/core/src/readme-examples.test.ts`, immediately after the smoke `describe`. No content edits — the test imports only `FormValidator`, `FormValidatorInitResult`, `FormValidatorValidationResult`, `ValidatorDeclaration` from core and runs on a single text input.

- [ ] **Step 4: Migrate the `strongPassword subtypes` block**

Cut the `describe('README: multi-rule validator (strongPassword subtypes)', ...)` block from the validators test file and paste it after the noWhitespace block in the core test file. No content edits.

- [ ] **Step 5: Migrate the `createValidateEvent { data }` injection block**

Cut the `describe('README: injecting validation results (createValidateEvent { data })', ...)` block. Paste it after the strongPassword block in the core test file. No content edits.

- [ ] **Step 6: Migrate the `ignoreValidationResult` block — rewriting to use a custom validator**

The existing test uses `required` from `@form-validator-js/validators`. To keep the core test file standalone, rewrite the test to use the `noWhitespace` validator (already declared in Step 3's migrated block — but each `describe` is isolated, so re-declare locally) or define a minimal `isAlice` custom validator:

```ts
describe('README: ignoreValidationResult', () => {
  test('rewrites results to isValid: true, and toggling back restores blocking', () => {
    document.body.innerHTML = `
      <form id="f">
        <input id="name" name="name" data-validation="isAlice">
        <button>Submit</button>
      </form>
    `;
    const form = document.getElementById('f') as HTMLFormElement;
    const input = document.getElementById('name') as HTMLInputElement;

    const isAlice: ValidatorDeclaration = {
      init: (target) => new FormValidatorInitResult({ observableElementList: [target] }),
      validate: (target) => new FormValidatorValidationResult({
        isValid: (target as HTMLInputElement).value === 'alice',
      }),
      errorMessage: 'Must be alice.',
    };

    const validator = new FormValidator({
      form,
      validatorDeclarations: { isAlice },
    });

    // Empty value → invalid → submit blocked.
    let blocked = new Event('submit', { cancelable: true, bubbles: true });
    form.dispatchEvent(blocked);
    expect(blocked.defaultPrevented).toBe(true);

    // Flip the switch: results are rewritten to valid.
    validator.ignoreValidationResult = true;
    const allowed = new Event('submit', { cancelable: true, bubbles: true });
    form.dispatchEvent(allowed);
    expect(allowed.defaultPrevented).toBe(false);

    // Flip back: blocked again.
    validator.ignoreValidationResult = false;
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    blocked = new Event('submit', { cancelable: true, bubbles: true });
    form.dispatchEvent(blocked);
    expect(blocked.defaultPrevented).toBe(true);
  });
});
```

Append this `describe` to the core test file. Delete the original `'README: ignoreValidationResult'` block from the validators test file.

- [ ] **Step 7: Migrate the async-validation `describe` block (six tests)**

Cut the entire `describe('README async-validation snippets', ...)` block from `packages/validators/src/readme-examples.test.ts` (around line 324 to end of file). Paste it after the `ignoreValidationResult` block in the core test file. No content edits — the async tests use `uniqueUsername` (a custom validator inline in the example) and untyped `validatorDeclarations: { ... }` literals.

These tests reference `globalThis.fetch` (assigned to a vitest mock at test time) and `AbortController` — both ambient. No additional core imports needed beyond those already added in Step 1.

- [ ] **Step 8: Delete the contexts and per-field-overrides blocks from the validators test file**

These two blocks will be re-written in Task 2 with custom validators and added directly to the core test file. Cut them from `packages/validators/src/readme-examples.test.ts` and **do not paste** anywhere yet.

The blocks to delete:
- `describe('README: validation contexts', ...)` (around line 199 in the current file)
- `describe('README: per-field error message overrides', ...)` (around line 227 in the current file)

- [ ] **Step 9: Update top-of-file comments**

In `packages/validators/src/readme-examples.test.ts`, replace the existing three-line header comment with:

```ts
// Each test below mirrors a code example in packages/validators/README.md
// or the root README's minimal example.
// CI failures here mean those READMEs are lying.
```

Also remove now-unused imports. After migration this file should only need:

```ts
import { FormValidator } from '@form-validator-js/core';
import {
  required,
  minLength,
  equalsTo,
} from '@form-validator-js/validators';
```

(Drop `FormValidatorInitResult`, `FormValidatorValidationResult`, `ValidatorDeclaration`, `checkedCount` if unused — verify by trying to compile.)

- [ ] **Step 10: Run both test files and confirm green**

```bash
npx vitest run --project core packages/core/src/readme-examples.test.ts
npx vitest run --project validators packages/validators/src/readme-examples.test.ts
```

Expected: both files pass. Total count should equal the original validators-file test count minus the two deleted (`validation contexts`, `per-field error message overrides`), with the core file holding all migrated tests.

Then run the whole suite:

```bash
npm test
```

Expected: green. If anything fails, do not proceed — diagnose. A common cause is dangling imports in the validators file or a leftover snippet.

- [ ] **Step 11: Stop. Show the diff. Wait for the user to authorize a commit.**

Run `git diff --stat` and `git status` for the user. Suggested commit message if they choose to commit:

```
test: split readme-examples into per-package files

Move core-only README example tests to packages/core/src/readme-examples.test.ts.
Keep root-README signup-form test in packages/validators/src/readme-examples.test.ts.
ignoreValidationResult test rewritten to use a custom validator so the new
core test file imports only @form-validator-js/core.
```

Do not run `git commit` until the user says so.

---

## Task 2: Add the rewritten contexts and per-field overrides tests to the core test file

**Files:**
- Modify: `packages/core/src/readme-examples.test.ts`

The original README examples for these two sections use validators from the validators package. The new `packages/core/README.md` must be standalone, so both examples get rewritten with custom validators. Lock the new example code in tests first.

- [ ] **Step 1: Write the rewritten contexts test**

Append this `describe` to `packages/core/src/readme-examples.test.ts`:

```ts
describe('README: validation contexts', () => {
  test('isContextError attaches the error to the fieldset, not the checkbox', () => {
    document.body.innerHTML = `
      <form id="f">
        <fieldset id="opts-fs" data-validation-context="atLeastOneChecked">
          <input type="checkbox" name="opts" value="a" data-validation="atLeastOneChecked">
          <input type="checkbox" name="opts" value="b">
          <input type="checkbox" name="opts" value="c">
        </fieldset>
        <button>Submit</button>
      </form>
    `;
    const form = document.getElementById('f') as HTMLFormElement;
    const fieldset = document.getElementById('opts-fs') as HTMLFieldSetElement;

    const atLeastOneChecked: ValidatorDeclaration = {
      init: (target) => {
        const name = (target as HTMLInputElement).name;
        return new FormValidatorInitResult({
          observableElementList: Array.from(document.getElementsByName(name)),
        });
      },
      validate: (target) => {
        const name = (target as HTMLInputElement).name;
        const checked = Array.from(document.getElementsByName(name))
          .filter((el) => (el as HTMLInputElement).checked).length;
        return new FormValidatorValidationResult({
          isValid: checked >= 1,
          isContextError: true,
        });
      },
      errorMessage: 'Pick at least one.',
    };

    const errorTargets: Element[] = [];
    new FormValidator({
      form,
      validatorDeclarations: { atLeastOneChecked },
      onErrorMessageListChanged: (el, msgs) => {
        if (msgs.length > 0) errorTargets.push(el);
      },
    });

    // Submit with nothing checked → error attaches to the fieldset.
    const submitted = new Event('submit', { cancelable: true, bubbles: true });
    form.dispatchEvent(submitted);
    expect(submitted.defaultPrevented).toBe(true);
    expect(errorTargets).toContain(fieldset);
  });
});
```

- [ ] **Step 2: Run the contexts test**

```bash
npx vitest run --project core -t 'validation contexts'
```

Expected: pass. If it fails, debug — the engine handles context attachment via `data-validation-context`, and the test must put the attribute on the fieldset.

- [ ] **Step 3: Write the rewritten per-field overrides test**

Append this `describe`:

```ts
describe('README: per-field error message overrides', () => {
  test('set, delete, clear cycle works against a custom validator', () => {
    document.body.innerHTML = `
      <form id="f">
        <input id="username" name="username" data-validation="noWhitespace">
        <button>Submit</button>
      </form>
    `;
    const form = document.getElementById('f') as HTMLFormElement;
    const username = document.getElementById('username') as HTMLInputElement;

    const noWhitespace: ValidatorDeclaration = {
      init: (target) => new FormValidatorInitResult({ observableElementList: [target] }),
      validate: (target) => new FormValidatorValidationResult({
        isValid: !/\s/.test((target as HTMLInputElement).value),
      }),
      errorMessage: 'Cannot contain whitespace.',
    };

    const messagesByElement = new Map<Element, string[]>();
    const validator = new FormValidator({
      form,
      validatorDeclarations: { noWhitespace },
      onErrorMessageListChanged: (el, msgs) => {
        messagesByElement.set(el, [...msgs]);
      },
    });

    // Trigger an error to see the default message.
    username.value = 'has space';
    username.dispatchEvent(new Event('input', { bubbles: true }));
    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    expect(messagesByElement.get(username)).toEqual(['Cannot contain whitespace.']);

    // Override the message for this specific field.
    validator.elementToSpecificErrorMessageMap.set(username, {
      noWhitespace: 'Usernames cannot contain whitespace.',
    });
    username.dispatchEvent(new Event('input', { bubbles: true }));
    expect(messagesByElement.get(username)).toEqual(['Usernames cannot contain whitespace.']);

    // Delete the override → fall back to the default message.
    validator.elementToSpecificErrorMessageMap.delete(username);
    username.dispatchEvent(new Event('input', { bubbles: true }));
    expect(messagesByElement.get(username)).toEqual(['Cannot contain whitespace.']);

    // Set then clear all overrides.
    validator.elementToSpecificErrorMessageMap.set(username, { noWhitespace: 'X' });
    username.dispatchEvent(new Event('input', { bubbles: true }));
    expect(messagesByElement.get(username)).toEqual(['X']);
    validator.elementToSpecificErrorMessageMap.clear();
    username.dispatchEvent(new Event('input', { bubbles: true }));
    expect(messagesByElement.get(username)).toEqual(['Cannot contain whitespace.']);
  });
});
```

- [ ] **Step 4: Run the per-field overrides test**

```bash
npx vitest run --project core -t 'per-field error message overrides'
```

Expected: pass.

- [ ] **Step 5: Run the whole suite to confirm no regression**

```bash
npm test
```

Expected: green across both projects.

- [ ] **Step 6: Stop. Show the diff. Wait for commit authorization.**

Suggested commit message:

```
test(core): add readme-examples tests for rewritten contexts and per-field overrides

The standalone-core constraint means these two README examples must use
custom validators rather than built-ins. Pin the new example code first.
```

---

## Task 3: Add the validators-README quick-start test

**Files:**
- Modify: `packages/validators/src/readme-examples.test.ts`

The new `packages/validators/README.md` has a brief quick-start. Pin it.

- [ ] **Step 1: Write the quick-start test**

Append this `describe` to `packages/validators/src/readme-examples.test.ts`:

```ts
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
```

- [ ] **Step 2: Add `maxLength` to the validators-file imports**

Open `packages/validators/src/readme-examples.test.ts` and add `maxLength` to the existing `import { … } from '@form-validator-js/validators'` line. Result (assuming the cleanup from Task 1 Step 9):

```ts
import {
  required,
  minLength,
  maxLength,
  equalsTo,
} from '@form-validator-js/validators';
```

- [ ] **Step 3: Run the quick-start test**

```bash
npx vitest run --project validators -t 'quick-start'
```

Expected: pass.

- [ ] **Step 4: Run the whole suite**

```bash
npm test
```

Expected: green.

- [ ] **Step 5: Stop. Show the diff. Wait for commit authorization.**

Suggested commit message:

```
test(validators): add quick-start example test mirroring new validators README
```

---

## Task 4: Rewrite `packages/core/README.md`

**Files:**
- Modify: `packages/core/README.md`

This is the largest text change. Replace the entire file. The content map is in the spec (`docs/superpowers/specs/2026-05-11-readme-split-design.md` § "packages/core/README.md"). Source for most sections is the current root README, copied verbatim except for the two rewritten examples (contexts, per-field overrides), which must match the code in Task 2's tests.

The full target structure (top-to-bottom):

1. Title: `# @form-validator-js/core`
2. Tagline paragraph: "The validation engine for [`form-validator-js`](https://github.com/mellonis/form-validator-js) — a declarative form-validation library for vanilla TypeScript / JavaScript, driven by `data-` attributes on HTML form fields. For ready-made rules, install [`@form-validator-js/validators`](https://www.npmjs.com/package/@form-validator-js/validators) alongside."
3. `## Install` — both packages, with the peer-dependency note (copy from current root).
4. `## What's new in 1.1.0` — copy the six-bullet list from current `packages/core/README.md`. **Edit one line:** the trailing sentence "See the root README's 'Async validation' section for the full guide." now points to a section that lives in *this* file, not root. Replace with: `See the [\`Async validation\`](#async-validation) section below.` (Or drop the sentence entirely — the full guide is in the same file.)
5. `## FormValidator` — short overview paragraph + the warning callout about listener-attach order. Source: current root, paragraphs starting "Constructing `FormValidator` sets `novalidate`…" through the "Construct `FormValidator` before attaching other `submit` listeners…" callout. Also include the "Validation runs:" bullet list (per-field, on submit, on reset) and the form=-linked-inputs note. Update any same-page anchor that pointed to `#validation-timing` to remain a same-page anchor (this README has its own `Validation timing` section, so the anchor still works).
6. `## Custom validators` — the validator-contract paragraph + the `noWhitespace` example. Source: current root "Custom validators" section, copy verbatim.
7. `### Multiple rules in one validator (subtypes)` — the `strongPassword` example. Source: current root, verbatim.
8. `## Validation contexts` — **rewritten** to use `atLeastOneChecked` (custom validator). The HTML and TS must match the test in Task 2 Step 1. Suggested prose:

   > By default, errors attach to the field that produced them. For group-level errors (radio/checkbox groups, fieldsets, multi-step sections), set `isContextError: true` and the error attaches to the nearest ancestor whose `data-validation-context` attribute names this validator.

   Then the HTML/TS example from Task 2 Step 1 (use the `atLeastOneChecked` declaration and the matching `<fieldset data-validation-context="atLeastOneChecked">` markup).

   Closing paragraph (verbatim from current root):

   > The form gets `data-validation-context="*"` (matches any validator) automatically, so any context-error without a more specific ancestor lands on the form.
9. `## Per-field error message overrides` — **rewritten** to override `noWhitespace`. Code must match Task 2 Step 3.
10. `## Async validation` — verbatim from current root "Async validation" section: defining (`uniqueUsername`), `AbortSignal`, debounce recipe with `wait`, pending callbacks, failure handling (`onError`), retry, submit semantics, injection. All subsections in the same order.
11. `## Validation timing` — verbatim from current root. The `data-validation-trigger` per-field override subsection included.
12. `## Disabling validation temporarily` — verbatim (the `ignoreValidationResult` block).
13. `## Browser integration (Constraint Validation API)` — verbatim.
14. `## Accessibility` — verbatim.
15. `## Cleanup` — verbatim (`destroy()` paragraph).
16. `## License` — `MIT.`

- [ ] **Step 1: Replace the file**

Overwrite `packages/core/README.md` with the content described above. Use the current root README as the source for verbatim sections.

- [ ] **Step 2: Verify the contexts and per-field examples match the tests**

Open `packages/core/src/readme-examples.test.ts` (Task 2). The HTML, the validator declaration, and the assertions in the test must match the code blocks in the README's Validation contexts and Per-field error message overrides sections. Mismatches mean the README is lying.

- [ ] **Step 3: Run the readme-examples test for the core file**

```bash
npx vitest run --project core packages/core/src/readme-examples.test.ts
```

Expected: pass. If a test fails because the example code in the README was tweaked during the rewrite, the README must change — never tweak the test to match a broken example.

- [ ] **Step 4: Run lint and typecheck**

```bash
npm run lint && npm run typecheck
```

Expected: green. Markdown is not linted, but the changed test file (none in this task) is.

- [ ] **Step 5: Visually inspect the rendered README on GitHub preview locally**

Open the file in the IDE's markdown preview (or any tool that renders GFM). Confirm:
- Code fences close correctly.
- Table renders (the package README does not have one, but check anyway).
- Internal anchors (`#validation-timing`, etc.) resolve to headings in the same file.
- External links to GitHub and npm work.

- [ ] **Step 6: Stop. Show the diff. Wait for commit authorization.**

Suggested commit message:

```
docs(core): expand README into the full engine reference

Move the engine API (contract, contexts, per-field overrides, async,
timing, ignoreValidationResult, Constraint Validation API, ARIA,
cleanup) from the root README into packages/core/README.md. Contexts
and per-field overrides examples rewritten with custom validators so
the file is standalone (no import from @form-validator-js/validators).
```

---

## Task 5: Rewrite `packages/validators/README.md`

**Files:**
- Modify: `packages/validators/README.md`

Replace the entire file. Spec is in `docs/superpowers/specs/2026-05-11-readme-split-design.md` § "packages/validators/README.md".

Full target structure:

1. Title: `# @form-validator-js/validators`
2. Tagline paragraph: "Built-in validators for [`form-validator-js`](https://github.com/mellonis/form-validator-js): `required`, `minLength`, `maxLength`, `pattern`, `equalsTo`, `checkedCount`, `numeric`, `min`, `max`, `step`. Peer-depends on [`@form-validator-js/core`](https://www.npmjs.com/package/@form-validator-js/core), pinned to the exact same version."
3. `## Install` — both packages.
4. `## Quick start` — the signin-form example. HTML + TS must match the test in Task 3 Step 1.
5. `## Text-like input` — the paragraph from current root README that defines "text-like input" vocabulary (the one starting `"Text-like input" below means any of:`).
6. `## File inputs` — the paragraph from current root explaining which validators support `type="file"` and why others reject it.
7. `## Built-in validators` — the table from current root README, verbatim. The DSL strings in the `DSL` column already convey the argument syntax.
8. `## DSL syntax` — short subsection (~120 words) explaining the rule: validators are separated by `;`, `,`, or whitespace; arguments live inside `(...)`, where `;` and `,` are allowed as long as the closing `)` is followed by `;`, `,`, or whitespace. Source: the relevant paragraph in `form-validator-js/CLAUDE.md` "How validation actually works" (the `data-validation` bullet). Rewrite for end-users; do not paste the regex verbatim from CLAUDE.md.
9. `## More` — one paragraph linking to core: "For `FormValidator` setup, custom validators, async, contexts, timing, and accessibility, see [`@form-validator-js/core`](https://www.npmjs.com/package/@form-validator-js/core)."
10. `## License` — `MIT.`

- [ ] **Step 1: Replace the file**

Overwrite `packages/validators/README.md` with the structure above.

- [ ] **Step 2: Verify the Quick start example matches the test**

The HTML, imports, and TS in `## Quick start` must match `packages/validators/src/readme-examples.test.ts` `'README: validators quick-start (signin form)'` block (Task 3 Step 1). The test runs against jsdom; the README presents the same code to a human reader.

- [ ] **Step 3: Run the validators readme-examples test**

```bash
npx vitest run --project validators packages/validators/src/readme-examples.test.ts
```

Expected: pass.

- [ ] **Step 4: Run lint and typecheck**

```bash
npm run lint && npm run typecheck
```

Expected: green.

- [ ] **Step 5: Visually inspect the rendered README**

Confirm:
- The validators table renders.
- Code fences close.
- Links to `@form-validator-js/core` on npm work.

- [ ] **Step 6: Stop. Show the diff. Wait for commit authorization.**

Suggested commit message:

```
docs(validators): expand README with quick-start, table, and DSL notes

Move the built-in validators table and DSL syntax notes from the root
README into packages/validators/README.md. Adds a small quick-start
example pinned by readme-examples.test.ts.
```

---

## Task 6: Slim down root `README.md`

**Files:**
- Modify: `README.md`

Replace the entire file. Spec is in `docs/superpowers/specs/2026-05-11-readme-split-design.md` § "Root `README.md`".

Full target structure:

1. Title: `# form-validator-js`
2. One-paragraph tagline (current root, line 3, verbatim).
3. `> **Status:** 1.1.0.` — bump from `1.0.0` in current root.
4. `## When this fits, when it doesn't` — verbatim from current root.
5. `## Install` — verbatim, including the "peer-dependency" sentence.
6. `## Minimal example` — verbatim, the signup-form HTML + TS block. Keep the surrounding paragraphs:
   - "The form gets `novalidate` set automatically…"
   - "Validation runs: per field / on submit / on reset" bullet list.
   - The form=-linked-inputs note.
   - The "construct `FormValidator` before attaching other `submit` listeners" callout.

   **Anchor fix:** the per-field bullet currently links to `#validation-timing`. That anchor moves to `packages/core/README.md`. Rewrite the link as:
   ```
   on `input` and/or `focusout`, depending on the [`trigger`](./packages/core/README.md#validation-timing) option
   ```
   The `./packages/core/README.md#validation-timing` relative link works on GitHub. The root README is not published to npm, so npm-side resolution doesn't matter here.
7. `## Project structure` — slim two-line description:

   ```
   packages/core/        Engine. FormValidator, result types, the validator contract.
   packages/validators/  Ten built-in validators (required, minLength, …, step).
   ```

   Followed by:

   > Full engine API (custom validators, async, timing, accessibility, lifecycle) → [`packages/core/README.md`](./packages/core/README.md).
   > Built-in validators (table, DSL, file-input support) → [`packages/validators/README.md`](./packages/validators/README.md).
8. `## Development` — verbatim from current root.
9. `## License` — verbatim.

Everything else from the current root is **removed** (it lives in the package READMEs after Tasks 4-5).

- [ ] **Step 1: Replace the file**

Overwrite `README.md` with the structure above.

- [ ] **Step 2: Re-run the root signup-form test**

```bash
npx vitest run --project validators -t 'minimal example'
```

Expected: pass. The example code in the root README is unchanged, so this should be a no-op verification.

- [ ] **Step 3: Run the whole suite**

```bash
npm test && npm run lint && npm run typecheck
```

Expected: green.

- [ ] **Step 4: Visually inspect the rendered README on GitHub**

Confirm:
- The relative link `./packages/core/README.md#validation-timing` resolves to the heading in core's README.
- The relative links to package READMEs work.
- No dead anchors remain.

- [ ] **Step 5: Stop. Show the diff. Wait for commit authorization.**

Suggested commit message:

```
docs: slim root README to elevator pitch

Move engine and validators reference content into per-package READMEs.
Root keeps the pitch, the minimal example, install, dev, license, and
links out to each package's full docs.
```

---

## Task 7: Update `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

Two notes go stale (spec § "CLAUDE.md updates"). Update both.

- [ ] **Step 1: Update the "Three places list the built-in validators" note**

Locate the bullet in `## Repo-specific quirks` that begins `"Three places list the built-in validators:"`. Replace with:

```markdown
- **Two places list the built-in validators**: `packages/validators/README.md` (table) and this CLAUDE.md (`## Architecture` bullet). Adding or renaming a validator means updating both.
```

- [ ] **Step 2: Update the `readme-examples.test.ts` note**

Locate the bullet that begins `"Tests are co-located with source"`. It currently mentions: `"The readme-examples.test.ts file in packages/validators/src/ mirrors each runnable code block in the root README; CI failures there mean the README is lying."` Replace that sentence with:

```markdown
Two `readme-examples.test.ts` files pin the README code blocks: `packages/core/src/readme-examples.test.ts` mirrors `packages/core/README.md`, and `packages/validators/src/readme-examples.test.ts` mirrors `packages/validators/README.md` plus the root README's minimal example. CI failures there mean the corresponding README is lying.
```

- [ ] **Step 3: Skim the rest of `CLAUDE.md` for stale references**

Search for any other occurrence of "root README" or "README.md" that implies it carries the full reference. Update or remove. Likely no other matches, but verify:

```bash
grep -n -i 'root readme\|README.md' CLAUDE.md
```

- [ ] **Step 4: Stop. Show the diff. Wait for commit authorization.**

Suggested commit message:

```
docs(claude): update CLAUDE.md to reflect README split

The validators table now lives in packages/validators/README.md only,
and each package has its own readme-examples.test.ts.
```

---

## Task 8: Final verification

**Files:** none — verification only.

- [ ] **Step 1: Run full local CI**

```bash
npm run lint && npm run typecheck && npm run test:coverage && npm run build
```

Expected: all four pass. `npm run test:coverage` runs Vitest with the V8 coverage provider; `npm run build` runs tsup in both workspaces.

- [ ] **Step 2: Spot-check the dist output**

```bash
ls -la packages/core/dist packages/validators/dist
grep -c '#' packages/core/dist/index.mjs
```

Expected: each `dist/` has `index.cjs`, `index.mjs`, `index.d.ts`, `index.d.mts`, plus `.map` files. The grep should return a non-zero number (private fields are preserved at the `es2022` target).

- [ ] **Step 3: Visual inspection of all three READMEs on GitHub**

Open each rewritten file in the GitHub web UI (or local markdown preview) and confirm:
- Anchors resolve.
- Tables render.
- Code fences close.
- Cross-README links work.
- No dangling references to sections that no longer exist.

- [ ] **Step 4: Confirm tasks 1-7 are committed (if user authorized)**

```bash
git log --oneline origin/master..HEAD
```

Expected: a coherent series of commits, one per task that produced changes (Tasks 1-7). If the user authorized squash-style commits instead of per-task commits, the log reflects that. Either is fine — the structure is the user's call.

- [ ] **Step 5: Stop. Tell the user the work is ready for PR (or further review).**

Do not run `gh pr create` without explicit instruction.

---

## Spec coverage check

Cross-check against `docs/superpowers/specs/2026-05-11-readme-split-design.md`:

- **Root README content map** → Task 6.
- **Core README content map** → Task 4.
- **Validators README content map** → Task 5.
- **Content rules (standalone constraint)** → Task 2 (tests use only core), Task 4 Steps 2-3 (verification).
- **Test reorganization** → Tasks 1, 2, 3.
- **CLAUDE.md updates** → Task 7.
- **Cross-linking + anchors moving out of root** → Task 6 Step 1 (anchor fix in root), Task 4 Step 5 (anchor verification in core), Task 5 Step 5 (link verification in validators).
- **Out of scope (deferred items)** → not implemented, correctly. No CHANGELOG.md created, no validators "What's new" section, no version bumps, no `package.json` edits.
- **Delivery verification** → Task 8.

All spec sections covered.

## Type / API consistency check

- `FormValidatorInitResult({ observableElementList })` — used in Tasks 1 (migrated), 2 (rewritten contexts and per-field tests). Same constructor signature throughout.
- `FormValidatorValidationResult({ isValid, isContextError? })` — same pattern, consistent.
- `ValidatorDeclaration` type — imported the same way in each test.
- `validator.elementToSpecificErrorMessageMap.set/delete/clear` — used in Task 2 per-field overrides test, matches the facade API documented in CLAUDE.md `## Architecture`.
- `data-validation-context="atLeastOneChecked"` — the attribute names a validator; matches the engine's `#getContext` behavior described in CLAUDE.md.

No API drift between tasks.
