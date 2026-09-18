/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { RgbColor, VgaColor, PaletteType } from '../types';

/**
 * Standard IBM VGA 16-color hardware default palette (Mode 12h / IRGB palette)
 * DAC values are 6-bit (0..63) as used by the VGA INMOS G171 / DAC registers.
 */
export const STANDARD_VGA_16: VgaColor[] = [
  { index: 0,  name: 'Black',         r: 0,   g: 0,   b: 0,   dacR: 0,  dacG: 0,  dacB: 0  },
  { index: 1,  name: 'Blue',          r: 0,   g: 0,   b: 170, dacR: 0,  dacG: 0,  dacB: 42 },
  { index: 2,  name: 'Green',         r: 0,   g: 170, b: 0,   dacR: 0,  dacG: 42, dacB: 0  },
  { index: 3,  name: 'Cyan',          r: 0,   g: 170, b: 170, dacR: 0,  dacG: 42, dacB: 42 },
  { index: 4,  name: 'Red',           r: 170, g: 0,   b: 0,   dacR: 42, dacG: 0,  dacB: 0  },
  { index: 5,  name: 'Magenta',       r: 170, g: 0,   b: 170, dacR: 42, dacG: 0,  dacB: 42 },
  { index: 6,  name: 'Brown',         r: 170, g: 85,  b: 0,   dacR: 42, dacG: 21, dacB: 0  },
  { index: 7,  name: 'Light Gray',    r: 170, g: 170, b: 170, dacR: 42, dacG: 42, dacB: 42 },
  { index: 8,  name: 'Dark Gray',     r: 85,  g: 85,  b: 85,  dacR: 21, dacG: 21, dacB: 21 },
  { index: 9,  name: 'Bright Blue',   r: 85,  g: 85,  b: 255, dacR: 21, dacG: 21, dacB: 63 },
  { index: 10, name: 'Bright Green',  r: 85,  g: 255, b: 85,  dacR: 21, dacG: 63, dacB: 21 },
  { index: 11, name: 'Bright Cyan',   r: 85,  g: 255, b: 255, dacR: 21, dacG: 63, dacB: 63 },
  { index: 12, name: 'Bright Red',    r: 255, g: 85,  b: 85,  dacR: 63, dacG: 21, dacB: 21 },
  { index: 13, name: 'Bright Magenta',r: 255, g: 85,  b: 255, dacR: 63, dacG: 21, dacB: 63 },
  { index: 14, name: 'Yellow',        r: 255, g: 255, b: 85,  dacR: 63, dacG: 63, dacB: 21 },
  { index: 15, name: 'Bright White',  r: 255, g: 255, b: 255, dacR: 63, dacG: 63, dacB: 63 },
];

/**
 * 16-shade Grayscale palette
 */
export const GRAYSCALE_16: VgaColor[] = Array.from({ length: 16 }, (_, i) => {
  const v = Math.round((i / 15) * 255);
  const dac = Math.round((i / 15) * 63);
  return {
    index: i,
    name: `Gray ${i}`,
    r: v,
    g: v,
    b: v,
    dacR: dac,
    dacG: dac,
    dacB: dac,
  };
});

/**
 * Green Phosphor (P1/P31) CRT 16-level palette
 */
export const GREEN_PHOSPHOR_16: VgaColor[] = Array.from({ length: 16 }, (_, i) => {
  const intensity = i / 15;
  const g = Math.round(intensity * 255);
  const r = Math.round(intensity * 35);
  const b = Math.round(intensity * 30);
  return {
    index: i,
    name: `P31 Green ${i}`,
    r,
    g,
    b,
    dacR: Math.round((r / 255) * 63),
    dacG: Math.round((g / 255) * 63),
    dacB: Math.round((b / 255) * 63),
  };
});

/**
 * Amber Phosphor (P134) CRT 16-level palette
 */
export const AMBER_CRT_16: VgaColor[] = Array.from({ length: 16 }, (_, i) => {
  const intensity = i / 15;
  const r = Math.round(intensity * 255);
  const g = Math.round(intensity * 176);
  const b = Math.round(intensity * 0);
  return {
    index: i,
    name: `Amber ${i}`,
    r,
    g,
    b,
    dacR: Math.round((r / 255) * 63),
    dacG: Math.round((g / 255) * 63),
    dacB: Math.round((b / 255) * 63),
  };
});

