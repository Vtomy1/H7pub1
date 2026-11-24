/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { ProcessedVgaData } from '../types';
import {
  disassembleComBinary,
  DisassembledInstruction,
  InstructionCategory,
} from '../utils/x86Disassembler';
import { Code2, Cpu, Layers, Filter, ArrowRight } from 'lucide-react';

interface AssemblyPreviewProps {
  data: ProcessedVgaData | null;
}

type FilterMode = 'all' | 'bios-init';

const CATEGORY_STYLES: Record<
  InstructionCategory,
  { mnemonic: string; rowAccent: string; badge: string }
> = {
  bios: {
    mnemonic: 'text-amber-300 font-bold',
    rowAccent: 'bg-amber-500/10 border-l-2 border-l-amber-400',
    badge: 'bg-amber-500/20 border-amber-500/50 text-amber-300',
  },
  dos: {
    mnemonic: 'text-rose-300 font-bold',
    rowAccent: 'bg-rose-500/10 border-l-2 border-l-rose-400',
    badge: 'bg-rose-500/20 border-rose-500/50 text-rose-300',
  },
  'port-io': {
    mnemonic: 'text-cyan-300 font-semibold',
    rowAccent: 'border-l-2 border-l-cyan-500/60',
    badge: 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300',
  },
  'vram-string': {
    mnemonic: 'text-emerald-300 font-semibold',
    rowAccent: 'border-l-2 border-l-emerald-500/60',
    badge: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300',
  },
  flow: {
    mnemonic: 'text-purple-300 font-semibold',
    rowAccent: 'border-l-2 border-l-purple-500/50',
    badge: 'bg-purple-500/15 border-purple-500/40 text-purple-300',
  },
  register: {
    mnemonic: 'text-sky-300 font-medium',
    rowAccent: 'border-l-2 border-l-transparent',
    badge: 'bg-slate-700/40 border-slate-600/50 text-slate-300',
  },
};

