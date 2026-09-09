# MediaMaja

Load photos, describe the change in plain English, and the pictures update.

**Everything runs in your browser.** The photo is never uploaded, there is no
server, no account and no API key. It works offline once the page has loaded.

```
"make it brighter and a bit warmer"
"black and white with more contrast"
"vintage look"
"moody and cinematic"
"rotate right"
```

It reads whole sentences and paragraphs too, not just commands:

> This is a photo of my grandmother from the 1970s. I would like it to feel warm
> and nostalgic, like an old family photograph. Please make it a little softer.

…applies a vintage look, adds warmth and softens it — and says so.

## Working on several photos

Load as many as you like, at once or a few at a time. Thumbnails run along the
top: click one to work on it, press its **×** to remove it, press **+** to add
more. Each photo keeps its own adjustments and its own undo history, so moving
between them never disturbs the others. **Download** saves the one you are on;
with more than one loaded there is also **Download all**.

## Running it

```bash
npm install
npm run dev
```

Then open <http://localhost:3000>. On Windows PowerShell use `npm.cmd` instead
of `npm`.

## What it understands

| Kind | Examples |
| --- | --- |
| Light | brighter, darker, more contrast, flat |
| Colour | warmer, cooler, more vivid, muted, black and white, sepia, hue |
| Texture | softer, blur, sharper, grain, fade, vignette |
| Whole looks | vintage, dramatic, cinematic, noir, dreamy, summer, airy, professional |
| Just make it good | "make it look nice", "improve this", "enhance it", "fix the lighting" |
| Geometry | rotate left, rotate right, upside down, flip horizontally |

Words are matched wherever they appear, so "could you make this a little
warmer?" works as well as "warmer". Three kinds of word change how far it goes:

- **Gentler** — "slightly", "a bit", "a touch", "subtle"
- **Harder** — "much", "very", "really", then "way", "super", "extremely"
- **The other way** — "less", "reduce", "tone down", or "remove the grain"

Instructions stack, so typing "brighter" twice is brighter than typing it once,
and "reset" or "start over" returns to the original.

### It tells you what it understood

After each instruction the app names every change it made. It also keeps three
different outcomes apart, because they need different answers from you:

- **Understood** — what it changed, in plain words.
- **Can't do that** — a real request that needs a kind of editing this app does
  not do, like "remove the person on the left". Rephrasing will not help, and
  saying so beats sending you round in circles.
- **Not sure** — wording it could not place. Try different words, or the sliders.

A vague request is a real request: "make it look nice" applies a modest
all-round lift rather than being turned away. It never outranks something the
app cannot do, though — "fix her skin" says it cannot retouch people rather
than quietly applying a general improvement instead.

Prose that is context rather than instruction — "this is a photo of my
grandmother" — is passed over in silence, so describing your photo does not
produce a wall of complaints.

Sliders under **Fine-tune by hand** show the same values as numbers, so a
misread instruction can be corrected directly. This is the whole design idea:
the words are a fast way to reach a set of adjustments you can always see and
change, never a black box.

## How it fits together

```
src/
  lib/
    adjustments.ts   The full set of edits, as one flat object of numbers
    parse.ts         English -> changes to that object
    render.ts        That object -> pixels on a canvas
  components/
    Editor.tsx       Photo tray, instruction box, preview, sliders, download
tests/
  parse.test.ts      The parser, in detail
  browser-check.mjs  Optional end-to-end check in a real browser
```

`parse.ts` and `render.ts` never refer to each other. The adjustments object is
the only thing between them, which is what makes the parser testable without a
browser and the renderer replaceable without touching the language handling.

Rendering happens in two passes: the browser's own filter pipeline for
brightness, contrast, saturation, blur, sepia, grayscale and hue, then a pixel
pass for warmth, fade, vignette and grain, which CSS has no equivalent for.
Sharpening is a final 3×3 convolution so it acts on the finished image.

### Why the preview is not full resolution

The pixel passes cost time in proportion to the number of pixels, and dragging a
slider asks for dozens of renders a second. At full resolution a 6-megapixel
photo takes around 700ms per render, so a drag buries the browser and the slider
appears to do nothing at all.

So the preview renders at no more than `PREVIEW_MAX_EDGE` (1400px on the long
edge) and renders on an animation frame, cancelling any frame still pending — a
burst of slider events collapses into one render. **The file you download is
always rendered at full resolution.** Blur scales with the preview so it does not
look stronger on screen than in the saved file; sharpening, being a fixed 3×3
kernel, is very slightly softer in the preview than in the export.

## Tests

```bash
npm test
```

42 assertions covering the parser: intensity words ranking correctly, negation,
removal, clause splitting, presets, geometry, accumulation, clamping to the
slider range, multi-sentence paragraphs, several effects in one clause, context
sentences staying silent, vague requests like "make it look nice" being
honoured, and impossible requests being told apart from unrecognised wording.

The renderer and the photo tray need a browser, so they are checked separately
by driving a real one and measuring the output: that brightness genuinely raises
the average pixel value, that each photo keeps its own edits when you switch
between them, that removing one leaves the right photo behind (checked by
filename, since an average pixel value cannot tell two pictures apart), and that
dragging a slider on a photo-sized image stays responsive:

```bash
npm install --no-save playwright && npx playwright install chromium
npm run build && npm start          # in another terminal
node tests/browser-check.mjs
```

## Limits

- Photos only. Video is a different pipeline and is not built yet.
- It reads the ideas it knows anywhere in your text. It is not a general
  language model, so an unusual way of putting something may not land — the
  reply tells you when that happens.
- Adjustments only. It cannot add, remove or repaint objects — "remove the car"
  or "put me on a beach" needs a generative image model, which this app
  deliberately does not use, since that means an API key and a bill per edit.
- Saving a very large photo takes a moment, since the download is rendered at
  full resolution on your own machine. The preview stays quick regardless.