/**
 * CGA-tinted retro 16-color palette
 */
export const CGA_TINTED_16: VgaColor[] = [
  { index: 0,  name: 'Black',         r: 0,   g: 0,   b: 0,   dacR: 0,  dacG: 0,  dacB: 0 },
  { index: 1,  name: 'CGA Cyan Dim',  r: 0,   g: 140, b: 140, dacR: 0,  dacG: 35, dacB: 35 },
  { index: 2,  name: 'CGA Mag Dim',   r: 140, g: 0,   b: 140, dacR: 35, dacG: 0,  dacB: 35 },
  { index: 3,  name: 'CGA White Dim', r: 140, g: 140, b: 140, dacR: 35, dacG: 35, dacB: 35 },
  { index: 4,  name: 'CGA Cyan Lite', r: 85,  g: 255, b: 255, dacR: 21, dacG: 63, dacB: 63 },
  { index: 5,  name: 'CGA Mag Lite',  r: 255, g: 85,  b: 255, dacR: 63, dacG: 21, dacB: 63 },
  { index: 6,  name: 'CGA White Lite',r: 255, g: 255, b: 255, dacR: 63, dacG: 63, dacB: 63 },
  { index: 7,  name: 'CGA Green Dim', r: 0,   g: 140, b: 0,   dacR: 0,  dacG: 35, dacB: 0 },
  { index: 8,  name: 'CGA Red Dim',   r: 140, g: 0,   b: 0,   dacR: 35, dacG: 0,  dacB: 0 },
  { index: 9,  name: 'CGA Brown',     r: 140, g: 70,  b: 0,   dacR: 35, dacG: 18, dacB: 0 },
  { index: 10, name: 'CGA Green Lite',r: 85,  g: 255, b: 85,  dacR: 21, dacG: 63, dacB: 21 },
  { index: 11, name: 'CGA Red Lite',  r: 255, g: 85,  b: 85,  dacR: 63, dacG: 21, dacB: 21 },
  { index: 12, name: 'CGA Yellow',    r: 255, g: 255, b: 85,  dacR: 63, dacG: 63, dacB: 21 },
  { index: 13, name: 'Deep Blue',     r: 0,   g: 0,   b: 140, dacR: 0,  dacG: 0,  dacB: 35 },
  { index: 14, name: 'Slate Gray',    r: 70,  g: 70,  b: 70,  dacR: 17, dacG: 17, dacB: 17 },
  { index: 15, name: 'Pure White',    r: 255, g: 255, b: 255, dacR: 63, dacG: 63, dacB: 63 },
];

/**
 * Converts 0-255 RGB to 0-63 VGA 6-bit DAC register value
 */
export function rgbToDac(val: number): number {
  return Math.min(63, Math.max(0, Math.round((val / 255) * 63)));
}

/**
 * Converts 0-63 VGA DAC register to 0-255 RGB
 */
export function dacToRgb(dac: number): number {
  return Math.min(255, Math.max(0, Math.round((dac / 63) * 255)));
}

/**
 * Perceptually weighted color distance (human eye is most sensitive to green, then red, then blue)
 */
export function colorDistanceSquared(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  // Weighted Euclidean formula for RGB
  const rMean = (r1 + r2) / 2;
  if (rMean < 128) {
    return 2 * dr * dr + 4 * dg * dg + 3 * db * db;
  } else {
    return 3 * dr * dr + 4 * dg * dg + 2 * db * db;
  }
}

/**
 * Find closest color in a palette
 */
export function findNearestColorIndex(r: number, g: number, b: number, palette: VgaColor[]): number {
  let bestIdx = 0;
  let minDistance = Infinity;

  for (let i = 0; i < palette.length; i++) {
    const col = palette[i];
    const dist = colorDistanceSquared(r, g, b, col.r, col.g, col.b);
    if (dist < minDistance) {
      minDistance = dist;
      bestIdx = i;
      if (dist === 0) break;
    }
  }

  return bestIdx;
}

