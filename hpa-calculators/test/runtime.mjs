#!/usr/bin/env node
/* ==========================================================================
   runtime.mjs — loads each calculator in a real browser and checks it works.

   Run with:  node test/runtime.mjs
   Requires:  a Chromium binary and Playwright's node package. Skips cleanly
              with a zero exit if neither is present, so it never blocks a
              machine that only wants parity and structure checks.

   Why this exists: parity.mjs proves the maths, structure.mjs proves the
   markup — and both passed with flying colours while the engine calculator
   was throwing `setUnitLabels is not defined` on every keystroke and
   rendering nothing but em dashes. A refactor had deleted two functions and
   neither suite could see it, because neither actually runs the page.

   So this checks the three things only execution can show:
     1. no uncaught errors on load or on input
     2. the readouts actually contain numbers, not placeholders
     3. the diagram actually drew something
   ========================================================================== */

import { readdir, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8123;

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
};

/* --- Locate a browser ----------------------------------------------------
   Playwright's own download, then puppeteer's cache, then anything on the
   PATH. Skipping is deliberate: this suite is a bonus, not a gate. */

async function findChromium() {
  const { homedir } = await import('node:os');
  const { stat } = await import('node:fs/promises');
  const home = homedir();

  // Browser cache layouts differ between Playwright, Puppeteer and their
  // versions, so walk the trees rather than guessing at path shapes.
  const NAMES = new Set(['chrome', 'chromium', 'headless_shell', 'chrome-headless-shell']);
  /* Several homes, because the caches don't always belong to the user
     running the tests — in a container this often runs as root while the
     browser was downloaded under a normal account, so homedir() points
     somewhere with nothing in it. */
  const homes = [home, process.env.HOME, '/home/claude', '/root', '/usr/local/share']
    .filter(Boolean);
  const roots = [
    ...homes.flatMap((h) => [
      join(h, '.cache/ms-playwright'),
      join(h, '.cache/puppeteer'),
    ]),
    process.env.CHROME_PATH && dirname(process.env.CHROME_PATH),
  ].filter(Boolean);

  async function walk(dir, depth = 0) {
    if (depth > 5) return null;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isFile() && NAMES.has(entry.name)) {
        try {
          const info = await stat(path);
          if (info.mode & 0o111) return path;   // executable
        } catch {}
      }
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const found = await walk(join(dir, entry.name), depth + 1);
      if (found) return found;
    }
    return null;
  }

  if (process.env.CHROME_PATH) {
    try {
      await access(process.env.CHROME_PATH);
      return process.env.CHROME_PATH;
    } catch {}
  }

  for (const root of roots) {
    const found = await walk(root);
    if (found) return found;
  }
  return null;
}

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  try {
    const { createRequire } = await import('node:module');
    ({ chromium } = createRequire(import.meta.url)('playwright'));
  } catch {
    console.log('\nruntime checks skipped — playwright not installed\n');
    process.exit(0);
  }
}

const executablePath = await findChromium();
if (!executablePath) {
  console.log('\nruntime checks skipped — no Chromium binary found\n');
  process.exit(0);
}

/* --- Serve the folder --------------------------------------------------- */

const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(req.url.split('?')[0]);
    if (path.endsWith('/')) path += 'index.html';
    const body = await readFile(join(root, path));
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((r) => server.listen(PORT, r));

/* --- Check each calculator ---------------------------------------------- */

const dirs = (await readdir(join(root, 'calculators'), { withFileTypes: true }))
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
let passed = 0;
const problems = [];

