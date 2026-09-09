import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { NEUTRAL, type Adjustments } from "../src/lib/adjustments";
import { parseInstruction, splitClauses } from "../src/lib/parse";

const parse = (text: string, base: Adjustments = NEUTRAL) => parseInstruction(text, base);

describe("single instructions", () => {
  it("brightens and darkens", () => {
    assert.ok(parse("make it brighter").adjustments.brightness > 0);
    assert.ok(parse("darker please").adjustments.brightness < 0);
  });

  it("reads warmth in both directions", () => {
    assert.ok(parse("warmer").adjustments.warmth > 0);
    assert.ok(parse("make it cooler").adjustments.warmth < 0);
  });

  it("handles British and American spellings alike", () => {
    assert.equal(
      parse("more colour").adjustments.saturation,
      parse("more color").adjustments.saturation,
    );
    assert.equal(parse("greyscale").adjustments.grayscale, 100);
    assert.equal(parse("grayscale").adjustments.grayscale, 100);
  });

  // "black and white" contains a clause separator, so it has to survive the
  // split intact -- otherwise it arrives as "black" plus "white" and neither
  // half means anything.
  it("treats black and white as an absolute, not a nudge", () => {
    for (const phrase of ["black and white", "black & white", "black n white", "b&w", "monochrome"]) {
      assert.equal(parse(phrase).adjustments.grayscale, 100, phrase);
      assert.equal(parse(phrase).unknown.length, 0, `${phrase} reported unknowns`);
    }
  });

  it("keeps black and white working alongside other instructions", () => {
    const result = parse("make it black and white and add more contrast");
    assert.equal(result.adjustments.grayscale, 100);
    assert.ok(result.adjustments.contrast > 0);
    assert.equal(result.unknown.length, 0, `unexpected unknowns: ${result.unknown}`);
  });
});

describe("intensity words", () => {
  it("scales down for hedged phrasing", () => {
    const slight = parse("slightly brighter").adjustments.brightness;
    const plain = parse("brighter").adjustments.brightness;
    assert.ok(slight < plain, `${slight} should be less than ${plain}`);
    assert.ok(slight > 0);
  });

  it("scales up for emphatic phrasing", () => {
    const plain = parse("brighter").adjustments.brightness;
    const lots = parse("much brighter").adjustments.brightness;
    const loads = parse("way brighter").adjustments.brightness;
    assert.ok(lots > plain, "much > plain");
    assert.ok(loads > lots, "way > much");
  });

  it("ranks a bit < plain < very < super", () => {
    const values = ["a bit warmer", "warmer", "very warmer", "super warmer"].map(
      (text) => parse(text).adjustments.warmth,
    );
    for (let i = 1; i < values.length; i += 1) {
      assert.ok(values[i] > values[i - 1], `${values[i]} should exceed ${values[i - 1]}`);
    }
  });
});

describe("direction and removal", () => {
  it("reverses the effect after a negating word", () => {
    assert.ok(parse("less contrast").adjustments.contrast < 0);
    assert.ok(parse("reduce the brightness").adjustments.brightness < 0);
    assert.ok(parse("tone down the saturation").adjustments.saturation < 0);
  });

  it("clears an effect when asked to remove it", () => {
    const withGrain = parse("add grain").adjustments;
    assert.ok(withGrain.grain > 0);
    assert.equal(parse("remove the grain", withGrain).adjustments.grain, 0);
  });

  it("does not let a negation flip an unrelated effect", () => {
    const result = parse("less contrast").adjustments;
    assert.equal(result.brightness, 0);
    assert.equal(result.saturation, 0);
  });
});

