#!/usr/bin/env node
/* ==========================================================================
   parity.mjs — checks every calculator's JS against the numbers its
   spreadsheet produced.

   Run with:  node test/parity.mjs
   No dependencies, no config, no install step. It walks /calculators, finds
   every cases.json, imports the matching formula module and compares.

   This is the file that lets you switch the spreadsheet off with confidence.
   ========================================================================== */

import { readdir, readFile } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const calcRoot = join(root, 'calculators');

let passed = 0;
let failed = 0;

/* A calculator can have more than one fixture file — engine displacement has
   one set from the original spreadsheet and another for the reciprocating
   loads, which are new work with a different provenance. Keeping them apart
   keeps that distinction visible. */
const caseFiles = [];
for (const entry of await readdir(calcRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const dir = join(calcRoot, entry.name);
  const files = (await readdir(dir))
    .filter((f) => f.startsWith('cases') && f.endsWith('.json'))
    .sort();
  for (const f of files) caseFiles.push(join(dir, f));
  if (!files.length) caseFiles.push(join(dir, 'cases.json'));
}

for (const caseFile of caseFiles) {
  let spec;
  try {
    spec = JSON.parse(await readFile(caseFile, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log(`skip  ${relative(root, caseFile)} — no cases.json yet`);
      continue;
    }
    throw err;
  }

  const modulePath = join(dirname(caseFile), spec.module);
  const mod = await import(pathToFileURL(modulePath).href);
  const fn = mod[spec.export];

  if (typeof fn !== 'function') {
    console.error(`FAIL  ${relative(root, caseFile)} — no export "${spec.export}"`);
    failed++;
    continue;
  }

  const tolerance = spec.tolerance ?? 0.01;
  console.log(`\n${relative(calcRoot, caseFile)}`);

  for (const testCase of spec.cases) {
    let actual;
    try {
      actual = fn(testCase.input);
    } catch (err) {
      // A case can legitimately expect a thrown error.
      if (testCase.expectError) {
        console.log(`  pass  ${testCase.name} (threw as expected)`);
        passed++;
      } else {
        console.error(`  FAIL  ${testCase.name} — threw: ${err.message}`);
        failed++;
      }
      continue;
    }

    /* A function that returns undefined when its inputs are insufficient —
       pulleySuggestion with no target set, for instance — needs its own
       assertion. Without this, a case with an empty `expect: {}` checks
       nothing at all: the for-of below simply has no entries to iterate,
       and a bug that made the function return a stale object instead of
       undefined would pass silently. */
    if (testCase.expectUndefined) {
      if (actual === undefined) {
        console.log(`  pass  ${testCase.name}`);
        passed++;
      } else {
        console.error(`  FAIL  ${testCase.name}`);
        console.error(`          expected undefined, got ${JSON.stringify(actual)}`);
        failed++;
      }
      continue;
    }

    /* Compared recursively, because some calculators group their results —
       spring rate returns a `front` and a `rear` object. A flat comparison
       reported "expected [object Object]" and told you nothing about which
       figure was wrong. Only keys present in `expect` are checked, so a
       fixture can assert one nested value without restating the rest. */
    const problems = [];
    const compare = (expected, got, path) => {
      for (const [key, want] of Object.entries(expected)) {
        const here = path ? `${path}.${key}` : key;
        const have = got === undefined || got === null ? undefined : got[key];

        if (want !== null && typeof want === 'object' && !Array.isArray(want)) {
          if (have === undefined || typeof have !== 'object') {
            problems.push(`${here}: expected an object, got ${have}`);
          } else {
            compare(want, have, here);
          }
        } else if (typeof want === 'number') {
          if (!(Math.abs(have - want) <= tolerance)) {
            problems.push(`${here}: expected ${want}, got ${have}`);
          }
        } else if (have !== want) {
          problems.push(`${here}: expected ${want}, got ${have}`);
        }
      }
    };
    compare(testCase.expect, actual, '');

    if (problems.length) {
      console.error(`  FAIL  ${testCase.name}`);
      problems.forEach((p) => console.error(`          ${p}`));
      failed++;
    } else {
      console.log(`  pass  ${testCase.name}`);
      passed++;
    }
  }

  /* Cross-check: assert a second export agrees with the first on some
     quantity. Used where a diagram is drawn from geometry that should
     reproduce the calculated answer — if the picture and the number ever
     disagree, one of them is lying to the student. */
  const cross = spec.crossCheck;
  if (cross) {
    const other = mod[cross.export];
    if (typeof other !== 'function') {
      console.error(`  FAIL  cross-check — no export "${cross.export}"`);
      failed++;
    } else {
      for (const testCase of spec.cases) {
        if (testCase.expectError) continue;
        let a, b;
        try {
          a = fn(testCase.input)[cross.against];
          b = other(testCase.input)[cross.field];
        } catch {
          continue;
        }
        const label = `${cross.export}.${cross.field} matches ${cross.against} — ${testCase.name}`;
        if (Math.abs(a - b) <= tolerance) {
          console.log(`  pass  ${label}`);
          passed++;
        } else {
          console.error(`  FAIL  ${label}`);
          console.error(`          ${cross.against}: ${a}, ${cross.field}: ${b}`);
          failed++;
        }
      }
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
