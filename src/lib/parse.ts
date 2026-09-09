import { clamp, NEUTRAL, type Adjustments, type NumericKey } from "./adjustments";

/**
 * Turns English into changes to an Adjustments object.
 *
 * It is built to read the way people actually write: a single command
 * ("brighter"), a sentence ("could you make this a bit warmer"), or a whole
 * paragraph describing a mood. It scans for the ideas it knows anywhere in the
 * text rather than demanding a particular phrasing.
 *
 * The aim is not to understand everything -- it is to be honest about what it
 * did. Three outcomes are kept apart, because they need different answers:
 *   applied     -- changes it made, named back in plain words
 *   unsupported -- real requests it recognises but cannot do (remove an object)
 *   unknown     -- wording it could not place at all
 * Prose that is context rather than instruction ("this is a photo of my
 * grandmother") is none of those, and is passed over in silence.
 */

export type ParseResult = {
  adjustments: Adjustments;
  applied: string[];
  unsupported: string[];
  unknown: string[];
  reset: boolean;
};

type Effect = {
  key: NumericKey;
  step: number;
  sign: 1 | -1;
  absolute?: boolean;
  label: string;
};

/**
 * Matched longest-phrase-first, so "more contrast" wins over "contrast" and
 * "black and white film" over "film".
 */
const EFFECTS: { phrases: string[]; effect: Effect }[] = [
  {
    phrases: ["greyscale", "grayscale", "monochrome", "mono", "b&w", "bw", "no colour", "no color", "colourless", "colorless"],
    effect: { key: "grayscale", step: 100, sign: 1, absolute: true, label: "black & white" },
  },
  {
    phrases: ["sepia", "old photo", "old photograph", "antique", "aged", "brownish", "brown tone"],
    effect: { key: "sepia", step: 55, sign: 1, label: "sepia" },
  },
  {
    phrases: ["brighter", "brighten", "brightness", "lighter", "lighten", "light it up", "less dark", "not so dark", "too dark", "underexposed", "bright"],
    effect: { key: "brightness", step: 18, sign: 1, label: "brightness" },
  },
  {
    phrases: ["darker", "darken", "dimmer", "less bright", "not so bright", "too bright", "overexposed", "blown out", "dim", "dark"],
    effect: { key: "brightness", step: 18, sign: -1, label: "brightness" },
  },
  {
    phrases: ["more contrast", "contrastier", "punchier", "punchy", "contrast", "bolder", "striking", "stronger blacks", "deeper blacks"],
    effect: { key: "contrast", step: 20, sign: 1, label: "contrast" },
  },
  {
    phrases: ["less contrast", "flatter", "flat", "softer contrast"],
    effect: { key: "contrast", step: 20, sign: -1, label: "contrast" },
  },
  {
    phrases: ["more colour", "more color", "colourful", "colorful", "saturation", "vibrant", "vivid", "saturated", "richer", "rich colours", "rich colors", "pop", "punch", "colours", "colors", "colour", "color"],
    effect: { key: "saturation", step: 22, sign: 1, label: "saturation" },
  },
  {
    phrases: ["desaturate", "desaturated", "washed out", "muted", "duller", "dull", "less colour", "less color", "pale", "pastel", "subdued"],
    effect: { key: "saturation", step: 22, sign: -1, label: "saturation" },
  },
  {
    phrases: ["golden hour", "warmer", "warmth", "golden", "sunny", "sunset", "sunrise", "cosy", "cozy", "orange tint", "yellow tint", "warm"],
    effect: { key: "warmth", step: 22, sign: 1, label: "warmth" },
  },
  {
    phrases: ["cooler", "colder", "wintry", "icy", "bluer", "blue tint", "cold", "cool"],
    effect: { key: "warmth", step: 22, sign: -1, label: "warmth" },
  },
  {
    phrases: ["out of focus", "blurry", "blurrier", "blur", "soften", "softer", "soft", "hazier"],
    effect: { key: "blur", step: 3, sign: 1, label: "blur" },
  },
  {
    phrases: ["sharpen", "sharper", "crisper", "crisp", "sharp", "clearer", "more detail", "detailed"],
    effect: { key: "sharpen", step: 30, sign: 1, label: "sharpening" },
  },
  {
    phrases: ["darken the edges", "darken edges", "dark edges", "vignette"],
    effect: { key: "vignette", step: 35, sign: 1, label: "vignette" },
  },
  {
    phrases: ["film grain", "grainy", "grain", "noisy", "noise", "gritty", "textured"],
    effect: { key: "grain", step: 30, sign: 1, label: "grain" },
  },
  {
    phrases: ["faded", "fade", "matte", "milky", "hazy", "dreamy haze", "lifted blacks"],
    effect: { key: "fade", step: 30, sign: 1, label: "fade" },
  },
  {
    phrases: ["shift the colours", "shift the colors", "hue"],
    effect: { key: "hue", step: 30, sign: 1, label: "hue shift" },
  },
];

