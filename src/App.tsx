/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  DitherAlgorithm,
  PaletteType,
  AspectRatioMode,
  ViewMode,
  ImageAdjustments,
  ProcessedVgaData,
  VgaColor,
} from './types';
import { SAMPLE_PRESETS, SamplePreset } from './utils/sampleImages';
import { getPalette, generateQuantizedPalette } from './utils/palette';
import { ditherImage, VGA_WIDTH, VGA_HEIGHT } from './utils/dithering';
import { convertToPlanarVga, TOTAL_PLANAR_BYTES } from './utils/planarVga';
import {
  buildComExecutable,
  generateAsmSource,
  generateCHeader,
  generatePascalUnit,
} from './utils/comGenerator';
import { CrtScreen } from './components/CrtScreen';
import { ControlPanel } from './components/ControlPanel';
import { HeaderExporter } from './components/HeaderExporter';
import { PlaneInspector } from './components/PlaneInspector';
import { VgaTimingVisualizer } from './components/VgaTimingVisualizer';
import { VgaMemoryMap } from './components/VgaMemoryMap';
import { VgaSweepProgress } from './utils/vgaTiming';
import { Terminal, Sparkles, Cpu, HardDrive, Download, Upload } from 'lucide-react';

export default function App() {
  // State
  const [selectedPresetId, setSelectedPresetId] = useState<string>('ibm-pc');
  const [sourceImageElement, setSourceImageElement] = useState<HTMLImageElement | null>(null);
  const [sourceImageData, setSourceImageData] = useState<ImageData | null>(null);

  const [algorithm, setAlgorithm] = useState<DitherAlgorithm>('floyd-steinberg');
  const [strength, setStrength] = useState<number>(0.9);
  const [paletteType, setPaletteType] = useState<PaletteType>('vga-default');
  const [aspectRatioMode, setAspectRatioMode] = useState<AspectRatioMode>('fit');
  const [viewMode, setViewMode] = useState<ViewMode>('composite');

  const [adjustments, setAdjustments] = useState<ImageAdjustments>({
    brightness: 0,
    contrast: 0,
    gamma: 1.0,
    saturation: 100,
  });

  const [processedData, setProcessedData] = useState<ProcessedVgaData | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [customQuantizedPalette, setCustomQuantizedPalette] = useState<VgaColor[]>([]);
  const [sweepProgress, setSweepProgress] = useState<VgaSweepProgress | null>(null);

  // Scaling helper: render input image to 640x480 ImageData based on AspectRatioMode
  const renderSourceTo640x480 = useCallback(
    (img: HTMLImageElement, mode: AspectRatioMode): ImageData => {
      const canvas = document.createElement('canvas');
      canvas.width = VGA_WIDTH;
      canvas.height = VGA_HEIGHT;
      const ctx = canvas.getContext('2d')!;

      // Background black fill
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, VGA_WIDTH, VGA_HEIGHT);

      const srcW = img.naturalWidth || img.width;
      const srcH = img.naturalHeight || img.height;

      if (mode === 'stretch') {
        ctx.drawImage(img, 0, 0, VGA_WIDTH, VGA_HEIGHT);
      } else if (mode === 'fill') {
        // Center crop to fill 640x480
        const scale = Math.max(VGA_WIDTH / srcW, VGA_HEIGHT / srcH);
        const nw = srcW * scale;
        const nh = srcH * scale;
        const dx = (VGA_WIDTH - nw) / 2;
        const dy = (VGA_HEIGHT - nh) / 2;
        ctx.drawImage(img, dx, dy, nw, nh);
      } else {
        // 'fit' with 4:3 letterbox
        const scale = Math.min(VGA_WIDTH / srcW, VGA_HEIGHT / srcH);
        const nw = srcW * scale;
        const nh = srcH * scale;
        const dx = (VGA_WIDTH - nw) / 2;
        const dy = (VGA_HEIGHT - nh) / 2;
        ctx.drawImage(img, dx, dy, nw, nh);
      }

      return ctx.getImageData(0, 0, VGA_WIDTH, VGA_HEIGHT);
    },
    []
  );

  // Initialize with the first sample preset
  useEffect(() => {
    const initialPreset = SAMPLE_PRESETS[0];
    const rawData = initialPreset.generate();
    setSourceImageData(rawData);

    // Compute custom palette for this image
    const customPal = generateQuantizedPalette(rawData);
    setCustomQuantizedPalette(customPal);
  }, []);

  // Handle preset selection
  const handleSelectPreset = (preset: SamplePreset) => {
    setSelectedPresetId(preset.id);
    setSourceImageElement(null);
    const rawData = preset.generate();
    setSourceImageData(rawData);

    const customPal = generateQuantizedPalette(rawData);
    setCustomQuantizedPalette(customPal);
  };

  // Handle user uploaded image
  const handleImageUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        setSelectedPresetId('custom');
        setSourceImageElement(img);
        const rawData = renderSourceTo640x480(img, aspectRatioMode);
        setSourceImageData(rawData);

        const customPal = generateQuantizedPalette(rawData);
        setCustomQuantizedPalette(customPal);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // When aspect ratio mode changes and we have a sourceImageElement
  useEffect(() => {
    if (sourceImageElement) {
      const rawData = renderSourceTo640x480(sourceImageElement, aspectRatioMode);
      setSourceImageData(rawData);
      const customPal = generateQuantizedPalette(rawData);
      setCustomQuantizedPalette(customPal);
    }
  }, [aspectRatioMode, sourceImageElement, renderSourceTo640x480]);

  // Global Clipboard paste listener (Ctrl+V / Cmd+V anywhere to paste image)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            handleImageUpload(blob);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [aspectRatioMode, renderSourceTo640x480]);

  // Global Drag and Drop support
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageUpload(e.dataTransfer.files[0]);
    }
  };

  // Main Pipeline processing
  useEffect(() => {
    if (!sourceImageData) return;

    setIsProcessing(true);

    const timer = setTimeout(() => {
      // 1. Resolve palette
      const activePalette = getPalette(paletteType, customQuantizedPalette);
      const isCustomPalette = paletteType !== 'vga-default';

      // 2. Dither source image into 640x480 16-color indexed pixels
      const { indexedPixels, rgbaBuffer } = ditherImage(
        sourceImageData,
        activePalette,
        algorithm,
        strength,
        adjustments
      );

      // 3. Bit-slice indexed pixels into 4 VGA Mode 12h bit-planes (38,400 bytes each)
      const planes = convertToPlanarVga(indexedPixels);

      // 4. Build MS-DOS .COM binary with x86 machine code preamble & compressed planar streams
      const { comBinary, compressedSize, fitsInCom } = buildComExecutable(
        planes,
        activePalette,
        isCustomPalette
      );

      // 5. Generate NASM/TASM assembly source code (.ASM)
      const asmCode = generateAsmSource(planes, activePalette, isCustomPalette);

      // 6. Generate C Header (.H) & Turbo Pascal Unit (.PAS)
      const cHeader = generateCHeader(planes, activePalette, isCustomPalette);
      const pascalCode = generatePascalUnit(activePalette, isCustomPalette);

      setProcessedData({
        indexedPixels,
        rgbaBuffer,
        planes,
        palette: activePalette,
        isCustomPalette,
        comBinary,
        compressedSize,
        rawPlanarSize: TOTAL_PLANAR_BYTES,
        compressionRatio: Math.round((1 - compressedSize / TOTAL_PLANAR_BYTES) * 100),
        fitsInCom,
        asmCode,
        cHeader,
        pascalCode,
      });

      setIsProcessing(false);
    }, 40);

    return () => clearTimeout(timer);
  }, [
    sourceImageData,
    algorithm,
    strength,
    paletteType,
    adjustments,
    customQuantizedPalette,
  ]);

  return (
    <div
      id="app-root"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="min-h-screen bg-[#070a0f] text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white relative"
    >
      {/* Drag overlay indicator */}
      {isDraggingOver && (
        <div className="fixed inset-0 bg-blue-600/30 backdrop-blur-sm border-4 border-dashed border-blue-400 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-[#0b1018] border border-blue-500/60 p-6 rounded-2xl flex flex-col items-center gap-3 shadow-2xl text-center">
            <Upload className="w-10 h-10 text-blue-400 animate-bounce" />
            <span className="text-lg font-bold text-white">Drop image to convert</span>
            <span className="text-xs text-slate-400">Fits automatically to 640×480 VGA Mode 12h</span>
          </div>
        </div>
      )}

      {/* Retro-Styled Header Navigation */}
      <header className="border-b border-[#1b2535] bg-[#0b0f17]/90 backdrop-blur sticky top-0 z-30 px-4 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-md border border-blue-400/30">
              <Terminal className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
                  MS-DOS Mode 12h COM Converter
                </h1>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-500/10 border border-blue-500/30 text-blue-300">
                  4-BIT • 640×480
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Image to VGA Planar 16-Color Executable (.COM) with Retro Dithering & x86 Assembly
              </p>
            </div>
          </div>

          {/* Header Action Badges */}
          <div className="flex items-center gap-2 text-xs font-mono">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#121824] border border-[#202b3d] text-slate-300">
              <Cpu className="w-3.5 h-3.5 text-emerald-400" />
              <span>INT 10h AH=00h AL=12h</span>
            </div>
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#121824] border border-[#202b3d] text-slate-300">
              <HardDrive className="w-3.5 h-3.5 text-blue-400" />
              <span>4 Planes @ 0xA000</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto w-full p-4 sm:p-6 flex flex-col gap-6 flex-1">
        {/* Main 2-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: CRT Display Viewport (7 cols on lg) */}
          <div className="lg:col-span-7 flex flex-col gap-5">
            <CrtScreen
              rgbaBuffer={processedData?.rgbaBuffer || null}
              indexedPixels={processedData?.indexedPixels || null}
              planes={processedData?.planes || null}
              palette={processedData?.palette || []}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              sweepProgress={sweepProgress}
            />

            {/* VGA Timing & Latency Visualizer */}
            <VgaTimingVisualizer
              planes={processedData?.planes || null}
              isCustomPalette={processedData?.isCustomPalette || false}
              onSweepProgressChange={setSweepProgress}
            />

            {/* VGA 4-Bit Plane Architecture Inspector */}
            <PlaneInspector
              planes={processedData?.planes || null}
              onSelectPlaneView={setViewMode}
              activeViewMode={viewMode}
            />
          </div>

          {/* Right Column: Controls & Dithering Engine (5 cols on lg) */}
          <div className="lg:col-span-5 flex flex-col gap-5">
            <ControlPanel
              algorithm={algorithm}
              onAlgorithmChange={setAlgorithm}
              strength={strength}
              onStrengthChange={setStrength}
              paletteType={paletteType}
              onPaletteTypeChange={setPaletteType}
              aspectRatioMode={aspectRatioMode}
              onAspectRatioModeChange={setAspectRatioMode}
              adjustments={adjustments}
              onAdjustmentsChange={setAdjustments}
              palette={processedData?.palette || []}
              selectedPresetId={selectedPresetId}
              onSelectPreset={handleSelectPreset}
              onImageUpload={handleImageUpload}
            />
          </div>
        </div>

        {/* Full-Width Section: VGA 256KB VRAM & 0xA000 Memory Map */}
        <div className="w-full">
          <VgaMemoryMap
            planes={processedData?.planes || null}
            activeViewMode={viewMode}
            onSelectPlaneView={setViewMode}
            sweepProgress={sweepProgress}
          />
        </div>

        {/* Bottom Full-Width Section: MS-DOS .COM Header & Code Generator */}
        <div className="w-full mt-2">
          <HeaderExporter data={processedData} />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#18202d] bg-[#090d14] px-4 py-3 text-xs font-mono text-slate-500 text-center">
        MS-DOS VGA Mode 12h (640x480 16-Color Planar) Engine • 38,400 Bytes/Plane • Direct CS:0100h Executable
      </footer>
    </div>
  );
}
