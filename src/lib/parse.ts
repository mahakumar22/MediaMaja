import {
  clamp,
  NEUTRAL,
  type Adjustments,
  type NumericKey,
} from "./adjustments";

/**
 * Turns plain English into changes to an Adjustments object.
 *
 * The aim is not to understand any sentence, it is to be honest about what it
 * did understand. Every clause either produces a change the user can see named
 * back to them, or lands in `unknown` so nothing is silently ignored.
 */

export type ParseResult = {
  adjustments: Adjustments;
  /** Human-readable descriptions of what was applied, in order. */
  applied: string[];
  /** Clauses that matched no known effect. */
  unknown: string[];
  /** True if the instruction asked to start over. */
  reset: boolean;
};

type Effect = {
  key: NumericKey;
  /** How far one plain, unmodified mention moves the value. */
  step: number;
  /** Which way the word itself points before any "less"/"more" is applied. */
  sign: 1 | -1;
  /** Absolute effects (black and white) are set outright, not nudged. */
  absolute?: boolean;
  label: string;
};

// Longer phrases must be tested before shorter ones they contain, so the list
// is ordered deliberately and matched in sequence.
const EFFECTS: { phrases: string[]; effect: Effect }[] = [
  {
    phrases: ["black and white", "black & white", "b&w", "bw", "greyscale", "grayscale", "monochrome", "mono"],
    effect: { key: "grayscale", step: 100, sign: 1, absolute: true, label: "black & white" },
  },
  {
    phrases: ["sepia", "old photo", "antique", "aged"],
    effect: { key: "sepia", step: 55, sign: 1, label: "sepia" },
  },
  {
    phrases: ["brighter", "brighten", "brightness", "lighter", "lighten", "light it up", "bright"],
    effect: { key: "brightness", step: 18, sign: 1, label: "brightness" },
  },
  {
    phrases: ["darker", "darken", "dimmer", "dim", "dark"],
    effect: { key: "brightness", step: 18, sign: -1, label: "brightness" },
  },
  {
    phrases: ["more contrast", "contrastier", "punchier", "punchy", "contrast"],
    effect: { key: "contrast", step: 20, sign: 1, label: "contrast" },
  },
  {
    phrases: ["flatter", "flat"],
    effect: { key: "contrast", step: 20, sign: -1, label: "contrast" },
  },
  {
    phrases: ["saturation", "more colour", "more color", "colourful", "colorful", "vibrant", "vivid", "saturated", "pop"],
    effect: { key: "saturation", step: 22, sign: 1, label: "saturation" },
  },
  {
    phrases: ["desaturate", "desaturated", "washed out", "muted", "duller", "dull", "less colour", "less color"],
    effect: { key: "saturation", step: 22, sign: -1, label: "saturation" },
  },
  {
    phrases: ["warmer", "warmth", "warm", "golden", "sunny", "cosy", "cozy", "orange"],
    effect: { key: "warmth", step: 22, sign: 1, label: "warmth" },
  },
  {
    phrases: ["cooler", "colder", "cold", "cool", "icy", "bluer", "blue"],
    effect: { key: "warmth", step: 22, sign: -1, label: "warmth" },
  },
  {
    phrases: ["blurry", "blurrier", "blur", "soften", "softer", "soft", "dreamy", "out of focus"],
    effect: { key: "blur", step: 3, sign: 1, label: "blur" },
  },
  {
    phrases: ["sharpen", "sharper", "crisper", "crisp", "sharp", "clearer"],
    effect: { key: "sharpen", step: 30, sign: 1, label: "sharpening" },
  },
  {
    phrases: ["vignette", "dark edges", "darken the edges", "darken edges"],
    effect: { key: "vignette", step: 35, sign: 1, label: "vignette" },
  },
  {
    phrases: ["grainy", "grain", "noisy", "noise", "film grain"],
    effect: { key: "grain", step: 30, sign: 1, label: "grain" },
  },
  {
    phrases: ["faded", "fade", "matte", "milky", "hazy"],
    effect: { key: "fade", step: 30, sign: 1, label: "fade" },
  },
  {
    phrases: ["hue", "shift the colours", "shift the colors"],
    effect: { key: "hue", step: 30, sign: 1, label: "hue shift" },
  },
];

