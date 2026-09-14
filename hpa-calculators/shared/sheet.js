/* ==========================================================================
   sheet.js. Fills in the print-only header.

   A printed calculator is a document that will be filed and read months
   later, so it has to say what it is: which calculator, which setup, which
   units, and when it was produced. On screen none of this is visible; the
   Silverstripe page carries the title and description for search.

   Called on every render rather than on beforeprint, because it's cheap and
   because Cmd+P in some browsers snapshots before beforeprint handlers
   finish.
   ========================================================================== */

const DATE_FORMAT = new Intl.DateTimeFormat('en-NZ', {
  day: 'numeric', month: 'short', year: 'numeric',
});

export function updateSheet(form, { unitLabel = '' } = {}) {
  const setupField = form.elements.setup;
  const setupOut = document.getElementById('sheet-setup');
  const unitsOut = document.getElementById('sheet-units');
  const dateOut = document.getElementById('sheet-date');
  /* The disclaimer in the footer points at the page holding the full list of
     assumptions, so it needs the same address. */
  const disclaimerUrls = document.querySelectorAll('[data-sheet-url]');

  if (setupOut) {
    const name = setupField ? setupField.value.trim() : '';
    // An unnamed sheet gets a rule to write on, which is more useful on
    // paper than an empty space.
    setupOut.textContent = name || '________________________';
  }

  for (const el of disclaimerUrls) {
    el.textContent = window.location.href.split('#')[0];
  }

  if (unitsOut) unitsOut.textContent = unitLabel;
  if (dateOut) dateOut.textContent = DATE_FORMAT.format(new Date());

  // The link that reproduces this sheet. Printed small at the foot, so a
  // student can reopen a setup from a page in their binder.
}
