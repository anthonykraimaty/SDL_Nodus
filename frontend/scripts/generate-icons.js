import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const iconsDir = path.join(__dirname, '../public/icons');

// Ensure icons directory exists
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// SVG icon (simple tent/camp icon)
const svgIcon = `
<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#795548;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#8d6e63;stop-opacity:1" />
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="512" height="512" fill="url(#grad)" rx="64"/>

  <!-- Tent shape -->
  <g transform="translate(256, 256)">
    <!-- Main tent -->
    <path d="M -120 100 L 0 -80 L 120 100 Z" fill="#d4a574" stroke="#8d6e63" stroke-width="4"/>
    <!-- Tent entrance -->
    <path d="M -40 100 L 0 20 L 40 100 Z" fill="#5d4037" opacity="0.5"/>
    <!-- Pole -->
    <line x1="0" y1="-80" x2="0" y2="100" stroke="#3e2723" stroke-width="3"/>
    <!-- Ground -->
    <line x1="-140" y1="100" x2="140" y2="100" stroke="#8d6e63" stroke-width="4"/>
    <!-- Flag -->
    <polygon points="0,-80 20,-60 0,-70" fill="#e57373"/>
  </g>
</svg>
`;

console.log('Generating app icons...');

// Generate icons for each size
Promise.all(
  sizes.map(async (size) => {
    const outputPath = path.join(iconsDir, `icon-${size}x${size}.png`);

    await sharp(Buffer.from(svgIcon))
      .resize(size, size)
      .png()
      .toFile(outputPath);

    console.log(`✓ Generated ${size}x${size} icon`);
  })
).then(() => {
  console.log('All icons generated successfully!');
}).catch((error) => {
  console.error('Error generating icons:', error);
  process.exit(1);
});
