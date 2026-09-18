/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DitherAlgorithm, ImageAdjustments, VgaColor } from '../types';
import { findNearestColorIndex } from './palette';

export const VGA_WIDTH = 640;
export const VGA_HEIGHT = 480;

// Standard Bayer matrices normalized 0..1
const BAYER_2X2 = [
  [0 / 4, 2 / 4],
  [3 / 4, 1 / 4],
];

const BAYER_4X4 = [
  [ 0 / 16,  8 / 16,  2 / 16, 10 / 16],
  [12 / 16,  4 / 16, 14 / 16,  6 / 16],
  [ 3 / 16, 11 / 16,  1 / 16,  9 / 16],
  [15 / 16,  7 / 16, 13 / 16,  5 / 16],
];

const BAYER_8X8 = [
  [ 0/64, 32/64,  8/64, 40/64,  2/64, 34/64, 10/64, 42/64],
  [48/64, 16/64, 56/64, 24/64, 50/64, 18/64, 58/64, 26/64],
  [12/64, 44/64,  4/64, 36/64, 14/64, 46/64,  6/64, 38/64],
  [60/64, 28/64, 52/64, 20/64, 62/64, 30/64, 54/64, 22/64],
  [ 3/64, 35/64, 11/64, 43/64,  1/64, 33/64,  9/64, 41/64],
  [51/64, 19/64, 59/64, 27/64, 49/64, 17/64, 57/64, 25/64],
  [15/64, 47/64,  7/64, 39/64, 13/64, 45/64,  5/64, 37/64],
  [63/64, 31/64, 55/64, 23/64, 61/64, 29/64, 53/64, 21/64],
];

/**
 * Apply contrast, brightness, gamma, saturation to RGB buffer
 */
export function preprocessPixel(
  r: number,
  g: number,
  b: number,
  adjustments: ImageAdjustments
): [number, number, number] {
  // Brightness: -100 to 100
  let pr = r + (adjustments.brightness * 255) / 100;
  let pg = g + (adjustments.brightness * 255) / 100;
  let pb = b + (adjustments.brightness * 255) / 100;

  // Contrast: -100 to 100
  const factor = (259 * (adjustments.contrast + 255)) / (255 * (259 - adjustments.contrast));
  pr = factor * (pr - 128) + 128;
  pg = factor * (pg - 128) + 128;
  pb = factor * (pb - 128) + 128;

  // Gamma: 0.5 to 2.5
  if (adjustments.gamma !== 1.0) {
    const invGamma = 1.0 / Math.max(0.1, adjustments.gamma);
    pr = 255 * Math.pow(Math.max(0, pr) / 255, invGamma);
    pg = 255 * Math.pow(Math.max(0, pg) / 255, invGamma);
    pb = 255 * Math.pow(Math.max(0, pb) / 255, invGamma);
  }

  // Saturation: 0 to 200 (100 = default)
  if (adjustments.saturation !== 100) {
    const gray = 0.299 * pr + 0.587 * pg + 0.114 * pb;
    const sat = adjustments.saturation / 100;
    pr = gray + sat * (pr - gray);
    pg = gray + sat * (pg - gray);
    pb = gray + sat * (pb - gray);
  }

  return [
    Math.min(255, Math.max(0, pr)),
    Math.min(255, Math.max(0, pg)),
    Math.min(255, Math.max(0, pb)),
  ];
}

/**
 * Core Dithering Function for 640x480 Mode 12h
 */