/** Whole looks, applied as one named recipe rather than a single slider. */
const PRESETS: { phrases: string[]; name: string; values: Partial<Record<NumericKey, number>> }[] = [
  {
    phrases: ["vintage", "retro", "old school", "nostalgic"],
    name: "vintage",
    values: { sepia: 40, fade: 25, grain: 20, contrast: -8, saturation: -15, vignette: 25 },
  },
  {
    phrases: ["dramatic", "moody", "broody"],
    name: "dramatic",
    values: { contrast: 35, saturation: -10, vignette: 40, brightness: -10 },
  },
  {
    phrases: ["cinematic", "film look", "movie look"],
    name: "cinematic",
    values: { contrast: 22, warmth: -12, vignette: 30, fade: 18 },
  },
  {
    phrases: ["noir", "film noir"],
    name: "noir",
    values: { grayscale: 100, contrast: 38, vignette: 35 },
  },
  {
    phrases: ["dreamy", "ethereal", "soft focus"],
    name: "dreamy",
    values: { blur: 2, fade: 22, brightness: 8, saturation: -8 },
  },
  {
    phrases: ["summer", "sunny day", "holiday"],
    name: "summer",
    values: { warmth: 30, saturation: 20, brightness: 10, contrast: 8 },
  },
];

/** Words that scale how far a single mention moves the value. */
const INTENSIFIERS: { phrases: string[]; factor: number }[] = [
  { phrases: ["just a touch", "a tiny bit", "a touch", "a tiny", "slightly", "a little bit", "a little", "a bit", "barely", "subtle", "subtly"], factor: 0.45 },
  { phrases: ["way too", "way", "super", "extremely", "massively", "hugely", "loads", "tons", "max", "maximum"], factor: 2.2 },
  { phrases: ["much", "very", "really", "a lot", "lots", "heavily", "strong", "strongly"], factor: 1.6 },
];

/** Words that reverse whichever way the effect word points. */
const NEGATORS = [
  "less", "reduce", "reduced", "decrease", "lower", "tone down", "take down",
  "remove", "no ", "not so", "not too", "without", "drop the", "kill the", "get rid of",
];

/** Words asking for the effect to be taken away entirely. */
const REMOVERS = ["remove", "without", "get rid of", "kill the", "drop the", "no "];

const RESET_PHRASES = ["reset", "start over", "start again", "undo everything", "original", "clear everything", "revert"];

const ROTATIONS: { phrases: string[]; degrees: number; label: string }[] = [
  { phrases: ["rotate left", "rotate anticlockwise", "rotate counterclockwise", "turn left"], degrees: 270, label: "rotate left" },
  { phrases: ["rotate right", "rotate clockwise", "turn right"], degrees: 90, label: "rotate right" },
  { phrases: ["upside down", "rotate 180", "turn it around"], degrees: 180, label: "rotate 180°" },
];

const FLIPS: { phrases: string[]; axis: "flipHorizontal" | "flipVertical"; label: string }[] = [
  { phrases: ["flip vertically", "flip vertical", "mirror vertically", "flip upside"], axis: "flipVertical", label: "flip vertically" },
  { phrases: ["flip horizontally", "flip horizontal", "mirror horizontally", "mirror it", "mirror", "flip"], axis: "flipHorizontal", label: "flip horizontally" },
];

/**
 * Phrases that contain one of the clause separators, rewritten before the split
 * so they survive it. Without this, "black and white" is torn into "black" and
 * "white" and neither half means anything.
 */
const PRE_SPLIT_ALIASES: [RegExp, string][] = [
  [/\bblack\s*(?:and|&|n)\s*white\b/gi, " grayscale "],
  [/\bwear\s*and\s*tear\b/gi, " grain "],
];

function canonicalise(text: string): string {
  return PRE_SPLIT_ALIASES.reduce(
    (out, [pattern, replacement]) => out.replace(pattern, replacement),
    text,
  );
}

function normalise(text: string): string {
  return ` ${text.toLowerCase().replace(/[^\p{L}\p{N}&\s]/gu, " ").replace(/\s+/g, " ").trim()} `;
}