for (const name of dirs) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // The browser always probes /favicon.ico; a 404 for it says nothing
    // about the calculator.
    if (/favicon/i.test(m.text()) || /404/.test(m.text())) return;
    errors.push(m.text());
  });
  page.on('requestfailed', (r) => {
    if (!/favicon/i.test(r.url())) errors.push(`request failed: ${r.url()}`);
  });

  await page.goto(`http://localhost:${PORT}/calculators/${name}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(350);

  // Typing is where a missing handler shows up, so exercise a real input.
  const firstNumber = await page.$('input[type="number"]');
  if (firstNumber) {
    const value = await firstNumber.inputValue();
    await firstNumber.fill(String(Number(value) || 50));
    await firstNumber.dispatchEvent('input');
    await page.waitForTimeout(250);
  }

  const state = await page.evaluate(() => {
    /* Hidden readouts are skipped. A readout that only appears once an
       optional input is filled — the LLTD baseline comparison, say — is
       legitimately blank until then, and offscreen either way. */
    const readouts = [...document.querySelectorAll('.readout__figure span:first-child')]
      .filter((el) => !el.closest('[hidden]'))
      .map((el) => el.textContent.trim());
    const results = [...document.querySelectorAll('.input--result')]
      .map((el) => el.value.trim());
    const scenes = [...document.querySelectorAll('.diagram__svg g')]
      .map((el) => el.children.length);

    /* Content must stay inside the viewBox. Measured on the scene GROUP, not
       per element: getBBox on a rotated <text> returns its pre-rotation box,
       which reads as an overflow that isn't there. A group's box does account
       for its children's transforms.

       Three diagrams have shipped with labels outside their viewBox, so this
       is worth enforcing rather than eyeballing. */
    const clipped = [...document.querySelectorAll('.diagram__svg > g')]
      .filter((g) => {
        const b = g.getBBox();
        const vb = g.ownerSVGElement.getAttribute('viewBox').split(' ').map(Number);
        return b.x < -2 || b.y < -2 || b.x + b.width > vb[2] + 2 || b.y + b.height > vb[3] + 2;
      })
      .map((g) => {
        const b = g.getBBox();
        const vb = g.ownerSVGElement.getAttribute('viewBox').split(' ').map(Number);
        return `${g.ownerSVGElement.id}: ${Math.round(b.x)},${Math.round(b.y)} to `
          + `${Math.round(b.x + b.width)},${Math.round(b.y + b.height)} in ${vb[2]}x${vb[3]}`;
      });

    return { readouts, results, scenes, clipped };
  });

  const label = (msg) => problems.push({ name, detail: msg });

  /* --- Unit switching ----------------------------------------------------
     Switching to imperial once left three fields holding their millimetre
     values while everything read them as inches: a 30mm compression height
     became 762mm and static compression ratio collapsed from 10.51 to 1.02.
     Nothing threw, so no other check could see it.

     The invariant is simple and strong: a ratio is dimensionless, so every
     ratio output must read identically in both systems. If a field failed
     to convert, the ratios move. */
  const unitSwitch = await page.$('.unit-switch label:nth-of-type(2) .unit-switch__label');
  if (unitSwitch) {
    /* Identified by the ": 1" unit suffix, which is the actual marker of a
       dimensionless output. Matching on the word "ratio" anywhere in the
       field caught "Belt surface speed", whose help text happens to end
       "...whatever the ratio." */
    const ratioFields = () => page.evaluate(() =>
      [...document.querySelectorAll('.field__unit')]
        .filter((u) => /^:\s*1$/.test(u.textContent.trim()))
        .map((u) => u.closest('.field__control')?.querySelector('input')?.value)
        .filter((v) => v !== undefined));

    /* Ratios alone are not enough. They are dimensionless, so scaling every
       corner weight by the same wrong factor leaves them untouched — which
       is exactly how the CoG corner weights were being converted as grams
       (413 kg became 15 lb) while this check stayed green.

       So also verify that each editable field's number matches the unit
       printed beside it: read the label before and after the switch, and
       confirm the value moved by the factor those two units imply. */
    const FACTORS = {
      mm: 1, in: 25.4,
      kg: 1, lb: 0.45359237, g: 0.001, oz: 0.028349523125,
      'N/mm': 1, 'kg/mm': 9.80665, 'lb/in': 0.1751268352,
    };

    const unitFields = () => page.evaluate(() =>
      [...document.querySelectorAll('.field__unit[data-unit]')]
        .map((u) => {
          const input = u.closest('.field__control')?.querySelector('input:not([readonly])');
          return input && input.value !== ''
            ? { id: input.id, unit: u.textContent.trim(), value: Number(input.value) }
            : null;
        })
        .filter(Boolean));

    const unitsBefore = await unitFields();
    const before = await ratioFields();
    await unitSwitch.click();
    await page.waitForTimeout(300);
    const after = await ratioFields();

    const unitsAfter = await unitFields();
    for (const a of unitsBefore) {
      const b = unitsAfter.find((x) => x.id === a.id);
      if (!b || a.unit === b.unit) continue;
      const fa = FACTORS[a.unit];
      const fb = FACTORS[b.unit];
      if (!fa || !fb) { label(`unknown unit "${a.unit}" or "${b.unit}" on ${a.id}`); continue; }
      const expected = (a.value * fa) / fb;
      // 0.5% covers the rounding each field applies on conversion
      if (Math.abs(b.value - expected) > Math.abs(expected) * 0.005 + 1e-6) {
        label(`${a.id}: ${a.value}${a.unit} became ${b.value}${b.unit}, expected ${expected.toFixed(3)}${b.unit} — wrong unit pair?`);
      }
    }

    /* Rate units get the same treatment, and separately: they are their own
       three-way control, not part of the metric/imperial system. The spring
       calculator gained rate *inputs* after its rate switch was written to
       govern outputs only, so 80 N/mm became 80 kg/mm on switching — the
       number stayed put while its label changed. Checking only the system
       switch missed it entirely. */
    /* Optional rate fields start blank, and a blank field has nothing to
       compare — which is how this check first passed while the bug it was
       written for was still present. So fill any empty one first. */
    await page.evaluate(() => {
      for (const label of document.querySelectorAll('.field__unit[data-unit="rate"]')) {
        const input = label.closest('.field__control')?.querySelector('input:not([readonly])');
        if (input && input.value === '') {
          input.value = '50';
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    });
    await page.waitForTimeout(200);

    /* Clicked through the DOM rather than with a real pointer: the radio is
       visually hidden behind its label, so a pointer click is intercepted. */
    const rateUnits = await page.evaluate(() =>
      [...document.querySelectorAll('input[name="rateUnit"]')].map((r) => r.value));
    for (let i = 1; i < rateUnits.length; i++) {
      const was = await unitFields();
      await page.evaluate((v) => {
        const el = document.querySelector(`input[name="rateUnit"][value="${v}"]`);
        el.click();
      }, rateUnits[i]);
      await page.waitForTimeout(250);
      const now = await unitFields();
      for (const a of was) {
        const b = now.find((x) => x.id === a.id);
        if (!b || a.unit === b.unit) continue;
        const fa = FACTORS[a.unit];
        const fb = FACTORS[b.unit];
        if (!fa || !fb) { label(`unknown rate unit "${a.unit}" or "${b.unit}" on ${a.id}`); continue; }
        const expected = (a.value * fa) / fb;
        if (Math.abs(b.value - expected) > Math.abs(expected) * 0.005 + 1e-6) {
          label(`${a.id}: ${a.value}${a.unit} became ${b.value}${b.unit}, expected ${expected.toFixed(3)}${b.unit} — rate switch not converting?`);
        }
      }
    }
    if (rateUnits.length) passed++;

    if (before.length && JSON.stringify(before) !== JSON.stringify(after)) {
      label(`ratios changed when units switched (${before.join('/')} -> ${after.join('/')}) — a field probably isn't being converted`);
    } else {
      passed++;
    }

    // And nothing should have thrown while switching.
    const afterErrors = [...new Set(errors)];
    if (afterErrors.length) label(`errors after unit switch: ${afterErrors.slice(0, 2).join(' | ')}`);
    else passed++;
  }


  if (errors.length) label(`uncaught errors: ${[...new Set(errors)].slice(0, 3).join(' | ')}`);
  else passed++;

  const deadReadouts = state.readouts.filter((t) => !t || t === '—');
  if (deadReadouts.length) label(`${deadReadouts.length} readout(s) showing no value`);
  else passed++;

  // Every result field blank means the render path died partway.
  if (state.results.length && state.results.every((v) => v === '—' || v === '')) {
    label('every result field is empty');
  } else passed++;

  if (state.scenes.length && state.scenes.every((n) => n === 0)) {
    label('nothing drawn in any diagram or chart');
  } else passed++;

  if (state.clipped.length) label(`drawn outside the viewBox — ${state.clipped.join('; ')}`);
  else passed++;

  await page.close();

  /* --- Print budget ------------------------------------------------------
     A setup sheet is meant to fit one A4 page, and page count is the only
     honest measure of that — it can't be eyeballed from a screen render.

     The viewport width matters and is easy to get wrong: the print content
     box is A4 minus the @page margins, 210 - 22 - 13 = 175mm, which is
     661px at 96dpi. Measuring at full 210mm width makes everything look
     comfortably shorter than it really is, because narrower content is
     taller content. */
  const printPage = await browser.newPage({ viewport: { width: 661, height: 1123 } });
  await printPage.emulateMedia({ media: 'print' });
  await printPage.goto(`http://localhost:${PORT}/calculators/${name}/`, { waitUntil: 'networkidle' });
  await printPage.waitForTimeout(300);
  const heightMm = await printPage.evaluate(
    () => (document.body.getBoundingClientRect().height * 25.4) / 96
  );
  await printPage.close();

  /* One A4 page of content: 297 less 14 top and 12 bottom margin.

     Most calculators get one page, and the check exists to stop them
     creeping past it. Load transfer is allowed two: it has 22 inputs where
     belt length has 5, and squeezing it onto one page would mean deleting
     figures a setup sheet needs. It breaks deliberately between car data
     and results, which is the split you want when reading it in the pit.

     A budget is stated per calculator rather than waived, so accidental
     growth is still caught — a two-page calculator drifting to three fails
     exactly as a one-page one drifting to two does. */
  const PAGE_MM = 271;
  const PAGES = {};
  const pages = PAGES[name] ?? 1;
  const budget = PAGE_MM * pages;

  if (heightMm > budget) {
    label(`print sheet is ${heightMm.toFixed(1)}mm, over the ${budget}mm `
      + `${pages}-page budget by ${(heightMm - budget).toFixed(1)}mm`);
  } else if (pages > 1 && heightMm < PAGE_MM * (pages - 1)) {
    label(`print sheet is ${heightMm.toFixed(1)}mm, which now fits in `
      + `${pages - 1} page(s) — reduce its budget in PAGES`);
  } else {
    passed++;
  }
}

await browser.close();
server.close();

if (problems.length) {
  console.error(`\n${problems.length} runtime check(s) failed:\n`);
  for (const p of problems) console.error(`  FAIL  ${p.name}\n          ${p.detail}`);
  console.error('');
  process.exit(1);
}

console.log(`\n${passed} runtime checks passed across ${dirs.length} calculators\n`);
