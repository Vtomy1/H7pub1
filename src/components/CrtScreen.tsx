/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useState } from 'react';
import { ViewMode, VgaColor } from '../types';
import { VGA_WIDTH, VGA_HEIGHT } from '../utils/dithering';
import { renderSinglePlaneToRgba, renderPlanesSplitToRgba } from '../utils/planarVga';
import { Eye, ZoomIn, ZoomOut, Monitor, Maximize2, Sparkles, Layers } from 'lucide-react';

interface CrtScreenProps {
  rgbaBuffer: Uint8ClampedArray | null;
  indexedPixels: Uint8Array | null;
  planes: [Uint8Array, Uint8Array, Uint8Array, Uint8Array] | null;
  palette: VgaColor[];
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

export const CrtScreen: React.FC<CrtScreenProps> = ({
  rgbaBuffer,
  indexedPixels,
  planes,
  palette,
  viewMode,
  onViewModeChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [crtEffect, setCrtEffect] = useState<boolean>(true);
  const [scanlines, setScanlines] = useState<boolean>(true);
  const [curvature, setCurvature] = useState<boolean>(true);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [hoveredPixel, setHoveredPixel] = useState<{
    x: number;
    y: number;
    colorIdx: number;
    color: VgaColor | null;
    bits: [number, number, number, number];
  } | null>(null);

  // Render to canvas whenever buffers change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !rgbaBuffer) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let targetBuffer: Uint8ClampedArray;

    if (viewMode === 'composite' || !planes) {
      targetBuffer = rgbaBuffer;
    } else if (viewMode === 'planes-split') {
      targetBuffer = renderPlanesSplitToRgba(planes, palette);
    } else if (viewMode === 'plane-0') {
      targetBuffer = renderSinglePlaneToRgba(planes[0], 90, 160, 255);
    } else if (viewMode === 'plane-1') {
      targetBuffer = renderSinglePlaneToRgba(planes[1], 80, 255, 120);
    } else if (viewMode === 'plane-2') {
      targetBuffer = renderSinglePlaneToRgba(planes[2], 255, 90, 90);
    } else if (viewMode === 'plane-3') {
      targetBuffer = renderSinglePlaneToRgba(planes[3], 255, 240, 100);
    } else {
      targetBuffer = rgbaBuffer;
    }

    const imgData = ctx.createImageData(VGA_WIDTH, VGA_HEIGHT);
    imgData.data.set(targetBuffer);
    ctx.putImageData(imgData, 0, 0);
  }, [rgbaBuffer, planes, viewMode, palette]);

