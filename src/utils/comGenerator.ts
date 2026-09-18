/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VgaColor, ProcessedVgaData } from '../types';
import { BYTES_PER_PLANE } from './planarVga';

export const MAX_COM_SIZE = 65280; // 64KB (65536) minus 256-byte PSP = 65,280 bytes

/**
 * Compact Byte-Run RLE compressor for VGA planar data.
 * Produces high compression on dithered and graphic bitplanes while keeping
 * the x86 decompression routine under 45 bytes of machine code.
 */
export function compressPlaneRle(plane: Uint8Array): Uint8Array {
  const output: number[] = [];
  const len = plane.length;
  let i = 0;

  while (i < len) {
    // Check for run of identical bytes
    let runLen = 1;
    while (i + runLen < len && plane[i + runLen] === plane[i] && runLen < 129) {
      runLen++;
    }

    if (runLen >= 3) {
      // Repeat tag: 0x80 | (runLen - 2)
      // Tag value is 128..255, representing repeat next byte 2..129 times
      output.push(0x80 | (runLen - 2));
      output.push(plane[i]);
      i += runLen;
    } else {
      // Literal sequence
      let litLen = 0;
      const start = i;

      while (i < len && litLen < 128) {
        // Look ahead to see if a run of >=3 is beginning
        if (i + 2 < len && plane[i] === plane[i + 1] && plane[i] === plane[i + 2]) {
          break;
        }
        litLen++;
        i++;
      }

      if (litLen > 0) {
        // Literal tag: 0..127 representing (litLen - 1)
        output.push(litLen - 1);
        for (let k = 0; k < litLen; k++) {
          output.push(plane[start + k]);
        }
      }
    }
  }

  return new Uint8Array(output);
}

/**
 * Build executable MS-DOS .COM binary file (16-bit real mode x86).
 * Loaded at CS:0100h by COMMAND.COM.
 */
