# GTE Edge — 2026 site

Built from the Figma file **GTE Brand 2026**, frame `Large screen` (node `216:11765`).

No build step, no dependencies to install. Open `index.html`, or serve the folder:

```bash
ruby -run -e httpd . -p 8777
```

```
index.html
css/
  styles.css        design tokens + every section
  brand-font.css    opt-in @font-face for the licensed headline face
js/
  app.js            scramble reveals, ticker, charts, keyboard, accordion, forms
  edge-object.js    the WebGL object that follows the page
  waitlist-wave.js  the undulating render behind the sign-up
assets/img, assets/svg   exported from Figma
assets/video             the hero intro
```

## Design tokens

Every colour, size and radius in `:root` is lifted straight from the Figma
variables, under the same names:

| Figma | CSS |
| --- | --- |
| `new-orange-2026` | `--orange` `#ff5e11` |
| `secondary` / `tertiary` | `--secondary` `--tertiary` |
| `colour/carbon/700–900` | `--carbon-700` … `--carbon-900` |
| `colour/paper/100–200` | `--paper-100` `--paper-200` |
| `colour/alloy/500`, `concrete/400`, `asphalt/600` | `--alloy` `--concrete` `--asphalt` |
| `card-elevated-1/2` | `--elev-1` `--elev-2` |
| `text/t-03 … t-12` | the `.h3/.h4/.h6/.h7/.b1/.b2/.m1/.m2` classes |

Type is the Figma stack: **APK Protocol** headlines, **Inter** body,
**JetBrains Mono** labels. APK Protocol is licensed and not included — the site
falls back to Figtree, the closest free geometric grotesk. To use the real face,
drop `APKProtocol-SemiBold.woff2` and `APKProtocol-Medium.woff2` into
`assets/fonts/` and uncomment the `brand-font.css` link in `index.html`.

## The object that follows you down the page — retired

The floating WebGL form has been removed from the page. `js/edge-object.js`
and `three.js` are no longer loaded and there is no `#edge-gl` canvas; the
EDGE rows use the flat glyphs instead (below). The file is still on disk and
the notes below still describe it, because the morph was a lot of work and is
worth recovering if it ever comes back.

`js/edge-object.js` renders a **lamella**: a cusped superellipse sheet combed
into parallel ribs, each rib then spun about its own axis by an amount that
falls off from the middle of the array outward. That spread across the array is
what reads as the spiral. The geometry, the rib sweep and the hand-built HDR
environment are ported from the Lamella study (`edgie.html`, "sparkle" preset) —
every highlight on the metal is a light placed in `paintEnv()`, not a tint.

Two things about it that are easy to get wrong:

- **Rib spin belongs near the top of its range, not in the middle.** At full
  spin the centre rib winds 355 deg — a near-full turn, so it comes back to
  looking flat — while the outermost ribs hold at 90. The ribs in between pass
  through every orientation on the way out, and that is what bands the form. A
  mid-range value instead turns the tall centre ribs side-on and collapses the
  silhouette into a flat lens.
- **A sheet turned far enough goes edge-on.** It now makes a full turn — roughly
  one revolution every 35s — which only works because of the standing tilt on X.
  Without that tilt it would present a pure edge twice per revolution and vanish;
  tilted, the edge-on moment reads as the fan folding rather than as a line.

It is not parented to any one section. It reads every `[data-edge-anchor]` in the
document, weights them by how close each sits to the middle of the viewport, and
eases toward that blend, so scrolling carries it from section to section rather
than cutting between fixed positions. Add a station anywhere with an empty div:

```html
<div data-edge-anchor="whatever" data-edge-scale="1.1"></div>
```

