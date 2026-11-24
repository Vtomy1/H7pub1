/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  CPU_HARDWARE_PROFILES,
  CpuProfileId,
  TransferMode,
  VgaSweepProgress,
  calculateVgaTimingMetrics,
  formatVramOffset,
  VGA_VSYNC_MS,
} from '../utils/vgaTiming';
import { BYTES_PER_PLANE, TOTAL_PLANAR_BYTES } from '../utils/planarVga';
import { VGA_HEIGHT } from '../utils/dithering';
import {
  Activity,
  Play,
  Pause,
  RotateCcw,
  Repeat,
  Gauge,
  Cpu,
  MonitorPlay,
  Zap,
} from 'lucide-react';

interface VgaTimingVisualizerProps {
  planes: [Uint8Array, Uint8Array, Uint8Array, Uint8Array] | null;
  isCustomPalette: boolean;
  onSweepProgressChange: (progress: VgaSweepProgress | null) => void;
}

type TimeScale = 1 | 0.1;

const PLANE_COLORS = [
  {
    name: 'P0 Blue',
    mask: '0x01',
    bar: 'bg-blue-500',
    glow: 'shadow-[0_0_10px_rgba(59,130,246,0.6)]',
    text: 'text-blue-400',
    badge: 'bg-blue-500/15 border-blue-500/40 text-blue-300',
  },
  {
    name: 'P1 Green',
    mask: '0x02',
    bar: 'bg-emerald-500',
    glow: 'shadow-[0_0_10px_rgba(16,185,129,0.6)]',
    text: 'text-emerald-400',
    badge: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300',
  },
  {
    name: 'P2 Red',
    mask: '0x04',
    bar: 'bg-rose-500',
    glow: 'shadow-[0_0_10px_rgba(244,63,94,0.6)]',
    text: 'text-rose-400',
    badge: 'bg-rose-500/15 border-rose-500/40 text-rose-300',
  },
  {
    name: 'P3 Intensity',
    mask: '0x08',
    bar: 'bg-amber-400',
    glow: 'shadow-[0_0_10px_rgba(251,191,36,0.6)]',
    text: 'text-amber-300',
    badge: 'bg-amber-500/15 border-amber-500/40 text-amber-300',
  },
];

