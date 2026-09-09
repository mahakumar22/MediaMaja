# MediaMaja

Drop in a photo, describe the change in plain English, and the picture updates.

**Everything runs in your browser.** The photo is never uploaded, there is no
server, no account and no API key. It works offline once the page has loaded.

```
"make it brighter and a bit warmer"
"black and white with more contrast"
"vintage look"
"slightly softer, add a vignette"
"rotate right"
```

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
| Whole looks | vintage, dramatic, cinematic, noir, dreamy, summer |
| Geometry | rotate left, rotate right, upside down, flip horizontally |

Three kinds of word change how far it goes:

- **Gentler** — "slightly", "a bit", "a touch", "subtle"
- **Harder** — "much", "very", "really", then "way", "super", "extremely"
- **The other way** — "less", "reduce", "tone down", or "remove the grain"

Instructions stack, so typing "brighter" twice is brighter than typing it once,
and "reset" or "start over" returns to the original.

### It tells you what it understood

After each instruction the app names every change it made, and lists anything it
could not interpret rather than quietly ignoring it. "make it brighter and add a
unicorn" brightens the photo and says plainly that the unicorn was not
understood. Sliders under **Fine-tune by hand** show the same values as numbers,
so a misread instruction can be corrected directly.

This is the whole design idea: the words are a fast way to reach a set of
adjustments you can always see and change, never a black box.

## How it fits together

```
src/
  lib/
    adjustments.ts   The full set of edits, as one flat object of numbers
    parse.ts         English -> changes to that object
    render.ts        That object -> pixels on a canvas
  components/
    Editor.tsx       Upload, instruction bar, preview, sliders, download
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

## Tests

```bash
npm test
```

26 assertions covering the parser: intensity words ranking correctly, negation,
removal, clause splitting, presets, geometry, accumulation, clamping to the
slider range, and that unrecognised words are reported rather than dropped.

The renderer needs a canvas, so it is checked separately by driving a real
browser and measuring the output — that brightness genuinely raises the average
pixel value, black and white genuinely equalises the channels, warmth genuinely
pushes red above blue, and rotation genuinely swaps the canvas dimensions:

```bash
npm install --no-save playwright && npx playwright install chromium
npm run build && npm start          # in another terminal
node tests/browser-check.mjs
```

## Limits

- Photos only. Video is a different pipeline and is not built yet.
- Adjustments only. It cannot add, remove or repaint objects — "remove the car"
  or "put me on a beach" needs a generative image model, which this app
  deliberately does not use, since that means an API key and a bill per edit.
- Very large photos (above roughly 6000px) will feel slow on the pixel passes,
  since the work happens on your own machine.