**Ambient motion.** Alongside the rotation the ribs breathe — each one stretches
and shortens along its own axis, pivoting on its own midpoint, on a wave that
travels across the array. Rotation, breathing and sway share one rate: slow
the turn without slowing the ribs and the two drift out of step. That has to happen on the GPU: rebuilding the geometry
per frame is out of the question, and after the spin every rib points somewhere
different, so "along the rib" is not a global axis. The build therefore writes
two extra attributes per vertex, `aAxis` and `aMid`, and the vertex shader scales
each vertex's offset along its own rib. One consequence worth remembering: the
geometry is centred by hand rather than with `geometry.center()`, because that
would move the positions and leave `aMid` behind, and the shader pivots on those.


### Morphing into the section glyphs

Scrolling the *built on you* section turns the form into the three glyphs beside
RESEARCH, MEMORY and RECURSIVE LEARNING, and lets it back out again.

It works because of what those glyphs are. Each is nothing but vertical bars on a
nine-column grid (`assets/svg/viz-*.svg` — 13, 14 and 18 bars), and a lamella is
already a row of straight ribs. So the change is a per-rib move rather than a
re-mesh: each rib keeps its own cross-section and is re-hung as a bar, x across
the page and the sheet's normal into the screen. Nothing is rebuilt per frame —
the whole effect is four extra vertex attributes and a `mix()`.

A bar is wider than a rib, so four or five ribs share one and stand side by side
across its stroke; that is what gives the bars their fluted look. The glyph is
scaled to span the width the lamella spans, so the form does not jump size as it
changes.

Two things this has to get right:

- **Normals follow the inverse of the same scaling.** A rib laid down as a bar is
  stretched along its own axis and squeezed across it. Reusing the original
  normals would leave the chrome reflecting a shape that is no longer there, so
  the shader rebuilds the normal in the rib's own basis and divides each
  component by that axis's scale.
- **The turn has to stop.** A glyph is flat, and a form that kept rotating would
  swing edge-on and vanish. `drift` is scaled by `1 - morph` and the three
  rotations ease to a near face-on pose as the change completes.

Which glyph shows follows the three rows — each is tagged `data-edge-morph` and
pulls its own icon by how near it sits to the reading line, on a kernel tight
enough (`exp(-d^2 / 0.028)`) that each gets a clean moment instead of a permanent
three-way blend. How far the change has run follows the section's own anchor, so
the form is fully itself everywhere else on the page.

That section's anchor is a **sticky** box inside a rail that spans the section,
parked so the form's centre lands on the reading line; it holds there while all
three rows scroll past it. Two earlier versions are worth recording, because
both looked fine until they weren't:

- A fixed box in the middle of the section had scrolled away before the third
  row reached the reading line, so the last glyph never finished forming.
- Spanning it across the three rows fixed that — until the rows were spaced
  further apart, at which point the form travelled far enough across the
  viewport to clip against the top and bottom edges at the first and last row.

Sticky is the only version where every glyph gets its full turn on screen, and
it is also the version that matches the reference: the object holds beside the
copy rather than sliding past it.

The section's own flat SVG glyphs are gone — the form is the illustration now —
and the row copy runs at `.h5`. H5 is not drawn anywhere in the Figma file;
40px is the step the rest of the scale (64 / 52 / _ / 32 / 24) asks for. The
gaps between the rows are deliberately generous: the scroll distance between
them is what the morph runs on, and at the old spacing the glyphs never held
long enough to read.

The anchor box sets the position and on-screen size (fitted on the silhouette's
bounding box, not the bounding sphere — the sheet is thin in Z and the sphere
would leave it undersized); `data-edge-scale` nudges it. The pointer turns the
form and shifts it, with a slow chase so the turn reads as weight; scroll
velocity feeds the sway. Rib count, segments and cross-section step down on
narrow screens, and `prefers-reduced-motion` stops the easing and the GPU sway.


## The flat glyphs

The three `viz-*.svg` glyphs are inlined into the EDGE rows as `<svg>` rather
than `<img>`, one `<path>` per bar, because the bars are animated individually.
Stroke colour and width are set in CSS, not on the paths.

