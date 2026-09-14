[README.md](https://github.com/user-attachments/files/32212252/README.md)
# hpa-calculators

Self-hosted, embeddable calculators to replace the grid.io versions. Plain
HTML, CSS and JavaScript. No framework, no build step, no dependencies.

## Why it's built this way

The previous setup died because the calculators lived inside someone else's
product. This one is a folder of static files, which has a useful property:
**every part is replaceable without touching any other part.**

- The host is interchangeable. Static files run identically on Cloudflare
  Pages, GitHub Pages, Netlify, S3 or your own nginx. Changing host is a DNS
  change, not a rebuild.
- No build step means no toolchain to rot. These files will open in a
  browser in ten years.
- No dependencies means nothing can be abandoned upstream, and there is no
  `npm install` that stops working.
- The maths lives in plain `.js` files you own, in a Git repo you control.

Worst case is your host disappears. You move the folder and update the
iframe URLs. An afternoon, not a rebuild.

## Performance

Each calculator is roughly 20KB and runs entirely in the browser. No API
call, no spreadsheet round-trip, no cold start; results update as the
student types. The shared CSS and JS are cached across all calculators, so
the second one someone opens is close to instant.

## Layout

```
shared/
  tokens.css      the design language. The only file you edit to rebrand
  calculator.css  shared components: sections, fields, readouts, working
  units.js        conversion and formatting, UI boundary only
  working.js      renders the "show the working" panel
  help.js         the "?" explanations beside field labels
  embed.js        auto-height and URL state
  sheet.js        fills in the print-only sheet header
  version.js      the build number, stamped into footers and print sheets

calculators/<name>/
  index.html      markup and wiring
  formula.js      the maths. Pure, canonical units, no DOM
  cases.json      fixtures taken from the original spreadsheet

test/parity.mjs     checks every formula.js against its cases.json
test/structure.mjs  checks every index.html against the markup contract
test/runtime.mjs    loads each page in a browser and checks it actually works
test/all.mjs        runs all three. The one command to remember
preview.html        local harness. Embeds every calculator in an iframe
EMBEDDING.md        putting a calculator on a Silverstripe page
DEPLOYMENT.md       getting this hosted on GitHub Pages
```

### The one rule worth keeping

`formula.js` has no DOM access, no imports and no unit awareness. It takes
canonical values, returns canonical values, and knows nothing about what the
user selected. Conversion happens only when reading a field and writing a
readout.

That rule is what makes two things possible. Your React Native app can
import the same file the website uses, so app and site can never disagree
about a number. And values can be handed between calculators safely,
because a travelling value can't carry a display unit with it. The
receiving calculator might be in imperial while the sender was in metric.

### Canonical units

| Quantity | Canonical |
|---|---|
| Length | mm |
| Volume | cc |
| Mass | kg |
| Force | N |
| Pressure | kPa |
| Torque | Nm |
| Stiffness | N/mm |
| Angle | degrees |
| Speed | rpm |

Automotive working units rather than strict SI, so we're never dealing in
0.0254 m. Test fixtures assert canonical values, so they don't churn when
someone adds a display unit later.

## Running locally

ES modules must be served over HTTP. Opening `index.html` straight from the
file system fails with a CORS error. This catches everyone once.

```bash
npx serve .
```

Then open **http://localhost:3000/preview.html**. That page embeds every
calculator in a real iframe using the production auto-height script, and
shows the reported height so you can confirm the embed handshake works.
Opening a calculator standalone shows the design but not the iframe
behaviour, which is the part that can actually go wrong.

No Node? Any static server does the job:

```bash
python3 -m http.server 3000
```

Run the tests before every commit:

```bash
node test/all.mjs
```

## Deploying

Push to `main` and point a static host at the repo root.

**Cloudflare Pages** over GitHub Pages, for one concrete reason: it can set
response headers, so you can add

```
Content-Security-Policy: frame-ancestors https://www.hpacademy.com
```

which stops anyone else embedding your calculators on their own site.
GitHub Pages can't set headers. Both are free and both serve from a CDN.

Use a subdomain like `calculators.hpacademy.com`. Nothing in the code
depends on the domain.

## Embedding

One `<script>` block goes into the Silverstripe base template, once. After
that each calculator is a single `<iframe>` tag. Both are in
`EMBEDDING.md`.

The script exists because an iframe has no intrinsic height and can't grow
to fit its content. The calculator measures itself and posts its height up.
Without it you get either a scrollbar inside the frame or a large gap under
it.

## URL state

One mechanism, three purposes:

- **Defaults**. A page embeds a calculator with starting values
- **Sharing.** "Copy link" gives a student a URL they can paste into the
  HPA forum, and an instructor opens the exact same numbers
- **Chaining**. One calculator hands values to the next

Field `name` attributes are the parameter names, so there's no separate
mapping to maintain. `units` selects metric or imperial.

## Design language

Everything is in `shared/tokens.css`. Colour is organised by **field role**,
taken from the XD mock, because a field's colour then tells the student
whether they can touch it:

| Role | Colour |
|---|---|
| Section header, inputs | HPA yellow `#F9B621` |
| Section header, intermediate | grey |
| Section header, results | green |
| Editable field | blue |
| Intermediate, read only | grey |
| Result | green |
| Status | green OK, amber close to limits, red warning |

Two deliberate departures from the mock, both about legibility:

- Yellow headers use dark text. White on `#F9B621` is about 2:1 contrast,
  unreadable in a workshop and well short of WCAG. The yellow is unchanged.
- The intermediate grey and results green are darkened so white header text
  clears 4.5:1. Same hues, more contrast.

Figures are set in a fixed-width face. That's subject-driven rather than
decorative: this audience reads dyno sheets, ECU tables and logger traces,
all of which align figures in columns. It also stops digits jittering as a
value recalculates.

To use a brand typeface, self-host it. Don't use Google Fonts, which adds a
third-party dependency and a DNS lookup inside the iframe:

```css
/* shared/tokens.css */
@font-face {
  font-family: "HPA Sans";
  src: url("./fonts/hpa-sans.woff2") format("woff2");
  font-weight: 400 700;
  font-display: swap;
}
:root {
  --font-sans: "HPA Sans", -apple-system, BlinkMacSystemFont, sans-serif;
}
```

Keep the fallbacks. If the font fails, the calculator still works and still
looks deliberate.

## Diagrams

Each calculator carries a live SVG schematic that redraws as values change.
It's there to show relative proportion. That the drive pulley is twice the
driven, that a bore is wider than its stroke, which a column of numbers
can't convey.

Three rules keep them consistent as the set grows:

**Geometry lives with the maths where the two are connected.** The belt path
in `beltGeometry()` is built from the same tangent angle as the length
formula, so the drawing and the answer are the same calculation. The parity
suite asserts it: `pathLength` from the geometry must equal `length` from
the formula, to 0.001 mm. If a future change breaks one, the test catches
it, rather than a student noticing the picture disagrees with the number.

Where no such relationship exists. The engine cylinder section is a scaled
rectangle, nothing about the displacement depends on it. The drawing stays
in the calculator's own file. Don't manufacture a cross-check that isn't
real.

**Draw one thing, honestly.** The cylinder section originally included a row
of circles for cylinder count. It was removed: laying out eight circles
implies a configuration, and eight in a row reads as a straight-eight rather
than a V8. Getting it right would have meant asking for the bank
configuration, which is an extra input for no analytical gain. The drawing
now shows bore against stroke and nothing else. If a diagram can't be drawn
truthfully without another input, leave it out rather than drawing something
misleading.

## Results layout

Results are a two-column grid: numbers on the left, diagram on the right.
The diagram used to sit full width above the readout, which doubled the
scroll height and sized the drawing far beyond the detail it carries.

Below 60rem it collapses to one column with the numbers first. On a phone
the answer should arrive before the picture. It stays two-column in print,
which is a large part of what keeps each sheet to one A4 page.

Everything derived belongs in the results section, not the inputs. Engine
displacement originally had a "Per cylinder" group among the inputs, which
was wrong: those are outputs. Same for the reciprocating loads, which were
a separate section below and are now beside the displacement they follow
from. One section, one working panel, one derivation.

## Field help

Every input and every non-obvious output has one. The aim is the fewest
words that let someone act: what the figure is, where to find it, and the
range or threshold that tells them whether theirs is sensible.

- **Give a range, not just a definition.** "Compressed, not shelf thickness"
  doesn't stop anyone entering 0.8mm for an engine with a 1.2mm factory
  gasket. "Factory gaskets are usually 1.0 to 1.3mm. Being 0.4mm out costs
  about 0.3:1 of ratio" does. That omission is what sent an SR20DET
  0.5:1 high.
- **Say what to do at the limit.** Peak rod tensile force explains that the
  load halves between two bolts, rises with the square of rpm, and that
  stock bolts suit the factory rev limit, so the reader knows when to look
  up their rod maker's clamp load.
- **Keep it under about 25 words** unless the field carries a real decision.
  35 entries average 19 words; only the rod bolt note runs to 45.

Help text is `data-help` on the button, so adding it is one attribute. It
can sit on a field label or a group heading. `initFieldHelp()` attaches the
note to whichever it finds, and a structure check makes sure every button
has one of the two, since a button with neither renders a "?" that silently
does nothing.

### Why it expands inline rather than floating

Worth keeping in mind for later calculators: **an absolutely positioned
popover cannot work in these frames.** The iframe is sized to its content and has no scroll of its
own, so a floating element adds nothing to document height and is simply
clipped at the frame edge. Worst on the last field of the last group, which
is exactly where someone reaches for help. Expanding inline grows the
document, the resize observer grows the frame, and nothing can be clipped.
It also works identically under a mouse, a finger and a keyboard, which
native tooltips do not. They don't exist on touch at all.

It also started as a native `title` tooltip with the glyph escaping its
circle, because `.field__help` was a `span`. An inline element, so `width`
and `height` did nothing. It's a `button` now, with `inline-flex` to centre
the character.

## Runtime tests

`node test/runtime.mjs` loads each calculator in a headless browser, types
into a field, and checks three things nothing else can see: no uncaught
errors, readouts containing actual numbers rather than em dashes, and
something actually drawn in each diagram.

It exists because parity and structure once both passed. 41 and 72 checks
green, while the engine calculator threw `setUnitLabels is not defined` on
every keystroke and displayed nothing but placeholders. A refactor had
deleted two functions and neither suite could tell, because neither suite
runs the page.

It also measures each print sheet against the one-page A4 budget, because
page count can't be judged from a screen render.

It skips itself with a zero exit when no browser or Playwright is available,
so it never blocks a machine that only wants the other two.

## Icon buttons

Print and copy-link are icon-only, which is safe because both glyphs are
long established. Two things make that accessible rather than merely tidy:

- Every icon button has an `aria-label` and a `title`, so it has a name for
  screen readers and for voice control, and hovering explains it.
- The 44px target is kept, so it doesn't shrink along with the label.
- Copy confirmation swaps the glyph to a tick *and* renames the button, so
  the confirmation reaches assistive tech and not only sighted users. With
  no text label there's nothing to change, which is the usual failure mode
  when a labelled button becomes an icon.

Icons are inline SVG using `currentColor`. No icon font, no sprite fetch,
nothing to flash in after load.

## Printing

Printouts are designed as filed documents, not screenshots. A student
building a reference binder of setups. One sheet for dry, one for wet —
needs each page to identify itself and to sit in a ring binder.

- A4 portrait, sized to fit one page. Two at most.
- `@page` margins are `14mm 13mm 12mm 22mm`. The wide left margin clears a
  hole punch.
- The print layout redefines the spacing and type **tokens** rather than
  overriding individual rules, so everything tightens uniformly and a new
  calculator gets a working print layout without anyone writing print CSS.
- A print-only header carries the calculator name, the setup name, which
  unit system was used, and the date. On screen this is hidden, because the
  Silverstripe page carries the title and description for search ranking.
- The **Setup** field labels the sheet. Without it a binder of printouts is
  a binder of identical printouts. It also travels in the share URL, so a
  link arrives already named.
- **Working panels don't print.** A filed sheet shows what was entered and
  what came out; the derivation is reference material and lives online. This
  is also most of what brings each sheet inside one page.
- Interactive furniture is dropped: unit switch, help buttons, the Setup
  field, animation controls.
- Input groups pack with `auto-fit`, three across on A4. Two fixed columns
  wasted a whole row whenever a section had three groups. The third wrapped
  alone and left half the page blank beside it.
- The shareable URL prints small at the foot, so a page in a binder can be
  reopened as a live calculator.
- Field background colours are forced to print. The blue/grey/green fills
  are how a reader tells entered values from calculated ones, so stripping
  them would lose meaning. Anyone wanting to save toner can untick
  "background graphics" in the print dialog.
- Collapsed sections don't print. If it was closed on screen the student
  didn't want it, and it would push the sheet onto another page.

Both sheets currently fit one A4 page. Engine displacement at 237mm and
belt length at 266mm of the 271mm available, and `test/runtime.mjs`
enforces that on every run.

**Measure the budget at the right width.** The print content box is A4 minus
the `@page` margins: 210 − 22 − 13 = 175mm, which is 661px at 96dpi.
Measuring at the full 210mm makes everything look comfortably shorter than
it is, because narrower content is taller content. Getting this wrong is how
a sheet measured at 267mm still came out as two pages.

One thing to tell students: use the calculator's own **Print** button, not
the browser's Cmd+P. Printing the whole Silverstripe page clips the iframe
to its on-screen height. The Print button prints the frame itself.

## Mobile and accessibility

Handled in the shared CSS, so every new calculator gets them by default:

- Input groups use `auto-fit`, so they reflow four columns to one against
  the actual iframe width rather than the device width. No breakpoints.
- Long sections are `<details>` elements, collapsible on small screens, with
  keyboard support and correct semantics for free.
- Inputs are 16px. Smaller makes iOS Safari zoom the page on focus, which
  inside an iframe is disorienting and hard to undo.
- Buttons are at least 44px tall.
- Number inputs carry `inputmode`, so phones show a numeric keypad.
- Focus rings are blue, not brand yellow. A yellow ring on a yellow button
  is invisible.
- Readouts are `aria-live`, so screen readers announce the new figure.
- Read-only fields are visibly non-interactive and skipped by tab order,
  which matters on touch where there's no hover to disambiguate.
- Field help is a real button with `aria-expanded`, not a hover tooltip, so
  it works on touch and with a keyboard.
- The title and description are hidden visually but kept in the
  accessibility tree, so the iframe still announces what it is.
- `prefers-reduced-motion` zeroes out transitions.

No `position: sticky` anywhere: because the iframe is sized to its content,
it has no scrollable viewport of its own, so sticky has nothing to stick to.

## Going beyond the spreadsheets

The spreadsheets were shaped by what a spreadsheet does comfortably. Now
that they aren't, calculators can answer the question behind the question.

**Engine displacement** also computes compression ratio, both static and
dynamic, from the figures a builder measures anyway. Compression height,
block deck height, chamber volume, dish or dome, gasket thickness, and the
intake closing point from the cam card:

| Output | Why it matters |
|---|---|
| Clearance volume | Where compression ratios go wrong: the chamber is the number people remember, the deck and gasket are the ones they forget, and together they're usually worth most of a point |
| Static CR | The figure on the box. Assumes the intake shuts at BDC, which no cam does |
| Dynamic CR | Measured from where the intake actually closes, so it tracks cylinder pressure and detonation risk. This is why a big cam softens an engine without changing the static number |
| Sensitivity | How much the ratio moves per 0.1mm of deck clearance. Usually why two people measuring one engine disagree |
| Reconciliation | Enter a published ratio and it works backwards to the chamber volume that figure implies, which shows which input is out |

### Why deck clearance is measured, not derived

The first version took block deck height and worked back:

```
deckClearance = deckHeight - (stroke/2 + rodLength + compHeight)
0.5           = 216.5      - (43 + 143 + 30)
```

That's catastrophic cancellation. A half-millimetre answer from the
difference of two ~216mm quantities, so input error is amplified about 200x.
A 0.1mm error in **any** of the four moved the ratio by 0.21:1, and 0.25mm
moved it half a point. Worse, no factory spec sheet quotes block deck
height, so that input was usually a guess.

Deck clearance is now entered directly. A small number read off a dial
indicator at TDC, and deck height is derived from it in the forward
direction, exactly, purely so the diagram can place the deck line.

The improvement is asserted in the fixtures rather than claimed: **rod
length and compression height must not change the static ratio at all**,
because neither appears in any volume. They now don't. Under the old
formulation each moved it 0.21:1 per 0.1mm.

What remains is real physics, not numerics: 0.1mm of deck clearance is
genuinely worth ~0.1:1 on an 86mm bore, which is why the sensitivity figure
is shown rather than hidden.

Gasket bore is its own input too. Gaskets are bored larger than the
cylinder, and assuming they match cost about 0.02:1 here.

The animated diagram draws from the same `crankGeometry()` the compression
maths uses, so picture and numbers cannot disagree. Its fixtures pin the two
boundary conditions that matter: at 0° the piston has travelled nothing, and
at exactly 180° it has travelled exactly one stroke, whatever the rod length.

**Engine displacement** also computes reciprocating loads, from two more
numbers a builder already knows. Rod length and intended rev limit, plus
reciprocating mass if they have it:

| Output | Why it matters |
|---|---|
| Rod ratio | Longer rods dwell the piston nearer TDC and cut peak acceleration at the same stroke |
| Mean piston speed | The figure that decides street engine versus race engine. Under ~20 m/s is production territory; race engines run to ~24 |
| Peak piston speed | Occurs before mid-stroke, not at it, because the rod swings |
| Peak acceleration at TDC | Where crank throw and rod obliquity act together. Always higher than BDC |
| Peak rod tensile force | What sizes rod bolts. Peaks on overlap when no cylinder pressure pushes back, not at peak combustion pressure |

Exact slider-crank kinematics, not the small-angle approximation. Peak
acceleration uses the closed form `r·ω²·(1 + λ)`, which was verified against
numeric differentiation of the exact velocity expression. Peak piston speed
has no tidy closed form once rod obliquity is included, so it's found by
sampling every 0.05°.

Mean piston speed carries a status colour, so the number teaches something
rather than just being a number.

**Belt length** also gives belt surface speed, a real design limit that
constrains pulley size independently of ratio. Past roughly 30 m/s most
belts lose life quickly. It was cheap to derive from inputs already present.

It also solves the inverse problem. The calculator answers "what does this
setup do"; given a target driven speed it now also answers "what setup do I
need," suggesting either a driven pulley diameter (keeping the drive pulley,
usually a fixed crank pulley) or a drive pulley diameter (keeping the driven
one, when that's the part you can't change), with a note stating the ratio
needed against the ratio you have. The parity fixtures verify it
indirectly, which is the
property that actually matters: feeding a suggested diameter back through
`beltLength()` must reproduce the target speed exactly.