  // Handle pixel hover inspector
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !indexedPixels) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = VGA_WIDTH / rect.width;
    const scaleY = VGA_HEIGHT / rect.height;

    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const x = Math.floor(clientX * scaleX);
    const y = Math.floor(clientY * scaleY);

    if (x >= 0 && x < VGA_WIDTH && y >= 0 && y < VGA_HEIGHT) {
      const idx = y * VGA_WIDTH + x;
      const colorIdx = indexedPixels[idx];
      const color = palette[colorIdx] || null;

      const bit0 = (colorIdx & 0x01) ? 1 : 0;
      const bit1 = (colorIdx & 0x02) ? 1 : 0;
      const bit2 = (colorIdx & 0x04) ? 1 : 0;
      const bit3 = (colorIdx & 0x08) ? 1 : 0;

      setHoveredPixel({
        x,
        y,
        colorIdx,
        color,
        bits: [bit0, bit1, bit2, bit3],
      });
    }
  };

  const handleMouseLeave = () => {
    setHoveredPixel(null);
  };

  return (
    <div id="crt-screen-container" className="flex flex-col gap-3 w-full">
      {/* Top Monitor Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#11161f] border border-[#232f42] px-4 py-2.5 rounded-xl text-xs text-slate-300">
        <div className="flex items-center gap-2">
          <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-mono text-emerald-400 font-semibold tracking-wide">VGA 640x480 @ 60Hz</span>
          <span className="text-slate-500">•</span>
          <span className="font-mono text-slate-400">Mode 12h (16-Color Planar)</span>
        </div>

        {/* View Mode Tabs */}
        <div className="flex items-center bg-[#0a0e14] p-1 rounded-lg border border-[#1e2736]">
          <button
            id="view-mode-composite"
            onClick={() => onViewModeChange('composite')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              viewMode === 'composite'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-[#18202d]'
            }`}
          >
            Composite (16-Col)
          </button>
          <button
            id="view-mode-planes-split"
            onClick={() => onViewModeChange('planes-split')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1 ${
              viewMode === 'planes-split'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-[#18202d]'
            }`}
          >
            <Layers className="w-3 h-3" />
            4-Plane Split
          </button>
          <button
            id="view-mode-p0"
            onClick={() => onViewModeChange('plane-0')}
            className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
              viewMode === 'plane-0' ? 'bg-blue-500 text-white' : 'text-blue-400 hover:bg-[#18202d]'
            }`}
            title="Plane 0: Bit 0 (Blue channel bit)"
          >
            P0
          </button>
          <button
            id="view-mode-p1"
            onClick={() => onViewModeChange('plane-1')}
            className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
              viewMode === 'plane-1' ? 'bg-emerald-500 text-white' : 'text-emerald-400 hover:bg-[#18202d]'
            }`}
            title="Plane 1: Bit 1 (Green channel bit)"
          >
            P1
          </button>
          <button
            id="view-mode-p2"
            onClick={() => onViewModeChange('plane-2')}
            className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
              viewMode === 'plane-2' ? 'bg-rose-500 text-white' : 'text-rose-400 hover:bg-[#18202d]'
            }`}
            title="Plane 2: Bit 2 (Red channel bit)"
          >
            P2
          </button>
          <button
            id="view-mode-p3"
            onClick={() => onViewModeChange('plane-3')}
            className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
              viewMode === 'plane-3' ? 'bg-amber-500 text-black font-bold' : 'text-amber-400 hover:bg-[#18202d]'
            }`}
            title="Plane 3: Bit 3 (Intensity bit)"
          >
            P3
          </button>
        </div>

        {/* CRT & Display Toggles */}
        <div className="flex items-center gap-2">
          <button
            id="toggle-crt-effect"
            onClick={() => {
              setCrtEffect(!crtEffect);
              setScanlines(!crtEffect);
              setCurvature(!crtEffect);
            }}
            className={`px-2.5 py-1 rounded border text-xs font-mono flex items-center gap-1.5 transition-colors ${
              crtEffect
                ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                : 'bg-[#151d29] border-[#293548] text-slate-400'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            CRT {crtEffect ? 'ON' : 'OFF'}
          </button>

          <button
            id="zoom-out-btn"
            onClick={() => setZoomLevel((z) => Math.max(1, z - 0.5))}
            disabled={zoomLevel <= 1}
            className="p-1 rounded bg-[#151d29] border border-[#293548] text-slate-300 disabled:opacity-30 hover:bg-[#202c3d]"
            title="Zoom out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono text-xs w-9 text-center text-slate-300">{zoomLevel}x</span>
          <button
            id="zoom-in-btn"
            onClick={() => setZoomLevel((z) => Math.min(3, z + 0.5))}
            disabled={zoomLevel >= 3}
            className="p-1 rounded bg-[#151d29] border border-[#293548] text-slate-300 disabled:opacity-30 hover:bg-[#202c3d]"
            title="Zoom in (1:1 pixel inspection)"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main CRT Monitor Housing Frame */}
      <div
        ref={containerRef}
        className={`relative w-full rounded-2xl bg-[#0c1017] p-3 sm:p-5 border-2 border-[#1e2736] shadow-2xl overflow-hidden ${
          curvature && crtEffect ? 'shadow-[inset_0_0_80px_rgba(0,0,0,0.9)]' : ''
        }`}
      >
        {/* Subtle Monitor Bezel reflection */}
        <div className="absolute inset-0 pointer-events-none rounded-2xl border border-white/5 shadow-inner" />

        {/* Outer CRT display viewport */}
        <div
          className={`relative w-full aspect-[4/3] bg-black rounded-xl overflow-auto flex items-center justify-center border border-[#1b2330] ${
            curvature && crtEffect ? 'rounded-[20px] shadow-[inset_0_0_50px_rgba(0,0,0,0.85)]' : ''
          }`}
        >
          <div
            style={{
              transform: `scale(${zoomLevel})`,
              transformOrigin: 'center center',
              transition: 'transform 0.15s ease-out',
            }}
            className="relative flex items-center justify-center max-w-full max-h-full"
          >
            {/* The Actual VGA Canvas */}
            <canvas
              ref={canvasRef}
              id="vga-canvas"
              width={VGA_WIDTH}
              height={VGA_HEIGHT}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              className={`w-full h-auto object-contain cursor-crosshair [image-rendering:pixelated] block ${
                curvature && crtEffect ? 'rounded-lg' : ''
              }`}
            />

            {/* CRT Scanline Overlay */}
            {scanlines && crtEffect && (
              <div
                className="absolute inset-0 pointer-events-none z-10 [background:linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.35)_50%)] [background-size:100%_4px]"
              />
            )}

            {/* CRT Subtle Phosphor Glow & Vignette */}
            {crtEffect && (
              <div
                className="absolute inset-0 pointer-events-none z-20 shadow-[inset_0_0_40px_rgba(0,0,0,0.6)] mix-blend-multiply"
              />
            )}
          </div>
        </div>

        {/* Real-time Pixel Inspector Bar under monitor */}
        <div className="mt-3 flex flex-wrap items-center justify-between text-xs font-mono text-slate-400 bg-[#080b0f] px-3.5 py-2 rounded-lg border border-[#18202c]">
          {hoveredPixel ? (
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">POS:</span>
                <span className="text-white font-semibold">
                  X:{hoveredPixel.x} Y:{hoveredPixel.y}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">COLOR:</span>
                <span
                  className="inline-block w-3.5 h-3.5 rounded border border-white/30"
                  style={{
                    backgroundColor: hoveredPixel.color
                      ? `rgb(${hoveredPixel.color.r}, ${hoveredPixel.color.g}, ${hoveredPixel.color.b})`
                      : '#000',
                  }}
                />
                <span className="text-emerald-400 font-bold">
                  #{hoveredPixel.colorIdx.toString().padStart(2, '0')} ({hoveredPixel.color?.name || 'Unknown'})
                </span>
                <span className="text-slate-500 text-[11px]">
                  RGB({hoveredPixel.color?.r}, {hoveredPixel.color?.g}, {hoveredPixel.color?.b})
                </span>
                <span className="text-slate-500 text-[11px]">
                  DAC(6b): {hoveredPixel.color?.dacR},{hoveredPixel.color?.dacG},{hoveredPixel.color?.dacB}
                </span>
              </div>
              <div className="flex items-center gap-1.5 border-l border-[#20293a] pl-3">
                <span className="text-slate-500">PLANES (B3 B2 B1 B0):</span>
                <span className="text-amber-300 font-bold tracking-widest">
                  [{hoveredPixel.bits[3]} {hoveredPixel.bits[2]} {hoveredPixel.bits[1]} {hoveredPixel.bits[0]}]
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-slate-500">
              <Eye className="w-3.5 h-3.5 text-slate-400" />
              <span>Hover over any pixel on the VGA display to inspect coordinates, DAC palette, and bitplanes.</span>
            </div>
          )}

          <div className="text-slate-500 hidden sm:block">
            VRAM 0xA000:0000 • 80 Bytes/Row • 38,400 B/Plane
          </div>
        </div>
      </div>
    </div>
  );
};
