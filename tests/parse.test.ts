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

  it("reports wording it could not place rather than ignoring it", () => {
    const result = parse("make it brighter and zoosh the flibbertigibbet");
    assert.ok(result.adjustments.brightness > 0, "the half it understood still applied");
    assert.ok(
      result.unknown.some((phrase) => phrase.includes("flibbertigibbet")),
      `expected the nonsense to be reported, got ${JSON.stringify(result.unknown)}`,
    );
  });

  // "add a unicorn" is not bad wording, it is a thing this app cannot do, and
  // the two deserve different answers.
  it("calls an impossible request impossible, not unrecognised", () => {
    const result = parse("make it brighter and add a unicorn");
    assert.ok(result.adjustments.brightness > 0);
    assert.ok(result.unsupported.some((item) => item.includes("adding")));
    assert.equal(result.unknown.length, 0);
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

describe("sentences and paragraphs", () => {
  it("reads a polite full sentence", () => {
    const result = parse("Could you please make this a little warmer?");
    assert.ok(result.adjustments.warmth > 0);
    assert.equal(result.unknown.length, 0, `unexpected unknowns: ${result.unknown}`);
  });

  it("picks up several ideas from one paragraph", () => {
    const result = parse(
      "This is a photo of my grandmother from the 1970s. I would like it to feel " +
        "warm and nostalgic, like an old family photograph. Please make it a little softer.",
    );
    assert.ok(result.adjustments.warmth > 0, "warmth");
    assert.ok(result.adjustments.sepia > 0, "vintage look applied");
    assert.ok(result.adjustments.blur > 0, "softer");
  });

  // Prose carries context that is not an instruction. Flagging it as
  // misunderstood makes the app look broken when it worked fine.
  it("stays silent about sentences that are context, not requests", () => {
    const result = parse(
      "This is a photo of my grandmother from the 1970s. Make it warmer.",
    );
    assert.equal(
      result.unknown.length,
      0,
      `context should not be reported as unknown, got ${JSON.stringify(result.unknown)}`,
    );
  });

  it("handles several sentences with different intensities", () => {
    const result = parse("Make it much brighter. Add a little grain. Slightly cooler.");
    assert.ok(result.adjustments.brightness > 20, "much brighter is a big step");
    assert.ok(result.adjustments.grain > 0 && result.adjustments.grain < 25, "a little grain is small");
    assert.ok(result.adjustments.warmth < 0, "cooler");
  });

  it("reads more than one effect from a single clause", () => {
    const result = parse("I want it bright vivid and sharp");
    assert.ok(result.adjustments.brightness > 0, "brightness");
    assert.ok(result.adjustments.saturation > 0, "saturation");
    assert.ok(result.adjustments.sharpen > 0, "sharpen");
  });

  it("does not repeat itself when a paragraph says the same thing twice", () => {
    const result = parse("Make it warmer. Really warm please. Warmer still.");
    assert.equal(new Set(result.applied).size, result.applied.length, "applied has duplicates");
  });

  it("understands mood words as whole looks", () => {
    assert.ok(parse("make it moody").adjustments.contrast > 0);
    assert.ok(parse("bright and airy please").adjustments.brightness > 0);
    assert.ok(parse("I want a golden hour feel").adjustments.warmth > 0);
    assert.ok(parse("give it a professional look").adjustments.sharpen > 0);
  });
});

describe("requests it cannot do", () => {
  // "Not understood" implies a wording problem the user could fix by
  // rephrasing. These are things the app genuinely cannot do, and saying so
  // is the difference between a helpful answer and a wild goose chase.
  it("separates impossible requests from unrecognised wording", () => {
    const result = parse("make it brighter and remove the person on the left");
    assert.ok(result.adjustments.brightness > 0, "the possible half still applied");
    assert.ok(
      result.unsupported.some((item) => item.includes("removing")),
      `expected an unsupported note, got ${JSON.stringify(result.unsupported)}`,
    );
    assert.equal(result.unknown.length, 0, "it should not also be called unknown");
  });

  it("recognises the usual generative asks", () => {
    for (const text of [
      "change the background to a beach",
      "make it look like an oil painting",
      "crop it to a square",
      "add some text at the top",
      "fix her skin",
    ]) {
      assert.ok(parse(text).unsupported.length > 0, `expected unsupported for: ${text}`);
    }
  });

  // "remove the grain" is an adjustment, not a generative edit.
  it("still treats removing an effect as an ordinary adjustment", () => {
    const grainy = parse("add lots of grain").adjustments;
    const result = parse("remove the grain", grainy);
    assert.equal(result.adjustments.grain, 0);
    assert.equal(result.unsupported.length, 0, "should not be called impossible");
  });
});
