/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { VgaColor } from '../types';
import {
  rgbToDac,
  dacToRgb,
  STANDARD_VGA_16,
  GRAYSCALE_16,
} from '../utils/palette';
import { VGA_WIDTH, VGA_HEIGHT } from '../utils/dithering';
import {
  Palette,
  X,
  RotateCcw,
  Sparkles,
  Check,
  Sliders,
} from 'lucide-react';

interface CustomPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  activePalette: VgaColor[];
  previewRgbaBuffer: Uint8ClampedArray | null;
  initialColorIndex?: number;
  onPaletteChange: (updatedPalette: VgaColor[]) => void;
  onResetToMedianCut: () => void;
  onCancelRestore: (originalPalette: VgaColor[], originalTypeWasCustom: boolean) => void;
  wasCustomPaletteOnOpen: boolean;
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;

  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
    else if (max === gn) h = ((bn - rn) / d + 2) / 6;
    else h = ((rn - gn) / d + 4) / 6;
  }

  return { h: h * 360, s, v };
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rn = 0,
    gn = 0,
    bn = 0;

  if (h < 60) [rn, gn, bn] = [c, x, 0];
  else if (h < 120) [rn, gn, bn] = [x, c, 0];
  else if (h < 180) [rn, gn, bn] = [0, c, x];
  else if (h < 240) [rn, gn, bn] = [0, x, c];
  else if (h < 300) [rn, gn, bn] = [x, 0, c];
  else [rn, gn, bn] = [c, 0, x];

  return {
    r: Math.round((rn + m) * 255),
    g: Math.round((gn + m) * 255),
    b: Math.round((bn + m) * 255),
  };
}

