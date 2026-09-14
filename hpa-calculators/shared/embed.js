/* ==========================================================================
   embed.js. Everything to do with living inside an iframe.

   Two jobs:
     1. tell the parent page how tall to make the iframe
     2. read starting values from the query string, and write them back out
        for sharing and for chaining between calculators
   ========================================================================== */

const HEIGHT_MESSAGE = 'hpa:calc:height';

/* --- Auto-height ---------------------------------------------------------
   An iframe has no intrinsic height and can't grow to fit its content, so
   the child measures itself and reports.

   ResizeObserver on <html> catches every cause: a value changing, the
   working panel opening, a section collapsing, rotation, font load. No
   polling, no timers. Height is read off documentElement rather than body
   because body has collapsible margins that make the number unreliable. */

export function reportHeight() {
  if (window.parent === window) return () => {};

  let last = 0;
  const send = () => {
    const height = Math.ceil(document.documentElement.getBoundingClientRect().height);
    if (height === last) return;
    last = height;
    window.parent.postMessage({ type: HEIGHT_MESSAGE, height }, '*');
  };

  if ('ResizeObserver' in window) {
    new ResizeObserver(send).observe(document.documentElement);
  } else {
    window.addEventListener('resize', send);
  }

  send();
  if (document.fonts?.ready) document.fonts.ready.then(send);
  return send;
}

/* --- URL state -----------------------------------------------------------
   One mechanism serving three purposes:

     defaults  a page embeds the calculator with starting values
     sharing   a student pastes their setup into the HPA forum
     chaining  one calculator hands values to the next

   Field `name` attributes are the parameter names, so there's no separate
   mapping to keep in sync. */

export function readUrlState(form) {
  const params = new URLSearchParams(window.location.search);
  let applied = false;

  for (const [key, raw] of params) {
    const field = form.elements[key];
    if (!field) continue;

    // Radio groups (the unit switch) arrive as a RadioNodeList.
    if (field.length && !field.tagName) {
      for (const radio of field) {
        if (radio.value === raw) { radio.checked = true; applied = true; }
      }
      continue;
    }

    if (field.type === 'number' || field.type === 'range') {
      const value = Number(raw);
      if (!Number.isFinite(value)) continue;   // a stale URL can't break us
      field.value = String(value);
    } else if (field.tagName === 'SELECT') {
      if (![...field.options].some((o) => o.value === raw)) continue;
      field.value = raw;
    } else if (field.type === 'checkbox') {
      field.checked = raw === '1' || raw === 'true';
    } else {
      field.value = raw;
    }
    applied = true;
  }

  return applied;
}

export function buildShareUrl(form, extra = {}) {
  const params = new URLSearchParams();

  for (const [key, value] of new FormData(form)) {
    if (value === '' || value === null) continue;
    params.set(key, String(value));
  }
  for (const [key, value] of Object.entries(extra)) {
    params.set(key, String(value));
  }

  const url = new URL(window.location.href);
  url.search = params.toString();
  return url.toString();
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;   // clipboard is blocked in some embedded contexts
  }
}