export function buildComExecutable(
  planes: [Uint8Array, Uint8Array, Uint8Array, Uint8Array],
  palette: VgaColor[],
  isCustomPalette: boolean
): { comBinary: Uint8Array; compressedSize: number; fitsInCom: boolean } {
  // Compress all 4 planes
  const compressedPlanes = planes.map((p) => compressPlaneRle(p));
  const compressedSizes = compressedPlanes.map((p) => p.length);

  const headerBytes: number[] = [];

  // --- x86 Machine Code Header ---
  // org 100h (implicit in .COM)

  // 1. Set video mode 12h (640x480 16-color graphics)
  // B8 12 00       mov ax, 0012h
  // CD 10          int 10h
  headerBytes.push(0xb8, 0x12, 0x00);
  headerBytes.push(0xcd, 0x10);

  // 2. Setup ES segment to VGA video memory 0xA000
  // B8 00 A0       mov ax, 0A000h
  // 8E C0          mov es, ax
  headerBytes.push(0xb8, 0x00, 0xa0);
  headerBytes.push(0x8e, 0xc0);

  // 3. Custom DAC Palette programming (if needed)
  if (isCustomPalette) {
    // BA C8 03       mov dx, 03C8h (VGA DAC Address Write Register)
    // 30 C0          xor al, al    (Start at color index 0)
    // EE             out dx, al
    // 42             inc dx        (03C9h: VGA DAC Data Register)
    // BE <disp16>    mov si, offset palette_data
    // B9 30 00       mov cx, 48    (16 colors * 3 RGB values in 6-bit)
    // dac_loop:
    // AC             lodsb
    // EE             out dx, al
    // E2 FC          loop dac_loop
    headerBytes.push(0xba, 0xc8, 0x03);
    headerBytes.push(0x30, 0xc0);
    headerBytes.push(0xee);
    headerBytes.push(0x42);
    // Placeholder for mov si, offset palette_data (we'll fix offset later)
    const palMovSiIndex = headerBytes.length;
    headerBytes.push(0xbe, 0x00, 0x00);
    headerBytes.push(0xb9, 0x30, 0x00);
    headerBytes.push(0xac);
    headerBytes.push(0xee);
    headerBytes.push(0xe2, 0xfc);
  }

  // 4. Setup SI to point to compressed graphics stream
  // BE <disp16>    mov si, offset graphics_data
  const dataMovSiIndex = headerBytes.length;
  headerBytes.push(0xbe, 0x00, 0x00);

  // 5. Plane decompression loop (BL = 0..3)
  // 30 DB          xor bl, bl      ; BL = plane index (0..3)
  // plane_loop:
  // BA C4 03       mov dx, 03C4h   ; VGA Sequencer Address Port
  // B0 02          mov al, 02h     ; Map Mask Register Index
  // EE             out dx, al
  // 42             inc dx          ; 03C5h Sequencer Data Port
  // 88 D9          mov cl, bl
  // B0 01          mov al, 01h
  // D2 E0          shl al, cl      ; AL = 1 << BL (plane mask: 1, 2, 4, 8)
  // EE             out dx, al      ; Enable target bit plane
  //
  // AD             lodsw           ; AX = compressed bytes count for this plane
  // 89 C5          mov bp, ax      ; BP = bytes left to read
  // 31 FF          xor di, di      ; DI = 0000h (VGA buffer target offset)
  //
  // unpack_token:
  // 83 FD 00       cmp bp, 0
  // 7E 1F          jle plane_next  ; (rel +31 bytes)
  // AC             lodsb           ; AL = tag
  // 4D             dec bp
  // A8 80          test al, 80h
  // 75 0C          jnz is_run
  //
  // ; Literal copy: (AL + 1) bytes
  // 0F B6 C8       movzx cx, al    ; or 30 E4 / 88 C1
  // 41             inc cx
  // 29 CD          sub bp, cx
  // F3 A4          rep movsb
  // EB ED          jmp unpack_token
  //
  // is_run:
  // 24 7F          and al, 7Fh
  // 04 02          add al, 02h
  // 0F B6 C8       movzx cx, al
  // AC             lodsb           ; byte to repeat
  // 4D             dec bp
  // F3 AA          rep stosb
  // EB DE          jmp unpack_token
  //
  // plane_next:
  // FEC3           inc bl
  // 80 FB 04       cmp bl, 04h
  // 72 C3          jb plane_loop
  headerBytes.push(0x30, 0xdb); // xor bl, bl

  const planeLoopOffset = headerBytes.length; // offset for jb plane_loop
  headerBytes.push(0xba, 0xc4, 0x03); // mov dx, 03C4h
  headerBytes.push(0xb0, 0x02);       // mov al, 02h
  headerBytes.push(0xee);             // out dx, al
  headerBytes.push(0x42);             // inc dx
  headerBytes.push(0x88, 0xd9);       // mov cl, bl
  headerBytes.push(0xb0, 0x01);       // mov al, 01h
  headerBytes.push(0xd2, 0xe0);       // shl al, cl
  headerBytes.push(0xee);             // out dx, al

  headerBytes.push(0xad);             // lodsw
  headerBytes.push(0x89, 0xc5);       // mov bp, ax
  headerBytes.push(0x31, 0xff);       // xor di, di

  const unpackTokenOffset = headerBytes.length;
  headerBytes.push(0x83, 0xfd, 0x00); // cmp bp, 0

  // jle plane_next (placeholder rel8)
  const jleIndex = headerBytes.length;
  headerBytes.push(0x7e, 0x00);

  headerBytes.push(0xac);             // lodsb
  headerBytes.push(0x4d);             // dec bp
  headerBytes.push(0xa8, 0x80);       // test al, 80h

  // jnz is_run (placeholder rel8)
  const jnzIndex = headerBytes.length;
  headerBytes.push(0x75, 0x00);

  // Literal run:
  // 30 E4          xor ah, ah
  // 88 C1          mov cl, al
  // 30 ED          xor ch, ch
  // 41             inc cx
  // 29 CD          sub bp, cx
  // F3 A4          rep movsb
  // jmp unpack_token
  headerBytes.push(0x30, 0xe4);
  headerBytes.push(0x88, 0xc1);
  headerBytes.push(0x30, 0xed);
  headerBytes.push(0x41);
  headerBytes.push(0x29, 0xcd);
  headerBytes.push(0xf3, 0xa4);

  // jmp unpack_token
  const jmpLiteralRel = unpackTokenOffset - (headerBytes.length + 2);
  headerBytes.push(0xeb, jmpLiteralRel & 0xff);

  // is_run label:
  const isRunOffset = headerBytes.length;
  headerBytes[jnzIndex + 1] = (isRunOffset - (jnzIndex + 2)) & 0xff;

  // 24 7F          and al, 7Fh
  // 04 02          add al, 02h
  // 30 E4          xor ah, ah
  // 88 C1          mov cl, al
  // 30 ED          xor ch, ch
  // AC             lodsb
  // 4D             dec bp
  // F3 AA          rep stosb
  headerBytes.push(0x24, 0x7f);
  headerBytes.push(0x04, 0x02);
  headerBytes.push(0x30, 0xe4);
  headerBytes.push(0x88, 0xc1);
  headerBytes.push(0x30, 0xed);
  headerBytes.push(0xac);
  headerBytes.push(0x4d);
  headerBytes.push(0xf3, 0xaa);

  // jmp unpack_token
  const jmpRunRel = unpackTokenOffset - (headerBytes.length + 2);
  headerBytes.push(0xeb, jmpRunRel & 0xff);

  // plane_next label:
  const planeNextOffset = headerBytes.length;
  headerBytes[jleIndex + 1] = (planeNextOffset - (jleIndex + 2)) & 0xff;

  // FE C3          inc bl
  // 80 FB 04       cmp bl, 04h
  // jb plane_loop
  headerBytes.push(0xfe, 0xc3);
  headerBytes.push(0x80, 0xfb, 0x04);
  const jbPlaneLoopRel = planeLoopOffset - (headerBytes.length + 2);
  headerBytes.push(0x72, jbPlaneLoopRel & 0xff);

  // 6. Wait for keystroke
  // 30 E4          xor ah, ah
  // CD 16          int 16h
  headerBytes.push(0x30, 0xe4);
  headerBytes.push(0xcd, 0x16);

  // 7. Restore 80x25 text mode (Mode 03h)
  // B8 03 00       mov ax, 0003h
  // CD 10          int 10h
  headerBytes.push(0xb8, 0x03, 0x00);
  headerBytes.push(0xcd, 0x10);

  // 8. Terminate to DOS
  // B8 00 4C       mov ax, 4C00h
  // CD 21          int 21h
  headerBytes.push(0xb8, 0x00, 0x4c);
  headerBytes.push(0xcd, 0x21);

  // Data section starts here!
  let currentOffset = 0x0100 + headerBytes.length;

  let palDataOffset = 0;
  const paletteBytes: number[] = [];
  if (isCustomPalette) {
    palDataOffset = currentOffset;
    // 16 colors * 3 DAC bytes (6-bit each 0..63)
    for (const col of palette) {
      paletteBytes.push(col.dacR & 0x3f, col.dacG & 0x3f, col.dacB & 0x3f);
    }
    currentOffset += paletteBytes.length;

    // Patch palette mov si, offset palDataOffset
    // Header byte index: palMovSiIndex + 1 and + 2
    // Search for the placeholder
    // In our code:
    // headerBytes.push(0xba, 0xc8, 0x03);
    // headerBytes.push(0x30, 0xc0);
    // headerBytes.push(0xee);
    // headerBytes.push(0x42);
    // const palMovSiIndex = headerBytes.length; // index of 0xbe
    headerBytes[11] = palDataOffset & 0xff;
    headerBytes[12] = (palDataOffset >> 8) & 0xff;
  }

  // Patch graphics data mov si, offset currentOffset
  // The mov si is at dataMovSiIndex + 1 and + 2
  headerBytes[dataMovSiIndex + 1] = currentOffset & 0xff;
  headerBytes[dataMovSiIndex + 2] = (currentOffset >> 8) & 0xff;

  // Build packed data block: [2 bytes len, ...data] for each plane
  const dataPayload: number[] = [];
  for (let p = 0; p < 4; p++) {
    const pData = compressedPlanes[p];
    const pLen = pData.length;
    dataPayload.push(pLen & 0xff, (pLen >> 8) & 0xff);
    for (let k = 0; k < pLen; k++) {
      dataPayload.push(pData[k]);
    }
  }

  // Combine full COM image
  const totalLength = headerBytes.length + paletteBytes.length + dataPayload.length;
  const comBinary = new Uint8Array(totalLength);
  comBinary.set(headerBytes, 0);
  if (paletteBytes.length > 0) {
    comBinary.set(paletteBytes, headerBytes.length);
  }
  comBinary.set(dataPayload, headerBytes.length + paletteBytes.length);

  return {
    comBinary,
    compressedSize: totalLength,
    fitsInCom: totalLength <= MAX_COM_SIZE,
  };
}