function toHexColor(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

export const CustomPaletteModal: React.FC<CustomPaletteModalProps> = ({
  isOpen,
  onClose,
  activePalette,
  previewRgbaBuffer,
  initialColorIndex = 0,
  onPaletteChange,
  onResetToMedianCut,
  onCancelRestore,
  wasCustomPaletteOnOpen,
}) => {
  const [selectedIdx, setSelectedIdx] = useState<number>(initialColorIndex);
  const [snapshotPalette, setSnapshotPalette] = useState<VgaColor[]>([]);
  const [snapshotWasCustom, setSnapshotWasCustom] = useState<boolean>(wasCustomPaletteOnOpen);

  const svPadRef = useRef<HTMLDivElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDraggingSvRef = useRef<boolean>(false);

  // Local HSV state so dragging on pure white/black preserves hue smoothly
  const currentColor = activePalette[selectedIdx] || STANDARD_VGA_16[0];
  const [hsv, setHsv] = useState<{ h: number; s: number; v: number }>(() =>
    rgbToHsv(currentColor.r, currentColor.g, currentColor.b)
  );

  // Capture snapshot whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedIdx(initialColorIndex);
      setSnapshotPalette(activePalette.map((c) => ({ ...c })));
      setSnapshotWasCustom(wasCustomPaletteOnOpen);
      const c = activePalette[initialColorIndex] || STANDARD_VGA_16[0];
      setHsv(rgbToHsv(c.r, c.g, c.b));
    }
    // Only capture snapshot when modal transitions to open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialColorIndex]);

  // Sync HSV when switching register slot
  const handleSelectSlot = (idx: number) => {
    setSelectedIdx(idx);
    const c = activePalette[idx];
    if (c) {
      setHsv(rgbToHsv(c.r, c.g, c.b));
    }
  };

  // Render live 640x480 preview inside modal canvas
  useEffect(() => {
    if (!isOpen || !previewRgbaBuffer || !previewCanvasRef.current) return;
    const canvas = previewCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imgData = ctx.createImageData(VGA_WIDTH, VGA_HEIGHT);
    imgData.data.set(previewRgbaBuffer);
    ctx.putImageData(imgData, 0, 0);
  }, [isOpen, previewRgbaBuffer]);

  // Escape key closes modal safely
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const updateSelectedColorRgb = useCallback(
    (r: number, g: number, b: number, syncHsv: boolean = true) => {
      const clampedR = Math.max(0, Math.min(255, Math.round(r)));
      const clampedG = Math.max(0, Math.min(255, Math.round(g)));
      const clampedB = Math.max(0, Math.min(255, Math.round(b)));

      const dacR = rgbToDac(clampedR);
      const dacG = rgbToDac(clampedG);
      const dacB = rgbToDac(clampedB);

      const nextPalette = activePalette.map((col, idx) => {
        if (idx !== selectedIdx) return col;
        return {
          ...col,
          name: `DAC #${idx}`,
          r: dacToRgb(dacR),
          g: dacToRgb(dacG),
          b: dacToRgb(dacB),
          dacR,
          dacG,
          dacB,
        };
      });

      if (syncHsv) {
        setHsv(rgbToHsv(clampedR, clampedG, clampedB));
      }
      onPaletteChange(nextPalette);
    },
    [activePalette, selectedIdx, onPaletteChange]
  );

  const updateSelectedColorDac = (dacR: number, dacG: number, dacB: number) => {
    const cr = Math.max(0, Math.min(63, Math.round(dacR)));
    const cg = Math.max(0, Math.min(63, Math.round(dacG)));
    const cb = Math.max(0, Math.min(63, Math.round(dacB)));
    const r = dacToRgb(cr);
    const g = dacToRgb(cg);
    const b = dacToRgb(cb);

    const nextPalette = activePalette.map((col, idx) => {
      if (idx !== selectedIdx) return col;
      return {
        ...col,
        name: `DAC #${idx}`,
        r,
        g,
        b,
        dacR: cr,
        dacG: cg,
        dacB: cb,
      };
    });

    setHsv(rgbToHsv(r, g, b));
    onPaletteChange(nextPalette);
  };

  // Interactive 2D Saturation / Value picker handlers
  const handleSvPointer = useCallback(
    (clientX: number, clientY: number) => {
      const pad = svPadRef.current;
      if (!pad) return;
      const rect = pad.getBoundingClientRect();
      const s = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const v = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
      const nextHsv = { h: hsv.h, s, v };
      setHsv(nextHsv);
      const { r, g, b } = hsvToRgb(nextHsv.h, nextHsv.s, nextHsv.v);
      updateSelectedColorRgb(r, g, b, false);
    },
    [hsv.h, updateSelectedColorRgb]
  );

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (isDraggingSvRef.current) {
        handleSvPointer(e.clientX, e.clientY);
      }
    };
    const handlePointerUp = () => {
      isDraggingSvRef.current = false;
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [handleSvPointer]);

  if (!isOpen) return null;

  const currentHex = toHexColor(currentColor.r, currentColor.g, currentColor.b);

  return (
    <div
      id="custom-palette-modal-backdrop"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="custom-palette-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="custom-palette-modal-title"
        className="bg-[#0e131c] border border-[#243247] rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Modal Header */}
        <div className="bg-[#0a0e15] border-b border-[#1c2637] px-5 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Palette className="w-4 h-4 text-amber-400" />
            <h2 id="custom-palette-modal-title" className="text-sm font-bold text-white">
              Custom VGA DAC Palette Editor (16 Registers • 18-Bit Color)
            </h2>
            <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/15 border border-amber-500/30 text-amber-300">
              PORT 0x3C8 / 0x3C9
            </span>
          </div>

          <button
            id="close-palette-modal-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1a2332] transition-colors cursor-pointer"
            aria-label="Close palette editor"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column: 16 VGA Registers + Live CRT Mini-Preview (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-200">
                  VGA Color Registers (00–15)
                </span>
                <span className="font-mono text-[11px] text-slate-400">
                  Click slot to edit
                </span>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {activePalette.map((col, idx) => {
                  const isSelected = idx === selectedIdx;
                  return (
                    <button
                      key={idx}
                      id={`palette-slot-${idx}`}
                      type="button"
                      onClick={() => handleSelectSlot(idx)}
                      className={`p-1.5 rounded-lg border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                        isSelected
                          ? 'bg-amber-500/15 border-amber-400 ring-1 ring-amber-400/50'
                          : 'bg-[#121925] border-[#1f2b3d] hover:border-slate-500'
                      }`}
                    >
                      <div
                        className="w-full h-6 rounded border border-white/20 shadow-inner"
                        style={{ backgroundColor: `rgb(${col.r}, ${col.g}, ${col.b})` }}
                      />
                      <div className="flex items-center justify-between font-mono text-[10px]">
                        <span className={isSelected ? 'text-amber-300 font-bold' : 'text-slate-300'}>
                          #{idx.toString().padStart(2, '0')}
                        </span>
                        <span className="text-slate-400 text-[9px]">
                          {col.dacR},{col.dacG},{col.dacB}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Live Quantized CRT Mini Preview */}
            <div className="bg-[#080b10] border border-[#1a2333] rounded-xl p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Live Mode 12h Preview
                </span>
                <span className="text-slate-400">640×480 Dithered</span>
              </div>
              <div className="w-full aspect-[4/3] bg-black rounded-lg overflow-hidden border border-[#1f293b]">
                <canvas
                  ref={previewCanvasRef}
                  width={VGA_WIDTH}
                  height={VGA_HEIGHT}
                  className="w-full h-full object-contain [image-rendering:pixelated]"
                />
              </div>
            </div>
          </div>

          {/* Right Column: Visual Color Picker + RGB & 6-bit DAC Controls (7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            {/* Active Register Header */}
            <div className="bg-[#121925] border border-[#1f2b3d] rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg border-2 border-white/30 shadow-md"
                  style={{
                    backgroundColor: `rgb(${currentColor.r}, ${currentColor.g}, ${currentColor.b})`,
                  }}
                />
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white font-mono">
                    Register #{selectedIdx.toString().padStart(2, '0')} ({currentHex})
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    8-bit RGB({currentColor.r}, {currentColor.g}, {currentColor.b}) • 6-bit DAC(
                    {currentColor.dacR}, {currentColor.dacG}, {currentColor.dacB})
                  </span>
                </div>
              </div>

              {/* Native Color Picker Button */}
              <label className="px-3 py-1.5 rounded-lg bg-[#182232] hover:bg-[#202d42] border border-[#2a3952] text-xs font-medium text-slate-200 flex items-center gap-2 cursor-pointer">
                <input
                  id="native-color-picker"
                  type="color"
                  value={currentHex}
                  onChange={(e) => {
                    const hex = e.target.value;
                    const r = parseInt(hex.slice(1, 3), 16);
                    const g = parseInt(hex.slice(3, 5), 16);
                    const b = parseInt(hex.slice(5, 7), 16);
                    updateSelectedColorRgb(r, g, b);
                  }}
                  className="w-5 h-5 rounded border-0 bg-transparent cursor-pointer p-0"
                />
                <span>OS Picker</span>
              </label>
            </div>

            {/* Interactive 2D Visual Color Picker (SV Pad + Hue Slider) */}
            <div className="bg-[#0b0f17] border border-[#1a2333] rounded-xl p-3.5 flex flex-col gap-3">
              <div
                ref={svPadRef}
                id="visual-sv-picker"
                onPointerDown={(e) => {
                  isDraggingSvRef.current = true;
                  handleSvPointer(e.clientX, e.clientY);
                }}
                className="relative w-full h-44 rounded-lg overflow-hidden cursor-crosshair border border-white/15 select-none touch-none"
                style={{
                  backgroundColor: `hsl(${hsv.h}, 100%, 50%)`,
                }}
              >
                {/* White -> Transparent horizontal saturation gradient */}
                <div className="absolute inset-0 bg-gradient-to-r from-white to-transparent pointer-events-none" />
                {/* Transparent -> Black vertical value gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent pointer-events-none" />
                {/* Picker Thumb */}
                <div
                  className="absolute w-4 h-4 -ml-2 -mt-2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.8)] pointer-events-none"
                  style={{
                    left: `${hsv.s * 100}%`,
                    top: `${(1 - hsv.v) * 100}%`,
                    backgroundColor: currentHex,
                  }}
                />
              </div>

              {/* Hue Spectrum Slider */}
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-mono text-slate-400 w-10">HUE</span>
                <input
                  id="palette-hue-slider"
                  type="range"
                  min="0"
                  max="359"
                  value={Math.round(hsv.h)}
                  onChange={(e) => {
                    const nextH = parseInt(e.target.value, 10);
                    const nextHsv = { ...hsv, h: nextH };
                    setHsv(nextHsv);
                    const { r, g, b } = hsvToRgb(nextHsv.h, nextHsv.s, nextHsv.v);
                    updateSelectedColorRgb(r, g, b, false);
                  }}
                  className="w-full h-3 rounded-lg appearance-none cursor-pointer"
                  style={{
                    background:
                      'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
                  }}
                />
                <span className="text-[11px] font-mono text-slate-300 w-9 text-right">
                  {Math.round(hsv.h)}°
                </span>
              </div>
            </div>

            {/* 8-bit RGB & 6-bit VGA DAC Channel Sliders */}
            <div className="bg-[#0b0f17] border border-[#1a2333] rounded-xl p-3.5 flex flex-col gap-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                  <span>6-Bit VGA DAC Registers (0–63) &amp; RGB (0–255)</span>
                </span>
              </div>

              {[
                {
                  key: 'r',
                  label: 'RED',
                  colorClass: 'text-rose-400',
                  accentClass: 'accent-rose-500',
                  rgbVal: currentColor.r,
                  dacVal: currentColor.dacR,
                  onDacChange: (v: number) =>
                    updateSelectedColorDac(v, currentColor.dacG, currentColor.dacB),
                },
                {
                  key: 'g',
                  label: 'GREEN',
                  colorClass: 'text-emerald-400',
                  accentClass: 'accent-emerald-500',
                  rgbVal: currentColor.g,
                  dacVal: currentColor.dacG,
                  onDacChange: (v: number) =>
                    updateSelectedColorDac(currentColor.dacR, v, currentColor.dacB),
                },
                {
                  key: 'b',
                  label: 'BLUE',
                  colorClass: 'text-blue-400',
                  accentClass: 'accent-blue-500',
                  rgbVal: currentColor.b,
                  dacVal: currentColor.dacB,
                  onDacChange: (v: number) =>
                    updateSelectedColorDac(currentColor.dacR, currentColor.dacG, v),
                },
              ].map((ch) => (
                <div key={ch.key} className="grid grid-cols-12 items-center gap-2 font-mono text-xs">
                  <span className={`col-span-2 font-bold ${ch.colorClass}`}>{ch.label}</span>
                  <input
                    id={`dac-slider-${ch.key}`}
                    type="range"
                    min="0"
                    max="63"
                    value={ch.dacVal}
                    onChange={(e) => ch.onDacChange(parseInt(e.target.value, 10))}
                    className={`col-span-6 h-1.5 bg-[#1b2436] rounded-lg appearance-none cursor-pointer ${ch.accentClass}`}
                  />
                  <div className="col-span-2 flex items-center justify-end gap-1">
                    <span className="text-[10px] text-slate-500">DAC</span>
                    <input
                      type="number"
                      min={0}
                      max={63}
                      value={ch.dacVal}
                      onChange={(e) => {
                        const parsed = parseInt(e.target.value || '0', 10);
                        ch.onDacChange(isNaN(parsed) ? 0 : parsed);
                      }}
                      className="w-11 px-1 py-0.5 rounded bg-[#131a26] border border-[#243248] text-white text-right text-[11px]"
                    />
                  </div>
                  <span className="col-span-2 text-right text-[11px] text-slate-400">
                    RGB:{ch.rgbVal}
                  </span>
                </div>
              ))}
            </div>

            {/* Quick Palette Preset Loaders */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <button
                id="palette-modal-median-cut"
                type="button"
                onClick={onResetToMedianCut}
                className="px-2.5 py-1.5 rounded-lg bg-[#151d2b] hover:bg-[#1d283b] border border-[#25334a] text-slate-300 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Auto Median-Cut</span>
              </button>
              <button
                id="palette-modal-standard-vga"
                type="button"
                onClick={() => onPaletteChange(STANDARD_VGA_16.map((c) => ({ ...c })))}
                className="px-2.5 py-1.5 rounded-lg bg-[#151d2b] hover:bg-[#1d283b] border border-[#25334a] text-slate-300 transition-colors cursor-pointer"
              >
                Load IBM VGA 16
              </button>
              <button
                id="palette-modal-grayscale"
                type="button"
                onClick={() => onPaletteChange(GRAYSCALE_16.map((c) => ({ ...c })))}
                className="px-2.5 py-1.5 rounded-lg bg-[#151d2b] hover:bg-[#1d283b] border border-[#25334a] text-slate-300 transition-colors cursor-pointer"
              >
                Load 16 Grayscale
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-[#0a0e15] border-t border-[#1c2637] px-5 py-3 flex flex-wrap items-center justify-between gap-3">
          <button
            id="palette-modal-revert-btn"
            type="button"
            onClick={() => {
              if (snapshotPalette.length === 16) {
                onCancelRestore(snapshotPalette, snapshotWasCustom);
              }
              onClose();
            }}
            className="px-3.5 py-2 rounded-lg bg-[#151d2b] hover:bg-[#1e293d] border border-[#26344b] text-xs font-medium text-slate-300 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Revert &amp; Close</span>
          </button>

          <button
            id="palette-modal-apply-btn"
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white flex items-center gap-1.5 shadow-lg shadow-emerald-950/40 transition-colors cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Apply Custom DAC Palette</span>
          </button>
        </div>
      </div>
    </div>
  );
};