The pattern to follow: an addition earns its place when it comes from inputs
the student already has, or from one more they'd know, and when it answers a
question they'd otherwise have to ask someone. Optional inputs stay optional
— leave reciprocating mass blank and the rod force is simply left out rather
than the section breaking.

## Corrections to the original spreadsheets

The maths is validated by the parity suite, so the corrections aren't
surfaced in the UI. A student doesn't need the migration history to trust
the number. This table is the record.

**Built so far**

| Calculator | Change |
|---|---|
| Displacement | `3.14159` replaced with full-precision pi. Shifts the answer around the sixth significant figure. |
| Displacement | Bore/stroke ratio added. Falls out of the same two inputs at no cost. |
| Displacement | Reciprocating loads added. See above. |
| Displacement | Zero bore and fractional cylinder counts now rejected with a message instead of returning a number. |
| Belt length | Same pi correction. |
| Belt length | The metric/imperial toggle is wired up. In the original, `H2`/`H3` were never read and `D4` was just `=C4`. |
| Belt length | "Target Output RPM" now has a purpose: the drive speed needed to reach it on the current ratio. Previously nothing referenced it. |
| Belt length | Guards added for pulleys that would overlap. The original returned `NaN` with no explanation. |
| Belt length | The twenty-row RPM table was dropped. The relationship is linear and the two speed outputs already state it. |
| Belt length | Belt surface speed added, with the limit shown as a status colour. |