/**
 * Whole looks. A mood word is usually asking for one of these.
 *
 * `fallback` marks a look so broad that it should never outrank a request the
 * app cannot do: "fix" means improve in "fix the lighting", but in "fix her
 * skin" it means retouching, and quietly applying a general lift there would
 * hide the fact that nothing was done about the actual request.
 */
const PRESETS: {
  phrases: string[];
  name: string;
  values: Partial<Record<NumericKey, number>>;
  fallback?: boolean;
}[] = [
  {
    phrases: ["old family photo", "old family photograph", "vintage", "retro", "nostalgic", "nostalgia", "old school", "seventies", "1970s", "70s", "1980s", "80s", "yesteryear"],
    name: "vintage",
    values: { sepia: 40, fade: 25, grain: 20, contrast: -8, saturation: -15, vignette: 25 },
  },
  {
    phrases: ["dramatic", "moody", "moodier", "broody", "gloomy", "sombre", "somber", "intense"],
    name: "dramatic",
    values: { contrast: 35, saturation: -10, vignette: 40, brightness: -10 },
  },
  {
    phrases: ["cinematic", "film look", "movie look", "filmic", "like a movie"],
    name: "cinematic",
    values: { contrast: 22, warmth: -12, vignette: 30, fade: 18 },
  },
  {
    phrases: ["film noir", "noir"],
    name: "noir",
    values: { grayscale: 100, contrast: 38, vignette: 35 },
  },
  {
    phrases: ["soft focus", "dreamy", "ethereal", "romantic", "wistful"],
    name: "dreamy",
    values: { blur: 2, fade: 22, brightness: 8, saturation: -8 },
  },
  {
    phrases: ["sunny day", "summery", "summer", "holiday", "tropical", "beachy"],
    name: "summer",
    values: { warmth: 30, saturation: 20, brightness: 10, contrast: 8 },
  },
  {
    phrases: ["bright and airy", "light and airy", "airy", "fresh", "clean and bright"],
    name: "airy",
    values: { brightness: 18, fade: 18, saturation: -5, contrast: -5 },
  },
  {
    phrases: ["professional", "polished", "magazine", "editorial", "high end"],
    name: "polished",
    values: { contrast: 18, saturation: 10, sharpen: 35 },
  },
  // The most common thing anyone types is not an instruction at all, it is
  // "make it look nice". Rejecting that is the app failing at its main job, so
  // it maps to a modest all-round lift.
  {
    phrases: [
      "look nice", "looks nice", "nice", "nicer", "better", "best", "improve", "improved",
      "improvement", "enhance", "enhanced", "beautiful", "prettier", "pretty", "lovely",
      "good", "great", "amazing", "stunning", "gorgeous", "wow", "fix", "fix it", "fix this",
      "clean it up", "clean up", "tidy it up", "sort it out", "do your thing", "work your magic",
      "lighting", "the lighting", "quality",
    ],
    name: "improved",
    values: { brightness: 6, contrast: 14, saturation: 12, sharpen: 25 },
    fallback: true,
  },
];

const INTENSIFIERS: { phrases: string[]; factor: number }[] = [
  { phrases: ["just a touch", "a tiny bit", "a touch", "a tiny", "slightly", "a little bit", "a little", "a bit", "barely", "subtle", "subtly", "gently", "softly", "marginally"], factor: 0.45 },
  { phrases: ["way too", "way", "super", "extremely", "massively", "hugely", "loads", "tons", "max", "maximum", "as much as possible"], factor: 2.2 },
  { phrases: ["much", "very", "really", "a lot", "lots", "heavily", "strongly", "significantly", "considerably"], factor: 1.6 },
];

const NEGATORS = [
  "less", "reduce", "reduced", "decrease", "lower", "tone down", "take down",
  "not so", "not too", "too much", "less of",
];

const REMOVERS = ["remove", "without", "get rid of", "kill the", "drop the", "take away", "no more"];

const RESET_PHRASES = [
  "reset", "start over", "start again", "undo everything", "back to the original",
  "as it was", "clear everything", "revert", "original",
];

