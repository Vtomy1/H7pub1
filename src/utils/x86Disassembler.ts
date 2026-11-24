/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type InstructionCategory =
  | 'bios'
  | 'dos'
  | 'port-io'
  | 'vram-string'
  | 'flow'
  | 'register';

export interface RegisterSnapshot {
  ax: string;
  ah: string;
  al: string;
  bx: string;
  cx: string;
  dx: string;
  es: string;
  si: string;
  di: string;
  bp: string;
  sp: string;
  csIp: string;
}

export interface StackExplanation {
  title: string;
  spBefore: string;
  spAfter: string;
  summary: string;
  frames: { offset: string; value: string; note: string }[];
}

export interface DisassembledInstruction {
  offset: number; // Virtual CS offset (starts at 0x0100)
  fileOffset: number; // Byte index in comBinary
  bytes: number[];
  hexBytes: string;
  label?: string;
  mnemonic: string;
  operands: string;
  targetAddr?: number; // For jumps / mov si
  category: InstructionCategory;
  isBiosOrDosCall: boolean;
  biosTag?: string;
  comment: string;
  registers: RegisterSnapshot;
  stackInfo: StackExplanation;
}

export interface ParsedComDisassembly {
  instructions: DisassembledInstruction[];
  codeEndOffset: number;
  paletteDataOffset: number | null;
  graphicsDataOffset: number | null;
  totalBytes: number;
}

function hex16(val: number): string {
  return (val & 0xffff).toString(16).toUpperCase().padStart(4, '0') + 'h';
}

function hex8(val: number): string {
  return (val & 0xff).toString(16).toUpperCase().padStart(2, '0') + 'h';
}

function signed8(byte: number): number {
  return byte >= 0x80 ? byte - 256 : byte;
}

/**
 * Parses a generated MS-DOS .COM binary (loaded at CS:0100h) and produces
 * a full color-coded disassembly with simulated register values and stack state.
 */