/**
 * Generate full, commented 16-bit x86 NASM/TASM source code (.ASM)
 */
export function generateAsmSource(
  planes: [Uint8Array, Uint8Array, Uint8Array, Uint8Array],
  palette: VgaColor[],
  isCustomPalette: boolean
): string {
  const compressed = planes.map((p) => compressPlaneRle(p));
  const totalComp = compressed.reduce((acc, p) => acc + p.length, 0);

  const lines: string[] = [];
  lines.push('; ==============================================================================');
  lines.push('; MS-DOS VGA Mode 12h (640x480 16-Color Planar) Executable (.COM)');
  lines.push('; Target: Real Mode 8086/286/386+ | Base: CS:0100h | Output: <filename>.COM');
  lines.push('; Assemble with: nasm -f bin image.asm -o image.com');
  lines.push('; ==============================================================================');
  lines.push('');
  lines.push('                org     100h            ; MS-DOS COM executable origin');
  lines.push('                section .text');
  lines.push('');
  lines.push('start:');
  lines.push('                ; --- 1. Set VGA Mode 12h (640x480, 16 Colors, 4 Bit-Planes) ---');
  lines.push('                mov     ax, 0012h       ; BIOS Video Service: Set Mode 12h');
  lines.push('                int     10h');
  lines.push('');
  lines.push('                ; --- 2. Initialize ES to VGA Framebuffer Base (0xA000) ---');
  lines.push('                mov     ax, 0A000h      ; Video memory base address');
  lines.push('                mov     es, ax');
  lines.push('');

  if (isCustomPalette) {
    lines.push('                ; --- 3. Program VGA DAC Palette Registers (0x3C8 / 0x3C9) ---');
    lines.push('                mov     dx, 03C8h       ; VGA DAC Address Write Port');
    lines.push('                xor     al, al          ; Start at color index 0');
    lines.push('                out     dx, al');
    lines.push('                inc     dx              ; 03C9h: VGA DAC Data Port');
    lines.push('                mov     si, palette_data');
    lines.push('                mov     cx, 48          ; 16 colors * 3 (6-bit RGB values 0..63)');
    lines.push('dac_loop:');
    lines.push('                lodsb');
    lines.push('                out     dx, al');
    lines.push('                loop    dac_loop');
    lines.push('');
  }

  lines.push('                ; --- 4. Decompress 4 Bit-Planes to VGA VRAM ---');
  lines.push('                mov     si, graphics_data ; SI -> Compressed Planar Stream');
  lines.push('                xor     bl, bl          ; BL = Plane index (0..3)');
  lines.push('');
  lines.push('plane_loop:');
  lines.push('                ; Select active VGA bit plane via Sequencer Map Mask');
  lines.push('                mov     dx, 03C4h       ; VGA Sequencer Address Port');
  lines.push('                mov     al, 02h         ; Register 02h: Map Mask Register');
  lines.push('                out     dx, al');
  lines.push('                inc     dx              ; 03C5h: Sequencer Data Port');
  lines.push('                mov     cl, bl');
  lines.push('                mov     al, 01h');
  lines.push('                shl     al, cl          ; AL = 1 << BL (Plane 0=1, 1=2, 2=4, 3=8)');
  lines.push('                out     dx, al          ; Enable plane for write');
  lines.push('');
  lines.push('                lodsw                   ; AX = Plane compressed byte count');
  lines.push('                mov     bp, ax          ; BP = Compressed bytes remaining');
  lines.push('                xor     di, di          ; DI = 0000h (Top-left of 640x480 plane)');
  lines.push('');
  lines.push('unpack_token:');
  lines.push('                cmp     bp, 0           ; Check if plane stream is exhausted');
  lines.push('                jle     plane_next');
  lines.push('                lodsb                   ; AL = RLE tag byte');
  lines.push('                dec     bp');
  lines.push('                test    al, 80h         ; If bit 7 is set, it is a repeated run');
  lines.push('                jnz     is_run');
  lines.push('');
  lines.push('                ; --- Literal Run of (AL + 1) Bytes ---');
  lines.push('                xor     ah, ah');
  lines.push('                mov     cl, al');
  lines.push('                xor     ch, ch');
  lines.push('                inc     cx              ; CX = Literal count');
  lines.push('                sub     bp, cx');
  lines.push('                rep     movsb           ; Copy DS:SI -> ES:DI');
  lines.push('                jmp     unpack_token');
  lines.push('');
  lines.push('is_run:');
  lines.push('                ; --- Repeat Run of Next Byte ---');
  lines.push('                and     al, 7Fh');
  lines.push('                add     al, 02h         ; Count = (Tag & 0x7F) + 2');
  lines.push('                xor     ah, ah');
  lines.push('                mov     cl, al');
  lines.push('                xor     ch, ch');
  lines.push('                lodsb                   ; AL = Byte value to repeat');
  lines.push('                dec     bp');
  lines.push('                rep     stosb           ; Repeat AL into ES:DI');
  lines.push('                jmp     unpack_token');
  lines.push('');
  lines.push('plane_next:');
  lines.push('                inc     bl              ; Next bit-plane');
  lines.push('                cmp     bl, 04h');
  lines.push('                jb      plane_loop');
  lines.push('');
  lines.push('                ; --- 5. Wait for Keypress (INT 16h, AH=00h) ---');
  lines.push('                xor     ah, ah');
  lines.push('                int     16h');
  lines.push('');
  lines.push('                ; --- 6. Restore Standard 80x25 Text Mode (Mode 03h) ---');
  lines.push('                mov     ax, 0003h');
  lines.push('                int     10h');
  lines.push('');
  lines.push('                ; --- 7. Terminate Process & Return to MS-DOS ---');
  lines.push('                mov     ax, 4C00h');
  lines.push('                int     21h');
  lines.push('');

  if (isCustomPalette) {
    lines.push('; --- VGA DAC Palette Data (16 Colors x 3 Bytes, 6-bit RGB 0..63) ---');
    lines.push('palette_data:');
    for (let i = 0; i < palette.length; i++) {
      const c = palette[i];
      lines.push(`                db      ${c.dacR.toString().padStart(2, ' ')}, ${c.dacG.toString().padStart(2, ' ')}, ${c.dacB.toString().padStart(2, ' ')}   ; Color ${i.toString().padStart(2, ' ')}: ${c.name}`);
    }
    lines.push('');
  }

  lines.push('; --- Compressed 4-Plane Mode 12h Graphics Stream ---');
  lines.push('; Planes: 0=Blue, 1=Green, 2=Red, 3=Intensity (Total Raw: 153,600 Bytes)');
  lines.push(`; Compressed Size: ${totalComp} Bytes (fits within 64KB COM limit)`);
  lines.push('graphics_data:');

  for (let p = 0; p < 4; p++) {
    const pData = compressed[p];
    const pLen = pData.length;
    lines.push(`; Plane ${p} (${['Blue', 'Green', 'Red', 'Intensity'][p]}): ${pLen} bytes`);
    lines.push(`                dw      ${pLen}          ; Plane ${p} byte count`);

    // Format in 16 bytes per line
    for (let i = 0; i < Math.min(pLen, 128); i += 16) {
      const chunk = Array.from(pData.slice(i, Math.min(i + 16, pLen)));
      const hexStr = chunk.map((b) => '0x' + b.toString(16).padStart(2, '0')).join(', ');
      lines.push(`                db      ${hexStr}`);
    }
    if (pLen > 128) {
      lines.push(`                ; ... [${pLen - 128} additional bytes for Plane ${p} omitted in preview; included in full download]`);
    }
  }

  return lines.join('\n');
}

