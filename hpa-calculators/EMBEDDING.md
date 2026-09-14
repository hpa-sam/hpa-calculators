# Embedding a calculator

Two steps. The script goes in the site template once, and then each page
needs one `<iframe>` that a content editor can paste into a content field
without a developer.

## Step 1: the resize script, once

The calculators report their height to the parent page so the iframe can grow
to fit. Without this they sit in a fixed box with their own scrollbar.

Paste this into your Silverstripe base template, just before `</body>`. In a
default theme that is `themes/<yourtheme>/templates/Page.ss`.

```html
<script>
(function () {
  // Only accept messages from where the calculators are hosted. Without
  // this, any embedded third-party frame could resize your layout or
  // trigger your modal.
  var ALLOWED_ORIGINS = [
    'https://calculators.hpacademy.com'
  ];

  function findFrame(source) {
    var frames = document.querySelectorAll('iframe[data-hpa-calc]');
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].contentWindow === source) return frames[i];
    }
    return null;
  }

  window.addEventListener('message', function (event) {
    if (ALLOWED_ORIGINS.indexOf(event.origin) === -1) return;

    var data = event.data;
    if (!data || data.type !== 'hpa:calc:height') return;

    var height = parseInt(data.height, 10);
    if (!height || height < 50 || height > 8000) return;

    // Matching the message to its iframe by window reference means several
    // calculators on one page each resize independently.
    var frame = findFrame(event.source);
    if (frame) frame.style.height = height + 'px';

  });
})();
</script>
```

**Change `ALLOWED_ORIGINS` to wherever you actually host these.** Exactly, with
the `https://` and no trailing slash:

| Hosting | Value |
| --- | --- |
| Custom domain | `https://calculators.hpacademy.com` |
| GitHub Pages default | `https://YOUR-ORG.github.io` |

If it does not match, the calculator still displays but never resizes, and you
get a scrollbar inside a fixed box. That symptom almost always means this line.

The origin check is not optional politeness. Without it any embedded
third-party frame on the page could resize your layout.

## Step 2: the iframe, per page

```html
<iframe
  data-hpa-calc
  src="https://calculators.hpacademy.com/calculators/engine-displacement/"
  title="Engine displacement calculator"
  loading="lazy"
  style="width:100%; height:620px; border:0; display:block;"
></iframe>
```

Change `src` and `title` per calculator. The seven paths are:

| Calculator | Path |
| --- | --- |
| Engine displacement | `/calculators/engine-displacement/` |
| Belt length and pulley ratio | `/calculators/belt-length/` |
| Centre of gravity | `/calculators/centre-of-gravity/` |
| Anti-roll bar stiffness | `/calculators/anti-roll-bar/` |
| Spring rate from ride frequency | `/calculators/spring-rate/` |
| Lateral load transfer | `/calculators/lateral-load-transfer/` |
| Brake system | `/calculators/brake-system/` |

`height:620px` is a starting value only, replaced the moment the calculator
reports in. Setting it near the final height stops the page jumping on load.

`loading="lazy"` means a calculator below the fold costs nothing until the
visitor scrolls to it.

## Check this before rolling out

Silverstripe's TinyMCE editor sanitises pasted HTML. Depending on your
`HTMLEditorConfig` it may strip the `data-hpa-calc` attribute, or the
`<iframe>` entirely. If the attribute goes, the script cannot find the frame
and resizing fails.

Test one page first. If the attribute is being stripped, change the selector
in the script to match on the source instead, which survives any editor:

```js
var frames = document.querySelectorAll('iframe[src*="/calculators/"]');
```

The tidier fix is to allow the attribute in your TinyMCE config, but that
needs a developer and the selector change does not.

## Passing starting values

Any input's `name` works as a query parameter, so the same calculator can open
with different defaults per page with no code change:

```
src=".../engine-displacement/?bore=101.6&stroke=88.4&cylinders=8"
src=".../engine-displacement/?units=imperial&bore=4&stroke=3.48"
```

`units` selects metric or imperial. This is the same mechanism behind the copy
link button, so there is one thing to understand rather than three.

## Several on one page

Each frame is matched to its own message by window reference, so any number of
calculators on a page resize independently. Nothing extra to configure.
