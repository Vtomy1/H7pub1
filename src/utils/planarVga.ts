/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VGA_WIDTH, VGA_HEIGHT } from './dithering';
import { VgaColor } from '../types';

export const BYTES_PER_ROW = VGA_WIDTH / 8; // 80 bytes
export const BYTES_PER_PLANE = BYTES_PER_ROW * VGA_HEIGHT; // 38,400 bytes
export const TOTAL_PLANAR_BYTES = BYTES_PER_PLANE * 4; // 153,600 bytes

/**
 * Converts 640x480 16-color indexed pixels (0..15) into 4 VGA Mode 12h bit-planes.
 *
 * VGA Mode 12h Planar Format:
 * - Base address: 0xA000:0000
 * - 4 planes of 38,400 bytes each.
 * - Each byte in a plane represents 8 horizontal pixels (MSB = leftmost pixel).
 * - Pixel color index (0..15) = (Bit3 << 3) | (Bit2 << 2) | (Bit1 << 1) | Bit0
 *   - Plane 0: Bit 0 (Blue)
 *   - Plane 1: Bit 1 (Green)
 *   - Plane 2: Bit 2 (Red)
 *   - Plane 3: Bit 3 (Intensity)
 */
export function convertToPlanarVga(
  indexedPixels: Uint8Array
): [Uint8Array, Uint8Array, Uint8Array, Uint8Array] {
  const plane0 = new Uint8Array(BYTES_PER_PLANE);
  const plane1 = new Uint8Array(BYTES_PER_PLANE);
  const plane2 = new Uint8Array(BYTES_PER_PLANE);
  const plane3 = new Uint8Array(BYTES_PER_PLANE);

  let byteOffset = 0;

  for (let y = 0; y < VGA_HEIGHT; y++) {
    const rowOffset = y * VGA_WIDTH;

    for (let x = 0; x < VGA_WIDTH; x += 8) {
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      let b3 = 0;

      for (let bit = 0; bit < 8; bit++) {
        const pixel = indexedPixels[rowOffset + x + bit] & 0x0f;
        const shift = 7 - bit;

        if (pixel & 0x01) b0 |= 1 << shift;
        if (pixel & 0x02) b1 |= 1 << shift;
        if (pixel & 0x04) b2 |= 1 << shift;
        if (pixel & 0x08) b3 |= 1 << shift;
      }

      plane0[byteOffset] = b0;
      plane1[byteOffset] = b1;
      plane2[byteOffset] = b2;
      plane3[byteOffset] = b3;

      byteOffset++;
    }
  }

  return [plane0, plane1, plane2, plane3];
}

/**
 * Reconstructs a single plane for visualization as high-contrast 1-bit monochrome (0=black, 1=white/tint)
 */
export function renderSinglePlaneToRgba(
  planeData: Uint8Array,
  tintR: number = 255,
  tintG: number = 255,
  tintB: number = 255
): Uint8ClampedArray {
  const buffer = new Uint8ClampedArray(VGA_WIDTH * VGA_HEIGHT * 4);
  let pixelIndex = 0;

  for (let byteIdx = 0; byteIdx < BYTES_PER_PLANE; byteIdx++) {
    const byteVal = planeData[byteIdx];

    for (let bit = 7; bit >= 0; bit--) {
      const isSet = (byteVal & (1 << bit)) !== 0;
      const outIdx = pixelIndex * 4;

      if (isSet) {
        buffer[outIdx] = tintR;
        buffer[outIdx + 1] = tintG;
        buffer[outIdx + 2] = tintB;
        buffer[outIdx + 3] = 255;
      } else {
        buffer[outIdx] = 12;
        buffer[outIdx + 1] = 16;
        buffer[outIdx + 2] = 20;
        buffer[outIdx + 3] = 255;
      }
      pixelIndex++;
    }
  }

  return buffer;
}

/**
 * Reconstructs 4-split quadrant view for visualizing all 4 planes side-by-side (320x240 each)
 */
export function renderPlanesSplitToRgba(
  planes: [Uint8Array, Uint8Array, Uint8Array, Uint8Array],
  palette: VgaColor[]
): Uint8ClampedArray {
  const buffer = new Uint8ClampedArray(VGA_WIDTH * VGA_HEIGHT * 4);

  // Top-Left: Plane 0 (Blue)
  // Top-Right: Plane 1 (Green)
  // Bottom-Left: Plane 2 (Red)
  // Bottom-Right: Plane 3 (Intensity)
  const tints = [
    { r: 85, g: 140, b: 255, label: 'PLANE 0 (BLUE)' },
    { r: 85, g: 255, b: 120, label: 'PLANE 1 (GREEN)' },
    { r: 255, g: 90, b: 90, label: 'PLANE 2 (RED)' },
    { r: 255, g: 240, b: 100, label: 'PLANE 3 (INTENSITY)' },
  ];

  for (let pIdx = 0; pIdx < 4; pIdx++) {
    const plane = planes[pIdx];
    const tint = tints[pIdx];
    const startX = (pIdx % 2) * 320;
    const startY = Math.floor(pIdx / 2) * 240;

    for (let qY = 0; qY < 240; qY++) {
      const srcY = qY * 2; // Sub-sample 2x
      const rowByteOffset = srcY * BYTES_PER_ROW;
      const targetY = startY + qY;

      for (let qX = 0; qX < 320; qX++) {
        const srcX = qX * 2;
        const byteIndex = rowByteOffset + Math.floor(srcX / 8);
        const bitIndex = 7 - (srcX % 8);
        const isSet = (plane[byteIndex] & (1 << bitIndex)) !== 0;

        const targetX = startX + qX;
        const outIdx = (targetY * VGA_WIDTH + targetX) * 4;

        if (isSet) {
          buffer[outIdx] = tint.r;
          buffer[outIdx + 1] = tint.g;
          buffer[outIdx + 2] = tint.b;
          buffer[outIdx + 3] = 255;
        } else {
          buffer[outIdx] = 15;
          buffer[outIdx + 1] = 18;
          buffer[outIdx + 2] = 24;
          buffer[outIdx + 3] = 255;
        }
      }
    }
  }

  // Draw fine dividers between quadrants
  for (let x = 0; x < VGA_WIDTH; x++) {
    const outIdx = (240 * VGA_WIDTH + x) * 4;
    buffer[outIdx] = 80;
    buffer[outIdx + 1] = 95;
    buffer[outIdx + 2] = 115;
    buffer[outIdx + 3] = 255;
  }
  for (let y = 0; y < VGA_HEIGHT; y++) {
    const outIdx = (y * VGA_WIDTH + 320) * 4;
    buffer[outIdx] = 80;
    buffer[outIdx + 1] = 95;
    buffer[outIdx + 2] = 115;
    buffer[outIdx + 3] = 255;
  }

  return buffer;
}