Each bar scales about its own middle. The scale is not a one-shot transition —
it reads a `--lit` custom property that `app.js` writes on every row on scroll,
1 when the row sits on the reading line and 0 a third of a viewport away, so
the glyph opens and closes continuously as you move rather than snapping once.
Each bar's start is offset by its index (`--i`), which makes the glyph wipe
open rather than inflate. The same measurement picks the single lit row, so the
copy and the glyph never disagree about which row you are reading.

Under `prefers-reduced-motion` the bars sit open.

## Page order

Rebuilt from the 2026-09 Figma page (`839:2399`):

1. **Hero** — full screen, the reveal video behind it. "Find your edge", the
   two-line sub, and the signup with the live count beside it. The market
   ticker is the bar flush with the bottom of the screen.
2. **EDGE** — laid on a 12-column grid: the heading takes the left 8, the three
   rows take the right 8 and sit flush to the content edge. Each row is a glyph
   beside 480px of copy, per `839:5628`. The introduction heads this section
   rather than standing on
   its own: `INTRODUCING ⚡ EDGE` / "Trading intelligence built on your own
   book.", then the three rows (contextual research, ontological memory,
   recursive learning) that the 3D form morphs through.
3. **"Map the market directly to your position."** — a centred title that
   leads into the pinned section.
4. **AI features** — pinned, three tabs, now with the crude-catalyst copy and
   the real newswire headlines in place of the lorem ipsum.
5. **Features** — the quote plus five cards. Card 01 holds the lamella tile.
   The design fills it with a video; Figma video fills do not export through the
   MCP bridge, so the exported frame stands in and the markup carries the
   `<video>` to drop in when the file lands.
6. **Waitlist**, **FAQ**, **Footer**.

The terminal showcase and the capabilities row are gone; they are not in the
current design. Their CSS is still in `styles.css`, unused.

