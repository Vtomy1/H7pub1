/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { ViewMode } from '../types';
import { BYTES_PER_PLANE, BYTES_PER_ROW, TOTAL_PLANAR_BYTES } from '../utils/planarVga';
import { VgaSweepProgress } from '../utils/vgaTiming';
import { Cpu, HardDrive, Layers, ArrowDown, Eye } from 'lucide-react';

interface VgaMemoryMapProps {
  planes: [Uint8Array, Uint8Array, Uint8Array, Uint8Array] | null;
  activeViewMode: ViewMode;
  onSelectPlaneView: (mode: ViewMode) => void;
  sweepProgress?: VgaSweepProgress | null;
}

const PLANE_CONFIG = [
  {
    index: 0,
    viewMode: 'plane-0' as ViewMode,
    label: 'Plane 0',
    channel: 'Blue (Bit 0)',
    maskHex: '0x01',
    baseText: 'text-blue-400',
    borderColor: 'border-blue-500/40',
    activeBorder: 'border-blue-400 ring-1 ring-blue-500/40',
    bgSoft: 'bg-blue-500/10',
    rgbCell: (alpha: number) => `rgba(59, 130, 246, ${alpha})`,
  },
  {
    index: 1,
    viewMode: 'plane-1' as ViewMode,
    label: 'Plane 1',
    channel: 'Green (Bit 1)',
    maskHex: '0x02',
    baseText: 'text-emerald-400',
    borderColor: 'border-emerald-500/40',
    activeBorder: 'border-emerald-400 ring-1 ring-emerald-500/40',
    bgSoft: 'bg-emerald-500/10',
    rgbCell: (alpha: number) => `rgba(16, 185, 129, ${alpha})`,
  },
  {
    index: 2,
    viewMode: 'plane-2' as ViewMode,
    label: 'Plane 2',
    channel: 'Red (Bit 2)',
    maskHex: '0x04',
    baseText: 'text-rose-400',
    borderColor: 'border-rose-500/40',
    activeBorder: 'border-rose-400 ring-1 ring-rose-500/40',
    bgSoft: 'bg-rose-500/10',
    rgbCell: (alpha: number) => `rgba(244, 63, 94, ${alpha})`,
  },
  {
    index: 3,
    viewMode: 'plane-3' as ViewMode,
    label: 'Plane 3',
    channel: 'Intensity (Bit 3)',
    maskHex: '0x08',
    baseText: 'text-amber-300',
    borderColor: 'border-amber-500/40',
    activeBorder: 'border-amber-400 ring-1 ring-amber-500/40',
    bgSoft: 'bg-amber-500/10',
    rgbCell: (alpha: number) => `rgba(251, 191, 36, ${alpha})`,
  },
];

const TOTAL_VRAM_BYTES = 262144; // 256 KB (4 x 64 KB planes)
const KB_PER_PLANE = 64; // 64 x 1,024-byte blocks per plane
const BYTES_PER_KB = 1024;
const ACTIVE_END_OFFSET = BYTES_PER_PLANE; // 38,400 = 0x9600

interface HoveredBlock {
  planeIdx: number;
  kbIndex: number; // 0..63
}