export function ditherImage(
  sourceImageData: ImageData,
  palette: VgaColor[],
  algorithm: DitherAlgorithm,
  strength: number, // 0.0 to 1.0
  adjustments: ImageAdjustments
): { indexedPixels: Uint8Array; rgbaBuffer: Uint8ClampedArray } {
  const width = VGA_WIDTH;
  const height = VGA_HEIGHT;
  const totalPixels = width * height;

  const indexedPixels = new Uint8Array(totalPixels);
  const rgbaBuffer = new Uint8ClampedArray(totalPixels * 4);

  // Create floating-point work buffers for error diffusion
  const bufferR = new Float32Array(totalPixels);
  const bufferG = new Float32Array(totalPixels);
  const bufferB = new Float32Array(totalPixels);

  const srcData = sourceImageData.data;

  // Populate floating point buffers with pre-processed RGB values
  for (let i = 0; i < totalPixels; i++) {
    const srcIdx = i * 4;
    const rawR = srcData[srcIdx];
    const rawG = srcData[srcIdx + 1];
    const rawB = srcData[srcIdx + 2];
    const [pr, pg, pb] = preprocessPixel(rawR, rawG, rawB, adjustments);
    bufferR[i] = pr;
    bufferG[i] = pg;
    bufferB[i] = pb;
  }

  // Handle Bayer Ordered Dithering separately (no error diffusion, position-based threshold matrix)
  if (algorithm.startsWith('bayer-')) {
    const matrix =
      algorithm === 'bayer-2'
        ? BAYER_2X2
        : algorithm === 'bayer-4'
        ? BAYER_4X4
        : BAYER_8X8;
    const mSize = matrix.length;
    const spread = 64 * strength; // dither noise spread range

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const threshold = (matrix[y % mSize][x % mSize] - 0.5) * spread;

        const r = Math.min(255, Math.max(0, bufferR[idx] + threshold));
        const g = Math.min(255, Math.max(0, bufferG[idx] + threshold));
        const b = Math.min(255, Math.max(0, bufferB[idx] + threshold));

        const colorIdx = findNearestColorIndex(r, g, b, palette);
        indexedPixels[idx] = colorIdx;

        const chosen = palette[colorIdx];
        const outIdx = idx * 4;
        rgbaBuffer[outIdx] = chosen.r;
        rgbaBuffer[outIdx + 1] = chosen.g;
        rgbaBuffer[outIdx + 2] = chosen.b;
        rgbaBuffer[outIdx + 3] = 255;
      }
    }

    return { indexedPixels, rgbaBuffer };
  }

  // Error diffusion helper
  const addError = (x: number, y: number, errR: number, errG: number, errB: number, weight: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const idx = y * width + x;
    bufferR[idx] += errR * weight * strength;
    bufferG[idx] += errG * weight * strength;
    bufferB[idx] += errB * weight * strength;
  };

  // Traverse pixels row by row
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const currentR = Math.min(255, Math.max(0, bufferR[idx]));
      const currentG = Math.min(255, Math.max(0, bufferG[idx]));
      const currentB = Math.min(255, Math.max(0, bufferB[idx]));

      const colorIdx = findNearestColorIndex(currentR, currentG, currentB, palette);
      indexedPixels[idx] = colorIdx;

      const chosen = palette[colorIdx];
      const outIdx = idx * 4;
      rgbaBuffer[outIdx] = chosen.r;
      rgbaBuffer[outIdx + 1] = chosen.g;
      rgbaBuffer[outIdx + 2] = chosen.b;
      rgbaBuffer[outIdx + 3] = 255;

      if (algorithm === 'none') {
        continue;
      }

      const errR = currentR - chosen.r;
      const errG = currentG - chosen.g;
      const errB = currentB - chosen.b;

      switch (algorithm) {
        case 'floyd-steinberg':
          // Standard Floyd-Steinberg:
          //      *   7/16
          // 3/16 5/16 1/16
          addError(x + 1, y, errR, errG, errB, 7 / 16);
          addError(x - 1, y + 1, errR, errG, errB, 3 / 16);
          addError(x, y + 1, errR, errG, errB, 5 / 16);
          addError(x + 1, y + 1, errR, errG, errB, 1 / 16);
          break;

        case 'atkinson':
          // Atkinson (classic Mac retro dither):
          //      *   1/8 1/8
          // 1/8 1/8 1/8
          //     1/8
          // Total error preserved: 6/8 (75%), giving crisp high-contrast retro borders
          addError(x + 1, y, errR, errG, errB, 1 / 8);
          addError(x + 2, y, errR, errG, errB, 1 / 8);
          addError(x - 1, y + 1, errR, errG, errB, 1 / 8);
          addError(x, y + 1, errR, errG, errB, 1 / 8);
          addError(x + 1, y + 1, errR, errG, errB, 1 / 8);
          addError(x, y + 2, errR, errG, errB, 1 / 8);
          break;

        case 'sierra-3':
          // Sierra-3 (32 divisor)
          addError(x + 1, y, errR, errG, errB, 5 / 32);
          addError(x + 2, y, errR, errG, errB, 3 / 32);
          addError(x - 2, y + 1, errR, errG, errB, 2 / 32);
          addError(x - 1, y + 1, errR, errG, errB, 4 / 32);
          addError(x, y + 1, errR, errG, errB, 5 / 32);
          addError(x + 1, y + 1, errR, errG, errB, 4 / 32);
          addError(x + 2, y + 1, errR, errG, errB, 2 / 32);
          addError(x - 1, y + 2, errR, errG, errB, 2 / 32);
          addError(x, y + 2, errR, errG, errB, 3 / 32);
          addError(x + 1, y + 2, errR, errG, errB, 2 / 32);
          break;

        case 'sierra-2':
          // Two-row Sierra (16 divisor)
          addError(x + 1, y, errR, errG, errB, 4 / 16);
          addError(x + 2, y, errR, errG, errB, 3 / 16);
          addError(x - 2, y + 1, errR, errG, errB, 1 / 16);
          addError(x - 1, y + 1, errR, errG, errB, 2 / 16);
          addError(x, y + 1, errR, errG, errB, 3 / 16);
          addError(x + 1, y + 1, errR, errG, errB, 2 / 16);
          addError(x + 2, y + 1, errR, errG, errB, 1 / 16);
          break;

        case 'sierra-lite':
          // Sierra Lite (4 divisor)
          addError(x + 1, y, errR, errG, errB, 2 / 4);
          addError(x - 1, y + 1, errR, errG, errB, 1 / 4);
          addError(x, y + 1, errR, errG, errB, 1 / 4);
          break;

        case 'burkes':
          // Burkes (32 divisor)
          addError(x + 1, y, errR, errG, errB, 8 / 32);
          addError(x + 2, y, errR, errG, errB, 4 / 32);
          addError(x - 2, y + 1, errR, errG, errB, 2 / 32);
          addError(x - 1, y + 1, errR, errG, errB, 4 / 32);
          addError(x, y + 1, errR, errG, errB, 8 / 32);
          addError(x + 1, y + 1, errR, errG, errB, 4 / 32);
          addError(x + 2, y + 1, errR, errG, errB, 2 / 32);
          break;

        case 'stucki':
          // Stucki (42 divisor)
          addError(x + 1, y, errR, errG, errB, 8 / 42);
          addError(x + 2, y, errR, errG, errB, 4 / 42);
          addError(x - 2, y + 1, errR, errG, errB, 2 / 42);
          addError(x - 1, y + 1, errR, errG, errB, 4 / 42);
          addError(x, y + 1, errR, errG, errB, 8 / 42);
          addError(x + 1, y + 1, errR, errG, errB, 4 / 42);
          addError(x + 2, y + 1, errR, errG, errB, 2 / 42);
          addError(x - 2, y + 2, errR, errG, errB, 1 / 42);
          addError(x - 1, y + 2, errR, errG, errB, 2 / 42);
          addError(x, y + 2, errR, errG, errB, 4 / 42);
          addError(x + 1, y + 2, errR, errG, errB, 2 / 42);
          addError(x + 2, y + 2, errR, errG, errB, 1 / 42);
          break;

        case 'jarvis':
          // Jarvis, Judice & Ninke (48 divisor)
          addError(x + 1, y, errR, errG, errB, 7 / 48);
          addError(x + 2, y, errR, errG, errB, 5 / 48);
          addError(x - 2, y + 1, errR, errG, errB, 3 / 48);
          addError(x - 1, y + 1, errR, errG, errB, 5 / 48);
          addError(x, y + 1, errR, errG, errB, 7 / 48);
          addError(x + 1, y + 1, errR, errG, errB, 5 / 48);
          addError(x + 2, y + 1, errR, errG, errB, 3 / 48);
          addError(x - 2, y + 2, errR, errG, errB, 1 / 48);
          addError(x - 1, y + 2, errR, errG, errB, 3 / 48);
          addError(x, y + 2, errR, errG, errB, 5 / 48);
          addError(x + 1, y + 2, errR, errG, errB, 3 / 48);
          addError(x + 2, y + 2, errR, errG, errB, 1 / 48);
          break;
      }
    }
  }

  return { indexedPixels, rgbaBuffer };
}
