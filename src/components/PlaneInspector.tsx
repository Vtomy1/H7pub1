/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ViewMode } from '../types';
import { Layers, ArrowRight } from 'lucide-react';

interface PlaneInspectorProps {
  planes: [Uint8Array, Uint8Array, Uint8Array, Uint8Array] | null;
  onSelectPlaneView: (mode: ViewMode) => void;
  activeViewMode: ViewMode;
}

export const PlaneInspector: React.FC<PlaneInspectorProps> = ({
  planes,
  onSelectPlaneView,
  activeViewMode,
}) => {
  if (!planes) return null;

  const planeMeta = [
    {
      id: 'plane-0',
      planeIdx: 0,
      bit: 'Bit 0',
      name: 'Plane 0: Blue',
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10 border-blue-500/30',
      activeBorder: 'border-blue-500 bg-blue-500/20',
      vram: '0xA000:0000',
      mask: '0x01 (Map Mask)',
      desc: 'Controls low bit of 4-bit palette index (Blue tint in default IRGB palette)',
    },
    {
      id: 'plane-1',
      planeIdx: 1,
      bit: 'Bit 1',
      name: 'Plane 1: Green',
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10 border-emerald-500/30',
      activeBorder: 'border-emerald-500 bg-emerald-500/20',
      vram: '0xA000:0000',
      mask: '0x02 (Map Mask)',
      desc: 'Controls bit 1 of palette index (Green tint in default IRGB palette)',
    },
    {
      id: 'plane-2',
      planeIdx: 2,
      bit: 'Bit 2',
      name: 'Plane 2: Red',
      color: 'text-rose-400',
      bgColor: 'bg-rose-500/10 border-rose-500/30',
      activeBorder: 'border-rose-500 bg-rose-500/20',
      vram: '0xA000:0000',
      mask: '0x04 (Map Mask)',
      desc: 'Controls bit 2 of palette index (Red tint in default IRGB palette)',
    },
    {
      id: 'plane-3',
      planeIdx: 3,
      bit: 'Bit 3',
      name: 'Plane 3: Intensity',
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/10 border-amber-500/30',
      activeBorder: 'border-amber-500 bg-amber-500/20',
      vram: '0xA000:0000',
      mask: '0x08 (Map Mask)',
      desc: 'Controls high bit of palette index (Bright/High-intensity flag)',
    },
  ];

  return (
    <div id="plane-inspector" className="bg-[#111620] border border-[#1e293b] rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Layers className="w-4 h-4 text-cyan-400" />
          <span>VGA 4-Bit Plane Architecture (Mode 12h)</span>
        </div>
        <span className="text-xs font-mono text-slate-400">38,400 bytes per plane (640×480 ÷ 8)</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {planeMeta.map((p) => {
          const isActive = activeViewMode === p.id;
          const planeData = planes[p.planeIdx];

          // Calculate set bits count
          let setBits = 0;
          for (let i = 0; i < Math.min(1000, planeData.length); i++) {
            let b = planeData[i];
            while (b) {
              setBits += b & 1;
              b >>= 1;
            }
          }
          const density = Math.round((setBits / (Math.min(1000, planeData.length) * 8)) * 100);

          return (
            <button
              key={p.id}
              id={`inspect-${p.id}`}
              onClick={() => onSelectPlaneView(p.id as ViewMode)}
              className={`flex flex-col text-left p-3 rounded-lg border transition-all ${
                isActive ? p.activeBorder : `${p.bgColor} hover:brightness-125`
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`font-mono text-xs font-bold ${p.color}`}>{p.name}</span>
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-black/40 text-slate-300">
                  {p.bit}
                </span>
              </div>

              <div className="text-[11px] text-slate-400 mb-2 leading-tight">{p.desc}</div>

              <div className="mt-auto pt-2 border-t border-white/10 flex items-center justify-between text-[10px] font-mono text-slate-300">
                <span>Sequencer: {p.mask}</span>
                <span>Bit Density: ~{density}%</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