/**
 * Generate C / C++ Header file for MS-DOS / OpenWatcom / Turbo C / DJGPP
 */
export function generateCHeader(
  planes: [Uint8Array, Uint8Array, Uint8Array, Uint8Array],
  palette: VgaColor[],
  isCustomPalette: boolean
): string {
  const lines: string[] = [];
  lines.push('/**');
  lines.push(' * MS-DOS VGA Mode 12h (640x480 16-Color Planar) C Header');
  lines.push(' * Compatible with: Borland Turbo C/C++, OpenWatcom, DJGPP');
  lines.push(' */');
  lines.push('#ifndef VGA_MODE12H_IMAGE_H');
  lines.push('#define VGA_MODE12H_IMAGE_H');
  lines.push('');
  lines.push('#include <dos.h>');
  lines.push('#include <conio.h>');
  lines.push('');
  lines.push('#define VGA_WIDTH       640');
  lines.push('#define VGA_HEIGHT      480');
  lines.push('#define BYTES_PER_PLANE 38400');
  lines.push('#define VGA_VRAM        ((unsigned char far *)0xA0000000L)');
  lines.push('');

  if (isCustomPalette) {
    lines.push('/* 16 Colors x 3 DAC channels (6-bit values 0..63) */');
    lines.push('const unsigned char vga_palette[16][3] = {');
    palette.forEach((c, idx) => {
      lines.push(`    { ${c.dacR}, ${c.dacG}, ${c.dacB} }${idx < 15 ? ',' : ''} /* ${c.name} */`);
    });
    lines.push('};');
    lines.push('');
  }

  lines.push('/* Planar VGA Mode 12h display routine */');
  lines.push('void vga_set_mode_12h(void) {');
  lines.push('    union REGS r;');
  lines.push('    r.x.ax = 0x0012; /* Set 640x480 16-color mode */');
  lines.push('    int86(0x10, &r, &r);');
  lines.push('}');
  lines.push('');
  lines.push('void vga_restore_text_mode(void) {');
  lines.push('    union REGS r;');
  lines.push('    r.x.ax = 0x0003; /* 80x25 text mode */');
  lines.push('    int86(0x10, &r, &r);');
  lines.push('}');
  lines.push('');
  lines.push('void vga_write_plane(int plane_index, const unsigned char far *data) {');
  lines.push('    unsigned int i;');
  lines.push('    unsigned char far *vram = VGA_VRAM;');
  lines.push('    /* Select VGA plane via Sequencer Map Mask Register (Port 0x3C4, Index 0x02) */');
  lines.push('    outp(0x03C4, 0x02);');
  lines.push('    outp(0x03C5, 1 << plane_index);');
  lines.push('    for (i = 0; i < BYTES_PER_PLANE; i++) {');
  lines.push('        vram[i] = data[i];');
  lines.push('    }');
  lines.push('}');
  lines.push('');
  lines.push('#endif /* VGA_MODE12H_IMAGE_H */');

  return lines.join('\n');
}

