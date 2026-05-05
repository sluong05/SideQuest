const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const src = path.join(__dirname, 'public', 'icon.svg');
const out = path.join(__dirname, 'public');

const icons = [
  { name: 'icon-192.png',        size: 192 },
  { name: 'icon-512.png',        size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'favicon-32.png',      size: 32  },
];

(async () => {
  for (const { name, size } of icons) {
    await sharp(src)
      .resize(size, size)
      .png()
      .toFile(path.join(out, name));
    console.log(`✓ ${name} (${size}×${size})`);
  }
  console.log('Icons generated.');
})();