**Still to do, agreed but not yet built**

| Calculator | Change |
|---|---|
| Brake | `H68` is a circular reference (`=IF(L68<E68,H68+1,...)`) used as an iterative solver. Replaced with the closed-form solution, which is exact rather than converged to ±1 kPa. |
| Brake | `H36` labels rear tyre load as kg but the formula returns N. |
| Brake | `D23` "Disc Radius" renamed. It's pad radial depth. |
| Brake | Master cylinder travel is piston-area ratio, implying 1 mm pad displacement. To be stated rather than changed. |
| ARB | Material dropdowns are wired backwards: bar material drives the arm's Young's modulus and vice versa. Invisible while both are Steel. |
| ARB | `CHOOSE` returns quoted strings that Sheets coerces to numbers. Becomes a material lookup table, so a third material is trivial. |
| CoG | Wheelbase corrected for lift angle (`WB·cos θ`). At 20.2° that's about 6% on the delta term. |
| CoG | Shows an empty state rather than a negative CoG height when the lifted corner weights aren't filled in. |
| CoG | The height formula was **not** wrong. An earlier review claimed the wheelbase needed correcting for lift angle; deriving it showed the cos terms cancel, and the "correction" would have added 2% error at 20° and 5% at 30°. |
| ARB | **Tube bore was `OD − wall` instead of `OD − 2 × wall`.** A wall sits on both sides of a bore, and section goes as the fourth power of diameter, so the missing factor of two understated the sheet's own default bar by 39.7%. 9.20 N/mm where the answer is 15.26. Largest error found in any sheet. |
| ARB | Material dropdowns were swapped: bar material drove the arm's Young's modulus and vice versa. Two fixtures now pin this shut. |
| ARB | Adjustment spacing and hole count were collected and never used. Stiffness is now reported per hole. |
| ARB | `CHOOSE` returning quoted numeric strings became a materials lookup table. |
| Spring rate | Formula was correct and is reproduced exactly. One target frequency applied to both ends became separate front and rear targets, with the resulting split reported. Ride quality depends on the split, not the absolute figure. |
| Brake | **The proportioning valve was applied two different ways.** The rear pressure cell multiplied the excess above the knee point by the slope; the bias table divided it. A valve exists to slow the rise of rear pressure, so dividing is right. With a 3:1 slope the sheet trebled rear pressure where it should third it: 2,985 kPa instead of 944. Dormant while the valve was switched off, which is how it survived. |
| Brake | "Disc Radius" was the pad's radial depth. `(OD − depth) / 2` is exactly the mean radius so the arithmetic was right, but the name invites entering a radius, which would halve the answer. Renamed, and a pad depth over half the rotor is now rejected. |
| Brake | Front pressure was solved by a circular cell incrementing itself until it converged, needing Excel's iterative calculation switched on. It has a closed form. |
| Brake | **The sheet answered the wrong question.** It took master cylinder bores as inputs and reported pressures. But calipers and rotors are the fixed part of a brake problem. The cylinders are what you choose around them. The calculator now searches every standard bore pair and recommends one, ranked on bias bar centring first so the bar has adjustment left in both directions, then pedal effort against target, then travel and stroke balance. Entered bores override it, for costing out what is already on the shelf. On the sheet's own car it recommends 5/8 inch front and 1 inch rear. The pair the sheet had fitted, arrived at independently. |
| Brake | A pedal effort target the calipers cannot reach reads as a failed cylinder choice when it is a pedal ratio problem. The calculator says which: "41.5 kg is the most these brakes will ask for; a ratio nearer 3.3:1 would reach 50." |
| Brake | The sheet stopped at required pressures. The calculator now reports the **bias bar position** those pressures need. The thing you actually adjust, and flags it when it falls outside the 35 to 65% a bar can reach, which makes a design unbuildable. |
| Spring rate | "Unsprung Weight Front (kg)" was subtracted whole from one corner, so it meant per corner; the label didn't say so and per axle is the other obvious reading. Now explicit, and a figure larger than the corner weight is rejected with that hint. |

