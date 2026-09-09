import type { Adjustments } from "./adjustments";

/**
 * Draws an image through a set of adjustments onto a canvas.
 *
 * Two passes. The first uses the browser's own filter pipeline for the things
 * it does well and fast; the second walks the pixels for the effects CSS has no
 * equivalent of. Sharpening is last, since it should act on the finished image.
 *
 * Everything happens on the user's machine -- no upload, no server, no network.
 */
export function renderToCanvas(
  source: CanvasImageSource & { width: number; height: number },
  canvas: HTMLCanvasElement,
  adjustments: Adjustments,
): void {
  const quarterTurns = ((adjustments.rotate % 360) + 360) % 360;
  const swapsAxes = quarterTurns === 90 || quarterTurns === 270;

  const sourceWidth = source.width;
  const sourceHeight = source.height;
  canvas.width = swapsAxes ? sourceHeight : sourceWidth;
  canvas.height = swapsAxes ? sourceWidth : sourceHeight;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return;

  context.save();
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((quarterTurns * Math.PI) / 180);
  context.scale(adjustments.flipHorizontal ? -1 : 1, adjustments.flipVertical ? -1 : 1);
  context.filter = cssFilter(adjustments);
  context.drawImage(source, -sourceWidth / 2, -sourceHeight / 2, sourceWidth, sourceHeight);
  context.restore();

  applyPixelEffects(context, canvas, adjustments);

  if (adjustments.sharpen > 0) applySharpen(context, canvas, adjustments.sharpen / 100);
}

/** The adjustments the browser's own filter pipeline can do directly. */
export function cssFilter(adjustments: Adjustments): string {
  const parts: string[] = [];

  if (adjustments.brightness !== 0) parts.push(`brightness(${1 + adjustments.brightness / 130})`);
  if (adjustments.contrast !== 0) parts.push(`contrast(${1 + adjustments.contrast / 110})`);
  if (adjustments.saturation !== 0) parts.push(`saturate(${Math.max(0, 1 + adjustments.saturation / 90)})`);
  if (adjustments.grayscale > 0) parts.push(`grayscale(${adjustments.grayscale / 100})`);
  if (adjustments.sepia > 0) parts.push(`sepia(${adjustments.sepia / 100})`);
  if (adjustments.blur > 0) parts.push(`blur(${adjustments.blur}px)`);
  if (adjustments.hue !== 0) parts.push(`hue-rotate(${adjustments.hue}deg)`);

  return parts.length > 0 ? parts.join(" ") : "none";
}

/** Warmth, fade, vignette and grain, none of which CSS filters cover. */
function applyPixelEffects(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  adjustments: Adjustments,
): void {
  const { warmth, fade, vignette, grain } = adjustments;
  if (warmth === 0 && fade === 0 && vignette === 0 && grain === 0) return;

  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = image.data;

  const warmShift = (warmth / 100) * 38;
  const fadeLift = (fade / 100) * 52;
  const fadeScale = 1 - (fade / 100) * 0.22;
  const grainAmount = (grain / 100) * 46;

  const centreX = canvas.width / 2;
  const centreY = canvas.height / 2;
  const maxDistance = Math.hypot(centreX, centreY) || 1;
  const vignetteStrength = vignette / 100;

  for (let i = 0; i < pixels.length; i += 4) {
    let r = pixels[i];
    let g = pixels[i + 1];
    let b = pixels[i + 2];

    if (warmShift !== 0) {
      r += warmShift;
      b -= warmShift;
      g += warmShift * 0.18;
    }

    if (fade !== 0) {
      r = r * fadeScale + fadeLift;
      g = g * fadeScale + fadeLift;
      b = b * fadeScale + fadeLift;
    }

    if (vignetteStrength > 0) {
      const pixelIndex = i / 4;
      const x = pixelIndex % canvas.width;
      const y = (pixelIndex - x) / canvas.width;
      const distance = Math.hypot(x - centreX, y - centreY) / maxDistance;
      // Untouched in the middle, falling away towards the corners.
      const falloff = 1 - vignetteStrength * Math.pow(Math.max(0, distance - 0.32) / 0.68, 2);
      r *= falloff;
      g *= falloff;
      b *= falloff;
    }

    if (grainAmount > 0) {
      const noise = (Math.random() - 0.5) * grainAmount;
      r += noise;
      g += noise;
      b += noise;
    }

    pixels[i] = r < 0 ? 0 : r > 255 ? 255 : r;
    pixels[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
    pixels[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
  }

  context.putImageData(image, 0, 0);
}

/** A 3x3 unsharp-style convolution, blended back by `amount`. */
function applySharpen(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  amount: number,
): void {
  const { width, height } = canvas;
  if (width < 3 || height < 3) return;

  const image = context.getImageData(0, 0, width, height);
  const source = image.data;
  const output = new Uint8ClampedArray(source);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const centre = (y * width + x) * 4;

      for (let channel = 0; channel < 3; channel += 1) {
        const index = centre + channel;
        const neighbours =
          source[index - width * 4] +
          source[index + width * 4] +
          source[index - 4] +
          source[index + 4];
        // 5*centre - the four neighbours, eased in so 100% is strong but sane.
        const sharpened = 5 * source[index] - neighbours;
        output[index] = source[index] + (sharpened - source[index]) * amount * 0.6;
      }
    }
  }

  context.putImageData(new ImageData(output, width, height), 0, 0);
}
