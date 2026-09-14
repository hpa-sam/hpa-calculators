#!/usr/bin/env node
/* ==========================================================================
   structure.mjs — checks every calculator against the markup contract.

   Run with:  node test/structure.mjs
   No dependencies.

   Why this exists: parity.mjs proves the maths is right, but every bug that
   has actually reached a screenshot in this project was structural — a stray
   closing div that pushed a diagram out of its grid column, a `span` styled
   as if it were a `button`, a native `title` used as a tooltip. Those are
   cheap to detect and expensive to spot by eye, and there will be seven
   calculators.

   Each rule below exists because something went wrong once. Add a rule when
   something goes wrong again; that's how the contract stays honest rather
   than becoming a wishlist.
   ========================================================================== */

import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const calcRoot = join(root, 'calculators');

const problems = [];
let checks = 0;

function check(name, condition, detail = '') {
  checks++;
  if (!condition) problems.push({ name, detail });
}

/* --- Shared vocabulary, read once ---------------------------------------- */

const tokensCss = await readFile(join(root, 'shared/tokens.css'), 'utf8');
const componentCss = await readFile(join(root, 'shared/calculator.css'), 'utf8');

const definedTokens = new Set([...tokensCss.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
/* A class counts as styled only if it heads a rule of its own. Appearing
   solely in a descendant position doesn't count: `.section__chevron` was
   deleted along with some collapsible-section CSS but survived inside
   `.working[open] .section__chevron`, so a naive "is it mentioned anywhere"
   check passed while the chevron rendered as nothing at all.

   Comments are stripped first, then rule headers are read as the text
   between a brace boundary and the next `{` — which skips `@media` headers
   (they contain `@`) while still finding the rules nested inside them.
   Only the first space-separated part of each selector is the rule's
   subject; classes compounded onto it (`.btn.is-done`) count as well. */
const cssNoComments = componentCss.replace(/\/\*[\s\S]*?\*\//g, '');
const definedClasses = new Set();
for (const match of cssNoComments.matchAll(/(?:^|[{}])\s*([^{}@]+?)\s*\{/g)) {
  for (const selector of match[1].split(',')) {
    const subject = selector.trim().split(/\s+/)[0];
    for (const cls of subject.matchAll(/\.([\w-]+)/g)) definedClasses.add(cls[1]);
  }
}

const BLOCK_TAGS = /<(div|output|details|form|section)\b/g;
const BLOCK_CLOSE = /<\/(div|output|details|form|section)>/g;

const dirs = (await readdir(calcRoot, { withFileTypes: true }))
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

/* ---- Global: the [hidden] guarantee ------------------------------------
   Checked once, not per-calculator. Any class that declares its own
   `display` (.groups, .results, .diagram, ...) overrides the browser's
   default `[hidden] { display: none }` rule at equal specificity, so
   `element.hidden = true` silently does nothing. This shipped once — the
   pulley sizing panel stayed visible at 256px tall with `hidden` set and
   true in the DOM. The universal override in calculator.css is the fix;
   this check makes sure it can't quietly disappear in a future edit. */
check('global: [hidden] is guaranteed to hide, everywhere',
  /\[hidden\]\s*\{[^}]*display:\s*none\s*!important/.test(componentCss));

for (const name of dirs) {
  const file = join(calcRoot, name, 'index.html');
  let html;
  try {
    html = await readFile(file, 'utf8');
  } catch {
    problems.push({ name, detail: 'no index.html' });
    continue;
  }

  const at = (msg) => `${name}: ${msg}`;
  const rawScript = (html.match(/<script type="module">([\s\S]*?)<\/script>/) || [, ''])[1];

  /* Comments are stripped before any "is this called?" check. A substring
     search happily matches `// reportHeight();`, which is precisely the
     commented-out-and-forgotten case these checks exist to catch. */
  const script = rawScript
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const markup = html.replace(/<script type="module">[\s\S]*?<\/script>/, '');

  /* ---- 1. Block nesting balances -------------------------------------------
     The bug that broke the belt layout: one extra </div> closed
     .results__main early, so the diagram rendered outside the grid and
     stretched to full width. Tracking depth line by line finds both the
     imbalance and where it starts. */

  let depth = 0;
  let firstNegative = 0;
  for (const [i, line] of markup.split('\n').entries()) {
    depth += (line.match(BLOCK_TAGS) || []).length;
    depth -= (line.match(BLOCK_CLOSE) || []).length;
    if (depth < 0 && !firstNegative) firstNegative = i + 1;
  }
  check(at('block tags balance'), depth === 0, `net depth ${depth}`);
  check(at('never closes past the root'), !firstNegative, `first at line ${firstNegative}`);

  /* ---- 2. Results layout -------------------------------------------------- */

  const resultsCount = (markup.match(/class="results"/g) || []).length;
  const mainCount = (markup.match(/class="results__main"/g) || []).length;
  const sideCount = (markup.match(/class="results__side"/g) || []).length;

  check(at('has a results grid'), resultsCount >= 1);
  check(at('one results__main per results grid'), mainCount === resultsCount,
    `${resultsCount} grids, ${mainCount} mains`);
  check(at('at most one results__side per grid'), sideCount <= resultsCount);

  /* A diagram or chart must live inside a side column or its own section —
     never loose in results__main, where it competes with the readout. */
  for (const block of ['diagram']) {
    const idx = markup.indexOf(`class="${block}"`);
    if (idx === -1) continue;
    const before = markup.slice(0, idx);
    const lastSide = before.lastIndexOf('results__side');
    const lastMain = before.lastIndexOf('results__main');
    const lastBody = before.lastIndexOf('section__body');
    check(at(`${block} sits in a side column or its own section`),
      lastSide > lastMain || lastBody > lastMain,
      'found inside results__main');
  }

  /* ---- 3. Token and class discipline -------------------------------------- */

  const usedTokens = new Set([...html.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]));
  const undefinedTokens = [...usedTokens].filter((t) => !definedTokens.has(t));
  check(at('every token used is defined'), !undefinedTokens.length, undefinedTokens.join(', '));

  const usedClasses = new Set();
  for (const m of markup.matchAll(/class="([^"]+)"/g)) {
    for (const c of m[1].split(/\s+/)) if (c) usedClasses.add(c);
  }
  // Template literals in the script build markup too.
  for (const m of rawScript.matchAll(/class="([a-z][\w -]*)"/g)) {
    for (const c of m[1].split(/\s+/)) if (c) usedClasses.add(c);
  }
  const unstyled = [...usedClasses].filter((c) => !definedClasses.has(c));
  check(at('every class has styles'), !unstyled.length, unstyled.join(', '));

  check(at('no inline styles'), !/<[^>]+\sstyle="/.test(markup),
    'use a token-driven class instead');

  /* ---- 4. Field help ------------------------------------------------------
     Both of these were real regressions: help implemented as a span (so the
     glyph escaped its circle, because inline elements ignore width) and as a
     native title (which does not exist on touch). */

  const helpCount = (markup.match(/class="field__help"/g) || []).length;
  check(at('field help is a button, not a span'),
    !/<span[^>]*class="field__help"/.test(markup));
  check(at('field help uses data-help, not title'),
    !/class="field__help"[^>]*\stitle=/.test(markup));
  check(at('every help button carries data-help'),
    (markup.match(/data-help=/g) || []).length === helpCount,
    `${helpCount} buttons, ${(markup.match(/data-help=/g) || []).length} data-help`);
  if (helpCount) {
    check(at('help is initialised'), script.includes('initFieldHelp('));
  }

  /* Every help button needs a .field or .group ancestor for its note to be
     appended to. One sat on a group heading with neither, so it rendered a
     "?" that did nothing at all when clicked — no error, no note. */
  const orphanHelp = [...markup.matchAll(/<button class="field__help"[\s\S]{0,400}?<\/button>/g)]
    .filter((m) => {
      const before = markup.slice(0, m.index);
      const field = before.lastIndexOf('class="field"');
      const group = before.lastIndexOf('class="group"');
      const closedField = before.lastIndexOf('</div>');
      return field === -1 && group === -1 && closedField === -1;
    });
  check(at('every help button can host its note'), !orphanHelp.length,
    `${orphanHelp.length} with no .field or .group ancestor`);

  /* ---- 5. References resolve --------------------------------------------- */

  const ids = [...markup.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  const idSet = new Set(ids);
  const duplicates = [...new Set(ids.filter((id) => ids.indexOf(id) !== ids.lastIndexOf(id)))];
  check(at('no duplicate ids'), !duplicates.length, duplicates.join(', '));

  const referenced = new Set([
    ...[...script.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]),
    ...[...script.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]),
  ]);
  const dangling = [...referenced].filter((id) => !idSet.has(id));
  check(at('every element referenced in script exists'), !dangling.length, dangling.join(', '));

  const names = new Set([...markup.matchAll(/\bname="([^"]+)"/g)].map((m) => m[1]));
  const fieldRefs = new Set([...script.matchAll(/form\.elements\.(\w+)/g)].map((m) => m[1]));
  const missingNames = [...fieldRefs].filter((f) => !names.has(f));
  check(at('every form field referenced exists'), !missingNames.length, missingNames.join(', '));

  const labelFor = [...markup.matchAll(/<label[^>]*\bfor="([^"]+)"/g)].map((m) => m[1]);
  const deadLabels = labelFor.filter((id) => !idSet.has(id));
  check(at('every label points at a real field'), !deadLabels.length, deadLabels.join(', '));

  /* ---- 6. Embedding ------------------------------------------------------
     Forgetting reportHeight() breaks the embed silently: it looks fine
     standalone and clips inside the iframe. */

  check(at('reports its height to the parent'), script.includes('reportHeight('));
  check(at('reads URL state'), script.includes('readUrlState('));
  check(at('links both shared stylesheets'),
    html.includes('shared/tokens.css') && html.includes('shared/calculator.css'));
  check(at('no browser storage'),
    !/localStorage|sessionStorage/.test(script),
    'unit choice is per-calculator by design');

  /* ---- 7. Print sheet ----------------------------------------------------
     A printout that cannot identify itself is useless in a binder. */

  for (const id of ['sheet-setup', 'sheet-units', 'sheet-date']) {
    check(at(`print header has #${id}`), idSet.has(id));
  }
  check(at('print header has a title'), markup.includes('sheet__title'));
  check(at('setup name field exists'), /id="setup"/.test(markup));
  check(at('print sheet is populated'), script.includes('updateSheet('));

  /* ---- 8. Accessibility basics ------------------------------------------- */

  check(at('readout announces changes'), /class="readout[^"]*"[^>]*aria-live|aria-live[^>]*class="readout/.test(markup)
    || /<output[^>]*aria-live/.test(markup));

  const numberInputs = [...markup.matchAll(/<input[^>]*type="number"[^>]*>/g)].map((m) => m[0]);
  const noInputMode = numberInputs.filter((tag) => !tag.includes('inputmode'));
  check(at('number inputs set inputmode for phone keypads'),
    !noInputMode.length, `${noInputMode.length} missing`);

  const svgs = [...markup.matchAll(/<svg[^>]*class="diagram__svg[^"]*"[^>]*>/g)].map((m) => m[0]);
  const unlabelled = svgs.filter((tag) => !tag.includes('role="img"') || !tag.includes('aria-labelledby'));
  check(at('diagrams are labelled for screen readers'),
    !unlabelled.length, `${unlabelled.length} missing role or aria-labelledby`);

  /* Every diagram/chart svg must carry its viewBox in the static markup, not
     only via a later setAttribute call. Without it, the element has no
     intrinsic ratio at first paint, and browsers disagree on what a
     percentage-width replaced element does in that state — this is exactly
     how the speed chart once rendered far wider than every other section
     while measuring correctly in one browser and not another. */
  /* SVG presentation attributes (fill, stroke, stroke-width) sit BELOW author
     CSS in the cascade, so `fill="none"` on an element whose class sets a
     fill does nothing at all — the bore of the cylinder diagram was filled
     solid grey for exactly this reason. Use a dedicated class instead. */
  const overriddenFill = [...script.matchAll(/class="(diagram__\w+)"[^>]*\s(?:fill|stroke|stroke-width)="/g)]
    .map((m) => m[1]);
  check(at('no presentation attributes that CSS will override'),
    !overriddenFill.length,
    `${overriddenFill.join(', ')} — presentation attributes lose to class rules`);

  const noViewBox = svgs.filter((tag) => !/\sviewBox="[\d.\s]+"/.test(tag));
  check(at('diagram svgs have a viewBox from first paint'),
    !noViewBox.length, `${noViewBox.length} missing viewBox in markup`);

  /* ---- 8a. Every status region is written to ---------------------------
     An element that exists, starts hidden and is never populated renders as
     nothing and is valid markup, so no other check sees it. The brake
     calculator's warnings panel was dead for several builds that way. */

  const liveRegions = [...markup.matchAll(/id="([\w-]+)"[^>]*role="status"/g)]
    .map((m) => m[1]);
  const unwritten = liveRegions.filter((id) => {
    const writes = new RegExp(`\\$\\('${id}'\\)\\.(textContent|innerHTML)\\s*=\\s*(?!'')`);
    return !writes.test(script);
  });
  check(at('every status region is written to'), !unwritten.length, unwritten.join(', '));

  /* ---- 8b. No leftover template placeholders ---------------------------
     A placeholder that survives into the markup is valid HTML and renders as
     text, so neither the browser nor any other check complains. One shipped
     as a visible "{DOWNFORCE_Front}" above an input. */

  const strayPlaceholder = [...markup.matchAll(/\{\{?[A-Z][A-Z0-9_]{3,}\}?\}/g)].map((m) => m[0]);
  check(at('no leftover template placeholders'),
    !strayPlaceholder.length, [...new Set(strayPlaceholder)].join(', '));

  /* ---- 9. Fixtures exist ------------------------------------------------- */

  const files = await readdir(join(calcRoot, name));
  check(at('has at least one fixture file'),
    files.some((f) => f.startsWith('cases') && f.endsWith('.json')));
  check(at('has a pure formula module'), files.includes('formula.js'));
}

/* --- The preview harness ------------------------------------------------
   It embeds every calculator, so it is the one place a calculator can end up
   listed twice. That happened: a second lateral-load-transfer host was added
   while a duplicate of the calculator itself existed, and both survived with
   the same id. Neither the browser nor any other check complains, so it is
   worth asserting here.
   ========================================================================== */

{
  const preview = await readFile(join(root, 'preview.html'), 'utf8');
  const at = (label) => `preview harness: ${label}`;

  const embedded = [...preview.matchAll(/src="calculators\/([^/"]+)\//g)].map((m) => m[1]);
  const repeated = embedded.filter((c, i) => embedded.indexOf(c) !== i);
  check(at('embeds each calculator exactly once'), !repeated.length,
    `repeated: ${[...new Set(repeated)].join(', ')}`);

  const missing = dirs.filter((d) => !embedded.includes(d));
  check(at('embeds every calculator that exists'), !missing.length,
    `missing: ${missing.join(', ')}`);

  const previewIds = [...preview.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const dupeIds = previewIds.filter((v, i) => previewIds.indexOf(v) !== i);
  check(at('no duplicate ids'), !dupeIds.length, [...new Set(dupeIds)].join(', '));
}

/* --- Report -------------------------------------------------------------- */

if (problems.length) {
  console.error(`\n${problems.length} of ${checks} structure checks failed:\n`);
  for (const p of problems) {
    console.error(`  FAIL  ${p.name}${p.detail ? `\n          ${p.detail}` : ''}`);
  }
  console.error('');
  process.exit(1);
}

console.log(`\n${checks} structure checks passed across ${dirs.length} calculators\n`);
