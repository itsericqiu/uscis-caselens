#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const rootDir = path.join(__dirname, '..');

// CRC32 table-based calculation
const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC32_TABLE[i] = c >>> 0;
}

function crc32(data) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC32_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createPNG(width, height) {
  // Create RGBA pixel buffer: 4 bytes per pixel
  const pixelData = Buffer.alloc(width * height * 4);

  // Ink-teal background: #1F5D5B = RGB(31, 93, 91), fully opaque.
  // Matches the panel's accent so the installed icon and the in-page mark
  // read as the same product.
  const navy = Buffer.from([31, 93, 91, 255]);
  for (let i = 0; i < width * height; i++) {
    navy.copy(pixelData, i * 4);
  }

  // Draw white "U" using three rectangles
  // U proportions: bars are ~20% of width thick, U occupies central ~60% of canvas
  const barWidth = Math.max(1, Math.floor(width * 0.2));
  const centerX = Math.floor((width - width * 0.6) / 2);
  const uWidth = Math.floor(width * 0.6);
  const leftBarX = centerX;
  const rightBarX = centerX + uWidth - barWidth;
  const barTopY = Math.floor(height * 0.15);
  const barBottomY = Math.floor(height * 0.85);
  const bottomBarHeight = Math.max(1, barWidth);

  // Helper: fill rectangle with white (255, 255, 255, 255)
  function fillRect(x, y, w, h) {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const px = x + dx;
        const py = y + dy;
        if (px >= 0 && px < width && py >= 0 && py < height) {
          const idx = (py * width + px) * 4;
          pixelData[idx] = 255;     // R
          pixelData[idx + 1] = 255; // G
          pixelData[idx + 2] = 255; // B
          pixelData[idx + 3] = 255; // A
        }
      }
    }
  }

  // Left vertical bar
  fillRect(leftBarX, barTopY, barWidth, barBottomY - barTopY);
  // Right vertical bar
  fillRect(rightBarX, barTopY, barWidth, barBottomY - barTopY);
  // Bottom horizontal bar connecting them
  fillRect(leftBarX, barBottomY, uWidth, bottomBarHeight);

  // Encode PNG
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk: width (4), height (4), bit depth (1), color type (1), compression (1), filter (1), interlace (1)
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 6;  // color type (RGBA)
  ihdrData[10] = 0; // compression method
  ihdrData[11] = 0; // filter method
  ihdrData[12] = 0; // interlace method

  const ihdrChunk = createChunk('IHDR', ihdrData);

  // IDAT chunk: zlib-compressed scanlines
  const scanlines = Buffer.alloc(height * (1 + width * 4));
  let scanlineIdx = 0;
  for (let y = 0; y < height; y++) {
    scanlines[scanlineIdx++] = 0; // filter type: None
    for (let x = 0; x < width; x++) {
      const pixelIdx = (y * width + x) * 4;
      pixelData.copy(scanlines, scanlineIdx, pixelIdx, pixelIdx + 4);
      scanlineIdx += 4;
    }
  }

  const compressedData = zlib.deflateSync(scanlines);
  const idatChunk = createChunk('IDAT', compressedData);

  // IEND chunk: empty
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([pngSignature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, 'ascii');
  const chunkData = Buffer.concat([typeBuffer, data]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(chunkData), 0);

  return Buffer.concat([length, chunkData, crc]);
}

// Create icons for sizes 16, 48, 128
const sizes = [16, 48, 128];
const extensions = [
  { name: 'chrome', dir: path.join(rootDir, 'extensions', 'chrome', 'icons') },
  { name: 'firefox', dir: path.join(rootDir, 'extensions', 'firefox', 'icons') }
];

let hadError = false;

for (const size of sizes) {
  const png = createPNG(size, size);

  for (const ext of extensions) {
    const filePath = path.join(ext.dir, `icon${size}.png`);
    try {
      fs.writeFileSync(filePath, png);
      // Verify PNG signature
      const sig = png.slice(0, 8);
      const expected = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
      if (!sig.equals(expected)) {
        console.error(`Error: Invalid PNG signature for ${filePath}`);
        hadError = true;
      } else {
        console.log(`${filePath} (${png.length} bytes)`);
      }
    } catch (err) {
      console.error(`Error writing ${filePath}: ${err.message}`);
      hadError = true;
    }
  }
}

if (hadError) {
  process.exit(1);
}