## Assumptions text and the build number

Every calculator ends with an "Assumptions and limits" list and a build
number, both of which have to stay true as the maths changes.

- **The list describes this build, not the intent.** Engine displacement
  states plainly that compression height affects only the drawing, that the
  dish figure must include valve reliefs, and that dynamic CR is a
  comparative number rather than a cylinder pressure. All three are things
  someone would otherwise assume the opposite of.
- **One build number for the set**, in `shared/version.js`, because a change
  to the tokens or the unit layer changes every calculator. Format
  `YYYY.MM.N`, bumped by hand when any published behaviour changes. A
  formula, an input, a default, or the assumptions text.
- **It prints.** A filed sheet outlives the build that produced it, and the
  compression and belt maths have each already changed once. Someone with a
  binder sheet and a different answer on screen needs to know whether the
  calculator moved or their inputs did.
- On paper the list sets in two columns at 6.5pt, which is what keeps it
  inside the one-page budget. The runtime print check caught it going 1.8mm
  over when the list was first added.

## Deliberately absent

Things removed rather than kept "just in case", because unused code is a
liability that has to be read and maintained:

- **`shared/chart.js`** and the belt calculator's speed-relationship graph.
  The relationship is linear, so the chart only ever showed a straight line
 . The two speed outputs and the sizing note say the same thing in less
  space. The brake calculator's bias plot will need a chart, but it needs
  shaded bands and a curve, so it will be built for that job rather than
  adapted from this one.
- **`shared/print.js`**. Forced `<details>` open for print, which stopped
  being needed when working panels came out of print entirely.
- **`buildChainUrl`**. Written for calculator-to-calculator chaining that
  doesn't exist yet. `readUrlState` and `buildShareUrl` already provide the
  mechanism when CoG arrives.
- **`display`, `unitFor`, `QUANTITIES`** from units.js, and `speedRange`
  from the belt formula. Never imported anywhere.
- CSS for tables, status pills, an assumptions panel, diagram keys,
  collapsible sections, `<select>` and disabled fields: all artefacts of
  earlier iterations that nothing renders now.

Two unused things are kept on purpose, and annotated in the CSS so they
don't get stripped: `.calc--flush`, an escape hatch if Silverstripe's own
padding doubles up, and `.section__header--intermediate`, because the design
language defines three section roles and the brake calculator needs the
third.

## Rules for building the next one

These aren't style preferences. Each one is here because something broke,
and each is enforced by `node test/all.mjs` where it can be.

**Report facts, not verdicts, when the model can't see the whole system.**
LLTD said "front works harder → understeer bias" and labelled each tuning
lever "understeer" or "oversteer". The model has no tyres, dampers, aero or
corner in it, so those were predictions it couldn't support. It now says
"transfer sits rearward of the weight split" and labels levers "forward" or
"rearward", which is exactly what it computed, and leaves the verdict to
the track.

**If a graphic doesn't respond to the control beside it, it's decoration.**
The cornering plan view first showed only the entered setup's tyre loads, so
moving a slider changed nothing on the car, which is the opposite of the
point. Each tyre now carries its trial load in amber beneath the setup load,
so softening the front bar visibly moves weight off the outside front and
onto the outside rear. Space for the second line is reserved either way, so
the car doesn't reflow.

**Check that a drawn direction agrees with the drawn geometry.** The corner
arc curved left while the front wheels steered right. SVG `rotate()` is
clockwise, so with front at top a positive steer angle points right, and the
path ahead must move toward +x. Worth deriving rather than eyeballing. The
arc is also drawn *under* the body: the car sits on its own path, so the
line necessarily crosses it, and on top it read as a line over the car
rather than a road beneath it.

**Equal specificity means source order decides.** A `.readout--alert`
modifier sat 580 lines before `.readout` in the stylesheet, so the base rule
won and the box stayed green while the class was correctly applied. The
JavaScript reported `true` and the screen disagreed. Modifiers now sit
immediately after the rule they modify. The structure suite checks that a
class heads a rule of its own; it does not check that the rule can win.

