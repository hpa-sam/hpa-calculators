/* ==========================================================================
   help.js. The "?" explanations next to field labels.

   These were native `title` tooltips. Three things were wrong with that:
   they take a second or two to appear, they can't be styled, and they don't
   exist at all on touch, which rules them out given these will run in the
   app.

   A floating popover would be the obvious replacement, but it can't work
   here. The iframe is sized to its content and has no scroll of its own, so
   an absolutely positioned element doesn't add to document height and would
   simply be clipped at the frame edge. Worst on the last field of the last
   group, which is exactly where someone would look for help.

   So the explanation expands inline and pushes the layout down. The frame
   grows to fit via the existing resize observer, nothing can be clipped,
   and it behaves identically under a mouse, a finger and a keyboard.

   Help text lives in the markup as `data-help`, so the note element doesn't
   have to be written out seven times per calculator.
   ========================================================================== */

let counter = 0;

export function initFieldHelp(root = document) {
  for (const button of root.querySelectorAll('[data-help]')) {
    /* Usually the button sits in a .field, and the note goes after that
       field's control. A help button on a group heading has no .field to
       attach to, so it falls back to the group. Without this it rendered
       as a "?" that silently did nothing when clicked. */
    const host = button.closest('.field') || button.closest('.group');
    if (!host) continue;

    const note = document.createElement('p');
    note.className = 'field__note';
    note.id = `field-help-${++counter}`;
    note.textContent = button.dataset.help;
    note.hidden = true;
    host.append(note);

    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', note.id);

    button.addEventListener('click', () => {
      const open = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!open));
      note.hidden = open;
    });
  }
}
