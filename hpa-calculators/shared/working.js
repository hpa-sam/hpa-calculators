/* ==========================================================================
   working.js. Renders the collapsible "show the working" panel.

   Every formula module returns a `working` array alongside its results.
   Each entry is one step:

     {
       label:   'Swept volume of one cylinder',
       expr:    'V = pi/4 x bore^2 x stroke',
       values:  'V = pi/4 x 86.00^2 x 86.00',
       result:  '499,556 mm^3',
       note:    'optional plain-language explanation'
     }

   Keeping this shared means the panel looks and behaves the same across
   all seven calculators, and a new calculator gets it by returning data
   rather than writing markup.

   Corrections made to the original spreadsheets are recorded in the README
   rather than surfaced here. The maths is validated by the parity suite,
   so a student doesn't need the migration history to trust the number.
   ========================================================================== */

const escape = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

export function renderWorking(container, steps) {
  if (!steps || !steps.length) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = steps
    .map((step) => {
      const parts = [`<p class="step__label">${escape(step.label)}</p>`];

      if (step.expr) {
        parts.push(`<code class="step__expr">${escape(step.expr)}</code>`);
      }
      if (step.values) {
        parts.push(
          `<code class="step__expr step__expr--values">${escape(step.values)}` +
            (step.result ? `  =  ${escape(step.result)}` : '') +
            `</code>`
        );
      }
      if (step.note) {
        parts.push(`<p class="step__note">${escape(step.note)}</p>`);
      }

      return `<div class="step">${parts.join('')}</div>`;
    })
    .join('');
}
