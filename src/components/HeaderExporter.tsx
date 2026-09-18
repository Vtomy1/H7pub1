/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ExportTab, ProcessedVgaData } from '../types';
import { formatHexDump, MAX_COM_SIZE } from '../utils/comGenerator';
import {
  Download,
  Copy,
  Check,
  FileCode,
  FileText,
  Binary,
  Cpu,
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  Terminal,
} from 'lucide-react';

interface HeaderExporterProps {
  data: ProcessedVgaData | null;
}

export const HeaderExporter: React.FC<HeaderExporterProps> = ({ data }) => {
  const [activeTab, setActiveTab] = useState<ExportTab>('asm');
  const [copied, setCopied] = useState<boolean>(false);

  if (!data) return null;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadCom = () => {
    const blob = new Blob([data.comBinary as unknown as BlobPart], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'IMAGE12H.COM';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadAsm = () => {
    const blob = new Blob([data.asmCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'IMAGE12H.ASM';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadC = () => {
    const blob = new Blob([data.cHeader], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'IMAGE12H.H';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPascal = () => {
    const blob = new Blob([data.pascalCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'IMAGE12H.PAS';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadRawPlanes = () => {
    // Combine 4 planes (38,400 * 4 = 153,600 bytes)
    const combined = new Uint8Array(153600);
    combined.set(data.planes[0], 0);
    combined.set(data.planes[1], 38400);
    combined.set(data.planes[2], 76800);
    combined.set(data.planes[3], 115200);

    const blob = new Blob([combined as unknown as BlobPart], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'PLANES.BIN';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const comSizePct = Math.min(100, Math.round((data.compressedSize / MAX_COM_SIZE) * 100));

  return (
    <div id="header-exporter" className="flex flex-col gap-4 w-full">
      {/* Executable Status & Download Banner */}
      <div className="bg-[#111620] border border-[#1e293b] rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <span className="font-semibold text-sm text-slate-100">MS-DOS Mode 12h Executable (.COM)</span>
            {data.fitsInCom ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono bg-emerald-950/80 border border-emerald-500/40 text-emerald-400">
                <CheckCircle2 className="w-3 h-3" /> DOSBox & Real Hardware Ready
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono bg-amber-950/80 border border-amber-500/40 text-amber-400">
                <AlertTriangle className="w-3 h-3" /> Exceeds 64KB COM limit (Use ASM/EXE)
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-slate-400 mt-1">
            <span>Size: <strong className="text-white">{data.compressedSize.toLocaleString()}</strong> / 65,280 bytes ({comSizePct}%)</span>
            <span>•</span>
            <span>Raw Planar: <strong>153,600</strong> bytes</span>
            <span>•</span>
            <span>Compression: <strong className="text-emerald-400">{Math.round((1 - data.compressedSize / 153600) * 100)}%</strong> saved</span>
          </div>

          {/* Size Bar */}
          <div className="w-full sm:w-80 h-2 bg-[#1b2330] rounded-full overflow-hidden mt-1.5 border border-[#232f42]">
            <div
              className={`h-full rounded-full transition-all ${
                data.fitsInCom ? 'bg-gradient-to-r from-emerald-500 to-teal-400' : 'bg-red-500'
              }`}
              style={{ width: `${comSizePct}%` }}
            />
          </div>
        </div>

        {/* Primary Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-center">
          <button
            id="download-com-btn"
            onClick={handleDownloadCom}
            className="flex-1 sm:flex-none px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 transition-all cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Download IMAGE12H.COM</span>
          </button>
          <button
            id="download-asm-btn"
            onClick={handleDownloadAsm}
            className="px-3 py-2.5 rounded-lg bg-[#182232] hover:bg-[#222f44] border border-[#2a384e] text-slate-200 font-medium text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
            title="Download NASM / TASM source (.ASM)"
          >
            <FileCode className="w-4 h-4 text-blue-400" />
            <span>.ASM</span>
          </button>
          <button
            id="download-planes-btn"
            onClick={handleDownloadRawPlanes}
            className="px-3 py-2.5 rounded-lg bg-[#182232] hover:bg-[#222f44] border border-[#2a384e] text-slate-200 font-medium text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
            title="Download 153.6KB Raw Planar Binary (.BIN)"
          >
            <Binary className="w-4 h-4 text-amber-400" />
            <span>.BIN</span>
          </button>
        </div>
      </div>

      {/* Code & Architecture Viewer Card */}
      <div className="bg-[#111620] border border-[#1e293b] rounded-xl overflow-hidden flex flex-col">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-between border-b border-[#1c2637] bg-[#0c1017] px-3 pt-2">
          <div className="flex items-center gap-1">
            {[
              { id: 'asm', label: 'x86 Assembly (.ASM)', icon: FileCode },
              { id: 'cheader', label: 'C Header (.H)', icon: FileText },
              { id: 'pascal', label: 'Turbo Pascal (.PAS)', icon: FileCode },
              { id: 'hex', label: 'COM Hex Dump', icon: Binary },
              { id: 'details', label: 'Mode 12h Spec', icon: Cpu },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id as ExportTab)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-all ${
                    isActive
                      ? 'border-blue-500 text-blue-400 bg-[#141b27]'
                      : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#111722]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 pb-2">
            {activeTab !== 'details' && (
              <button
                id="copy-code-btn"
                onClick={() => {
                  let text = '';
                  if (activeTab === 'asm') text = data.asmCode;
                  else if (activeTab === 'cheader') text = data.cHeader;
                  else if (activeTab === 'pascal') text = data.pascalCode;
                  else if (activeTab === 'hex') text = formatHexDump(data.comBinary, 1024);
                  handleCopy(text);
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#182232] hover:bg-[#202d42] border border-[#273750] text-xs text-slate-300 transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Code</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Tab Contents */}
        <div className="p-4 bg-[#090d14] overflow-x-auto max-h-[480px]">
          {activeTab === 'asm' && (
            <pre className="font-mono text-xs text-slate-300 leading-relaxed whitespace-pre selection:bg-blue-600 selection:text-white">
              {data.asmCode}
            </pre>
          )}

          {activeTab === 'cheader' && (
            <pre className="font-mono text-xs text-slate-300 leading-relaxed whitespace-pre selection:bg-blue-600 selection:text-white">
              {data.cHeader}
            </pre>
          )}

          {activeTab === 'pascal' && (
            <pre className="font-mono text-xs text-slate-300 leading-relaxed whitespace-pre selection:bg-blue-600 selection:text-white">
              {data.pascalCode}
            </pre>
          )}

          {activeTab === 'hex' && (
            <div className="flex flex-col gap-2">
              <div className="text-[11px] font-mono text-slate-400">
                Base Address: CS:0100h | Displaying first 512 bytes of binary image
              </div>
              <pre className="font-mono text-xs text-emerald-400 leading-relaxed whitespace-pre selection:bg-emerald-900 selection:text-emerald-200">
                {formatHexDump(data.comBinary, 512)}
              </pre>
            </div>
          )}

          {activeTab === 'details' && (
            <div className="flex flex-col gap-4 text-xs text-slate-300 leading-relaxed">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[#101622] p-3.5 rounded-lg border border-[#1b2535]">
                  <h4 className="font-semibold text-white mb-2 flex items-center gap-1.5">
                    <Cpu className="w-4 h-4 text-blue-400" />
                    MS-DOS Mode 12h Architecture
                  </h4>
                  <ul className="space-y-1.5 text-slate-400 font-mono text-[11px]">
                    <li>• <strong className="text-slate-200">Video Mode:</strong> INT 10h AH=00h AL=12h</li>
                    <li>• <strong className="text-slate-200">Resolution:</strong> 640 horizontal x 480 vertical</li>
                    <li>• <strong className="text-slate-200">Color Depth:</strong> 4 bits per pixel (16 colors)</li>
                    <li>• <strong className="text-slate-200">Memory Organization:</strong> 4 Bit-Planes at segment 0xA000</li>
                    <li>• <strong className="text-slate-200">Bytes per Row:</strong> 640 / 8 = 80 bytes per plane</li>
                    <li>• <strong className="text-slate-200">Plane Size:</strong> 80 * 480 = 38,400 bytes</li>
                    <li>• <strong className="text-slate-200">Total Video RAM:</strong> 38,400 * 4 = 153,600 bytes</li>
                  </ul>
                </div>

                <div className="bg-[#101622] p-3.5 rounded-lg border border-[#1b2535]">
                  <h4 className="font-semibold text-white mb-2 flex items-center gap-1.5">
                    <HardDrive className="w-4 h-4 text-emerald-400" />
                    VGA Register Programming Ports
                  </h4>
                  <ul className="space-y-1.5 text-slate-400 font-mono text-[11px]">
                    <li>• <strong className="text-slate-200">Port 03C4h:</strong> VGA Sequencer Address Register</li>
                    <li>• <strong className="text-slate-200">Port 03C5h:</strong> VGA Sequencer Data Register</li>
                    <li>• <strong className="text-slate-200">Map Mask Index 02h:</strong> Enables CPU writes to Plane 0 (01h), Plane 1 (02h), Plane 2 (04h), Plane 3 (08h)</li>
                    <li>• <strong className="text-slate-200">Port 03C8h:</strong> VGA DAC Address Write Register</li>
                    <li>• <strong className="text-slate-200">Port 03C9h:</strong> VGA DAC Data Register (6-bit RGB 0..63)</li>
                  </ul>
                </div>
              </div>

              <div className="bg-[#101622] p-3.5 rounded-lg border border-[#1b2535]">
                <h4 className="font-semibold text-white mb-1.5">How the MS-DOS .COM File Executes in DOSBox</h4>
                <p className="text-slate-400 text-xs">
                  To run the generated <code className="text-emerald-400">IMAGE12H.COM</code> file in DOSBox, mount your folder, run <code className="text-white">IMAGE12H.COM</code> at the <code className="text-slate-300">C:\&gt;</code> prompt. The x86 bootstrap sets video mode 12h, selects the VGA Sequencer planes, decompresses the 640x480 planar image at lightning speed into video segment 0xA000, and holds until you press any key, after which it safely restores text mode 03h and exits cleanly to DOS.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
