import sharp from 'sharp';
import { mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 1024x1024 선물상자 아이콘 SVG
const svgIcon = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#22C55E"/>
      <stop offset="50%" stop-color="#16A34A"/>
      <stop offset="100%" stop-color="#14532D"/>
    </linearGradient>
  </defs>
  <!-- 배경 -->
  <rect width="1024" height="1024" rx="220" fill="url(#bg)"/>

  <!-- 박스 몸체 -->
  <rect x="192" y="568" width="640" height="310" rx="60" fill="white"/>

  <!-- 박스 뚜껑 -->
  <rect x="172" y="430" width="680" height="155" rx="60" fill="rgba(255,255,255,0.87)"/>

  <!-- 세로 리본 -->
  <rect x="452" y="430" width="120" height="448" rx="40" fill="rgba(20,83,45,0.18)"/>

  <!-- 나비매듭 왼쪽 원 -->
  <circle cx="318" cy="360" r="130" fill="white" opacity="0.9"/>

  <!-- 나비매듭 오른쪽 원 -->
  <circle cx="706" cy="360" r="130" fill="white" opacity="0.9"/>

  <!-- 매듭 중심 -->
  <circle cx="512" cy="430" r="82" fill="white"/>
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

  const names = ['ic_launcher.png', 'ic_launcher_round.png'];
  for (const name of names) {
    await sharp(svgBuf)
      .resize(size, size)
      .png()
      .toFile(join(outDir, name));
    console.log(`✓ ${dir}/${name} (${size}x${size})`);
  }
}

// foreground (adaptive icon) — 108dp 기준, 아이콘은 72dp 중앙
const fgSizes = [
  { dir: 'mipmap-mdpi',    size: 108 },
  { dir: 'mipmap-hdpi',    size: 162 },
  { dir: 'mipmap-xhdpi',   size: 216 },
  { dir: 'mipmap-xxhdpi',  size: 324 },
  { dir: 'mipmap-xxxhdpi', size: 432 },
];

for (const { dir, size } of fgSizes) {
  const outDir = join(ANDROID_BASE, dir);
  await sharp(svgBuf)
    .resize(size, size)
    .png()
    .toFile(join(outDir, 'ic_launcher_foreground.png'));
  console.log(`✓ ${dir}/ic_launcher_foreground.png (${size}x${size})`);
}

console.log('\n아이콘 생성 완료!');
