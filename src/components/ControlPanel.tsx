/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  DitherAlgorithm,
  PaletteType,
  AspectRatioMode,
  ImageAdjustments,
  VgaColor,
} from '../types';
import { SAMPLE_PRESETS, SamplePreset } from '../utils/sampleImages';
import {
  Sliders,
  Palette,
  Image as ImageIcon,
  Upload,
  RotateCcw,
  Sparkles,
  Info,
  Maximize,
  Ratio,
} from 'lucide-react';

interface ControlPanelProps {
  algorithm: DitherAlgorithm;
  onAlgorithmChange: (alg: DitherAlgorithm) => void;
  strength: number;
  onStrengthChange: (s: number) => void;
  paletteType: PaletteType;
  onPaletteTypeChange: (p: PaletteType) => void;
  aspectRatioMode: AspectRatioMode;
  onAspectRatioModeChange: (m: AspectRatioMode) => void;
  adjustments: ImageAdjustments;
  onAdjustmentsChange: (adj: ImageAdjustments) => void;
  palette: VgaColor[];
  selectedPresetId: string;
  onSelectPreset: (preset: SamplePreset) => void;
  onImageUpload: (file: File) => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  algorithm,
  onAlgorithmChange,
  strength,
  onStrengthChange,
  paletteType,
  onPaletteTypeChange,
  aspectRatioMode,
  onAspectRatioModeChange,
  adjustments,
  onAdjustmentsChange,
  palette,
  selectedPresetId,
  onSelectPreset,
  onImageUpload,
}) => {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onImageUpload(e.target.files[0]);
    }
  };

  const handleResetAdjustments = () => {
    onAdjustmentsChange({
      brightness: 0,
      contrast: 0,
      gamma: 1.0,
      saturation: 100,
    });
  };

  return (
    <div id="control-panel" className="flex flex-col gap-5 w-full">
      {/* 1. Source Image & Presets */}
      <div className="bg-[#111620] border border-[#1e293b] rounded-xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <ImageIcon className="w-4 h-4 text-blue-400" />
            <span>Image Source</span>
          </div>
          <span className="text-xs text-slate-400">Drag & drop or paste anytime</span>
        </div>

        {/* Preset Thumbnails */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {SAMPLE_PRESETS.map((p) => {
            const isSelected = selectedPresetId === p.id;
            return (
              <button
                key={p.id}
                id={`preset-${p.id}`}
                onClick={() => onSelectPreset(p)}
                className={`flex flex-col text-left p-2.5 rounded-lg border transition-all ${
                  isSelected
                    ? 'bg-blue-600/20 border-blue-500 text-white shadow-sm ring-1 ring-blue-500/40'
                    : 'bg-[#151c28] border-[#222e42] text-slate-300 hover:bg-[#1c2637] hover:border-slate-600'
                }`}
              >
                <span className="font-semibold text-xs truncate">{p.name}</span>
                <span className="text-[10px] text-slate-400 truncate mt-0.5">{p.description}</span>
              </button>
            );
          })}
        </div>

        {/* Upload Button */}
        <div className="flex items-center gap-2 pt-1">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
            id="file-upload-input"
          />
          <button
            id="upload-custom-image-btn"
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 py-2 px-3 rounded-lg bg-[#182232] hover:bg-[#202d42] border border-[#273750] text-xs font-medium text-slate-200 flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-emerald-400" />
            <span>Upload Image (PNG, JPG, WEBP)</span>
          </button>
        </div>
      </div>

      {/* 2. Dithering Algorithm & Strength */}
      <div className="bg-[#111620] border border-[#1e293b] rounded-xl p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span>Dithering Method</span>
          </div>
          <span className="text-xs font-mono text-emerald-400 font-medium">
            {Math.round(strength * 100)}% diffusion
          </span>
        </div>

        {/* Algorithm Select Dropdown / Buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            { id: 'floyd-steinberg', label: 'Floyd-Steinberg', desc: 'Classic 4-neighbor error diffusion' },
            { id: 'atkinson', label: 'Atkinson', desc: 'Macintosh retro high-contrast' },
            { id: 'bayer-4', label: 'Bayer 4x4 (Crosshatch)', desc: 'Ordered vintage matrix' },
            { id: 'bayer-8', label: 'Bayer 8x8 (Fine Mesh)', desc: 'Fine ordered crosshatch' },
            { id: 'sierra-3', label: 'Sierra-3', desc: 'Smooth 3-row diffusion' },
            { id: 'burkes', label: 'Burkes', desc: 'High-speed 7-neighbor filter' },
            { id: 'stucki', label: 'Stucki', desc: 'Sharp edges & gradient balance' },
            { id: 'jarvis', label: 'Jarvis-Judice-Ninke', desc: 'Large 12-neighbor diffusion' },
            { id: 'none', label: 'No Dither (Threshold)', desc: 'Nearest color without diffusion' },
          ].map((alg) => {
            const isSelected = algorithm === alg.id;
            return (
              <button
                key={alg.id}
                id={`dither-${alg.id}`}
                onClick={() => onAlgorithmChange(alg.id as DitherAlgorithm)}
                className={`flex flex-col text-left p-2 rounded-lg border transition-all ${
                  isSelected
                    ? 'bg-emerald-600/20 border-emerald-500 text-white ring-1 ring-emerald-500/40'
                    : 'bg-[#151c28] border-[#222e42] text-slate-300 hover:bg-[#1c2637]'
                }`}
              >
                <span className="font-semibold text-xs leading-tight">{alg.label}</span>
                <span className="text-[10px] text-slate-400 leading-tight mt-1">{alg.desc}</span>
              </button>
            );
          })}
        </div>

        {/* Strength Slider */}
        {algorithm !== 'none' && (
          <div className="flex flex-col gap-1.5 pt-1">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Dither Diffusion Strength</span>
              <span className="font-mono text-slate-200">{Math.round(strength * 100)}%</span>
            </div>
            <input
              id="dither-strength-slider"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={strength}
              onChange={(e) => onStrengthChange(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-[#1f2a3c] rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
          </div>
        )}
      </div>

      {/* 3. VGA 16-Color Palette Selection & DAC Swatches */}
      <div className="bg-[#111620] border border-[#1e293b] rounded-xl p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Palette className="w-4 h-4 text-amber-400" />
            <span>VGA 16-Color Palette (4-Bit)</span>
          </div>
          <span className="text-xs text-slate-400">16 colors per frame</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            { id: 'vga-default', name: 'Standard IBM VGA', desc: 'Hardware default 16 IRGB colors' },
            { id: 'custom-quantized', name: 'Custom Quantized', desc: 'Median-Cut DAC programmed (photo quality!)' },
            { id: 'grayscale-16', name: '16 Grayscale', desc: 'Even 16-step luminance shades' },
            { id: 'green-phosphor', name: 'P31 Green CRT', desc: 'Monochrome IBM 5151 phosphor' },
            { id: 'amber-crt', name: 'P134 Amber CRT', desc: 'Classic amber monochrome display' },
            { id: 'cga-tinted', name: 'CGA Tinted', desc: 'Retro CGA Cyan/Magenta/Brown/White' },
          ].map((p) => {
            const isSelected = paletteType === p.id;
            return (
              <button
                key={p.id}
                id={`palette-${p.id}`}
                onClick={() => onPaletteTypeChange(p.id as PaletteType)}
                className={`flex flex-col text-left p-2 rounded-lg border transition-all ${
                  isSelected
                    ? 'bg-amber-500/20 border-amber-500 text-white ring-1 ring-amber-500/40'
                    : 'bg-[#151c28] border-[#222e42] text-slate-300 hover:bg-[#1c2637]'
                }`}
              >
                <span className="font-semibold text-xs leading-tight">{p.name}</span>
                <span className="text-[10px] text-slate-400 leading-tight mt-1">{p.desc}</span>
              </button>
            );
          })}
        </div>

        {/* 16 Palette Swatches Display */}
        <div className="flex flex-col gap-1.5 pt-1">
          <span className="text-xs text-slate-400 font-mono">Active 16-Color DAC Table (0..15):</span>
          <div className="grid grid-cols-8 sm:grid-cols-16 gap-1 p-2 rounded-lg bg-[#0a0d13] border border-[#1b2330]">
            {palette.map((c, idx) => (
              <div
                key={idx}
                className="group relative flex flex-col items-center justify-center"
                title={`#${idx}: ${c.name} | RGB(${c.r}, ${c.g}, ${c.b}) | DAC 6b: (${c.dacR}, ${c.dacG}, ${c.dacB})`}
              >
                <div
                  className="w-full aspect-square rounded border border-white/20 shadow-sm transition-transform group-hover:scale-110"
                  style={{ backgroundColor: `rgb(${c.r}, ${c.g}, ${c.b})` }}
                />
                <span className="text-[9px] font-mono text-slate-400 mt-0.5">{idx}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4. Aspect Ratio & Pre-Processing Adjustments */}
      <div className="bg-[#111620] border border-[#1e293b] rounded-xl p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Sliders className="w-4 h-4 text-purple-400" />
            <span>Image Pre-Processing & 640x480 Framing</span>
          </div>
          <button
            id="reset-adjustments-btn"
            onClick={handleResetAdjustments}
            className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </button>
        </div>

        {/* Aspect Ratio Mode Buttons */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 w-24">Framing:</span>
          <div className="grid grid-cols-3 gap-2 flex-1">
            {[
              { id: 'fit', label: 'Fit (4:3 Letterbox)', icon: Ratio },
              { id: 'fill', label: 'Crop to Fill', icon: Maximize },
              { id: 'stretch', label: 'Exact Stretch', icon: Ratio },
            ].map((mode) => (
              <button
                key={mode.id}
                id={`aspect-${mode.id}`}
                onClick={() => onAspectRatioModeChange(mode.id as AspectRatioMode)}
                className={`py-1.5 px-2 rounded-lg border text-xs font-medium transition-colors ${
                  aspectRatioMode === mode.id
                    ? 'bg-purple-600/30 border-purple-500 text-white'
                    : 'bg-[#151c28] border-[#222e42] text-slate-400 hover:bg-[#1c2637]'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sliders: Contrast, Brightness, Gamma, Saturation */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          {/* Contrast */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Contrast</span>
              <span className="font-mono text-slate-200">{adjustments.contrast > 0 ? `+${adjustments.contrast}` : adjustments.contrast}</span>
            </div>
            <input
              id="contrast-slider"
              type="range"
              min="-60"
              max="60"
              value={adjustments.contrast}
              onChange={(e) =>
                onAdjustmentsChange({ ...adjustments, contrast: parseInt(e.target.value, 10) })
              }
              className="w-full h-1.5 bg-[#1f2a3c] rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
          </div>

          {/* Brightness */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Brightness</span>
              <span className="font-mono text-slate-200">{adjustments.brightness > 0 ? `+${adjustments.brightness}` : adjustments.brightness}</span>
            </div>
            <input
              id="brightness-slider"
              type="range"
              min="-60"
              max="60"
              value={adjustments.brightness}
              onChange={(e) =>
                onAdjustmentsChange({ ...adjustments, brightness: parseInt(e.target.value, 10) })
              }
              className="w-full h-1.5 bg-[#1f2a3c] rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
          </div>

          {/* Gamma */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Gamma</span>
              <span className="font-mono text-slate-200">{adjustments.gamma.toFixed(2)}</span>
            </div>
            <input
              id="gamma-slider"
              type="range"
              min="0.5"
              max="2.0"
              step="0.05"
              value={adjustments.gamma}
              onChange={(e) =>
                onAdjustmentsChange({ ...adjustments, gamma: parseFloat(e.target.value) })
              }
              className="w-full h-1.5 bg-[#1f2a3c] rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
          </div>

          {/* Saturation */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Color Saturation</span>
              <span className="font-mono text-slate-200">{adjustments.saturation}%</span>
            </div>
            <input
              id="saturation-slider"
              type="range"
              min="0"
              max="200"
              step="5"
              value={adjustments.saturation}
              onChange={(e) =>
                onAdjustmentsChange({ ...adjustments, saturation: parseInt(e.target.value, 10) })
              }
              className="w-full h-1.5 bg-[#1f2a3c] rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