/**
 * Generate an optimized 16-color palette for a specific image using the Median Cut algorithm.
 * Since VGA cards can reprogram DAC registers (0x3C8, 0x3C9), this produces photo-quality results
 * inside the MS-DOS COM executable!
 */
export function generateQuantizedPalette(imageData: ImageData): VgaColor[] {
  const pixels: RgbColor[] = [];
  const data = imageData.data;
  const step = Math.max(1, Math.floor((data.length / 4) / 20000)); // Sample ~20k pixels for performance

  for (let i = 0; i < data.length; i += step * 4) {
    const a = data[i + 3];
    if (a < 128) continue; // Skip transparent
    pixels.push({
      r: data[i],
      g: data[i + 1],
      b: data[i + 2],
    });
  }

  if (pixels.length === 0) {
    return STANDARD_VGA_16;
  }

  // Median-cut algorithm to partition pixels into 16 buckets
  interface Box {
    pixels: RgbColor[];
  }

  const boxes: Box[] = [{ pixels }];

  while (boxes.length < 16) {
    // Find box with greatest variance/range
    let splitIdx = -1;
    let maxRange = -1;
    let splitChannel: 'r' | 'g' | 'b' = 'r';

    for (let b = 0; b < boxes.length; b++) {
      const box = boxes[b];
      if (box.pixels.length < 2) continue;

      let minR = 255, maxR = 0;
      let minG = 255, maxG = 0;
      let minB = 255, maxB = 0;

      for (const p of box.pixels) {
        if (p.r < minR) minR = p.r;
        if (p.r > maxR) maxR = p.r;
        if (p.g < minG) minG = p.g;
        if (p.g > maxG) maxG = p.g;
        if (p.b < minB) minB = p.b;
        if (p.b > maxB) maxB = p.b;
      }

      const rangeR = maxR - minR;
      const rangeG = maxG - minG;
      const rangeB = maxB - minB;
      const largest = Math.max(rangeR, rangeG, rangeB);

      if (largest > maxRange) {
        maxRange = largest;
        splitIdx = b;
        splitChannel = largest === rangeR ? 'r' : largest === rangeG ? 'g' : 'b';
      }
    }

    if (splitIdx === -1) break;

    const targetBox = boxes[splitIdx];
    targetBox.pixels.sort((p1, p2) => p1[splitChannel] - p2[splitChannel]);

    const median = Math.floor(targetBox.pixels.length / 2);
    const boxA: Box = { pixels: targetBox.pixels.slice(0, median) };
    const boxB: Box = { pixels: targetBox.pixels.slice(median) };

    boxes.splice(splitIdx, 1, boxA, boxB);
  }

  // Calculate average color for each box
  const palette: VgaColor[] = boxes.map((box, idx) => {
    let sumR = 0, sumG = 0, sumB = 0;
    for (const p of box.pixels) {
      sumR += p.r;
      sumG += p.g;
      sumB += p.b;
    }
    const count = Math.max(1, box.pixels.length);
    const r = Math.round(sumR / count);
    const g = Math.round(sumG / count);
    const b = Math.round(sumB / count);

    return {
      index: idx,
      name: `Custom ${idx}`,
      r,
      g,
      b,
      dacR: rgbToDac(r),
      dacG: rgbToDac(g),
      dacB: rgbToDac(b),
    };
  });

  // Pad to 16 if less
  while (palette.length < 16) {
    const fallback = STANDARD_VGA_16[palette.length];
    palette.push({
      ...fallback,
      index: palette.length,
      name: `Custom ${palette.length}`,
    });
  }

  return palette;
}

/**
 * Get palette by type
 */
export function getPalette(type: PaletteType, customPalette?: VgaColor[]): VgaColor[] {
  switch (type) {
    case 'vga-default':
      return STANDARD_VGA_16;
    case 'custom-quantized':
      return customPalette && customPalette.length === 16 ? customPalette : STANDARD_VGA_16;
    case 'grayscale-16':
      return GRAYSCALE_16;
    case 'green-phosphor':
      return GREEN_PHOSPHOR_16;
    case 'amber-crt':
      return AMBER_CRT_16;
    case 'cga-tinted':
      return CGA_TINTED_16;
    default:
      return STANDARD_VGA_16;
  }
}