**A status region nothing writes to is invisible to every check.** The brake
warnings panel existed, started hidden and was never populated for several
builds after the results section was rebuilt. It renders as nothing, which is
valid markup. The structure suite now asserts that every `role="status"`
element is written to somewhere in the script.

**Read the data that was supplied, don't retype it from memory.** The master
cylinder list was typed from convention: 13 bores capped at 1 inch, against
the 28 in the workbook running to 1-3/4 inch. The seven omissions above 1
inch were exactly the ones that could reach a heavy pedal, so the tool was
recommending compromises while hiding the sizes that would have solved the
problem. The list is now generated from the sheet.

**A hinge threshold rewards nothing inside it.** Stroke balance was scored
as zero penalty under 6mm absolute and a ramp above, so a pair 5.9mm apart
scored the same as a matched one, which is how the tool came to recommend a
pair it simultaneously warned about. It is now a continuous ratio, and
scored against the best any pair achieves rather than against 1.0: a high
front bias delivered through a balance bar forces a small front bore against
a large rear one, so nothing on the default car beats 2.10 to 1 and an
absolute target would have condemned every option equally.

**Some targets are jointly unreachable, and saying which lever moves them is
the useful answer.** Pedal effort times pedal travel is fixed by the
required torque, the pad friction and the rotor's effective radius. It
survives any change of bore or pedal ratio, because both scale the two terms
in opposite directions. So 50 kg at 35mm is not a cylinder problem. The
calculator now says so and names rotors and pads as the levers, instead of
picking a compromise and raising three warnings about it.

**Ask for what people already know.** The brake calculator asked for a
loaded tyre radius in millimetres. Two inputs instead of six looked like a
simplification, but a radius is a figure nobody has to hand. It has to be
measured or looked up, while "235/45R18" is memorised. It now takes the
sidewall form as typed, accepts the variants in circulation
(`235/45R18`, `235-45-17`, `265/35 R19`), range-checks each part so a
transposed size is rejected rather than quietly changing every torque, and
shows the derived radius beside it. Fewer inputs is not the same as less
work for the reader.

**A stray template placeholder is valid markup.** One shipped as a visible
`{DOWNFORCE_Front}` above an input: the browser renders it as text and no
existing check looked for it. The structure suite now rejects brace-wrapped
all-caps tokens surviving into markup.

**Shading the answer beats plotting it.** The brake plot went through three
versions. Bias against deceleration showed the compromise but not whether
the hardware met it. Rear-against-front pressure was correct and standard,
and made the valve's kink legible, but it asked the reader to hold the whole
mapping from pressure back to deceleration in their head.

The version that works classifies the background: red below optimal bias,
green from optimal to 7 points front of it, grey above. The asymmetry is the
substance. Front-biased is safe because the front locks first and the car
runs straight, rear-biased spins it, so the target is a band that sits
above the optimal line and never below. Three blue curves go over the top:
what the bar delivers at each end of its travel, and heaviest, what it
delivers at the setting in use. The question becomes "is the thick line in
the green?", and the range where it is is reported as a field. A
proportioning valve visibly kinks that line upward to follow the optimal,
which is what widens the range.

**Pick the axes the domain uses, then the physics is legible.** The brake
plot went through two wrong versions. Required bias against deceleration,
then that plus a reachable band. On those axes a proportioning valve only
nibbles at one edge of the band, because it bites hardest at the rear-biased
end of the bar's travel where rear pressure hits the knee soonest. Correct,
and useless.

The standard axes are rear line pressure against front: the **brake balance
diagram**. There the ideal is a curve that rises, peaks and rolls over as
the rear unloads, and the hardware is a straight line through the origin
whose slope pressure cannot change. A straight line cannot follow a bending
curve, which is why a car is balanced at exactly one deceleration, and a
valve puts a *kink* in the line so it can follow the roll-over. That is the
whole point of fitting one, and it is visible at a glance on these axes and
on no others.

**A plot should answer a question, not restate a number.** The brake
diagram first plotted required bias against deceleration. A rising line
that showed the compromise but not whether the hardware could meet it. It
now draws the band the bias bar can actually reach across its travel, over
the demand curve. Where the line is inside the band the bar can be set to
meet it; where it leaves, no adjustment will. Without a proportioning valve
the band is flat, because bias is set by cylinder and caliper areas and does
not care about pressure, so a flat band crossing a rising line is the
compromise, drawn, and fitting a valve visibly tilts the band to follow the
demand. The deceleration range where the two overlap is reported as a field:
"adjustable 0.45 to 1.30 g".

**Show the situation, not a false precision.** LLTD's diagram opens with a
plan view of the car mid-corner: front labelled, front wheels steered, the
line through the corner, the inertial force at the centre of gravity, and
each tyre's load with the outside pair drawn loaded. What it deliberately
does not do is mark the transfer split as a position along the wheelbase —
at true scale a three-point change in LLTD moves such a marker about three
units, which is invisible, and exaggerating it to be visible would
misrepresent it. The trial is marked on the transfer bar instead, where a
point and a half is legible against a 50% reference.

**The preview harness is where a calculator can get listed twice, so it is
checked.** Lateral load transfer was embedded twice with the same host id —
a leftover from the day a duplicate of the calculator itself existed. No
browser complains and no other check looked, so the structure suite now
asserts that the harness embeds every calculator exactly once, embeds all of
them, and has no duplicate ids.

**Print one address, not two.** The footer printed the page URL on both the
disclaimer line and the build line. The disclaimer needs it. It is where
the full assumptions live, so the build line is now just the build number,
and `#sheet-url` and its wiring are gone.

**A forced page break outlives the reason for it.** LLTD carried
`section--break-before` on its results, added when the sheet genuinely
needed two pages so the results would start cleanly on the second. After the
sheet came down to 254mm it was still printing as two pages, and an hour
went into measuring margins, break-inside, PDF options and viewport heights
before the decisive test: hiding the entire input section dropped the content
to 128mm and it *still* printed two pages. Nothing height-related can do
that. The rule is gone, the class with it, and all six calculators now print
to one page.

**The printed page is the reference, not the archive.** The full assumptions
list cost 20 to 35mm on every sheet. It now prints as one line. Some
assumptions and limitations apply, see the calculator at this address. With
the page itself holding the authoritative copy. Guidance addressed to
someone at a screen goes too: a note recommending which slider to reach for
is not useful on paper, and neither are the sliders.

**A printed sheet records figures, not controls.** The four sliders and
their reset are hidden on paper and replaced by one line of the rates they
were sitting at. With the redundant rear-share label dropped, the reserved
anti-jump heights released in print, three-column input and result grids,
and inputs regrouped so unsprung mass sits with mass and unsprung heights
with the other heights, the LLTD sheet came down from 377mm to 296mm.
Column counts were applied through an opt-in `groups--dense` class rather
than globally, because measured across all six calculators a global rule
made five of them taller.

**A panel you interact with must not move while you interact with it.** The
trial result started as its own card that appeared once a slider moved,
which shifted everything below it by 46px. Including the slider being
dragged. It now sits permanently in the results readout beside the figure it
is compared against, distinguished by ink and a rule rather than a card.
Three further sources of movement had to be reserved: both readout captions
get space for two lines, the trial note for four, and each slider's delta
line is always rendered, blank when unchanged. Verified at zero pixels of
shift on the document, the readout and the working panel.

