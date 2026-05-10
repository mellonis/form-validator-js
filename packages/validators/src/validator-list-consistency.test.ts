/// <reference types="node" />
// Keeps the built-in validator list in sync across code and docs.
// CLAUDE.md "Three places list the built-in validators": root README table,
// packages/validators/README.md package summary, and the validators bullet
// in root CLAUDE.md (## Architecture). Plus the index.ts exports and the
// on-disk filenames. CI failures here mean one of them drifted.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as validators from './index';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');

const canonical = Object.keys(validators).sort();

const NUMBER_WORD: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

describe('built-in validator list stays in sync', () => {
  test('on-disk validator files match the index.ts exports', () => {
    const fileNames = readdirSync(resolve(here, 'validators'))
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .map((f) => f.replace(/\.ts$/, ''))
      .sort();
    expect(fileNames).toEqual(canonical);
  });

  test('root README validator table lists exactly the canonical set', () => {
    const readme = readFileSync(resolve(repoRoot, 'README.md'), 'utf8');
    const headerIdx = readme.indexOf('| Name | DSL | Argument | Notes |');
    expect(headerIdx, 'validator table header not found in README.md').toBeGreaterThan(-1);
    const tableStart = readme.indexOf('\n', headerIdx) + 1;
    const tableEnd = readme.indexOf('\n\n', tableStart);
    const tableBody = readme.slice(tableStart, tableEnd === -1 ? undefined : tableEnd);

    const names = tableBody
      .split('\n')
      .filter((row) => row.startsWith('| `'))
      .map((row) => row.match(/^\| `([^`]+)`/)?.[1])
      .filter((name): name is string => Boolean(name))
      .sort();

    expect(names).toEqual(canonical);
  });

  test('packages/validators/README.md package summary lists exactly the canonical set', () => {
    const readme = readFileSync(resolve(here, '..', 'README.md'), 'utf8');
    const summaryLine = readme.split('\n').find((line) => line.startsWith('Built-in validators'));
    expect(summaryLine, 'package summary line not found').toBeDefined();
    const names = [...summaryLine!.matchAll(/`([a-zA-Z][a-zA-Z0-9]*)`/g)]
      .map((m) => m[1])
      .sort();
    expect(names).toEqual(canonical);
  });

  test('CLAUDE.md ## Architecture validators bullet mentions every validator by name', () => {
    const claudeMd = readFileSync(resolve(repoRoot, 'CLAUDE.md'), 'utf8');
    const marker = '**`@form-validator-js/validators`**';
    const startIdx = claudeMd.indexOf(marker);
    expect(startIdx, `${marker} not found in CLAUDE.md`).toBeGreaterThan(-1);
    const endIdx = claudeMd.indexOf('\n\n', startIdx);
    const bullet = claudeMd.slice(startIdx, endIdx === -1 ? undefined : endIdx);

    for (const name of canonical) {
      expect(
        bullet,
        `validator \`${name}\` should appear backticked in the CLAUDE.md validators bullet`,
      ).toMatch(new RegExp(`\`${name}\``));
    }
  });

  test('root README "N built-in validators" prose matches the actual count', () => {
    const readme = readFileSync(resolve(repoRoot, 'README.md'), 'utf8');
    const pattern = /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\s+built-in\s+validators?\b/gi;
    const matches = [...readme.matchAll(pattern)];
    expect(matches.length, 'no "N built-in validators" prose found').toBeGreaterThan(0);
    for (const m of matches) {
      const raw = m[1].toLowerCase();
      const claimed = NUMBER_WORD[raw] ?? Number(raw);
      expect(claimed, `prose "${m[0]}" disagrees with actual validator count`).toBe(canonical.length);
    }
  });
});