export function disassembleComBinary(
  comBinary: Uint8Array,
  isCustomPalette: boolean
): ParsedComDisassembly {
  const rawInstructions: Array<{
    offset: number;
    fileOffset: number;
    bytes: number[];
    hexBytes: string;
    mnemonic: string;
    operands: string;
    targetAddr?: number;
    category: InstructionCategory;
    isBiosOrDosCall: boolean;
    biosTag?: string;
    comment: string;
    registers: RegisterSnapshot;
    stackInfo: StackExplanation;
  }> = [];

  // Track simulated 16-bit CPU registers from MS-DOS .COM entry state
  let ax = 0x0000;
  let bx = 0x0000;
  let cx = 0x00ff; // On COM entry, CX typically holds low bytes of size / 00FFh
  let dx = 0x0000;
  let es = 0x0000; // Initially ES = CS = PSP segment
  let si = 0x0100;
  let di = 0x0000;
  let bp = 0x0000;
  const sp = 0xfffe; // Standard DOS .COM stack pointer (word 0000h pushed at top)

  const snapshot = (ip: number): RegisterSnapshot => ({
    ax: hex16(ax),
    ah: hex8((ax >> 8) & 0xff),
    al: hex8(ax & 0xff),
    bx: hex16(bx),
    cx: hex16(cx),
    dx: hex16(dx),
    es: es === 0 ? 'CS (PSP)' : hex16(es),
    si: hex16(si),
    di: hex16(di),
    bp: hex16(bp),
    sp: hex16(sp),
    csIp: `CS:${hex16(ip)}`,
  });

  const defaultStack = (note: string): StackExplanation => ({
    title: 'MS-DOS .COM Stack Frame (SS = CS)',
    spBefore: 'FFFEh',
    spAfter: 'FFFEh',
    summary: note,
    frames: [
      {
        offset: 'SS:FFFEh',
        value: '0000h',
        note: 'DOS COM return address (points to PSP:0000h INT 20h)',
      },
    ],
  });

  let pc = 0; // index into comBinary
  let paletteDataOffset: number | null = null;
  let graphicsDataOffset: number | null = null;
  const jumpTargets = new Map<number, string>();

  while (pc < comBinary.length) {
    const virtAddr = 0x0100 + pc;
    const op = comBinary[pc];
    let len = 1;
    let mnemonic = 'db';
    let operands = hex8(op);
    let targetAddr: number | undefined;
    let category: InstructionCategory = 'register';
    let isBiosOrDosCall = false;
    let biosTag: string | undefined;
    let comment = '';
    let stackInfo = defaultStack(
      'Register/I/O instruction executes directly on CPU registers without modifying SS:SP.'
    );

    // 1. B8 imm16 -> mov ax, imm16
    if (op === 0xb8 && pc + 2 < comBinary.length) {
      len = 3;
      const imm = comBinary[pc + 1] | (comBinary[pc + 2] << 8);
      ax = imm;
      mnemonic = 'mov';
      operands = `ax, ${hex16(imm)}`;
      if (imm === 0x0012) {
        comment = 'AH=00h (Set Video Mode), AL=12h (VGA 640x480 16-color planar)';
      } else if (imm === 0xa000) {
        comment = 'Load VGA planar framebuffer base segment (0xA000)';
      } else if (imm === 0x0003) {
        comment = 'AH=00h (Set Video Mode), AL=03h (Standard 80x25 color text)';
      } else if (imm === 0x4c00) {
        comment = 'AH=4Ch (DOS Exit Process), AL=00h (Return code 0)';
      }
    }
    // 2. B9 imm16 -> mov cx, imm16
    else if (op === 0xb9 && pc + 2 < comBinary.length) {
      len = 3;
      const imm = comBinary[pc + 1] | (comBinary[pc + 2] << 8);
      cx = imm;
      mnemonic = 'mov';
      operands = `cx, ${hex16(imm)}`;
      comment = `Set loop counter CX = ${imm} (16 colors × 3 DAC channels = 48 bytes)`;
    }
    // 3. BA imm16 -> mov dx, imm16
    else if (op === 0xba && pc + 2 < comBinary.length) {
      len = 3;
      const imm = comBinary[pc + 1] | (comBinary[pc + 2] << 8);
      dx = imm;
      mnemonic = 'mov';
      operands = `dx, ${hex16(imm)}`;
      if (imm === 0x03c8) {
        comment = 'VGA DAC Write Address Register port (03C8h)';
      } else if (imm === 0x03c4) {
        comment = 'VGA Sequencer Address Register port (03C4h)';
      }
    }
    // 4. BE imm16 -> mov si, imm16
    else if (op === 0xbe && pc + 2 < comBinary.length) {
      len = 3;
      const imm = comBinary[pc + 1] | (comBinary[pc + 2] << 8);
      si = imm;
      targetAddr = imm;
      mnemonic = 'mov';
      if (isCustomPalette && paletteDataOffset === null) {
        paletteDataOffset = imm;
        operands = `si, palette_data (${hex16(imm)})`;
        comment = 'Point DS:SI to 48-byte 6-bit RGB DAC palette table';
      } else {
        graphicsDataOffset = imm;
        operands = `si, graphics_data (${hex16(imm)})`;
        comment = 'Point DS:SI to RLE-compressed 4-plane Mode 12h stream';
      }
    }
    // 5. B0 imm8 -> mov al, imm8
    else if (op === 0xb0 && pc + 1 < comBinary.length) {
      len = 2;
      const imm = comBinary[pc + 1];
      ax = (ax & 0xff00) | imm;
      mnemonic = 'mov';
      operands = `al, ${hex8(imm)}`;
      if (dx === 0x03c4 && imm === 0x02) {
        comment = 'Select Sequencer Index 02h (Map Mask Register)';
      } else if (imm === 0x01) {
        comment = 'Base plane bitmask (1 << BL selects Plane 0..3)';
      }
    }
    // 6. CD imm8 -> int imm8 (BIOS / DOS Software Interrupt)
    else if (op === 0xcd && pc + 1 < comBinary.length) {
      len = 2;
      const intNum = comBinary[pc + 1];
      const nextIp = virtAddr + 2;
      mnemonic = 'int';
      operands = hex8(intNum);
      isBiosOrDosCall = true;

      if (intNum === 0x10 && (ax & 0xffff) === 0x0012) {
        category = 'bios';
        biosTag = 'BIOS VIDEO • MODE 12h INIT';
        comment =
          'Invoke BIOS Video Services (IVT 0040h): initialize 640×480 16-color planar VGA mode & clear VRAM';
        stackInfo = {
          title: 'INT 10h Interrupt Stack Push (Mode 12h Initialization)',
          spBefore: 'FFFEh',
          spAfter: 'FFF8h (restored to FFFEh on IRET)',
          summary:
            'CPU pushes FLAGS, CS, and return IP onto SS:SP before jumping to ROM BIOS INT 10h handler (IVT 0000:0040h). BIOS saves caller registers on stack, programs CRTC/Sequencer/Graphics Controller for Mode 12h, and executes IRET.',
          frames: [
            { offset: 'SS:FFFEh', value: '0000h', note: 'Initial DOS .COM exit word' },
            { offset: 'SS:FFFCh', value: 'FLAGS', note: 'CPU flags pushed (IF=0, TF=0)' },
            { offset: 'SS:FFFAh', value: 'CS', note: 'Caller Code Segment' },
            { offset: 'SS:FFF8h', value: hex16(nextIp), note: 'Return IP (mov ax, 0A000h)' },
          ],
        };
      } else if (intNum === 0x10 && (ax & 0xffff) === 0x0003) {
        category = 'bios';
        biosTag = 'BIOS VIDEO • MODE 03h RESTORE';
        comment =
          'Invoke BIOS Video Services: restore standard 80×25 16-color VGA text mode before returning to DOS';
        stackInfo = {
          title: 'INT 10h Interrupt Stack Push (Text Mode Restore)',
          spBefore: 'FFFEh',
          spAfter: 'FFF8h (restored to FFFEh on IRET)',
          summary:
            'CPU pushes 6-byte interrupt frame (FLAGS, CS, IP) to SS:FFF8h. Video BIOS reprograms CRTC registers back to 80×25 text mode and returns via IRET.',
          frames: [
            { offset: 'SS:FFFEh', value: '0000h', note: 'Initial DOS .COM exit word' },
            { offset: 'SS:FFFCh', value: 'FLAGS', note: 'Saved processor flags' },
            { offset: 'SS:FFFAh', value: 'CS', note: 'Caller Code Segment' },
            { offset: 'SS:FFF8h', value: hex16(nextIp), note: 'Return IP (mov ax, 4C00h)' },
          ],
        };
      } else if (intNum === 0x16) {
        category = 'bios';
        biosTag = 'BIOS KEYBOARD • WAIT KEY';
        comment =
          'Invoke BIOS Keyboard Services (AH=00h): halt until user presses any key (returns ASCII/scan code in AX)';
        stackInfo = {
          title: 'INT 16h Interrupt Stack Push (Keyboard Wait)',
          spBefore: 'FFFEh',
          spAfter: 'FFF8h (restored to FFFEh on IRET)',
          summary:
            'Pushes FLAGS, CS, and return IP onto the stack. BIOS polls keyboard ring buffer (0040:001Ah) with interrupts re-enabled until a keystroke arrives, then pops frame via IRET.',
          frames: [
            { offset: 'SS:FFFEh', value: '0000h', note: 'Initial DOS .COM exit word' },
            { offset: 'SS:FFFCh', value: 'FLAGS', note: 'Saved CPU flags' },
            { offset: 'SS:FFFAh', value: 'CS', note: 'Caller Code Segment' },
            { offset: 'SS:FFF8h', value: hex16(nextIp), note: 'Return IP (mov ax, 0003h)' },
          ],
        };
      } else if (intNum === 0x21) {
        category = 'dos';
        biosTag = 'MS-DOS EXIT (AH=4Ch)';
        comment = 'Invoke DOS Function 4Ch: release COM memory block & return to COMMAND.COM';
        stackInfo = {
          title: 'INT 21h Terminate Process Stack Frame',
          spBefore: 'FFFEh',
          spAfter: 'Process Terminated',
          summary:
            'CPU pushes FLAGS, CS, and IP before transferring control to DOS kernel (IVT 0000:0084h). DOS discards this stack, frees the 64 KB COM segment, and jumps to parent COMMAND.COM.',
          frames: [
            { offset: 'SS:FFFEh', value: '0000h', note: 'Initial DOS .COM exit word' },
            { offset: 'SS:FFFCh', value: 'FLAGS', note: 'Pushed on INT 21h entry' },
            { offset: 'SS:FFFAh', value: 'CS', note: 'COM segment being freed' },
            { offset: 'SS:FFF8h', value: hex16(nextIp), note: 'Never returned (process ends)' },
          ],
        };
      }
    }
    // 7. 8E C0 -> mov es, ax
    else if (op === 0x8e && comBinary[pc + 1] === 0xc0) {
      len = 2;
      es = ax;
      mnemonic = 'mov';
      operands = 'es, ax';
      comment = 'ES = 0A000h: Extra Segment now points directly to VGA planar memory';
    }
    // 8. 30 xx -> xor reg8, reg8
    else if (op === 0x30 && pc + 1 < comBinary.length) {
      len = 2;
      const modrm = comBinary[pc + 1];
      mnemonic = 'xor';
      if (modrm === 0xc0) {
        ax &= 0xff00;
        operands = 'al, al';
        comment = 'Zero AL (DAC palette start index = 0)';
      } else if (modrm === 0xdb) {
        bx &= 0xff00;
        operands = 'bl, bl';
        comment = 'Zero BL (active VGA plane counter 0..3)';
      } else if (modrm === 0xe4) {
        ax &= 0x00ff;
        operands = 'ah, ah';
        comment = 'Zero AH (clear upper byte of AX)';
      } else if (modrm === 0xed) {
        cx &= 0x00ff;
        operands = 'ch, ch';
        comment = 'Zero CH (clear upper byte of CX count)';
      }
    }
    // 9. 31 FF -> xor di, di
    else if (op === 0x31 && comBinary[pc + 1] === 0xff) {
      len = 2;
      di = 0;
      mnemonic = 'xor';
      operands = 'di, di';
      comment = 'Reset destination VRAM offset ES:DI = A000:0000h (top-left pixel row)';
    }
    // 10. EE -> out dx, al
    else if (op === 0xee) {
      len = 1;
      category = 'port-io';
      mnemonic = 'out';
      operands = 'dx, al';
      if (dx === 0x03c8) {
        comment = 'Write starting palette index (0) to VGA DAC Address port 03C8h';
      } else if (dx === 0x03c9) {
        comment = 'Send 6-bit RGB channel value (0..63) to VGA DAC Data port 03C9h';
      } else if (dx === 0x03c4) {
        comment = 'Select VGA Sequencer Register 02h (Map Mask) via port 03C4h';
      } else if (dx === 0x03c5) {
        comment = 'Write plane bitmask (1/2/4/8) to port 03C5h — enables target 64KB plane';
      } else {
        comment = 'Write byte in AL to I/O port specified in DX';
      }
    }
    // 11. 42 -> inc dx
    else if (op === 0x42) {
      len = 1;
      dx = (dx + 1) & 0xffff;
      mnemonic = 'inc';
      operands = 'dx';
      comment = `Advance I/O port to ${hex16(dx)} (Data Register)`;
    }
    // 12. 41 -> inc cx
    else if (op === 0x41) {
      len = 1;
      cx = (cx + 1) & 0xffff;
      mnemonic = 'inc';
      operands = 'cx';
      comment = 'CX = (AL + 1): literal copy length (1..128 bytes)';
    }
    // 13. 4D -> dec bp
    else if (op === 0x4d) {
      len = 1;
      mnemonic = 'dec';
      operands = 'bp';
      comment = 'Decrement remaining compressed plane byte count in BP';
    }
    // 14. AC -> lodsb
    else if (op === 0xac) {
      len = 1;
      category = 'vram-string';
      mnemonic = 'lodsb';
      operands = '';
      comment = 'Load byte at DS:SI into AL and increment SI';
    }
    // 15. AD -> lodsw
    else if (op === 0xad) {
      len = 1;
      category = 'vram-string';
      mnemonic = 'lodsw';
      operands = '';
      comment = 'Load 16-bit compressed plane byte count from DS:SI into AX';
    }
    // 16. 89 C5 -> mov bp, ax
    else if (op === 0x89 && comBinary[pc + 1] === 0xc5) {
      len = 2;
      mnemonic = 'mov';
      operands = 'bp, ax';
      comment = 'Store compressed plane stream length in BP';
    }
    // 17. 88 D9 / 88 C1 -> mov cl, reg8
    else if (op === 0x88 && pc + 1 < comBinary.length) {
      len = 2;
      const modrm = comBinary[pc + 1];
      mnemonic = 'mov';
      if (modrm === 0xd9) {
        operands = 'cl, bl';
        comment = 'CL = active plane index (0..3) for bit shift';
      } else if (modrm === 0xc1) {
        operands = 'cl, al';
        comment = 'Copy RLE count byte into CL';
      }
    }
    // 18. D2 E0 -> shl al, cl
    else if (op === 0xd2 && comBinary[pc + 1] === 0xe0) {
      len = 2;
      mnemonic = 'shl';
      operands = 'al, cl';
      comment = 'Compute Sequencer Map Mask: 01h << plane_index (1, 2, 4, or 8)';
    }
    // 19. 83 FD imm8 -> cmp bp, imm8
    else if (op === 0x83 && comBinary[pc + 1] === 0xfd && pc + 2 < comBinary.length) {
      len = 3;
      const imm = comBinary[pc + 2];
      mnemonic = 'cmp';
      operands = `bp, ${hex8(imm)}`;
      comment = 'Check if compressed bytes remain in current bit-plane';
    }
    // 20. 80 FB imm8 -> cmp bl, imm8
    else if (op === 0x80 && comBinary[pc + 1] === 0xfb && pc + 2 < comBinary.length) {
      len = 3;
      const imm = comBinary[pc + 2];
      mnemonic = 'cmp';
      operands = `bl, ${hex8(imm)}`;
      comment = 'Check if all 4 VGA bit-planes (0..3) have been written';
    }
    // 21. FE C3 -> inc bl
    else if (op === 0xfe && comBinary[pc + 1] === 0xc3) {
      len = 2;
      bx = (bx & 0xff00) | (((bx & 0xff) + 1) & 0xff);
      mnemonic = 'inc';
      operands = 'bl';
      comment = 'Advance to next VGA bit-plane index';
    }
    // 22. A8 imm8 -> test al, imm8
    else if (op === 0xa8 && pc + 1 < comBinary.length) {
      len = 2;
      const imm = comBinary[pc + 1];
      mnemonic = 'test';
      operands = `al, ${hex8(imm)}`;
      comment = 'Test bit 7 of RLE tag (1 = repeat run, 0 = literal copy)';
    }
    // 23. 24 imm8 -> and al, imm8
    else if (op === 0x24 && pc + 1 < comBinary.length) {
      len = 2;
      const imm = comBinary[pc + 1];
      mnemonic = 'and';
      operands = `al, ${hex8(imm)}`;
      comment = 'Mask off high bit to extract repeat run length';
    }
    // 24. 04 imm8 -> add al, imm8
    else if (op === 0x04 && pc + 1 < comBinary.length) {
      len = 2;
      const imm = comBinary[pc + 1];
      mnemonic = 'add';
      operands = `al, ${hex8(imm)}`;
      comment = 'Repeat count = (tag & 7Fh) + 2 bytes';
    }
    // 25. 29 CD -> sub bp, cx
    else if (op === 0x29 && comBinary[pc + 1] === 0xcd) {
      len = 2;
      mnemonic = 'sub';
      operands = 'bp, cx';
      comment = 'Subtract literal byte count from remaining stream length BP';
    }
    // 26. F3 A4 / F3 AA -> rep movsb / rep stosb
    else if (op === 0xf3 && pc + 1 < comBinary.length) {
      len = 2;
      category = 'vram-string';
      const subOp = comBinary[pc + 1];
      if (subOp === 0xa4) {
        mnemonic = 'rep movsb';
        operands = '';
        comment = 'Copy CX literal bytes from DS:SI directly into VGA VRAM ES:DI';
      } else if (subOp === 0xaa) {
        mnemonic = 'rep stosb';
        operands = '';
        comment = 'Fill CX repeated bytes of AL into VGA VRAM ES:DI';
      }
    }
    // 27. Conditional & Unconditional relative 8-bit jumps (7E, 75, 72, EB, E2)
    else if (
      (op === 0x7e || op === 0x75 || op === 0x72 || op === 0xeb || op === 0xe2) &&
      pc + 1 < comBinary.length
    ) {
      len = 2;
      category = 'flow';
      const rel = signed8(comBinary[pc + 1]);
      const dest = virtAddr + 2 + rel;
      targetAddr = dest;

      if (op === 0xe2) {
        mnemonic = 'loop';
        operands = hex16(dest);
        jumpTargets.set(dest, 'dac_loop');
        comment = `Decrement CX and loop to ${hex16(dest)} until all 48 DAC bytes written`;
      } else if (op === 0x7e) {
        mnemonic = 'jle';
        operands = hex16(dest);
        jumpTargets.set(dest, 'plane_next');
        comment = `Jump to next bit-plane (${hex16(dest)}) when BP <= 0`;
      } else if (op === 0x75) {
        mnemonic = 'jnz';
        operands = hex16(dest);
        jumpTargets.set(dest, 'is_run');
        comment = `Jump to RLE repeat handler (${hex16(dest)}) if bit 7 set`;
      } else if (op === 0x72) {
        mnemonic = 'jb';
        operands = hex16(dest);
        jumpTargets.set(dest, 'plane_loop');
        comment = `Loop to ${hex16(dest)} for next bit-plane while BL < 4`;
      } else {
        mnemonic = 'jmp';
        operands = hex16(dest);
        jumpTargets.set(dest, 'unpack_token');
        comment = `Continue RLE token loop at ${hex16(dest)}`;
      }
    }

    const bytes = Array.from(comBinary.slice(pc, pc + len));
    const hexBytes = bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

    rawInstructions.push({
      offset: virtAddr,
      fileOffset: pc,
      bytes,
      hexBytes,
      mnemonic,
      operands,
      targetAddr,
      category,
      isBiosOrDosCall,
      biosTag,
      comment,
      registers: snapshot(virtAddr),
      stackInfo,
    });

    pc += len;

    // Stop disassembling machine code immediately after DOS terminate (int 21h)
    if (op === 0xcd && bytes[1] === 0x21) {
      break;
    }
  }

  // Attach resolved labels
  jumpTargets.set(0x0100, 'start');
  const instructions: DisassembledInstruction[] = rawInstructions.map((inst) => {
    const label = jumpTargets.get(inst.offset);
    let operands = inst.operands;
    if (inst.targetAddr !== undefined && jumpTargets.has(inst.targetAddr)) {
      const targetLabel = jumpTargets.get(inst.targetAddr)!;
      if (inst.category === 'flow') {
        operands = `${targetLabel} (${hex16(inst.targetAddr)})`;
      }
    }
    return {
      ...inst,
      label,
      operands,
    };
  });

  return {
    instructions,
    codeEndOffset: 0x0100 + pc,
    paletteDataOffset,
    graphicsDataOffset,
    totalBytes: comBinary.length,
  };
}