**Let people try a change, don't just tabulate changes.** LLTD's static
"tuning levers" table listed five fixed adjustments and what each did. It's
now four sliders that move each spring and bar rate in catalogue steps —
half a kgf/mm, five N/mm, twenty-five lb/in. With the trial result in amber
beside the entered setup. Landing on a real part matters: an unrounded
slider proposes springs that don't exist.

Three things that make it safe to play with. The trial card stays hidden
until a slider actually moves. Editing any input retires the trial rather
than leaving a stale one on screen. And a rate at rest stays exactly as
entered, so a trial differs only in what was moved.

**Whether a control has moved is a question about its position, not its
value.** Snapping 98 N/mm to a round 10.0 kgf/mm shifts the value by 0.07
without anyone touching anything, which read as a change and left the trial
card showing at rest. Comparing slider positions. Integers. Fixed it.

**Work both directions when one alone can't be judged.** Spring rate went
target frequency → rate only, and a target of 2.0 Hz means nothing until you
know the car is at 1.6. Entering the spring fitted now reports the frequency
it gives, the gap to the target, and the rate change needed to close it. The
round-trip is asserted rather than assumed: feeding a target rate back in
must return the target frequency exactly.

**One name per quantity, or the label and the value drift apart.** Rate
labels were written as `data-unit="stiffness"` and rate conversion looked
for `data-unit="rate"`. Adding rate *inputs* to the spring calculator then
converted a value from 80 N/mm to 8.16 kgf/mm while the label beside it
still read N/mm. Both are `rate` now. The runtime check missed it twice
first: once because it only cycled the metric/imperial switch and not the
rate switch, and again because the new fields start blank and a blank field
has nothing to compare. It now fills them before testing.

**A comparative tool needs something to compare against.** An absolute LLTD
of 52% means little on its own; a move of −2.5 points from a setup you drove
last weekend means a lot. So LLTD takes an optional baseline figure and
reports the change from it, which is what turns the calculator into the
tune-test-repeat loop it is actually for. The Setup field and share link
already let a validated setup be named and kept. "Neutral, dry" at 55% and
"Neutral, wet" at 53% are two saved setups of the same car.

**What earns a place on screen**

1. **Show what someone acts on; hide what they only pass through.** Bore
   area, per-cylinder swept volume, deck and gasket volumes, the three belt
   length terms and acceleration at BDC are all real and all still
   calculated. They live in the working panel, because nobody decides
   anything from them. The visible outputs went from 16 to 10 on the engine
   and 9 to 6 on the belt calculator without losing a single figure.
2. **Don't print a number twice.** Bore-to-stroke ratio had its own field
   while the diagram caption already said "Square · bore to stroke 1.00:1".
   The field went.
3. **Order inputs the way the engine is measured**, not the way the maths
   needs them: bore and stroke, then the rotating assembly, then the
   combustion volumes, with cross-checks like the published ratio last.
4. **Order outputs by what the person came for.** Compression ratio now
   precedes piston loads, because that's the question that brings people to
   this calculator. It used to be third.
5. **No two groups share a title.** "Compression" appeared as both an input
   and an output group; the output one is "Compression ratio" now.

**Structure**

6. **Derived values go in the results section, never among the inputs.** A
   field's colour tells the student whether they can touch it, so putting an
   output in the input panel contradicts the whole colour system.
7. **A diagram belongs in `.results__side` or its own section**. Never
   loose inside `.results__main`, where it competes with the readout.
   Checked.
8. **One `.results__main` per `.results` grid, at most one
   `.results__side`.** Checked, along with block-tag balance line by line.
   A single stray `</div>` once closed the main column early, which pushed
   a diagram out of the grid where it stretched to full width and, because
   a viewBox has fixed aspect ratio, grew just as tall.
9. **Diagram SVGs carry a `max-height`.** Defensive: when a layout mistake
   does happen, it should read as slightly odd rather than broken.
10. **Grid and flex children get `min-width: 0`.** Their default of `auto`
   lets wide content push a column past its track. Set once on
   `.results > *` so no calculator has to remember.

**Numerical stability**

- **Never derive a small quantity by subtracting two large ones.** Take the
  small quantity as the input and derive the large one forward if something
  needs it. See deck clearance above: the same engine, the same physics, and
  input error stopped being amplified 200-fold.
- **Assert the invariant, don't claim the improvement.** "Rod length must
  not change the compression ratio" is checkable, and it's what proves the
  reformulation worked.

**One symbol, one quantity.** `g` was doing duty as both grams and
acceleration, and in the engine calculator the two sat in the same results
panel. Reciprocating mass in `g`, peak acceleration in `g`. Acceleration is
now capital `G` throughout, labels and prose, and lowercase `g` is grams
only. Strict physics has this backwards (capital G is the gravitational
constant) but motorsport writes "1.4 G", the audience reads it that way, and
confusion with a constant nobody enters is not a real hazard while grams
sharing a panel is. Where `g` meant 9.81 inside a formula expression it is
now written as 9.81, so no reader has to work out which sense is meant.

**Name the mechanism, not the outcome.** The ride-frequency help said a
stiffer rear makes the car "ride flat", which labels the goal in words that
sound like an explanation, and reads as backwards, since a stiffer end
sounds like it should upset a car rather than settle it. It now says what
happens: the front wheels meet the bump first, so the ends start out of
step; at equal frequencies they stay out of step and the car see-saws, each
end feeding the other; a rear 5 to 20 percent stiffer catches up in phase
and the pitching dies away within a bump or two. The mechanism went in the
help tooltip, where there is room, and the inline note was shortened to the
observation alone.

**A count needs no unit.** "Cylinders" and "Holes per arm" carried a unit of
`off`. British trade usage, opaque elsewhere. The label already names what
is counted, so the unit was removed rather than translated: `count` after
"Cylinders" is filler.

**An intermediate that restates an input earns nothing.** Rear-over-front
frequency split is the two targets above divided by each other; loaded
radius restates the tyre size just typed. Both dropped from the results,
with the loaded radius kept in the working panel because it is the only
check that a transposed aspect ratio. 45 for 55, quietly worth 24mm. Was
caught. Rod ratio stayed, renamed **Rod:Stroke**, because engine builders
quote it alongside Bore:Stroke.

**Dead code accumulates behind every replaced feature.** Sweeping after the
brake plot was rebuilt three times and the valve control twice found seven
stylesheet rules, three exported functions and three design tokens with no
remaining reference: the rear-against-front pressure diagram's band, demand
and ideal curves, the rod's original single-line style, a unit label helper,
a rate-snapping helper and a bias sweep, all superseded. About 2.2 KB.

Worth recording how it nearly went wrong. A regex written to remove a
function and its comment matched far more than intended and silently
deleted a fifth of the stylesheet and eight exports from the brake module.
The suite caught it immediately, and the files were restored from the last
packaged build rather than repaired. The rewrite removed each block by exact
text with an assertion on the byte count, which then caught a second
over-match on its first run.