/** Splits an instruction into clauses on commas, "and", "then", "also", "plus". */
export function splitClauses(text: string): string[] {
  return canonicalise(text)
    .toLowerCase()
    .split(/[,;.]|\band\b|\bthen\b|\balso\b|\bplus\b|\bwith\b/g)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function containsPhrase(haystack: string, phrase: string): boolean {
  // Phrases are matched on word boundaries so "warm" does not fire inside "swarm".
  return haystack.includes(phrase.endsWith(" ") ? phrase : ` ${phrase} `);
}

function intensityOf(clause: string): number {
  for (const { phrases, factor } of INTENSIFIERS) {
    if (phrases.some((phrase) => containsPhrase(clause, phrase))) return factor;
  }
  return 1;
}

function isNegated(clause: string): boolean {
  return NEGATORS.some((word) => containsPhrase(clause, word.trim()));
}

function isRemoval(clause: string): boolean {
  return REMOVERS.some((word) => containsPhrase(clause, word.trim()));
}

/**
 * Applies one instruction on top of the current adjustments. Instructions are
 * cumulative: "brighter" twice is brighter than "brighter" once, which is what
 * people expect when they keep typing at a picture.
 */
export function parseInstruction(text: string, base: Adjustments = NEUTRAL): ParseResult {
  const next: Adjustments = { ...base };
  const applied: string[] = [];
  const unknown: string[] = [];

  if (!text.trim()) return { adjustments: next, applied, unknown, reset: false };

  const whole = normalise(canonicalise(text));
  if (RESET_PHRASES.some((phrase) => containsPhrase(whole, phrase))) {
    return { adjustments: { ...NEUTRAL }, applied: ["back to the original"], unknown, reset: true };
  }

  for (const rawClause of splitClauses(text)) {
    const clause = normalise(rawClause);
    let matched = false;

    for (const { phrases, degrees, label } of ROTATIONS) {
      if (phrases.some((phrase) => containsPhrase(clause, phrase))) {
        next.rotate = (next.rotate + degrees) % 360;
        applied.push(label);
        matched = true;
        break;
      }
    }
    if (matched) continue;

    for (const { phrases, axis, label } of FLIPS) {
      if (phrases.some((phrase) => containsPhrase(clause, phrase))) {
        next[axis] = !next[axis];
        applied.push(label);
        matched = true;
        break;
      }
    }
    if (matched) continue;

    for (const { phrases, name, values } of PRESETS) {
      if (phrases.some((phrase) => containsPhrase(clause, phrase))) {
        const scale = intensityOf(clause);
        for (const [key, value] of Object.entries(values) as [NumericKey, number][]) {
          next[key] = clamp(key, value * scale);
        }
        applied.push(`${name} look`);
        matched = true;
        break;
      }
    }
    if (matched) continue;

    for (const { phrases, effect } of EFFECTS) {
      if (!phrases.some((phrase) => containsPhrase(clause, phrase))) continue;

      const removing = isRemoval(clause);
      const direction = isNegated(clause) ? -effect.sign : effect.sign;
      const scale = intensityOf(clause);

      if (removing) {
        next[effect.key] = clamp(effect.key, NEUTRAL[effect.key]);
        applied.push(`${effect.label} removed`);
      } else if (effect.absolute) {
        next[effect.key] = clamp(effect.key, direction > 0 ? effect.step : NEUTRAL[effect.key]);
        applied.push(direction > 0 ? effect.label : `${effect.label} removed`);
      } else {
        const delta = effect.step * direction * scale;
        next[effect.key] = clamp(effect.key, next[effect.key] + delta);
        applied.push(`${effect.label} ${delta > 0 ? "up" : "down"}`);
      }

      matched = true;
      break;
    }

    // Filler on its own ("make it", "please") is not a failure to understand.
    if (!matched && !isFiller(clause)) unknown.push(rawClause.trim());
  }

  return { adjustments: next, applied, unknown, reset: false };
}

const FILLER = [
  "make it", "make this", "make the photo", "make the picture", "can you",
  "i want", "please", "the photo", "the picture", "this", "it", "a", "the",
];

function isFiller(clause: string): boolean {
  const trimmed = clause.trim();
  return trimmed.length === 0 || FILLER.includes(trimmed);
}

/** Every phrase the parser knows, for the "things you can type" hints. */
export function knownPhrases(): string[] {
  return [
    ...PRESETS.map((preset) => preset.phrases[0]),
    ...EFFECTS.map((entry) => entry.phrases[0]),
    ...ROTATIONS.map((entry) => entry.phrases[0]),
    "flip horizontally",
  ];
}
