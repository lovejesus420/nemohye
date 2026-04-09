import sharp from 'sharp';
import { mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const svgIcon = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="1024" height="1024">
  <defs>
    <linearGradient id="emeraldGradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#22c55e"/>
      <stop offset="100%" stop-color="#059669"/>
    </linearGradient>
  </defs>
  <rect width="500" height="500" fill="#ffffff"/>
  <rect x="50" y="50" width="400" height="400" rx="80" fill="url(#emeraldGradient)"/>
  <g fill="none" stroke="#ffffff" stroke-linejoin="round" stroke-linecap="round">
    <rect x="175" y="180" width="150" height="110" stroke-width="14"/>
    <rect x="160" y="150" width="180" height="30" rx="4" stroke-width="14"/>
    <line x1="250" y1="150" x2="250" y2="290" stroke-width="14"/>
    <path d="M 250 150 C 200 90, 140 130, 190 150 Z" stroke-width="12"/>
    <path d="M 250 150 C 300 90, 360 130, 310 150 Z" stroke-width="12"/>
    <path d="M 250 150 L 210 200" stroke-width="12"/>
    <path d="M 250 150 L 290 200" stroke-width="12"/>
  </g>
  <text x="250" y="360" font-family="Malgun Gothic, sans-serif" font-size="48" font-weight="bold" fill="#ffffff" text-anchor="middle" letter-spacing="-1">네모혜</text>
  <text x="250" y="405" font-family="Malgun Gothic, sans-serif" font-size="20" font-weight="500" fill="#ffffff" text-anchor="middle" letter-spacing="0.5">네 모든 혜택</text>
</svg>
`;

const ANDROID_BASE = join(__dirname, 'android/app/src/main/res');

const sizes = [
  { dir: 'mipmap-mdpi',    size: 48  },
  { dir: 'mipmap-hdpi',    size: 72  },
  { dir: 'mipmap-xhdpi',   size: 96  },
  { dir: 'mipmap-xxhdpi',  size: 144 },
  { dir: 'mipmap-xxxhdpi', size: 192 },
];

const svgBuf = Buffer.from(svgIcon);

for (const { dir, size } of sizes) {
  const outDir = join(ANDROID_BASE, dir);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  for (const name of ['ic_launcher.png', 'ic_launcher_round.png']) {
    await sharp(svgBuf).resize(size, size).png().toFile(join(outDir, name));
    console.log(`✓ ${dir}/${name} (${size}x${size})`);
  }
}

const fgSizes = [
  { dir: 'mipmap-mdpi',    size: 108 },
  { dir: 'mipmap-hdpi',    size: 162 },
  { dir: 'mipmap-xhdpi',   size: 216 },
  { dir: 'mipmap-xxhdpi',  size: 324 },
  { dir: 'mipmap-xxxhdpi', size: 432 },
];

for (const { dir, size } of fgSizes) {
  const outDir = join(ANDROID_BASE, dir);
  await sharp(svgBuf).resize(size, size).png().toFile(join(outDir, 'ic_launcher_foreground.png'));
  console.log(`✓ ${dir}/ic_launcher_foreground.png (${size}x${size})`);
}

console.log('\n아이콘 생성 완료!');
