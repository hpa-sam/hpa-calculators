#!/usr/bin/env node
/* ==========================================================================
   all.mjs — one command to run before committing.

       node test/all.mjs

   Runs both suites and fails if either does. They answer different
   questions and both matter:

     parity.mjs     is the maths right?
     structure.mjs  is the markup built the way the design language expects?
     runtime.mjs    does the page actually work when a browser runs it?

   The third exists because the first two once passed together while the
   engine calculator threw on every keystroke and displayed nothing but em
   dashes — neither suite runs the page, so neither could see it. runtime
   skips itself cleanly when no browser is available.
   ========================================================================== */

import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const run = (file) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [join(here, file)], { stdio: 'inherit' });
    child.on('close', (code) => resolve(code === 0));
  });

const results = [];
for (const file of ['parity.mjs', 'structure.mjs', 'runtime.mjs']) {
  results.push([file, await run(file)]);
}

const failed = results.filter(([, ok]) => !ok);

if (failed.length) {
  console.error(`Failed: ${failed.map(([f]) => f).join(', ')}\n`);
  process.exit(1);
}

console.log('All suites passed.\n');
