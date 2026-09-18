/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type DitherAlgorithm =
  | 'none'
  | 'floyd-steinberg'
  | 'atkinson'
  | 'bayer-2'
  | 'bayer-4'
  | 'bayer-8'
  | 'sierra-3'
  | 'sierra-2'
  | 'sierra-lite'
  | 'burkes'
  | 'stucki'
  | 'jarvis';

export type PaletteType =
  | 'vga-default'
  | 'custom-quantized'
  | 'grayscale-16'
  | 'green-phosphor'
  | 'amber-crt'
  | 'cga-tinted';

export type AspectRatioMode = 'fit' | 'fill' | 'stretch';

export type ViewMode = 'composite' | 'planes-split' | 'plane-0' | 'plane-1' | 'plane-2' | 'plane-3';

export type ExportTab = 'asm' | 'cheader' | 'pascal' | 'hex' | 'details';

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface VgaColor extends RgbColor {
  index: number;
  name: string;
  dacR: number; // 0..63 (6-bit VGA DAC value)
  dacG: number;
  dacB: number;
}

export interface ImageAdjustments {
  brightness: number; // -100 to 100
  contrast: number;   // -100 to 100
  gamma: number;      // 0.5 to 2.5
  saturation: number; // 0 to 200
}

export interface ProcessedVgaData {
  indexedPixels: Uint8Array; // 640 * 480 bytes, each pixel 0..15
  rgbaBuffer: Uint8ClampedArray; // 640 * 480 * 4 bytes for canvas
  planes: [Uint8Array, Uint8Array, Uint8Array, Uint8Array]; // 4 planes of 38,400 bytes each
  palette: VgaColor[]; // 16 colors
  isCustomPalette: boolean;
  comBinary: Uint8Array; // Complete executable MS-DOS .COM file
  compressedSize: number;
  rawPlanarSize: number; // 153,600 bytes
  compressionRatio: number; // Percentage
  fitsInCom: boolean; // < 65,280 bytes
  asmCode: string;
  cHeader: string;
  pascalCode: string;
}