const ROTATIONS: { phrases: string[]; degrees: number; label: string }[] = [
  { phrases: ["rotate left", "rotate anticlockwise", "rotate counterclockwise", "turn left", "anticlockwise"], degrees: 270, label: "rotate left" },
  { phrases: ["rotate right", "rotate clockwise", "turn right", "clockwise"], degrees: 90, label: "rotate right" },
  { phrases: ["upside down", "rotate 180", "turn it around"], degrees: 180, label: "rotate 180°" },
];

const FLIPS: { phrases: string[]; axis: "flipHorizontal" | "flipVertical"; label: string }[] = [
  { phrases: ["flip vertically", "flip vertical", "mirror vertically"], axis: "flipVertical", label: "flip vertically" },
  { phrases: ["flip horizontally", "flip horizontal", "mirror horizontally", "mirror it", "mirror", "flip"], axis: "flipHorizontal", label: "flip horizontally" },
];

/**
 * Requests this app recognises but genuinely cannot do -- they would need a
 * generative image model, not an adjustment. Saying so beats "not understood",
 * which sounds like a wording problem the user could fix by rephrasing.
 */
const UNSUPPORTED: { pattern: RegExp; what: string }[] = [
  { pattern: /\b(remove|delete|erase|cut out|get rid of|take out)\b/, what: "removing things from the picture" },
  { pattern: /\b(add|put|insert|place)\s+(a|an|the|some|my)\b/, what: "adding things to the picture" },
  { pattern: /\bbackground\b/, what: "changing the background" },
  { pattern: /\b(crop|resize|zoom|stretch|scale)\b/, what: "cropping or resizing" },
  { pattern: /\b(text|caption|watermark|logo|sticker)\b/, what: "adding text or graphics" },
  { pattern: /\b(face|skin|teeth|wrinkles?|blemish|spots?|eyes|hair)\b/, what: "retouching people" },
  { pattern: /\b(painting|van gogh|anime|cartoon|oil paint|watercolou?r|sketch|drawing|3d)\b/, what: "repainting it in another style" },
  { pattern: /\b(sky|clouds?|sun|grass|tree|car|person|people)\b/, what: "editing one object on its own" },
];

/** Words that carry no request on their own, so a clause of only these is context. */
const STOPWORDS = new Set([
  "i", "id", "im", "ive", "we", "you", "it", "its", "this", "that", "these", "those",
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being", "am",
  "want", "wanted", "need", "would", "could", "should", "can", "will", "shall", "may",
  "like", "love", "prefer", "hope", "wish", "think", "feel", "feels", "felt", "look", "looks", "looking",
  "make", "makes", "made", "give", "gives", "get", "got", "have", "has", "had", "do", "does", "did",
  "please", "thanks", "thank", "kindly", "just", "so", "very", "really", "quite", "rather",
  "photo", "photos", "picture", "pictures", "pic", "pics", "image", "images", "shot", "snap",
  "of", "my", "our", "his", "her", "their", "your", "me", "us", "them", "him",
  "to", "for", "with", "from", "in", "on", "at", "by", "as", "into", "about",
  "more", "less", "bit", "little", "lot", "some", "any", "all", "much", "many",
  "and", "or", "but", "if", "when", "while", "than", "then", "there", "here",
  "grandmother", "grandfather", "mum", "mom", "dad", "family", "friend", "friends",
  "taken", "took", "day", "night", "morning", "evening", "yesterday", "today",
  "one", "two", "up", "down", "out", "over", "back", "way", "thing", "things",
  "try", "trying", "lets", "let", "maybe", "perhaps", "kind", "sort", "bit",
]);

const PRE_SPLIT_ALIASES: [RegExp, string][] = [
  [/\bblack\s*(?:and|&|n)\s*white\b/gi, " grayscale "],
  // Settled before "colour" is read as a request for more of it.
  [/\bno\s+colou?rs?\b/gi, " grayscale "],
  [/\bwithout\s+colou?rs?\b/gi, " grayscale "],
  [/\bbright\s+and\s+airy\b/gi, " airy "],
  [/\blight\s+and\s+airy\b/gi, " airy "],
  [/\bwarm\s+and\s+(?:cosy|cozy)\b/gi, " warm "],
  [/\bold\s+family\s+(?:photo|photograph|picture)\b/gi, " vintage "],
];

function canonicalise(text: string): string {
  return PRE_SPLIT_ALIASES.reduce((out, [pattern, to]) => out.replace(pattern, to), text);
}

function normalise(text: string): string {
  return ` ${text.toLowerCase().replace(/[^\p{L}\p{N}&\s]/gu, " ").replace(/\s+/g, " ").trim()} `;
}