The three EDGE rows light one at a time — whichever is at the reading line,
which is the same row the form is showing the glyph for, so both read off one
measurement. The design annotates exactly this ("only one is highlighted at a
time… always the one that is in the middle of the screen").

**The row copy is set at `.h5`, 40px.** That was chosen when these paragraphs
were about 110 characters; the current copy is nearer 300, and the Figma sets
it at 18px. 40px still lays out without breaking, but it is six lines of
display type per row — worth a second look.


## The tile video

Card 01 plays `assets/video/edge-window.webm` — the lamella film from the design,
720x520, the card's exact size. It is the card's whole background, with the
number and copy riding on top of it behind a scrim: the ribbons sweep bright
through the left of frame, and the words sit exactly there.

**It was transcoded in the browser, not on disk.** The supplied MP4 was 10.4MB
for eight seconds (about 10Mbps for a 720x520 loop) and there is no encoder on
this machine — no ffmpeg, no HandBrake CLI. Chrome has one: seek the source
frame by frame, build a `VideoFrame` from each, write them into a
`MediaStreamTrackGenerator`, and let `MediaRecorder` mux VP9. That gives
1.33MB — 87% off — at 720x520 and 7.94s against the source's 8.00s.

One thing that has to be right: **MediaRecorder timestamps frames by when they
arrive, not by the timestamp on the VideoFrame.** Writing as fast as the seeks
allow packed the whole clip into 2.4s, so it played 3.3x too fast. The writes
are paced against `performance.now()` instead, which lands within 3ms over six
seconds.

The same trick can emit `video/mp4;codecs=avc1`, and it does produce a 1.7MB
file that `avmediainfo` reads happily — but Chrome will not play it
(`MEDIA_ERR_SRC_NOT_SUPPORTED`), because MediaRecorder's fragmented MP4 is not
a complete file. So the tile ships WebM only. Anything that cannot play VP9 —
older Safari, older iOS — keeps the still, which is the right fallback for a
decorative background anyway.

The file is not fetched until the card is near the viewport, and it pauses on
the way out. The still also covers the first moments of playback, because the
film opens on black.

## Waitlist

600px tall. A black section with a single bloom rising past the bottom edge,
scaled 1.75x so the arc flattens across the frame and reads as a horizon
rather than a bulb —
centred count,
"Join waitlist", and the email field. The bright part of the bloom is a band
rather than the centre — the core reads darker, the way a limb-lit sphere does —
so the gradient stops peak around three quarters of the radius.

This replaced the fluted-chrome panel, which means `js/waitlist-wave.js` and the
6.3MB `assets/img/waitlist-bg.png` are no longer loaded. Both are still on disk.

## Small screens

Following the 393px Figma frame (`839:6714`):

- The hero reads top-down — headline under the nav, signup at the foot of the
  screen — instead of everything piled on the bottom edge, and the two sentences
  of the sub run together rather than breaking.
- The flat `viz-*.svg` glyphs come back in the EDGE rows below 1100px. They are
  hidden on desktop because the 3D form is doing that job; below 1100px the form
  is not rendered at all, so the row would otherwise open with nothing.

## Hero

The hero is one full viewport (`min-height: 100svh`). `assets/video/silhouette-reveal.mp4`
covers it edge to edge with `object-fit: cover`, and the copy, the signup form and
the stats bar all ride the bottom of the screen: the bar sits flush with the
bottom edge and the copy block clears it by 60px. The terminal shot and the
market ticker that used to sit inside the hero are now their own `.showcase`
section directly below, so the first screen is just the film and the invitation.

### Format

The source is H.264 in MP4 (5.0s, 1280x720, 650KB) and it stays that way. H.264
plays in every browser that matters and is better supported on iOS than VP9 in
WebM, so converting would trade support and a generation of re-encoding for no
size win. If you do want a WebM, encode it offline and add it as the *first*
`<source>` — the markup already takes a list:

    ffmpeg -i silhouette-reveal.mp4 -c:v libvpx-vp9 -crf 32 -b:v 0 -an silhouette-reveal.webm

The file still carries the AAC track it was exported with, about 120KB of the
650KB, which nothing ever plays. `-an` on any re-encode drops it.

### Timing

The video plays once on load and then simply stops, holding its last frame —
which is the hero composition. Nothing pauses it explicitly; a `<video>` that is
not looping sits on its final frame when it ends.

The hero copy, the form and the stats bar are held back until `ended` fires, so
the reveal is not competing with type appearing over it. Everything below the
fold reveals on scroll as normal.

Three escapes mean nobody waits in front of a blank hero:

- Any scroll releases the copy immediately; the video carries on underneath.
- A 6.5s cap covers a video that stalls without ever firing `ended`.
- If `play()` rejects — a tab opened in the background, an autoplay policy — the
  video is hidden and the still (`hero-plate.jpg`) takes over.

That last one is worth keeping as-is. An earlier version guessed at failure with
a 1.6s timeout and fired on perfectly good playback that was merely slow to
start; `play()` returns a promise that says definitively whether playback began,
so there is no need to guess. And the fallback has to *hide* the video, not just
reveal the still underneath — otherwise its black first frame covers it.

The still carries no `src` in the markup: `heroIntro()` fills it in from
`data-src` at the moment it is needed, so its 212KB never loads on the path where
the video works. `hero-plate.png`, the 1.9MB lossless original it was made from,
is left in `assets/img/` unreferenced.

Under `prefers-reduced-motion` the video is parked on its last frame and never
plays.

## Scramble reveal

Every headline decodes instead of fading in. Mark one with `data-scramble` and
the reveal observer runs `scramble()` on it.

It rewrites only text nodes, walking the element with a `TreeWalker`, so the
coloured spans and `<br>`s inside a headline survive untouched — and the original
`innerHTML` is put back verbatim once the last character lands, leaving no
wrapper elements behind.

Two details are what make it feel solid rather than janky:

- **Every character gets its own box, locked to the width of the character it
  will settle on.** Measured in one read pass, written in one write pass. Without
  it, swapping a `W` for an `I` reflows the line and the headline jitters and
  re-wraps while it decodes.
- **All characters churn from the first frame**; only the moment they *settle* is
  staggered. Staggering the start instead leaves most of the line blank for most
  of the animation, which reads as broken rather than as decoding.
- **Each character keeps its own flicker rate and phase** (22-48ms, randomised).
  On one shared tick the whole line swaps in lockstep and reads as a pulse; out
  of step they read as individual characters churning.

There is no fade and no slide on a decoding headline — `.reveal[data-scramble]`
drops the transition, so the line lands as noise at full strength and resolves in
place. The flicker *is* the entrance. Swapping glyphs every frame would be strobe
rather than noise, which is what the per-character rate avoids.

While a heading is churning it carries an `aria-label` with the real text, so
assistive tech never reads the gibberish. Under `prefers-reduced-motion` the
headline simply appears.

## The AI features panel

Built from **Scroll section - AI features** (node `357:16833`), which is three
variants of one 1728x1020 frame. On the page they are three states of a single
full-screen panel rather than three sections.

The track is three viewports tall and the panel is `position: sticky` for all of
it, so scroll position *inside* the track is the tab index — the first tab
collapses as the second expands, and so on. Clicking a collapsed tab scrolls the
page to that tab's slice rather than setting state directly, which keeps scroll
as the single source of truth and means the back/forward buttons and a mid-panel
page reload all land somewhere coherent.

The accordion animates `flex-grow` (0 to 1), which is a plain number and so
interpolates cleanly — `grid-template-rows` would not, because `80px` and `1fr`
have no defined interpolation between them. One catch worth keeping: a collapsed
tab's body is taken out of flow (`position: absolute`), because while it was in
flow the hidden body still sized the row and the collapsed tabs would not sit at
their 80px.

All three states share one candle series, and each overlay is derived from that
same data rather than exported from Figma — so the envelope, the frequency
ribbon and the trader pins always sit on the price:

| State | Overlay | How |
| --- | --- | --- |
| 01 | News cards + elbow connectors | DOM cards, connectors measured from their boxes down to the price line |
| 02 | Volume envelope + trade frequency | rolling mean ±1.7σ over the series; `#2890FF` at 1.5px, fill at 10%; frequency line `#CFE1EF` |
| 03 | Trader pins + position callout | absolutely placed at the design's percentages |

The panel sticks at `--navh` rather than 0 so the fixed nav never covers the
first row. Under 1100px the accordion moves above the chart and the panel keeps
pinning; the news cards clamp to three lines so they stay clear of the price
line at phone width.

## Things worth knowing

- **Video fills don't export through the MCP bridge.** The hero plays the supplied
  film directly; the capabilities object, which is also a video in Figma, is a
  real-time WebGL form rather than a playback.
- **Charts are drawn, not pictures.** The Figma candlesticks are thousands of vector
  rectangles; `js/app.js` generates them on canvas from a seeded RNG, so they are
  crisp at any size, animate in, and render identically every load.
- The keyboard, the news→chart connectors, and both market tickers are generated in
  `app.js` — edit the data at the top of each module rather than the markup.
- `prefers-reduced-motion` is respected throughout: reveals, marquees, the streaks,
  the count-up and the accordion all go static, and the 3D object stops easing.

## Waitlist — the retired panel

The fluted-chrome panel described here was replaced by the bloom section above.
It is kept because the live-count contract still applies, and because the wave
is worth recovering if the panel ever comes back.

Built from node `216:15611`. A light panel: the render fills it and the headline
and form sit top-left over it, exactly as in the design (712px measure at 88px,
artwork hung at 0,-146 at 2375px square).

The headline measure is set in `em`, not px, so the line break stays where the
design put it at every width — in px the type shrinks with the viewport while the
measure does not, and the words re-flow.

One trap worth recording: `.waitlist` needs an explicit `width: 100%`. With
`aspect-ratio` and a `min-height` and no stated width, the box derives its
**width from the raised height** — at phone size that came out 981px wide and
pushed the page sideways.

### The wave

The render behind the sign-up undulates. `js/waitlist-wave.js` draws it through
a displacement shader rather than transforming the picture: sampling coordinates
are pushed sideways by a wave running down the image and up and down by a slower
one running across it, so the ribs bend while the frame stays put. Two lengths
per axis, deliberately not harmonics, so the pattern takes a long time to repeat.

Amplitude (`uAmp`, in UV) and rate have to be tuned together, and the rate is the
one that decides whether anything reads as movement. Judging amplitude by
comparing two stills is misleading: 0.0017 looked like a sensible displacement
frozen, but spread over a ~20s cycle it travelled about a pixel a second and was
invisible in motion. It sits at 0.0038/0.0024 over a ~8s cycle, which is a few
pixels a second — noticeable if you watch it, not distracting if you do not.

Two things that cost time and are easy to hit again:

- **Feed the GPU a decoded canvas, not the `<img>`.** Handing
  `new THREE.Texture(img)` the element produced `GL_INVALID_VALUE` on
  `texSubImage2D` and a blank texture — the section still looked right only
  because the still underneath was showing through. It copies into a 2048px
  offscreen canvas and uses a `CanvasTexture`.
- **The canvas never renders more pixels than the texture has.** Left at a 1.75
  device-pixel ratio this was a 13MP surface redrawn every frame for no extra
  detail.

It renders only while the section is on screen, holds 120fps alongside the
lamella's own context, and leaves the still `<img>` underneath as the fallback
for no-WebGL and `prefers-reduced-motion`.

### The live count

`WAITLIST` at the top of `app.js` drives the number:

```js
var WAITLIST = {
  endpoint: null,   // e.g. "https://waitlist.gte.xyz/api/waitlist-count"
  field: "count",   // dotted paths are fine: "data.total"
  every: 30000,
  fallback: 227024
};
```

Set `endpoint` and the headline tracks it: it polls on `every`, rolls the digits
whenever the number moves, pauses while the tab is hidden, re-checks on focus,
and keeps the last good value if a request fails. Nothing else needs changing.

**It ships as `null` because there is nothing to point it at yet.**
`waitlist.gte.xyz` exposes only per-user routes — `/api/signup`,
`/api/pre-signup`, `/api/me`, `/api/referral`, `/api/social/*`, `/api/username`,
`/api/boost`, `/api/tier-evolution`, `/api/card-image` — and no public total;
`/api/stats`, `/api/count` and `/api/waitlist/count` all 404. Two things are
needed server-side:

1. A public route returning the total, e.g. `{"count": 227024}`. Cache it —
   every visitor hits it.
2. `Access-Control-Allow-Origin` for whatever domain this site runs on, or the
   browser blocks the read cross-origin.

Until then the headline shows `fallback`, which is the number from the design.

## Footer

The ASCII driver (`assets/img/ascii-portrait.webp`) is a full standing figure and
much taller than it is wide (579x1425), so it is sized by **height** and centred
in the left panel rather than cropped into a fixed-width box — a 370px box would
have chopped the legs off. The band is 820px tall rather than the design's 659:
at 659 the figure came out 268px wide and the glyphs mushed into each other.

## A note on caching

Local CSS and JS carry a `?v=` query in `index.html`. Bump it when you change
those files — without it a browser will happily keep serving the old copy, which
cost me a while chasing a wave that was already fixed.

## Not wired up

The waitlist forms validate and give feedback but post nowhere — point the submit
handler in `app.js` at the real endpoint. Footer and nav links are `#` placeholders,
and the FAQ copy is the design's placeholder text.
