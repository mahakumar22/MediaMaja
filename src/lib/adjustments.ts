/**
 * Every edit the app can make, as one flat set of numbers. Parsing turns
 * English into changes to this object; rendering turns this object into pixels.
 * Keeping it in the middle means the user can always see, and correct, exactly
 * what their words were understood to mean.
 */
export type Adjustments = {
  /** -100 (black) .. 100 (blown out) */
  brightness: number;
  contrast: number;
  saturation: number;
  /** -100 (cold blue) .. 100 (warm gold) */
  warmth: number;
  /** 0 .. 100, lifts the blacks for a matte look */
  fade: number;
  /** 0 .. 100 */
  sepia: number;
  grayscale: number;
  vignette: number;
  grain: number;
  sharpen: number;
  /** 0 .. 20 pixels */
  blur: number;
  /** -180 .. 180 degrees of hue shift */
  hue: number;
  /** 0, 90, 180 or 270 degrees clockwise */
  rotate: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
};

export const NEUTRAL: Adjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  warmth: 0,
  fade: 0,
  sepia: 0,
  grayscale: 0,
  vignette: 0,
  grain: 0,
  sharpen: 0,
  blur: 0,
  hue: 0,
  rotate: 0,
  flipHorizontal: false,
  flipVertical: false,
};

/** The slider range for each numeric control, also used to clamp parsing. */
export const LIMITS: Record<NumericKey, { min: number; max: number; label: string }> = {
  brightness: { min: -100, max: 100, label: "Brightness" },
  contrast: { min: -100, max: 100, label: "Contrast" },
  saturation: { min: -100, max: 100, label: "Saturation" },
  warmth: { min: -100, max: 100, label: "Warmth" },
  fade: { min: 0, max: 100, label: "Fade" },
  sepia: { min: 0, max: 100, label: "Sepia" },
  grayscale: { min: 0, max: 100, label: "Black & white" },
  vignette: { min: 0, max: 100, label: "Vignette" },
  grain: { min: 0, max: 100, label: "Grain" },
  sharpen: { min: 0, max: 100, label: "Sharpen" },
  blur: { min: 0, max: 20, label: "Blur" },
  hue: { min: -180, max: 180, label: "Hue shift" },
};

export type NumericKey =
  | "brightness"
  | "contrast"
  | "saturation"
  | "warmth"
  | "fade"
  | "sepia"
  | "grayscale"
  | "vignette"
  | "grain"
  | "sharpen"
  | "blur"
  | "hue";

export const NUMERIC_KEYS = Object.keys(LIMITS) as NumericKey[];

export function clamp(key: NumericKey, value: number): number {
  const { min, max } = LIMITS[key];
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function isNeutral(adjustments: Adjustments): boolean {
  return NUMERIC_KEYS.every((key) => adjustments[key] === NEUTRAL[key])
    && adjustments.rotate === 0
    && !adjustments.flipHorizontal
    && !adjustments.flipVertical;
}
