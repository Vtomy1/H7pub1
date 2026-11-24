/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { compressPlaneRle } from './comGenerator';
import { BYTES_PER_PLANE, BYTES_PER_ROW, TOTAL_PLANAR_BYTES } from './planarVga';
import { VGA_HEIGHT } from './dithering';

export type CpuProfileId = '8088-477' | '286-12' | '386dx-33' | '486dx2-66' | 'pentium-133';
export type TransferMode = 'rle-com' | 'raw-planar';

export interface CpuHardwareProfile {
  id: CpuProfileId;
  name: string;
  shortName: string;
  busName: string;
  clockMhz: number;
  vramWriteMBps: number; // Effective throughput to 0xA000 over system bus
  rleSpeedFactor: number; // Relative efficiency when unpacking RLE vs raw MOVSB
  portIoPenaltyUs: number; // Microseconds per IN/OUT VGA port instruction
  description: string;
}

export const CPU_HARDWARE_PROFILES: CpuHardwareProfile[] = [
  {
    id: '8088-477',
    name: '8088 @ 4.77 MHz',
    shortName: '8088 4.77MHz',
    busName: '8-bit ISA (PC/XT)',
    clockMhz: 4.77,
    vramWriteMBps: 0.32,
    rleSpeedFactor: 0.85,
    portIoPenaltyUs: 18,
    description: 'Original IBM PC/XT bus; visible top-to-bottom plane sweep.',
  },
  {
    id: '286-12',
    name: '80286 @ 12 MHz',
    shortName: '286 12MHz',
    busName: '16-bit ISA (PC/AT)',
    clockMhz: 12,
    vramWriteMBps: 1.15,
    rleSpeedFactor: 0.96,
    portIoPenaltyUs: 8,
    description: 'AT-class 16-bit ISA with standard VGA wait states.',
  },
  {
    id: '386dx-33',
    name: '80386DX @ 33 MHz',
    shortName: '386DX 33MHz',
    busName: '16-bit ISA @ 8.33MHz',
    clockMhz: 33,
    vramWriteMBps: 2.45,
    rleSpeedFactor: 1.08,
    portIoPenaltyUs: 4.5,
    description: 'Fast 32-bit CPU bottlenecked by 8.33 MHz ISA VGA bus.',
  },
  {
    id: '486dx2-66',
    name: '80486DX2 @ 66 MHz',
    shortName: '486DX2 66MHz',
    busName: '32-bit VLB Local Bus',
    clockMhz: 66,
    vramWriteMBps: 14.8,
    rleSpeedFactor: 1.05,
    portIoPenaltyUs: 1.6,
    description: 'VESA Local Bus clears the ISA bottleneck for >60 FPS writes.',
  },
  {
    id: 'pentium-133',
    name: 'Pentium @ 133 MHz',
    shortName: 'Pentium 133',
    busName: '32-bit PCI 2.0 VGA',
    clockMhz: 133,
    vramWriteMBps: 34.0,
    rleSpeedFactor: 1.02,
    portIoPenaltyUs: 0.9,
    description: 'Burst PCI transfers complete well inside one 16.67ms V-Sync.',
  },
];

export interface PlaneTimingBreakdown {
  planeIndex: number;
  name: string;
  compressedBytes: number;
  rawBytes: number;
  transferMs: number;
  repeatRunsPct: number;
}

export interface VgaTimingMetrics {
  profile: CpuHardwareProfile;
  transferMode: TransferMode;
  totalRawBytes: number; // 153,600
  sourcePayloadBytes: number; // Compressed stream or 153,600
  totalTimeMs: number;
  theoreticalFps: number;
  vsyncLockedFps: number; // Quantized to 60Hz V-Blank intervals
  vsyncFrameBudgetPct: number; // Percentage of 16.667ms (60Hz) budget
  effectiveBandwidthMBps: number;
  portIoOverheadMs: number;
  perPlane: PlaneTimingBreakdown[];
  cumulativePlaneEndMs: [number, number, number, number];
}

export const VGA_VSYNC_MS = 1000 / 60; // 16.6667 ms (60Hz Mode 12h refresh)

/**
 * Analyze compressed RLE ratio of repeated runs vs literal bytes in a plane
 */
function analyzePlaneRle(plane: Uint8Array): { compressedBytes: number; repeatBytes: number } {
  const compressed = compressPlaneRle(plane);
  let i = 0;
  let repeatBytes = 0;

  while (i < compressed.length) {
    const tag = compressed[i++];
    if ((tag & 0x80) !== 0) {
      const count = (tag & 0x7f) + 2;
      repeatBytes += count;
      i += 1; // skip repeated value byte
    } else {
      const count = tag + 1;
      i += count; // skip literal bytes
    }
  }

  return {
    compressedBytes: compressed.length,
    repeatBytes: Math.min(BYTES_PER_PLANE, repeatBytes),
  };
}

