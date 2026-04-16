import sharp from 'sharp';
import { mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const svgIcon = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="1024" height="1024">
  <rect width="500" height="500" fill="#ffffff"/>
  <polygon points="250,102 410,182 250,262 90,182" fill="#5fd45a"/>
  <polygon points="410,182 410,344 250,424 250,262" fill="#2a8f2a"/>
  <polygon points="90,182 250,262 250,424 90,344" fill="#3db83d"/>
  <polyline points="250,102 410,182 410,344 250,424 90,344 90,182 250,102" stroke="#1e6b1e" stroke-width="11" stroke-linejoin="round" fill="none"/>
  <line x1="250" y1="262" x2="250" y2="424" stroke="#1e6b1e" stroke-width="11"/>
  <line x1="250" y1="262" x2="410" y2="182" stroke="#1e6b1e" stroke-width="11"/>
  <line x1="250" y1="262" x2="90" y2="182" stroke="#1e6b1e" stroke-width="11"/>
</svg>
`;

const ANDROID_BASE = join(__dirname, 'android/app/src/main/res');

const sizes = [
  { dir: 'mipmap-mdpi', size: 48 },
  { dir: 'mipmap-hdpi', size: 72 },
  { dir: 'mipmap-xhdpi', size: 96 },
  { dir: 'mipmap-xxhdpi', size: 144 },
  { dir: 'mipmap-xxxhdpi', size: 192 },
];

const svgBuf = Buffer.from(svgIcon);

for (const { dir, size } of sizes) {
  const outDir = join(ANDROID_BASE, dir);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  for (const name of ['ic_launcher.png', 'ic_launcher_round.png']) {
    await sharp(svgBuf).resize(size, size).png().toFile(join(outDir, name));
    console.log(`generated ${dir}/${name} (${size}x${size})`);
  }
}

const fgSizes = [
  { dir: 'mipmap-mdpi', size: 108 },
  { dir: 'mipmap-hdpi', size: 162 },
  { dir: 'mipmap-xhdpi', size: 216 },
  { dir: 'mipmap-xxhdpi', size: 324 },
  { dir: 'mipmap-xxxhdpi', size: 432 },
];

for (const { dir, size } of fgSizes) {
  const outDir = join(ANDROID_BASE, dir);
  await sharp(svgBuf).resize(size, size).png().toFile(join(outDir, 'ic_launcher_foreground.png'));
  console.log(`generated ${dir}/ic_launcher_foreground.png (${size}x${size})`);
}

console.log('\nicon generation complete');