export const AssemblyPreview: React.FC<AssemblyPreviewProps> = ({ data }) => {
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [selectedOffset, setSelectedOffset] = useState<number>(0x0103); // Default to first INT 10h (Mode 12h)

  const parsed = useMemo(() => {
    if (!data) return null;
    return disassembleComBinary(data.comBinary, data.isCustomPalette);
  }, [data]);

  // Ensure selectedOffset always resolves to a valid instruction when binary updates
  useEffect(() => {
    if (!parsed || parsed.instructions.length === 0) return;
    const exists = parsed.instructions.some((inst) => inst.offset === selectedOffset);
    if (!exists) {
      const firstBios = parsed.instructions.find((inst) => inst.isBiosOrDosCall);
      setSelectedOffset(firstBios ? firstBios.offset : parsed.instructions[0].offset);
    }
  }, [parsed, selectedOffset]);

  if (!data || !parsed) return null;

  const visibleInstructions =
    filterMode === 'bios-init'
      ? parsed.instructions.filter(
          (inst) =>
            inst.isBiosOrDosCall ||
            inst.category === 'port-io' ||
            inst.offset === 0x0100 ||
            (inst.mnemonic === 'mov' &&
              (inst.operands.startsWith('ax,') ||
                inst.operands.startsWith('es,') ||
                inst.operands.startsWith('dx,')))
        )
      : parsed.instructions;

  const selectedInst: DisassembledInstruction =
    parsed.instructions.find((i) => i.offset === selectedOffset) ||
    parsed.instructions[0];

  const biosCalls = parsed.instructions.filter((i) => i.isBiosOrDosCall);

  const hex16 = (n: number) => n.toString(16).toUpperCase().padStart(4, '0') + 'h';

  return (
    <section
      id="assembly-preview"
      className="bg-[#111620] border border-[#1e293b] rounded-xl overflow-hidden flex flex-col w-full"
    >
      {/* Header Toolbar */}
      <div className="bg-[#0c1017] border-b border-[#1c2637] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Code2 className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-semibold text-slate-100">
            Assembly Preview (COM Binary Disassembly)
          </h2>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 border border-amber-500/30 text-amber-300">
            PARSED FROM {data.comBinary.length.toLocaleString()}B BINARY
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Jump to BIOS Calls */}
          <div className="flex flex-wrap items-center gap-1">
            {biosCalls.map((call, idx) => {
              const isSelected = selectedInst.offset === call.offset;
              const shortLabel =
                call.biosTag?.includes('MODE 12h')
                  ? 'INT 10h (12h)'
                  : call.biosTag?.includes('MODE 03h')
                  ? 'INT 10h (03h)'
                  : call.biosTag?.includes('KEYBOARD')
                  ? 'INT 16h'
                  : 'INT 21h';
              return (
                <button
                  key={`${call.offset}-${idx}`}
                  id={`jump-bios-${idx}`}
                  onClick={() => setSelectedOffset(call.offset)}
                  className={`px-2 py-1 rounded text-[11px] font-mono border transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-amber-500/25 border-amber-400 text-amber-200 font-semibold'
                      : 'bg-[#141b27] border-[#243146] text-slate-300 hover:border-amber-500/50 hover:text-amber-300'
                  }`}
                >
                  {shortLabel}
                </button>
              );
            })}
          </div>

          {/* Filter Mode Toggle */}
          <div className="flex items-center bg-[#080b10] p-0.5 rounded-lg border border-[#1d2738] text-[11px] font-mono">
            <button
              id="disasm-filter-all"
              onClick={() => setFilterMode('all')}
              className={`px-2.5 py-1 rounded-md flex items-center gap-1 transition-colors cursor-pointer ${
                filterMode === 'all'
                  ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Full Code ({parsed.instructions.length})</span>
            </button>
            <button
              id="disasm-filter-bios"
              onClick={() => setFilterMode('bios-init')}
              className={`px-2.5 py-1 rounded-md flex items-center gap-1 transition-colors cursor-pointer ${
                filterMode === 'bios-init'
                  ? 'bg-amber-600/25 text-amber-300 border border-amber-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Filter className="w-3 h-3" />
              <span>BIOS &amp; VGA Init</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Split View: Disassembly Listing (Left 7 cols) + Stack & Register Context (Right 5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[#1c2637]">
        {/* Left: Color-Coded Disassembly Table */}
        <div className="lg:col-span-7 bg-[#080c12] overflow-y-auto max-h-[460px] p-3 font-mono text-xs">
          {/* Legend */}
          <div className="flex flex-wrap items-center gap-3 pb-2.5 mb-2 border-b border-[#161f2e] text-[10px] text-slate-400">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400" /> BIOS Interrupt
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-cyan-400" /> VGA Port I/O
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400" /> VRAM String Ops
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-purple-400" /> Flow / Jump
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-400" /> DOS Exit
            </span>
          </div>

          <div className="flex flex-col gap-0.5">
            {visibleInstructions.map((inst) => {
              const style = CATEGORY_STYLES[inst.category];
              const isSelected = inst.offset === selectedInst.offset;

              return (
                <React.Fragment key={inst.offset}>
                  {inst.label && (
                    <div className="text-[11px] font-bold text-indigo-300 pt-2 pb-0.5 pl-2">
                      {inst.label}:
                    </div>
                  )}
                  <button
                    id={`disasm-row-${inst.offset.toString(16)}`}
                    type="button"
                    onClick={() => setSelectedOffset(inst.offset)}
                    className={`w-full text-left px-2.5 py-1.5 rounded flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 transition-colors cursor-pointer ${
                      style.rowAccent
                    } ${
                      isSelected
                        ? 'bg-blue-600/20 ring-1 ring-blue-500/50'
                        : 'hover:bg-[#111824]'
                    }`}
                  >
                    {/* Address & Machine Bytes */}
                    <div className="flex items-center gap-2.5 shrink-0">
                      <span className="text-slate-500 w-16">
                        0100:{inst.offset.toString(16).toUpperCase().padStart(4, '0')}
                      </span>
                      <span className="text-emerald-400/90 w-20 text-[11px]">
                        {inst.hexBytes}
                      </span>
                    </div>

                    {/* Instruction Mnemonic & Operands */}
                    <div className="flex items-center gap-2 min-w-[195px] shrink-0">
                      <span className={`w-20 ${style.mnemonic}`}>{inst.mnemonic}</span>
                      <span className="text-slate-200">{inst.operands}</span>
                    </div>

                    {/* BIOS Tag or Comment */}
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {inst.biosTag && (
                        <span
                          className={`px-1.5 py-0.5 rounded border text-[9px] shrink-0 ${style.badge}`}
                        >
                          {inst.biosTag}
                        </span>
                      )}
                      <span className="text-[11px] text-slate-400 truncate">
                        ; {inst.comment}
                      </span>
                    </div>
                  </button>
                </React.Fragment>
              );
            })}

            {/* Data Payload Summary Entries */}
            <div className="mt-3 pt-2 border-t border-[#182233] flex flex-col gap-1 text-[11px] text-slate-400 px-2">
              {parsed.paletteDataOffset !== null && (
                <div className="flex items-center justify-between">
                  <span className="text-amber-300/90">
                    palette_data @ CS:{hex16(parsed.paletteDataOffset)}
                  </span>
                  <span>48 bytes (16 × 3 DAC 6-bit RGB values)</span>
                </div>
              )}
              {parsed.graphicsDataOffset !== null && (
                <div className="flex items-center justify-between">
                  <span className="text-cyan-300/90">
                    graphics_data @ CS:{hex16(parsed.graphicsDataOffset)}
                  </span>
                  <span>
                    {(
                      parsed.totalBytes -
                      (parsed.graphicsDataOffset - 0x0100)
                    ).toLocaleString()}{' '}
                    bytes (4 RLE-compressed Mode 12h bit-planes)
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Register State & Stack Operations Inspector */}
        <div className="lg:col-span-5 bg-[#0c111a] p-4 flex flex-col gap-4">
          {/* Selected Instruction Banner */}
          <div className="bg-[#111824] border border-[#1f2b3e] rounded-lg p-3 flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono text-slate-400">
                Selected @ {selectedInst.registers.csIp}
              </span>
              {selectedInst.biosTag && (
                <span
                  className={`px-2 py-0.5 rounded border text-[10px] font-mono ${
                    CATEGORY_STYLES[selectedInst.category].badge
                  }`}
                >
                  {selectedInst.biosTag}
                </span>
              )}
            </div>
            <div className="font-mono text-sm font-bold text-white flex items-center gap-2">
              <span className={CATEGORY_STYLES[selectedInst.category].mnemonic}>
                {selectedInst.mnemonic}
              </span>
              <span>{selectedInst.operands}</span>
              <span className="text-xs font-normal text-emerald-400 ml-auto">
                [{selectedInst.hexBytes}]
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">{selectedInst.comment}</p>
          </div>

          {/* 16-Bit x86 Registers & VGA Init Values */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-sky-400" />
                <span>x86 CPU Registers (16-Bit Real Mode)</span>
              </span>
              <span className="font-mono text-[10px] text-slate-400">
                AH={selectedInst.registers.ah} AL={selectedInst.registers.al}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5 font-mono text-[11px]">
              {[
                { name: 'AX', val: selectedInst.registers.ax, highlight: selectedInst.category === 'bios' },
                { name: 'BX', val: selectedInst.registers.bx, highlight: false },
                { name: 'CX', val: selectedInst.registers.cx, highlight: false },
                { name: 'DX', val: selectedInst.registers.dx, highlight: selectedInst.category === 'port-io' },
                { name: 'ES', val: selectedInst.registers.es, highlight: selectedInst.operands.includes('es') },
                { name: 'SI', val: selectedInst.registers.si, highlight: selectedInst.operands.includes('si') },
                { name: 'DI', val: selectedInst.registers.di, highlight: false },
                { name: 'BP', val: selectedInst.registers.bp, highlight: false },
                { name: 'SP', val: selectedInst.registers.sp, highlight: selectedInst.isBiosOrDosCall },
              ].map((reg) => (
                <div
                  key={reg.name}
                  className={`px-2.5 py-1.5 rounded border flex items-center justify-between ${
                    reg.highlight
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                      : 'bg-[#090d14] border-[#1a2333] text-slate-300'
                  }`}
                >
                  <span className="text-slate-400">{reg.name}</span>
                  <span className="font-bold">{reg.val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Stack Operations & Interrupt Frame Breakdown */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-purple-400" />
                <span>Stack Operations (SS:SP)</span>
              </span>
              <span className="font-mono text-[10px] text-purple-300 flex items-center gap-1">
                <span>{selectedInst.stackInfo.spBefore}</span>
                <ArrowRight className="w-3 h-3" />
                <span>{selectedInst.stackInfo.spAfter}</span>
              </span>
            </div>

            <div className="bg-[#090d14] border border-[#1a2333] rounded-lg p-3 flex flex-col gap-2.5">
              <div className="text-[11px] font-semibold text-purple-300">
                {selectedInst.stackInfo.title}
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {selectedInst.stackInfo.summary}
              </p>

              {/* Stack Frame Cells */}
              <div className="flex flex-col gap-1 font-mono text-[11px]">
                {selectedInst.stackInfo.frames.map((frame, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-[#101622] border border-[#1c2638]"
                  >
                    <span className="text-slate-400 shrink-0">{frame.offset}</span>
                    <span className="text-emerald-300 font-bold shrink-0">{frame.value}</span>
                    <span className="text-[10px] text-slate-400 truncate text-right">
                      {frame.note}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