/**
 * Computes realistic VGA Mode 12h transfer timing & frame-rate metrics
 * for pushing 153,600 bytes (4 x 38,400) to segment 0xA000.
 */
export function calculateVgaTimingMetrics(
  planes: [Uint8Array, Uint8Array, Uint8Array, Uint8Array],
  profile: CpuHardwareProfile,
  transferMode: TransferMode,
  isCustomPalette: boolean
): VgaTimingMetrics {
  const planeNames = ['Plane 0 (Blue)', 'Plane 1 (Green)', 'Plane 2 (Red)', 'Plane 3 (Intensity)'];

  // Sequencer Map Mask (0x3C4/0x3C5 = 2 OUTs per plane = 8 OUTs)
  // Custom DAC palette (0x3C8 + 48 x 0x3C9 = 49 OUTs)
  const portWrites = 8 + (isCustomPalette ? 49 : 0);
  const portIoOverheadMs = (portWrites * profile.portIoPenaltyUs) / 1000;

  const baseBytesPerMs = profile.vramWriteMBps * 1000; // MB/s == 1,000,000 B/s == 1,000 B/ms

  const perPlane: PlaneTimingBreakdown[] = [];
  let sourcePayloadBytes = 0;
  let totalPlaneMs = 0;
  const cumulativePlaneEndMs: [number, number, number, number] = [0, 0, 0, 0];

  for (let p = 0; p < 4; p++) {
    const analysis = analyzePlaneRle(planes[p]);
    const repeatRatio = analysis.repeatBytes / BYTES_PER_PLANE;

    let planeMs: number;
    if (transferMode === 'raw-planar') {
      // Straight REP MOVSB of 38,400 bytes
      planeMs = BYTES_PER_PLANE / baseBytesPerMs;
      sourcePayloadBytes += BYTES_PER_PLANE;
    } else {
      // RLE decompression: REP STOSB runs avoid source bus reads,
      // while literal runs add slight tag-decoding overhead.
      const rleBusGain = 1 + repeatRatio * 0.22;
      const effectiveSpeed = baseBytesPerMs * profile.rleSpeedFactor * rleBusGain;
      planeMs = BYTES_PER_PLANE / effectiveSpeed;
      sourcePayloadBytes += analysis.compressedBytes;
    }

    totalPlaneMs += planeMs;
    cumulativePlaneEndMs[p] = portIoOverheadMs + totalPlaneMs;

    perPlane.push({
      planeIndex: p,
      name: planeNames[p],
      compressedBytes: analysis.compressedBytes,
      rawBytes: BYTES_PER_PLANE,
      transferMs: planeMs,
      repeatRunsPct: Math.round(repeatRatio * 100),
    });
  }

  const totalTimeMs = portIoOverheadMs + totalPlaneMs;
  const theoreticalFps = totalTimeMs > 0 ? 1000 / totalTimeMs : 0;
  const vsyncIntervals = Math.max(1, Math.ceil(totalTimeMs / VGA_VSYNC_MS));
  const vsyncLockedFps = 60 / vsyncIntervals;
  const vsyncFrameBudgetPct = (totalTimeMs / VGA_VSYNC_MS) * 100;
  const effectiveBandwidthMBps = TOTAL_PLANAR_BYTES / (totalTimeMs * 1000);

  return {
    profile,
    transferMode,
    totalRawBytes: TOTAL_PLANAR_BYTES,
    sourcePayloadBytes,
    totalTimeMs,
    theoreticalFps,
    vsyncLockedFps,
    vsyncFrameBudgetPct,
    effectiveBandwidthMBps,
    portIoOverheadMs,
    perPlane,
    cumulativePlaneEndMs,
  };
}

export interface VgaSweepProgress {
  active: boolean;
  planeIndex: number; // 0..3
  scanline: number; // 0..479 within active plane
  bytesWrittenTotal: number; // 0..153,600
  elapsedSimulatedMs: number;
}

/**
 * Helper to format byte offset inside 0xA000 segment
 */
export function formatVramOffset(scanline: number): string {
  const clamped = Math.max(0, Math.min(VGA_HEIGHT - 1, scanline));
  const offset = clamped * BYTES_PER_ROW;
  return `0xA000:${offset.toString(16).padStart(4, '0').toUpperCase()}`;
}
