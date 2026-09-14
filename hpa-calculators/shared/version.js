/* ==========================================================================
   version.js. One build number for the whole set.

   The calculators share a foundation, so they share a version: if the
   tokens, the unit layer or the print sheet changes, every calculator
   changed. A per-calculator version would imply they can drift apart,
   which is exactly what the shared layer exists to prevent.

   It matters because printed sheets outlive the build that made them. A
   student with a setup sheet in a binder and a different answer on screen
   needs to know whether the calculator changed or their inputs did, and
   the maths behind compression ratio and belt sizing has already changed
   once each. Every sheet carries the build that produced it.

   Format: YYYY.MM.N, bumped by hand. N resets each month.
   Bump it when any published behaviour changes. A formula, an input, a
   default, or the assumptions text. Not for typo fixes.
   ========================================================================== */

export const BUILD = '2026.10.7';

/** Stamps the build into every [data-build] element. */
export function showBuild(root = document) {
  for (const el of root.querySelectorAll('[data-build]')) {
    el.textContent = BUILD;
  }
}