describe("multiple instructions in one sentence", () => {
  it("splits on commas and 'and'", () => {
    assert.deepEqual(splitClauses("brighter, warmer and sharper"), ["brighter", "warmer", "sharper"]);
  });

  it("applies every clause", () => {
    const result = parse("make it brighter, a bit warmer and add a vignette");
    assert.ok(result.adjustments.brightness > 0, "brightness");
    assert.ok(result.adjustments.warmth > 0, "warmth");
    assert.ok(result.adjustments.vignette > 0, "vignette");
    assert.equal(result.unknown.length, 0, `unexpected unknowns: ${result.unknown}`);
  });

  it("accumulates when told the same thing twice", () => {
    const once = parse("brighter");
    const twice = parse("brighter", once.adjustments);
    assert.ok(twice.adjustments.brightness > once.adjustments.brightness);
  });
});

describe("presets", () => {
  it("applies a whole look at once", () => {
    const vintage = parse("make it vintage").adjustments;
    assert.ok(vintage.sepia > 0 && vintage.grain > 0 && vintage.fade > 0);
  });

  it("noir is black and white with punch", () => {
    const noir = parse("noir").adjustments;
    assert.equal(noir.grayscale, 100);
    assert.ok(noir.contrast > 0);
  });
});

describe("geometry", () => {
  it("rotates in both directions and wraps", () => {
    assert.equal(parse("rotate right").adjustments.rotate, 90);
    assert.equal(parse("rotate left").adjustments.rotate, 270);
    const twice = parse("rotate right", parse("rotate right").adjustments);
    assert.equal(twice.adjustments.rotate, 180);
  });

  it("flips, and flipping twice returns to the start", () => {
    const once = parse("flip horizontally").adjustments;
    assert.equal(once.flipHorizontal, true);
    assert.equal(parse("flip horizontally", once).adjustments.flipHorizontal, false);
  });

  it("does not confuse a vertical flip for a horizontal one", () => {
    const result = parse("flip vertically").adjustments;
    assert.equal(result.flipVertical, true);
    assert.equal(result.flipHorizontal, false);
  });
});

describe("honesty about what it understood", () => {
  it("names every change it made", () => {
    const result = parse("brighter and warmer");
    assert.equal(result.applied.length, 2);
  });

  it("reports words it did not understand rather than ignoring them", () => {
    const result = parse("make it brighter and add a unicorn");
    assert.ok(result.adjustments.brightness > 0, "the half it understood still applied");
    assert.ok(
      result.unknown.some((phrase) => phrase.includes("unicorn")),
      `expected the unicorn to be reported, got ${JSON.stringify(result.unknown)}`,
    );
  });

  it("does not report ordinary filler as misunderstood", () => {
    assert.equal(parse("make it brighter").unknown.length, 0);
    assert.equal(parse("please make the photo warmer").unknown.length, 0);
  });

  it("resets everything on request", () => {
    const edited = parse("vintage and much brighter").adjustments;
    const reset = parse("start over", edited);
    assert.equal(reset.reset, true);
    assert.deepEqual(reset.adjustments, NEUTRAL);
  });
});

describe("robustness", () => {
  it("survives empty and nonsense input without throwing", () => {
    for (const text of ["", "   ", "!!!", "asdfghjkl", "?????"]) {
      const result = parse(text);
      assert.ok(result.adjustments, `failed on ${JSON.stringify(text)}`);
    }
  });

  it("never produces a value outside the slider range", () => {
    let state = NEUTRAL;
    for (let i = 0; i < 25; i += 1) state = parse("way way brighter and super saturated", state).adjustments;
    assert.ok(state.brightness <= 100, `brightness ${state.brightness}`);
    assert.ok(state.saturation <= 100, `saturation ${state.saturation}`);

    let dark = NEUTRAL;
    for (let i = 0; i < 25; i += 1) dark = parse("much darker", dark).adjustments;
    assert.ok(dark.brightness >= -100, `brightness ${dark.brightness}`);
  });

  it("is not confused by a word appearing inside another word", () => {
    // "warm" inside "swarm" must not trigger a warmth change.
    assert.equal(parse("swarm").adjustments.warmth, 0);
  });
});