**A limits list should say where the model stops being true, not how the
tool works.** The seven lists had grown to 67 items, and a third of them
documented behaviour rather than stating a limit: how master cylinder pairs
are ranked, what turns the recommendation red, what a trial slider does to
the inputs, which units a figure can be shown in. All of that belongs in
help text beside the control, and most of it already was. Cut to 50, with
the remainder shortened. Brake dropped hardest, 16 to 10.

**Reference material should not cost vertical space on every visit.** The
lists are now collapsed by default, which returns between 90 and 180 pixels
depending on the calculator. They are still hidden in print, where the
footer disclaimer already points at the page.

**The em dash is a tell.** 172 of them across the build, all in prose. Most
read better as a full stop and a new sentence, a few as a comma before a
connective. The 80 standalone em dashes that mark an empty result are a
different thing and were left alone.

**A drawing can be internally inconsistent and still look fine.** The engine
piston showed its skirt stepping inward on both sides. That step is the
relief over the pin bosses, visible only when looking ALONG the wrist pin, a
view in which the rod cannot be seen swinging. The rod was swinging. The
drawing was showing two views at once. On the thrust face, which is what a
swinging rod implies, the skirt runs the full bore width and carries the
side load.

**Size parts from the dimension that governs them.** The rod eyes were
fractions of the bore, which left the big end swallowing the crank throw on
a short-stroke engine. Journals scale with stroke, not bore: taking a Honda
K20 at 86 x 86 as the reference. 48mm rod journal, 50mm main, 21mm piston
pin. The rod journal is 0.56 of the stroke, the main a shade more, and the
pin about a quarter of the bore. Measured across five geometries the journal
now holds 0.55 to 0.56 of the crank radius, and the short-rod clamp still
pulls it in when the two eyes would otherwise meet.

**A budget written for one drawing does not survive the next.** The vertical
allowance under the crank was 12mm, set when the rod ended in a three-unit
dot. With a real big end the rod overlapped the caption at bottom dead
centre, and the viewBox containment check passed throughout, because
overlapping text is not overflowing text. The eye radius is a fixed fraction
of stroke, so it can be budgeted before the scale that would otherwise
depend on it.

**Derive a mechanism from its joints, not from its pose.** The connecting
rod is now a profile rather than a line, built entirely from the two pin
centres: a unit vector along the rod and its perpendicular give the beam
corners, waisted between two bosses. It follows length and angle without
being told either. Every width is a fraction of the CURRENT centre distance
rather than a fixed number of units. With a short rod near mid-stroke a
fixed width puts the bosses inside each other and the outline crosses
itself. Verified valid and inside the viewBox across five bore/stroke/rod
extremes and six crank angles, because the diagram animates and every frame
redraws.

**A variant that needs overrides is a new component.** The proportioning
valve switch was built as a `.unit-switch` variant, and the compact
overrides were inserted by matching `.unit-switch__label {`, which also
matched inside `:checked + .unit-switch__label` and `:focus-visible +
.unit-switch__label`, breaking both compound selectors and duplicating the
block three times. Every unit switch in the build lost its segmented styling
and its checked state, on all seven calculators, and the suite did not care
because a class that heads a rule still heads a rule. The valve is now its
own `.toggle`: a checkbox whose state is carried by colour and knob
position, sharing nothing.

**Disable, don't hide, when a control is conditional.** The proportioning
valve moved into the targets group as an on/off switch with its knee point
and slope beside it, disabled until the switch is thrown. Hiding them would
have reflowed the page on every toggle; disabled they hold their place, and
the toggle measures at zero pixels of shift. `disabled` rather than a grey
class also keeps them out of the tab order and tells a screen reader they
are inactive, and the styling hangs off `:disabled` so the two cannot drift
apart.

**A chart should take the shape of the box it is given.** The brake plot was
a fixed portrait viewBox. In the side column that is right; stacked below
the results on a tablet the box is 786px wide and the drawing rendered 444px
of it, marooned, with labels no bigger than at desktop. It now picks a wide
viewBox when the box is wide, and uses 98% of it. The screen layout the
calculator ended up with was not the one planned either: removing two groups
left eight, which auto-fit puts in two rows of four with every front/rear
pair adjacent. Better than the three columns intended, and 46mm shorter in
print.

**Order inputs by the question being asked, and put comparable things side
by side.** The brake inputs ran car, tyres, brakes, calipers, pedal, valve —
which mixed what the car is with what is being asked of it, and separated
the front and rear halves of each pair. They now run car, then targets, then
the hydraulics that set the pedal, then the hardware in front/rear pairs, so
each pair sits in the same row and can be considered together. Design
deceleration moved from Car to Targets: it is what you are asking of the
car, not a property of it. The reorder alone took 17mm off the printed
sheet, because balanced groups waste less of each row.

**Group a value with the one that modifies it.** LLTD's inputs had all four
motion ratios in a group of their own, separated from the rates they apply
to, which invites pairing a spring rate with a bar motion ratio, and left a
lone fifth group on a second row. Each rate now sits with its own ratio.

**Units**

- **A unit control belongs to the quantity, not the calculator.** Spring and
  bar rates are bought in N/mm, kgf/mm and lb/in, two of which are metric —
  so the choice cannot follow a metric/imperial switch. Both rate
  calculators have their own three-way control, independent of the length
  and mass switch, and it drives every rate on the page together: readout,
  component rates, sensitivities and tables.
- **N/mm is the reference, not the answer.** It's what the physics is in and
  what every formula module returns, and it's also the unit nobody orders
  parts in. So whichever unit is selected, the other two appear underneath
  the figure. Converting in your head is the step that puts the wrong spring
  in the car, and these calculators drive purchasing.
- **Rate-unit logic lives in `units.js`**, not in each calculator:
  `RATE_UNITS` and `otherRateUnits()`. Two calculators needed it, which is
  the point at which it stops being local.
- **Never list which fields convert on a unit switch.** The list approach
  failed exactly as you'd expect: `['bore', 'stroke', 'rodLength']` was
  right when written, then compression height, deck height and gasket
  thickness were added and nobody remembered the array. Those three kept
  their millimetre values and were then read as inches, so a 30mm
  compression height became 762mm and static compression ratio collapsed
  from 10.51:1 to 1.02:1. `convertEditableFields()` discovers fields from
  the `data-unit` label already beside them, so a new field converts the
  moment it's labelled.
- **Every displayed unit follows the switch, including inside diagrams.**
  The cylinder caption still read "499.5 cc" in imperial after the fix
  above, because that one string was hardcoded.
- **Ratios must read identically in both systems.** They're dimensionless,
  so if a ratio moves when units change, a field didn't convert. Checked at
  runtime.
- **A field's number must match the unit printed beside it.** Ratios alone
  aren't enough: they're scale-invariant, so scaling every corner weight by
  the same wrong factor leaves them untouched. That is precisely how the
  CoG corner weights came to be converted as grams. 413 kg displayed as
  15 lb. With every suite green. The runtime check now reads each field's
  unit label before and after a switch and confirms the value moved by the
  factor those two units imply.