export const VgaTimingVisualizer: React.FC<VgaTimingVisualizerProps> = ({
  planes,
  isCustomPalette,
  onSweepProgressChange,
}) => {
  const [cpuId, setCpuId] = useState<CpuProfileId>('8088-477');
  const [transferMode, setTransferMode] = useState<TransferMode>('rle-com');
  const [timeScale, setTimeScale] = useState<TimeScale>(1);
  const [loopPlayback, setLoopPlayback] = useState<boolean>(false);
  const [syncToCrt, setSyncToCrt] = useState<boolean>(true);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [progressFraction, setProgressFraction] = useState<number>(1); // 0..1 across 153,600 bytes

  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number | null>(null);
  const progressRef = useRef<number>(1);

  const selectedProfile = useMemo(
    () => CPU_HARDWARE_PROFILES.find((p) => p.id === cpuId) || CPU_HARDWARE_PROFILES[0],
    [cpuId]
  );

  const metrics = useMemo(() => {
    if (!planes) return null;
    return calculateVgaTimingMetrics(planes, selectedProfile, transferMode, isCustomPalette);
  }, [planes, selectedProfile, transferMode, isCustomPalette]);

  // Convert overall 0..1 progress fraction into plane + scanline state using exact per-plane timings
  const computeSweepState = useCallback(
    (fraction: number, active: boolean): VgaSweepProgress => {
      const clamped = Math.max(0, Math.min(1, fraction));
      if (!metrics) {
        return {
          active,
          planeIndex: 3,
          scanline: VGA_HEIGHT - 1,
          bytesWrittenTotal: Math.round(clamped * TOTAL_PLANAR_BYTES),
          elapsedSimulatedMs: 0,
        };
      }

      const simMs = clamped * metrics.totalTimeMs;
      const ends = metrics.cumulativePlaneEndMs;
      const ioStart = metrics.portIoOverheadMs;

      if (simMs <= ioStart) {
        return {
          active,
          planeIndex: 0,
          scanline: 0,
          bytesWrittenTotal: 0,
          elapsedSimulatedMs: simMs,
        };
      }

      let planeIdx = 0;
      for (let p = 0; p < 4; p++) {
        if (simMs <= ends[p] || p === 3) {
          planeIdx = p;
          break;
        }
      }

      const planeStart = planeIdx === 0 ? ioStart : ends[planeIdx - 1];
      const planeDuration = Math.max(0.0001, metrics.perPlane[planeIdx].transferMs);
      const planeFrac = Math.max(0, Math.min(1, (simMs - planeStart) / planeDuration));

      const scanline = Math.min(VGA_HEIGHT - 1, Math.floor(planeFrac * VGA_HEIGHT));
      const bytesInPlane = Math.round(planeFrac * BYTES_PER_PLANE);
      const bytesWrittenTotal = planeIdx * BYTES_PER_PLANE + bytesInPlane;

      return {
        active,
        planeIndex: planeIdx,
        scanline,
        bytesWrittenTotal,
        elapsedSimulatedMs: simMs,
      };
    },
    [metrics]
  );

  // Sync CRT overlay whenever sweep state updates
  useEffect(() => {
    if (!syncToCrt || (!isPlaying && progressFraction >= 0.9999)) {
      onSweepProgressChange(null);
      return;
    }
    onSweepProgressChange(computeSweepState(progressFraction, true));
  }, [progressFraction, isPlaying, syncToCrt, computeSweepState, onSweepProgressChange]);

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      onSweepProgressChange(null);
    };
  }, [onSweepProgressChange]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying || !metrics) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastTickRef.current = null;
      return;
    }

    const step = (timestamp: number) => {
      if (lastTickRef.current === null) {
        lastTickRef.current = timestamp;
      }
      const dtMs = timestamp - lastTickRef.current;
      lastTickRef.current = timestamp;

      // Advance simulated transfer time scaled by timeScale
      const simDeltaMs = dtMs * timeScale;
      const fracDelta = simDeltaMs / Math.max(0.5, metrics.totalTimeMs);

      let next = progressRef.current + fracDelta;
      if (next >= 1) {
        if (loopPlayback) {
          next = next % 1;
        } else {
          next = 1;
          progressRef.current = 1;
          setProgressFraction(1);
          setIsPlaying(false);
          return;
        }
      }

      progressRef.current = next;
      setProgressFraction(next);
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPlaying, metrics, timeScale, loopPlayback]);

  const handlePlayPause = () => {
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      if (progressFraction >= 0.999) {
        progressRef.current = 0;
        setProgressFraction(0);
      }
      // If user hits play on a very fast CPU (e.g. 486/Pentium < 18ms) in single-shot 1x mode,
      // auto-suggest or keep 1x if looping, otherwise 0.1x makes the sweep visible to human eye
      setIsPlaying(true);
    }
  };

  const handleReset = () => {
    setIsPlaying(false);
    progressRef.current = 1;
    setProgressFraction(1);
    onSweepProgressChange(null);
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setIsPlaying(false);
    progressRef.current = val;
    setProgressFraction(val);
  };

  if (!planes || !metrics) return null;

  const sweepState = computeSweepState(progressFraction, isPlaying);
  const activePlaneMeta = PLANE_COLORS[sweepState.planeIndex];

  // Frame-rate meter scaling (0 to 120 FPS logarithmic-friendly visual bar, with 60Hz marker at 66.7%)
  const cappedFpsForMeter = Math.min(120, metrics.theoreticalFps);
  const fpsMeterPct =
    cappedFpsForMeter <= 60
      ? (cappedFpsForMeter / 60) * 66.67
      : 66.67 + ((cappedFpsForMeter - 60) / 60) * 33.33;

  const vsyncOk = metrics.totalTimeMs <= VGA_VSYNC_MS;
  const vsyncFramesNeeded = metrics.totalTimeMs / VGA_VSYNC_MS;

  return (
    <div
      id="vga-timing-visualizer"
      className="bg-[#111620] border border-[#1e293b] rounded-xl p-4 flex flex-col gap-4"
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-semibold text-slate-200">
            VGA Timing &amp; Latency Visualizer
          </span>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
            0xA000 • 153,600 B
          </span>
        </div>

        {/* Transfer Method Toggle */}
        <div className="flex items-center bg-[#0a0e14] p-0.5 rounded-lg border border-[#1e2736] text-[11px] font-mono">
          <button
            id="timing-mode-rle"
            onClick={() => setTransferMode('rle-com')}
            className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
              transferMode === 'rle-com'
                ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Uses actual .COM RLE stream (REP MOVSB + REP STOSB)"
          >
            .COM RLE ({(metrics.sourcePayloadBytes / 1024).toFixed(1)} KB)
          </button>
          <button
            id="timing-mode-raw"
            onClick={() => setTransferMode('raw-planar')}
            className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
              transferMode === 'raw-planar'
                ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Uncompressed 153,600 byte REP MOVSB transfer"
          >
            Raw 153.6 KB
          </button>
        </div>
      </div>

      {/* CPU / Video Bus Hardware Selector */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400 flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-blue-400" />
            <span>Target CPU &amp; Bus Architecture</span>
          </span>
          <span className="font-mono text-[11px] text-slate-400">
            {selectedProfile.busName} • {selectedProfile.vramWriteMBps} MB/s bus
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
          {CPU_HARDWARE_PROFILES.map((prof) => {
            const isSelected = prof.id === cpuId;
            return (
              <button
                key={prof.id}
                id={`cpu-profile-${prof.id}`}
                onClick={() => {
                  setCpuId(prof.id);
                  if (prof.vramWriteMBps >= 10 && timeScale === 1 && !loopPlayback) {
                    setTimeScale(0.1);
                  }
                }}
                className={`flex flex-col text-left px-2.5 py-2 rounded-lg border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-blue-600/20 border-blue-500 text-white ring-1 ring-blue-500/40'
                    : 'bg-[#151c28] border-[#222e42] text-slate-300 hover:bg-[#1c2637]'
                }`}
              >
                <span className="font-mono text-[11px] font-bold leading-tight truncate">
                  {prof.shortName}
                </span>
                <span className="text-[10px] text-slate-400 truncate mt-0.5">
                  {prof.vramWriteMBps} MB/s
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Frame-Rate Meter & Latency Telemetry Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Frame-Rate Meter Card */}
        <div className="bg-[#0b0f17] border border-[#1a2333] rounded-lg p-3 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-cyan-400" />
              <span>Frame-Rate Meter</span>
            </span>
            <div className="flex items-baseline gap-1.5 font-mono">
              <span
                id="vga-fps-value"
                className={`text-base font-bold ${
                  vsyncOk
                    ? 'text-emerald-400'
                    : metrics.theoreticalFps >= 15
                    ? 'text-amber-400'
                    : 'text-rose-400'
                }`}
              >
                {metrics.theoreticalFps >= 100
                  ? Math.round(metrics.theoreticalFps)
                  : metrics.theoreticalFps.toFixed(1)}
              </span>
              <span className="text-[11px] text-slate-400">FPS (Bus Max)</span>
            </div>
          </div>

          {/* Segmented FPS Bar with 60Hz V-Sync Threshold Line */}
          <div className="relative h-5 bg-[#121925] rounded border border-[#1f2b3e] overflow-hidden">
            {/* Fill */}
            <div
              className={`h-full transition-all duration-300 ${
                vsyncOk
                  ? 'bg-gradient-to-r from-emerald-600 via-emerald-500 to-cyan-400'
                  : metrics.theoreticalFps >= 15
                  ? 'bg-gradient-to-r from-amber-600 to-amber-400'
                  : 'bg-gradient-to-r from-rose-600 to-amber-500'
              }`}
              style={{ width: `${Math.max(2, fpsMeterPct)}%` }}
            />
            {/* 60 Hz V-Sync Marker at 66.67% */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white/80 z-10"
              style={{ left: '66.67%' }}
              title="60 Hz Mode 12h V-Sync Target (16.67 ms)"
            />
            <span
              className="absolute top-0.5 text-[9px] font-mono text-white/90 bg-black/60 px-1 rounded pointer-events-none"
              style={{ left: 'calc(66.67% + 4px)' }}
            >
              60Hz
            </span>
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>
              V-Sync Locked:{' '}
              <strong className="text-slate-200">{metrics.vsyncLockedFps.toFixed(1)} Hz</strong>
            </span>
            <span>
              {vsyncOk ? (
                <span className="text-emerald-400">Single V-Blank (Tear-Free)</span>
              ) : (
                <span className="text-amber-400">
                  Spans {vsyncFramesNeeded.toFixed(1)} V-Blanks
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Bus Latency & Overhead Card */}
        <div className="bg-[#0b0f17] border border-[#1a2333] rounded-lg p-3 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>0xA000 Push Latency</span>
            </span>
            <div className="flex items-baseline gap-1.5 font-mono">
              <span id="vga-latency-ms" className="text-base font-bold text-white">
                {metrics.totalTimeMs >= 100
                  ? metrics.totalTimeMs.toFixed(0)
                  : metrics.totalTimeMs.toFixed(1)}
              </span>
              <span className="text-[11px] text-slate-400">ms / frame</span>
            </div>
          </div>

          {/* 16.67 ms Frame Budget Bar */}
          <div className="flex flex-col gap-1">
            <div className="h-5 bg-[#121925] rounded border border-[#1f2b3e] overflow-hidden relative flex items-center">
              <div
                className={`h-full transition-all duration-300 ${
                  vsyncOk ? 'bg-emerald-500/80' : 'bg-rose-500/75'
                }`}
                style={{ width: `${Math.min(100, metrics.vsyncFrameBudgetPct)}%` }}
              />
              <span className="absolute inset-0 flex items-center justify-between px-2 text-[10px] font-mono text-slate-200">
                <span>16.67ms V-Sync Budget</span>
                <span>{Math.round(metrics.vsyncFrameBudgetPct)}%</span>
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>
              Eff. Rate:{' '}
              <strong className="text-cyan-300">
                {metrics.effectiveBandwidthMBps.toFixed(2)} MB/s
              </strong>
            </span>
            <span>
              Port I/O: <strong className="text-slate-200">{metrics.portIoOverheadMs.toFixed(2)} ms</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Simulated Scanline Progress Bar & 4-Plane Raster Sweep */}
      <div className="bg-[#0b0f17] border border-[#1a2333] rounded-lg p-3.5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              id="vga-sweep-play-btn"
              onClick={handlePlayPause}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                isPlaying
                  ? 'bg-amber-500/20 border border-amber-500/50 text-amber-300 hover:bg-amber-500/30'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
              }`}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isPlaying ? 'Pause Sweep' : 'Simulate Scanline Push'}</span>
            </button>

            <button
              id="vga-sweep-reset-btn"
              onClick={handleReset}
              className="p-1.5 rounded-lg bg-[#151c28] hover:bg-[#1e2839] border border-[#243147] text-slate-300 transition-colors cursor-pointer"
              title="Reset to complete frame"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Playback Options: Time Scale, Loop, CRT Sync */}
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
            <button
              id="vga-speed-1x"
              onClick={() => setTimeScale(1)}
              className={`px-2 py-1 rounded border transition-colors cursor-pointer ${
                timeScale === 1
                  ? 'bg-blue-600/25 border-blue-500/60 text-blue-300'
                  : 'bg-[#141b26] border-[#222d40] text-slate-400 hover:text-slate-200'
              }`}
              title="Real-time simulated speed"
            >
              1× Real
            </button>
            <button
              id="vga-speed-01x"
              onClick={() => setTimeScale(0.1)}
              className={`px-2 py-1 rounded border transition-colors cursor-pointer ${
                timeScale === 0.1
                  ? 'bg-blue-600/25 border-blue-500/60 text-blue-300'
                  : 'bg-[#141b26] border-[#222d40] text-slate-400 hover:text-slate-200'
              }`}
              title="10x slower inspection speed for fast buses"
            >
              0.1× Inspect
            </button>

            <button
              id="vga-sweep-loop-btn"
              onClick={() => setLoopPlayback(!loopPlayback)}
              className={`px-2 py-1 rounded border flex items-center gap-1 transition-colors cursor-pointer ${
                loopPlayback
                  ? 'bg-purple-600/25 border-purple-500/60 text-purple-300'
                  : 'bg-[#141b26] border-[#222d40] text-slate-400 hover:text-slate-200'
              }`}
            >
              <Repeat className="w-3 h-3" />
              <span>Loop</span>
            </button>

            <button
              id="vga-sweep-crt-sync-btn"
              onClick={() => setSyncToCrt(!syncToCrt)}
              className={`px-2 py-1 rounded border flex items-center gap-1 transition-colors cursor-pointer ${
                syncToCrt
                  ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300'
                  : 'bg-[#141b26] border-[#222d40] text-slate-400 hover:text-slate-200'
              }`}
              title="Render progressive 4-plane scanline sweep live on the CRT monitor above"
            >
              <MonitorPlay className="w-3 h-3" />
              <span>CRT Sweep</span>
            </button>
          </div>
        </div>

        {/* 4-Plane Segmented 153,600-Byte Progress Bar */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11px] font-mono">
            <div className="flex items-center gap-2">
              <span className={`px-1.5 py-0.5 rounded border text-[10px] ${activePlaneMeta.badge}`}>
                {activePlaneMeta.name} • Port 03C5h={activePlaneMeta.mask}
              </span>
              <span className="text-slate-300">
                Scanline{' '}
                <strong className="text-white">
                  {(sweepState.scanline + 1).toString().padStart(3, '0')}
                </strong>
                /480
              </span>
            </div>
            <span className="text-slate-400">
              <strong className="text-slate-200">
                {sweepState.bytesWrittenTotal.toLocaleString()}
              </strong>{' '}
              / 153,600 B
            </span>
          </div>

          {/* 4-Segment Planar Bar */}
          <div className="grid grid-cols-4 gap-1 h-4 bg-[#070a10] p-0.5 rounded-md border border-[#1d283b]">
            {[0, 1, 2, 3].map((pIdx) => {
              const pStartByte = pIdx * BYTES_PER_PLANE;
              const pBytesDone = Math.max(
                0,
                Math.min(BYTES_PER_PLANE, sweepState.bytesWrittenTotal - pStartByte)
              );
              const pct = (pBytesDone / BYTES_PER_PLANE) * 100;
              const pMeta = PLANE_COLORS[pIdx];
              const isActivePlane = sweepState.planeIndex === pIdx && progressFraction < 1;

              return (
                <div
                  key={pIdx}
                  className="relative h-full bg-[#131a26] rounded-sm overflow-hidden"
                  title={`${pMeta.name}: ${pBytesDone.toLocaleString()} / 38,400 B (${metrics.perPlane[pIdx].transferMs.toFixed(1)} ms)`}
                >
                  <div
                    className={`h-full ${pMeta.bar} ${
                      isActivePlane ? pMeta.glow : 'opacity-85'
                    } transition-none`}
                    style={{ width: `${pct}%` }}
                  />
                  <span className="absolute inset-0 flex items-center justify-center text-[9px] font-mono font-bold text-white/90 drop-shadow">
                    P{pIdx} ({Math.round(pct)}%)
                  </span>
                </div>
              );
            })}
          </div>

          {/* Active Scanline Fine Raster Track + Scrub Slider */}
          <div className="flex items-center gap-3 pt-1">
            <span className="text-[10px] font-mono text-slate-400 whitespace-nowrap">
              {formatVramOffset(sweepState.scanline)}
            </span>
            <input
              id="vga-sweep-scrubber"
              type="range"
              min="0"
              max="1"
              step="0.001"
              value={progressFraction}
              onChange={handleScrub}
              className="w-full h-1.5 bg-[#1b2436] rounded-lg appearance-none cursor-pointer accent-emerald-400"
              title="Scrub across 153,600 bytes pushed to 0xA000"
            />
            <span className="text-[10px] font-mono text-emerald-400 whitespace-nowrap w-16 text-right">
              {sweepState.elapsedSimulatedMs.toFixed(1)} ms
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