export const VgaMemoryMap: React.FC<VgaMemoryMapProps> = ({
  planes,
  activeViewMode,
  onSelectPlaneView,
  sweepProgress = null,
}) => {
  const [selectedPlane, setSelectedPlane] = useState<number>(0);
  const [hoveredBlock, setHoveredBlock] = useState<HoveredBlock | null>(null);

  // Precompute 64 1-KB block densities (0..1) per plane from actual planar bytes
  const planeBlockDensities = useMemo(() => {
    if (!planes) return null;

    return planes.map((plane) => {
      const densities = new Float32Array(KB_PER_PLANE);
      for (let kb = 0; kb < KB_PER_PLANE; kb++) {
        const start = kb * BYTES_PER_KB;
        const end = Math.min(BYTES_PER_PLANE, start + BYTES_PER_KB);
        if (start >= BYTES_PER_PLANE) {
          densities[kb] = -1; // Offscreen / unused region (0x9600..0xFFFF)
          continue;
        }
        let nonZeroOrSetBits = 0;
        let bitTotal = 0;
        for (let i = start; i < end; i++) {
          let val = plane[i];
          bitTotal += 8;
          while (val) {
            nonZeroOrSetBits += val & 1;
            val >>= 1;
          }
        }
        densities[kb] = bitTotal > 0 ? nonZeroOrSetBits / bitTotal : 0;
      }
      return densities;
    });
  }, [planes]);

  if (!planes || !planeBlockDensities) return null;

  // Determine inspected block (hovered or default start of selected plane)
  const inspected: HoveredBlock = hoveredBlock ?? {
    planeIdx: selectedPlane,
    kbIndex: 0,
  };
  const inspectedOffset = inspected.kbIndex * BYTES_PER_KB;
  const isInspectedActive = inspectedOffset < ACTIVE_END_OFFSET;
  const inspectedEndOffset = Math.min(inspectedOffset + BYTES_PER_KB - 1, 0xffff);
  const startRow = Math.floor(inspectedOffset / BYTES_PER_ROW);
  const endRow = Math.min(479, Math.floor((Math.min(inspectedEndOffset, ACTIVE_END_OFFSET - 1)) / BYTES_PER_ROW));
  const inspectedCpuPhys = (0xa0000 + inspectedOffset).toString(16).toUpperCase().padStart(5, '0');
  const inspectedSegOff = `0xA000:${inspectedOffset.toString(16).toUpperCase().padStart(4, '0')}`;
  const inspectedEndOff = `0xA000:${inspectedEndOffset.toString(16).toUpperCase().padStart(4, '0')}`;

  // Sample first 12 bytes from the inspected 1KB block if inside active VRAM
  const sampleBytesHex = isInspectedActive
    ? Array.from(
        planes[inspected.planeIdx].slice(
          inspectedOffset,
          Math.min(BYTES_PER_PLANE, inspectedOffset + 12)
        )
      )
        .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
        .join(' ')
    : 'FF FF FF FF (Unmapped / Offscreen Scratch)';

  const activeUtilizationPct = ((TOTAL_PLANAR_BYTES / TOTAL_VRAM_BYTES) * 100).toFixed(1);
  const activeSweepKb =
    sweepProgress && sweepProgress.planeIndex >= 0
      ? Math.floor((sweepProgress.scanline * BYTES_PER_ROW) / BYTES_PER_KB)
      : -1;

  return (
    <section
      id="vga-memory-map"
      className="bg-[#111620] border border-[#1e293b] rounded-xl p-4 sm:p-5 flex flex-col gap-4 w-full"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <HardDrive className="w-4 h-4 text-cyan-400" />
          <h2 className="text-sm font-semibold text-slate-100">
            VGA 256 KB VRAM &amp; 0xA000 Physical Memory Map
          </h2>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/10 border border-cyan-500/30 text-cyan-300">
            64 KB APERTURE → 4 × 64 KB PLANES
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-slate-400">
          <span>
            Active Mode 12h: <strong className="text-emerald-400">153,600 B</strong> ({activeUtilizationPct}%)
          </span>
          <span>•</span>
          <span>
            Free / Offscreen: <strong className="text-slate-300">108,544 B</strong>
          </span>
        </div>
      </div>

      {/* 1. Real-Mode CPU 128 KB Video Address Space (0xA0000 - 0xBFFFF) */}
      <div className="bg-[#0b0f17] border border-[#1a2333] rounded-lg p-3.5 flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5 font-medium text-slate-300">
            <Cpu className="w-3.5 h-3.5 text-emerald-400" />
            <span>x86 Real-Mode CPU Video Aperture (0xA0000–0xBFFFF • 128 KB)</span>
          </div>
          <span className="font-mono text-[11px] text-cyan-300">
            Segment 0xA000 Window Highlighted
          </span>
        </div>

        {/* 128 KB Real-Mode Memory Bar: 64KB A000 | 32KB B000 | 32KB B800 */}
        <div className="grid grid-cols-12 gap-1.5 items-stretch">
          {/* 0xA000 Segment (64 KB = 6/12 cols) */}
          <div className="col-span-12 sm:col-span-6 rounded-lg border-2 border-cyan-400/80 bg-cyan-950/25 p-2 flex flex-col gap-1.5 shadow-[0_0_20px_rgba(34,211,238,0.12)]">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="font-bold text-cyan-300">SEG 0xA000 (0xA0000–0xAFFFF)</span>
              <span className="text-cyan-200 font-semibold">64 KB ACTIVE</span>
            </div>

            {/* Sub-bar showing 38.4 KB Active Scanline Window vs 27.1 KB Unused */}
            <div className="h-5 rounded bg-[#080d14] border border-cyan-500/30 overflow-hidden flex">
              <div
                className="h-full bg-gradient-to-r from-cyan-500/70 to-emerald-500/70 flex items-center justify-center text-[10px] font-mono font-bold text-white"
                style={{ width: '58.6%' }}
                title="0xA000:0000 - 0xA000:95FF (38,400 B active per plane)"
              >
                0000–95FF (38.4 KB)
              </div>
              <div
                className="h-full bg-[#131b26] flex items-center justify-center text-[10px] font-mono text-slate-400 border-l border-cyan-500/30"
                style={{ width: '41.4%' }}
                title="0xA000:9600 - 0xA000:FFFF (27,136 B offscreen per plane)"
              >
                9600–FFFF (Free)
              </div>
            </div>
          </div>

          {/* 0xB000 Segment (32 KB = 3/12 cols) */}
          <div className="col-span-6 sm:col-span-3 rounded-lg border border-[#222d40] bg-[#0e131d] p-2 flex flex-col justify-between opacity-65">
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
              <span>SEG 0xB000</span>
              <span>32 KB</span>
            </div>
            <div className="h-5 rounded bg-[#141b27] border border-[#1f293b] flex items-center justify-center text-[10px] font-mono text-slate-500">
              MDA Mono (Inactive)
            </div>
          </div>

          {/* 0xB800 Segment (32 KB = 3/12 cols) */}
          <div className="col-span-6 sm:col-span-3 rounded-lg border border-[#222d40] bg-[#0e131d] p-2 flex flex-col justify-between opacity-65">
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
              <span>SEG 0xB800</span>
              <span>32 KB</span>
            </div>
            <div className="h-5 rounded bg-[#141b27] border border-[#1f293b] flex items-center justify-center text-[10px] font-mono text-slate-500">
              Text Mode 03h (Exit)
            </div>
          </div>
        </div>

        {/* Bus Routing Bridge Indicator */}
        <div className="flex flex-wrap items-center justify-center gap-2 pt-0.5 text-[11px] font-mono text-cyan-300/90">
          <ArrowDown className="w-3.5 h-3.5 text-cyan-400" />
          <span>
            Sequencer Map Mask (<code className="text-white">Port 0x3C4 Index 02h → 0x3C5</code>) routes{' '}
            <code className="text-cyan-300">0xA000:0000..95FF</code> across 4 parallel 64 KB VRAM banks
          </span>
        </div>
      </div>

      {/* 2. Physical 256 KB VGA VRAM (4 x 64 KB Planes, 1 KB per cell) */}
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-slate-300 font-medium flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-blue-400" />
            <span>Physical 256 KB VGA Memory Banks (64 × 1 KB blocks per plane)</span>
          </span>
          <span className="font-mono text-[11px] text-slate-400">
            Hover or click any 1 KB block to inspect physical address &amp; live planar hex
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2.5">
          {PLANE_CONFIG.map((cfg) => {
            const densities = planeBlockDensities[cfg.index];
            const isCrtInspecting = activeViewMode === cfg.viewMode;
            const isSweepWritingPlane = sweepProgress?.planeIndex === cfg.index;

            return (
              <div
                key={cfg.index}
                className={`rounded-lg border p-2.5 bg-[#0b0f17] transition-all ${
                  isSweepWritingPlane
                    ? cfg.activeBorder
                    : isCrtInspecting
                    ? cfg.activeBorder
                    : 'border-[#1b2434]'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <button
                      id={`vram-select-plane-${cfg.index}`}
                      onClick={() => {
                        setSelectedPlane(cfg.index);
                        onSelectPlaneView(cfg.viewMode);
                      }}
                      className={`px-2 py-0.5 rounded border text-[11px] font-mono font-bold transition-colors cursor-pointer ${cfg.bgSoft} ${cfg.borderColor} ${cfg.baseText} hover:brightness-125`}
                      title="Focus this plane on CRT Display"
                    >
                      {cfg.label}: {cfg.channel}
                    </button>
                    <span className="text-[11px] font-mono text-slate-400">
                      Mask: <strong className="text-slate-200">{cfg.maskHex}</strong>
                    </span>
                    <span className="hidden sm:inline text-[11px] font-mono text-slate-500">
                      • 0x0000–0x95FF Active (38,400 B)
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
                    {isSweepWritingPlane && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 animate-pulse">
                        WRITING @ LINE {(sweepProgress!.scanline + 1).toString().padStart(3, '0')}
                      </span>
                    )}
                    <span>64 KB Bank #{cfg.index}</span>
                  </div>
                </div>

                {/* 64 x 1 KB Blocks Grid (32 columns on md, 64 on xl) */}
                <div className="grid grid-cols-16 sm:grid-cols-32 gap-[2px]">
                  {Array.from({ length: KB_PER_PLANE }).map((_, kbIdx) => {
                    const density = densities[kbIdx];
                    const isUsed = density >= 0;
                    const isBoundaryBlock = kbIdx === 37; // 0x9400..0x95FF (512B used)
                    const isHovered =
                      inspected.planeIdx === cfg.index && inspected.kbIndex === kbIdx;
                    const isLiveCursor =
                      isSweepWritingPlane && activeSweepKb === kbIdx;

                    // Map bit density (0..1) to crisp visibility alpha
                    const alpha = isUsed ? Math.max(0.22, Math.min(0.95, 0.22 + density * 0.78)) : 0;

                    return (
                      <button
                        key={kbIdx}
                        type="button"
                        onMouseEnter={() => setHoveredBlock({ planeIdx: cfg.index, kbIndex: kbIdx })}
                        onClick={() => {
                          setSelectedPlane(cfg.index);
                          setHoveredBlock({ planeIdx: cfg.index, kbIndex: kbIdx });
                        }}
                        className={`h-4 rounded-[2px] border transition-transform cursor-pointer relative ${
                          isLiveCursor
                            ? 'border-white scale-110 z-10 ring-1 ring-white'
                            : isHovered
                            ? 'border-white/90 scale-110 z-10'
                            : isUsed
                            ? 'border-white/10'
                            : 'border-[#1d2636] bg-[#10151f]'
                        }`}
                        style={{
                          backgroundColor: isUsed ? cfg.rgbCell(alpha) : undefined,
                          backgroundImage: !isUsed
                            ? 'repeating-linear-gradient(45deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 2px, transparent 2px, transparent 5px)'
                            : isBoundaryBlock
                            ? 'linear-gradient(90deg, transparent 50%, rgba(16,21,31,0.85) 50%)'
                            : undefined,
                        }}
                        title={`Plane ${cfg.index} | 0xA000:${(kbIdx * 1024)
                          .toString(16)
                          .toUpperCase()
                          .padStart(4, '0')} (${isUsed ? `Density ${Math.round(density * 100)}%` : 'Free Offscreen'})`}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Live Address & Hex Mapping Inspector Bar */}
      <div className="bg-[#080b10] border border-[#1a2333] rounded-lg px-3.5 py-2.5 flex flex-col lg:flex-row lg:items-center justify-between gap-2 text-xs font-mono">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <div className="flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-slate-400">BLOCK:</span>
            <span className={`font-bold ${PLANE_CONFIG[inspected.planeIdx].baseText}`}>
              P{inspected.planeIdx} KB#{inspected.kbIndex.toString().padStart(2, '0')}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">CPU:</span>
            <span className="text-cyan-300 font-semibold">
              {inspectedSegOff}–{inspectedEndOff.slice(7)}
            </span>
            <span className="text-slate-500">(Phys 0x{inspectedCpuPhys})</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">RASTER:</span>
            <span className="text-slate-200">
              {isInspectedActive ? `Lines ${startRow}–${endRow}` : 'Offscreen VRAM (Unused)'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] overflow-x-auto">
          <span className="text-slate-500">BYTES:</span>
          <span className="text-emerald-400 whitespace-nowrap">{sampleBytesHex}</span>
        </div>
      </div>
    </section>
  );
};
