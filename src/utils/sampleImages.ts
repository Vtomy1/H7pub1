/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VGA_WIDTH, VGA_HEIGHT } from './dithering';

export interface SamplePreset {
  id: string;
  name: string;
  description: string;
  generate: () => ImageData;
}

/**
 * Procedural retro graphics generator for instant 1-click testing
 */
export const SAMPLE_PRESETS: SamplePreset[] = [
  {
    id: 'ibm-pc',
    name: 'IBM PC 5150 & DOS',
    description: 'Vintage IBM PC with green phosphor CRT and DOS prompt',
    generate: () => {
      const canvas = document.createElement('canvas');
      canvas.width = VGA_WIDTH;
      canvas.height = VGA_HEIGHT;
      const ctx = canvas.getContext('2d')!;

      // Background gradient
      const bgGrad = ctx.createLinearGradient(0, 0, 0, VGA_HEIGHT);
      bgGrad.addColorStop(0, '#151b26');
      bgGrad.addColorStop(1, '#080c12');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, VGA_WIDTH, VGA_HEIGHT);

      // Desk surface
      const deskGrad = ctx.createLinearGradient(0, 360, 0, VGA_HEIGHT);
      deskGrad.addColorStop(0, '#4a3828');
      deskGrad.addColorStop(1, '#2b1f14');
      ctx.fillStyle = deskGrad;
      ctx.fillRect(0, 360, VGA_WIDTH, 120);

      // Computer chassis
      ctx.fillStyle = '#cfc5b0';
      ctx.fillRect(160, 260, 320, 110);
      ctx.strokeStyle = '#8f8574';
      ctx.lineWidth = 4;
      ctx.strokeRect(160, 260, 320, 110);

      // Disk drives
      ctx.fillStyle = '#222222';
      ctx.fillRect(360, 280, 100, 24);
      ctx.fillRect(360, 320, 100, 24);
      ctx.fillStyle = '#777777';
      ctx.fillRect(400, 290, 20, 4);
      ctx.fillRect(400, 330, 20, 4);

      // Badge
      ctx.fillStyle = '#103080';
      ctx.fillRect(180, 280, 40, 16);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px monospace';
      ctx.fillText('IBM', 190, 292);

      // Monitor Housing
      ctx.fillStyle = '#dcd4c0';
      ctx.fillRect(190, 80, 260, 180);
      ctx.strokeStyle = '#999080';
      ctx.lineWidth = 6;
      ctx.strokeRect(190, 80, 260, 180);

      // CRT Bezel & Screen
      ctx.fillStyle = '#1c1b18';
      ctx.beginPath();
      ctx.roundRect(210, 96, 220, 144, 16);
      ctx.fill();

      // CRT Phosphor Screen
      const crtGrad = ctx.createRadialGradient(320, 168, 10, 320, 168, 110);
      crtGrad.addColorStop(0, '#002812');
      crtGrad.addColorStop(1, '#000e05');
      ctx.fillStyle = crtGrad;
      ctx.beginPath();
      ctx.roundRect(216, 102, 208, 132, 10);
      ctx.fill();

      // DOS Prompt on Screen
      ctx.fillStyle = '#00ff66';
      ctx.font = '11px monospace';
      ctx.fillText('IBM Personal Computer DOS', 224, 122);
      ctx.fillText('Version 3.30 (C)Copyright', 224, 136);
      ctx.fillText('IBM Corp 1981, 1987', 224, 150);
      ctx.fillText('C:\\>MODE CO80', 224, 172);
      ctx.fillText('C:\\>GRAPHICS', 224, 186);
      ctx.fillText('C:\\>SHOW12H.COM _', 224, 204);

      // Title Banner
      ctx.fillStyle = '#e6edf5';
      ctx.font = 'bold 26px monospace';
      ctx.fillText('VGA MODE 12h (640x480)', 40, 45);

      ctx.fillStyle = '#4ade80';
      ctx.font = '14px monospace';
      ctx.fillText('4-BIT PLANAR GRAPHICS • 16 COLORS', 40, 70);

      return ctx.getImageData(0, 0, VGA_WIDTH, VGA_HEIGHT);
    },
  },
  {
    id: 'cyber-sunset',
    name: 'Cyberpunk Retro Grid',
    description: 'Neon synthwave sun with mountain wireframe and grid perspective',
    generate: () => {
      const canvas = document.createElement('canvas');
      canvas.width = VGA_WIDTH;
      canvas.height = VGA_HEIGHT;
      const ctx = canvas.getContext('2d')!;

      // Deep purple-to-dark sky
      const skyGrad = ctx.createLinearGradient(0, 0, 0, 300);
      skyGrad.addColorStop(0, '#0a001a');
      skyGrad.addColorStop(0.5, '#2b0c3f');
      skyGrad.addColorStop(1, '#691452');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, VGA_WIDTH, 300);

      // Retro Sun
      const sunGrad = ctx.createLinearGradient(0, 100, 0, 270);
      sunGrad.addColorStop(0, '#ffe600');
      sunGrad.addColorStop(0.5, '#ff4500');
      sunGrad.addColorStop(1, '#ff0077');
      ctx.fillStyle = sunGrad;
      ctx.beginPath();
      ctx.arc(320, 200, 90, 0, Math.PI * 2);
      ctx.fill();

      // Horizontal Sun Blinds
      ctx.fillStyle = '#2b0c3f';
      for (let y = 170; y < 290; y += 14) {
        const h = 2 + (y - 170) * 0.08;
        ctx.fillRect(200, y, 240, h);
      }

      // Mountain silhouettes
      ctx.fillStyle = '#140326';
      ctx.beginPath();
      ctx.moveTo(0, 300);
      ctx.lineTo(80, 210);
      ctx.lineTo(170, 270);
      ctx.lineTo(260, 190);
      ctx.lineTo(340, 250);
      ctx.lineTo(440, 180);
      ctx.lineTo(520, 260);
      ctx.lineTo(640, 220);
      ctx.lineTo(640, 300);
      ctx.closePath();
      ctx.fill();

      // Ground plane
      ctx.fillStyle = '#060010';
      ctx.fillRect(0, 300, VGA_WIDTH, 180);

      // Perspective Grid Lines
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 1.5;

      // Vanishing point: (320, 300)
      for (let x = -400; x <= VGA_WIDTH + 400; x += 60) {
        ctx.beginPath();
        ctx.moveTo(320, 300);
        ctx.lineTo(x, 480);
        ctx.stroke();
      }

      // Horizontal grid lines
      for (let i = 1; i <= 12; i++) {
        const y = 300 + Math.pow(i / 12, 1.8) * 180;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(VGA_WIDTH, y);
        ctx.stroke();
      }

      // Retro text
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 32px sans-serif';
      ctx.fillText('MS-DOS 640x480', 50, 60);

      return ctx.getImageData(0, 0, VGA_WIDTH, VGA_HEIGHT);
    },
  },
  {
    id: 'space-shuttle',
    name: 'Apollo / Earth Orbit',
    description: 'High-contrast Earth horizon, spacecraft and starry cosmos',
    generate: () => {
      const canvas = document.createElement('canvas');
      canvas.width = VGA_WIDTH;
      canvas.height = VGA_HEIGHT;
      const ctx = canvas.getContext('2d')!;

      // Starry void
      ctx.fillStyle = '#000003';
      ctx.fillRect(0, 0, VGA_WIDTH, VGA_HEIGHT);

      // Stars
      for (let i = 0; i < 240; i++) {
        const sx = (Math.sin(i * 997) * 0.5 + 0.5) * VGA_WIDTH;
        const sy = (Math.cos(i * 613) * 0.5 + 0.5) * 320;
        const bright = Math.floor((Math.sin(i * 37) * 0.5 + 0.5) * 200 + 55);
        ctx.fillStyle = `rgb(${bright},${bright},${bright + 20})`;
        ctx.fillRect(sx, sy, (i % 5 === 0) ? 2 : 1, (i % 5 === 0) ? 2 : 1);
      }

      // Earth limb
      const earthGrad = ctx.createRadialGradient(320, 700, 200, 320, 700, 500);
      earthGrad.addColorStop(0, '#ffffff');
      earthGrad.addColorStop(0.2, '#3b82f6');
      earthGrad.addColorStop(0.4, '#1d4ed8');
      earthGrad.addColorStop(0.55, '#052e64');
      earthGrad.addColorStop(0.65, '#000c24');
      earthGrad.addColorStop(1, '#000000');
      ctx.fillStyle = earthGrad;
      ctx.beginPath();
      ctx.arc(320, 750, 520, 0, Math.PI * 2);
      ctx.fill();

      // Atmosphere haze
      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(320, 750, 520, Math.PI * 1.25, Math.PI * 1.75);
      ctx.stroke();

      // Space Shuttle / Craft
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.moveTo(320, 160);
      ctx.lineTo(270, 250);
      ctx.lineTo(370, 250);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.moveTo(320, 160);
      ctx.lineTo(305, 200);
      ctx.lineTo(335, 200);
      ctx.closePath();
      ctx.fill();

      // Wing flaps and cockpit
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(312, 190, 16, 6);

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 24px monospace';
      ctx.fillText('MISSION: MODE 12h', 40, 50);

      return ctx.getImageData(0, 0, VGA_WIDTH, VGA_HEIGHT);
    },
  },
  {
    id: 'pixel-mona',
    name: 'Portrait / Classical Art',
    description: 'Subtle shading and skin-tone gradients to test dithering quality',
    generate: () => {
      const canvas = document.createElement('canvas');
      canvas.width = VGA_WIDTH;
      canvas.height = VGA_HEIGHT;
      const ctx = canvas.getContext('2d')!;

      // Warm classical chiaroscuro background
      const grad = ctx.createRadialGradient(320, 220, 50, 320, 240, 380);
      grad.addColorStop(0, '#5c4530');
      grad.addColorStop(0.4, '#312318');
      grad.addColorStop(1, '#0d0906');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, VGA_WIDTH, VGA_HEIGHT);

      // Head shape
      const faceGrad = ctx.createRadialGradient(310, 200, 20, 310, 210, 140);
      faceGrad.addColorStop(0, '#f5d5ba');
      faceGrad.addColorStop(0.5, '#c99875');
      faceGrad.addColorStop(0.8, '#82583e');
      faceGrad.addColorStop(1, '#3b2518');
      ctx.fillStyle = faceGrad;
      ctx.beginPath();
      ctx.ellipse(320, 220, 95, 125, 0, 0, Math.PI * 2);
      ctx.fill();

      // Eyes
      ctx.fillStyle = '#422818';
      ctx.beginPath();
      ctx.ellipse(285, 200, 16, 8, 0, 0, Math.PI * 2);
      ctx.ellipse(355, 200, 16, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      // Pupils
      ctx.fillStyle = '#170e08';
      ctx.beginPath();
      ctx.arc(285, 200, 5, 0, Math.PI * 2);
      ctx.arc(355, 200, 5, 0, Math.PI * 2);
      ctx.fill();

      // Nose bridge
      ctx.strokeStyle = '#734c32';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(320, 200);
      ctx.lineTo(316, 235);
      ctx.lineTo(326, 240);
      ctx.stroke();

      // Lips
      ctx.fillStyle = '#94443b';
      ctx.beginPath();
      ctx.ellipse(320, 268, 22, 9, 0, 0, Math.PI * 2);
      ctx.fill();

      // Dark hair curls
      ctx.fillStyle = '#1e140d';
      ctx.beginPath();
      ctx.arc(230, 220, 45, 0, Math.PI * 2);
      ctx.arc(410, 220, 45, 0, Math.PI * 2);
      ctx.arc(320, 115, 60, 0, Math.PI * 2);
      ctx.fill();

      // Frame
      ctx.strokeStyle = '#cda34f';
      ctx.lineWidth = 12;
      ctx.strokeRect(60, 40, 520, 400);

      ctx.fillStyle = '#d4af37';
      ctx.font = 'bold 20px serif';
      ctx.fillText('CHIAROSCURO 16-COLOR TEST', 160, 30);

      return ctx.getImageData(0, 0, VGA_WIDTH, VGA_HEIGHT);
    },
  },
];