- **A declared quantity must name the unit pair, not just the dimension.**
  `mass` meant grams/ounces for a piston and kilograms/pounds for a corner
  weight. There are now two quantities, `mass` and `massSmall`.

**Tokens**

6. **No inline styles, ever.** Checked. If the tokens don't cover it, add a
   token. That's what makes the print layout work with no per-calculator
   effort.
7. **Every `var(--…)` must be defined in `tokens.css`, every class must
   *head a rule of its own* in `calculator.css`.** Both checked, including
   classes built in template literals. The own-rule part matters: a class
   surviving only inside a descendant selector like
   `.working[open] .section__chevron` has no styles at all, and a naive
   "is it mentioned anywhere" check misses it, which is exactly how the
   working panel's chevron came to render as nothing.
8. **Single-class selectors only.** No descendant or element-type selectors,
   so everything sits at one specificity level and nothing silently
   overrides anything else. It's why there is no `!important` in the
   codebase.

**A third: SVG presentation attributes lose to CSS**

`fill="none"` on an element whose class sets a fill does nothing. The
cylinder bore was filled solid grey all the way down over the crank circle
while the markup plainly said otherwise. Presentation attributes sit *below*
author CSS in the cascade; they're defaults, not overrides. Use a dedicated
class (`.diagram__outline`) instead. Checked.

**Two browser behaviours that CSS cannot work around**

These both shipped as silent bugs. Neither produced an error, and both
looked correct in the code.

- **`hidden` loses to any class that sets `display`.** An author stylesheet
  beats the User Agent stylesheet's `[hidden] { display: none }` at equal
  specificity, regardless of source order, so `.groups { display: grid }`
  quietly cancelled `element.hidden = true`, and the pulley sizing panel
  stayed on screen at 256px tall with the attribute correctly set. Fixed
  once, universally, with `[hidden] { display: none !important; }`. The one
  deliberate `!important` in this codebase. It restores a guarantee rather
  than patching over a specificity mistake, and every future
  `display`-setting class inherits the fix. Checked.
- **A closed `<details>` reserves no layout space for its content.** Not
  even with `display: block !important` on the child. Only the `open`
  attribute expands it. This mattered while working panels printed; they no
  longer do, so the workaround was deleted rather than left in. Worth knowing
  before anyone tries to force collapsed content visible with CSS again.

**Interaction**

9. **No floating popovers or `position: sticky`.** The iframe is sized to
   its content and has no scroll of its own, so anything absolutely
   positioned adds nothing to document height and gets clipped at the frame
   edge. Expand inline instead and let the resize observer grow the frame.
10. **Field help is a `button` with `data-help`, never a `span` and never a
    native `title`.** Checked. Spans ignore `width`/`height`, so the glyph
    escapes its circle; `title` tooltips don't exist on touch at all.
11. **No `localStorage` or `sessionStorage`.** Checked. Unit choice is
    per-calculator by design.

**Wiring**

12. **`reportHeight()` and `readUrlState()` must both be called.** Checked,
    with comments stripped first. Forgetting `reportHeight()` breaks the
    embed *silently*: it looks correct standalone and clips in the iframe.
13. **No duplicate ids; every id, form field and `label for` referenced must
    resolve.** Checked.
14. **Every calculator needs a `.sheet` print header and a Setup field.**
    Checked. A printout that can't identify itself is useless in a binder.
15. **Number inputs set `inputmode`; readouts are `aria-live`; diagrams and
    diagrams carry `role="img"` and `aria-labelledby`.** Checked.

**Maths**

16. **`formula.js` stays pure**. No DOM, no imports, no unit awareness. It
    is what the app will import, and what the tests exercise.
17. **Write the fixtures before the JavaScript**, from the spreadsheet,
    including every awkward case.
18. **Cross-check a diagram against the answer only where the relationship
    is real.** The belt path shares its tangent angle with the length
    formula, so `pathLength` must equal `length`. Asserted. The cylinder
    section is a scaled rectangle that nothing depends on, so it has no
    cross-check. Don't manufacture one.
19. **If a diagram can't be drawn truthfully without another input, leave it
    out.** Cylinder count was removed for this reason: eight circles in a
    row read as a straight-eight, and getting it right meant asking for the
    bank configuration for no analytical gain.

**Additions**

20. **An addition earns its place** when it comes from inputs the student
    already has, or one more they'd know, and answers something they'd
    otherwise have to ask someone. Optional inputs stay optional. Leave
    reciprocating mass blank and rod force drops out rather than the section
    breaking.

When something breaks that these rules don't cover, add a rule and a check.
That's what keeps this a record of real failures rather than a wishlist.

## Adding a calculator

1. Copy an existing folder under `calculators/`.
2. Rewrite `formula.js`. One exported function plus an `explain()` for the
   working panel. Canonical units, no DOM.
3. Update the fields in `index.html` and the `render()` that maps results
   onto output elements.
4. Replace `cases.json` with values from the original sheet. A calculator
   can carry more than one fixture file. Anything matching `cases*.json` is
   picked up, which is how engine displacement keeps its spreadsheet-derived
   fixtures separate from the reciprocating-load ones that are new work.
5. `node test/all.mjs`
6. Commit, push, embed.

**Do the fixtures first.** Before writing any JavaScript, pull ten or so
input/output pairs out of the spreadsheet, including every awkward case:
zero, the minimum, the maximum, wherever a tier boundary changes. Then
translate the formula and run the tests.

This matters more than it sounds. These sheets have accumulated years of
undocumented behaviour, and the fixtures are what tell you whether you
reproduced the sheet or merely reproduced what you assumed it did.

Don't add colours or sizes to a calculator's own file, and don't use inline
styles. If the tokens don't cover something, add a token. That's how the
design language stays consistent as the set grows, and it's what makes the
print layout work without per-calculator effort.

Each new calculator needs a `.sheet` block copied and retitled, and a
`Setup` field in the tools row. Both are markup only; the styling and the
date/units wiring are shared.

## Build order

The sheets form a dependency chain, and CoG feeds both of the big ones:

```
CoG height ──────────┬──────────► Brake system
                     └──────────► LLTD
Spring stiffness ───────────────► LLTD  (spring K, motion ratio)
ARB stiffness ──────────────────► LLTD  (ARB K)
Engine displacement, belt length  standalone
```

1. **Engine displacement, belt length**. Done.
2. **CoG height**. Done. Passed all structure and runtime checks first
   time, which is the shared foundation earning its keep.
3. **Anti-roll bar**, **spring rate from ride frequency**. Done.
4. **Brake system**. Done. All seven now print to a single A4 page. Spring
   rate passed every suite on its first run, which is the first calculator
   to do so. The linter caught two faults on first run: a
   class removed during the dead-code sweep that was needed again, and
   `stroke-width` as a presentation attribute where the class wins.
3. **ARB stiffness** and **spring stiffness from ride frequency**.
4. **LLTD**.
5. **Brake system**. By far the biggest, and by then the shared pieces are
   settled.

The shared vehicle vocabulary for chaining will be introduced at step 2,
where it first earns its place. It'll be based on the named ranges already
in the LLTD sheet (`Fr_NSM`, `Roll_Mom._Arm`, `Total_AR_K`) rather than
invented from scratch.