/**
 * Breaks an instruction into clauses. Sentence enders and conjunctions both
 * split, so a paragraph becomes the same shape as a list of short commands, and
 * each clause keeps its own "a bit" or "much" attached to the right effect.
 */
export function splitClauses(text: string): string[] {
  return canonicalise(text)
    .toLowerCase()
    .split(/[,;.!?\n]|\band\b|\bthen\b|\balso\b|\bplus\b|\bwith\b|\bbut\b|\bhowever\b/g)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function containsPhrase(haystack: string, phrase: string): boolean {
  return haystack.includes(` ${phrase} `);
}

function intensityOf(clause: string): number {
  for (const { phrases, factor } of INTENSIFIERS) {
    if (phrases.some((phrase) => containsPhrase(clause, phrase))) return factor;
  }
  return 1;
}

const isNegated = (clause: string) => NEGATORS.some((word) => containsPhrase(clause, word));
const isRemoval = (clause: string) => REMOVERS.some((word) => containsPhrase(clause, word));

/** True when a clause is only connective tissue, not a request. */
function isContextOnly(clause: string): boolean {
  const words = clause.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  // Numbers and names carry no instruction on their own either.
  return words.every((word) => STOPWORDS.has(word) || /^\d+$/.test(word) || word.length <= 2);
}

function unsupportedIn(clause: string): string | null {
  for (const { pattern, what } of UNSUPPORTED) {
    if (pattern.test(clause)) return what;
  }
  return null;
}

export function parseInstruction(text: string, base: Adjustments = NEUTRAL): ParseResult {
  const next: Adjustments = { ...base };
  const applied: string[] = [];
  const unsupported: string[] = [];
  const unknown: string[] = [];

  if (!text.trim()) return { adjustments: next, applied, unsupported, unknown, reset: false };

  if (RESET_PHRASES.some((phrase) => containsPhrase(normalise(canonicalise(text)), phrase))) {
    return {
      adjustments: { ...NEUTRAL },
      applied: ["back to the original"],
      unsupported,
      unknown,
      reset: true,
    };
  }

  for (const rawClause of splitClauses(text)) {
    const clause = normalise(rawClause);
    let matchedSomething = false;

    for (const { phrases, degrees, label } of ROTATIONS) {
      if (phrases.some((phrase) => containsPhrase(clause, phrase))) {
        next.rotate = (next.rotate + degrees) % 360;
        applied.push(label);
        matchedSomething = true;
        break;
      }
    }

    if (!matchedSomething) {
      for (const { phrases, axis, label } of FLIPS) {
        if (phrases.some((phrase) => containsPhrase(clause, phrase))) {
          next[axis] = !next[axis];
          applied.push(label);
          matchedSomething = true;
          break;
        }
      }
    }

    // Presets run before individual effects so "vintage but brighter" lands the
    // look first and then nudges it, rather than the other way round.
    for (const { phrases, name, values, fallback } of PRESETS) {
      if (!phrases.some((phrase) => containsPhrase(clause, phrase))) continue;
      if (fallback && unsupportedIn(clause)) continue;
      const scale = intensityOf(clause);
      for (const [key, value] of Object.entries(values) as [NumericKey, number][]) {
        next[key] = clamp(key, value * scale);
      }
      applied.push(`${name} look`);
      matchedSomething = true;
      break;
    }

    // A clause of prose can mention several things at once, so unlike a short
    // command this collects every effect it finds -- one per adjustment.
    const seen = new Set<NumericKey>();
    for (const { phrases, effect } of EFFECTS) {
      if (seen.has(effect.key)) continue;
      if (!phrases.some((phrase) => containsPhrase(clause, phrase))) continue;

      seen.add(effect.key);
      matchedSomething = true;

      const direction = isNegated(clause) ? -effect.sign : effect.sign;
      const scale = intensityOf(clause);

      if (isRemoval(clause)) {
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
    }

    if (matchedSomething) continue;

    const cannotDo = unsupportedIn(clause);
    if (cannotDo) {
      if (!unsupported.includes(cannotDo)) unsupported.push(cannotDo);
    } else if (!isContextOnly(clause)) {
      unknown.push(rawClause.trim());
    }
  }

  return { adjustments: next, applied: dedupe(applied), unsupported, unknown, reset: false };
}

/** A paragraph often says the same thing twice; the summary should not. */
function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}

export function knownPhrases(): string[] {
  return [
    ...PRESETS.map((preset) => preset.phrases[0]),
    ...EFFECTS.map((entry) => entry.phrases[0]),
    ...ROTATIONS.map((entry) => entry.phrases[0]),
    "flip horizontally",
  ];
}