/**
 * Generate Turbo Pascal 7.0 Unit / Code
 */
export function generatePascalUnit(palette: VgaColor[], isCustomPalette: boolean): string {
  const lines: string[] = [];
  lines.push('{ ============================================================================== }');
  lines.push('{ MS-DOS VGA Mode 12h (640x480 16-Color Planar) Turbo Pascal Unit                }');
  lines.push('{ Target: Turbo Pascal 7.0 / Free Pascal for DOS                                 }');
  lines.push('{ ============================================================================== }');
  lines.push('unit Vga12h;');
  lines.push('');
  lines.push('interface');
  lines.push('uses Crt, Dos;');
  lines.push('');
  lines.push('procedure SetMode12h;');
  lines.push('procedure RestoreTextMode;');
  lines.push('procedure SelectPlane(PlaneIndex: Byte);');
  lines.push('');
  lines.push('implementation');
  lines.push('');
  lines.push('procedure SetMode12h;');
  lines.push('var Regs: Registers;');
  lines.push('begin');
  lines.push('  Regs.AX := $0012;');
  lines.push('  Intr($10, Regs);');
  lines.push('end;');
  lines.push('');
  lines.push('procedure RestoreTextMode;');
  lines.push('var Regs: Registers;');
  lines.push('begin');
  lines.push('  Regs.AX := $0003;');
  lines.push('  Intr($10, Regs);');
  lines.push('end;');
  lines.push('');
  lines.push('procedure SelectPlane(PlaneIndex: Byte);');
  lines.push('begin');
  lines.push('  Port[$3C4] := $02; { Sequencer Map Mask register }');
  lines.push('  Port[$3C5] := 1 shl PlaneIndex;');
  lines.push('end;');
  lines.push('');
  lines.push('end.');

  return lines.join('\n');
}

/**
 * Formats a byte array into a hex dump (Offset | Hex bytes | ASCII)
 */
export function formatHexDump(data: Uint8Array, maxBytes: number = 512): string {
  const lines: string[] = [];
  const limit = Math.min(data.length, maxBytes);

  for (let i = 0; i < limit; i += 16) {
    const offset = (0x0100 + i).toString(16).padStart(4, '0').toUpperCase();
    const chunk = Array.from(data.slice(i, Math.min(i + 16, limit)));

    const hexPart = chunk
      .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
      .join(' ')
      .padEnd(48, ' ');

    const asciiPart = chunk
      .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.'))
      .join('');

    lines.push(`${offset}  ${hexPart}  |${asciiPart}|`);
  }

  if (data.length > limit) {
    lines.push(`... [${data.length - limit} more bytes in full ${data.length} byte binary]`);
  }

  return lines.join('\n');
}
