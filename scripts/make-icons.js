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

  // A lens: a white ring with a solid centre.
  //
  // This used to be a white "U". Three problems with that, all the same
  // problem: "U" is the agency's initial, not this tool's; it says nothing
  // about CaseLens; and on a solid official-looking tile it read as a
  // first-party government mark next to a name containing "USCIS". A store
  // listing that must state it is unaffiliated should not open with a glyph
  // implying otherwise. A lens is on-name and unmistakably third-party.
  //
  // The teal stays: #1F5D5B is conspicuously not USCIS navy, which is doing
  // quiet work here, and it matches the panel's accent so the installed icon
  // and the in-page mark read as one product.
  const cx = width / 2;
  const cy = height / 2;
  const ringRadius = width * 0.30;    // centreline of the ring stroke
  const ringHalf = width * 0.085;     // half the stroke width
  const dotRadius = width * 0.115;

  // Rectangles could not draw this without stair-stepping, which at 16px is
  // the difference between a lens and a smudge. Coverage is sampled on a 4x4
  // grid per pixel and used to blend white over the ground.
  const SS = 4;

  function coverage(px, py) {
    let hits = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const x = px + (sx + 0.5) / SS - cx;
        const y = py + (sy + 0.5) / SS - cy;
        const d = Math.sqrt(x * x + y * y);
        if (Math.abs(d - ringRadius) <= ringHalf || d <= dotRadius) hits++;
      }
    }
    return hits / (SS * SS);
  }

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const a = coverage(px, py);
      if (a <= 0) continue;
      const idx = (py * width + px) * 4;
      for (let c = 0; c < 3; c++) {
        pixelData[idx + c] = Math.round(pixelData[idx + c] * (1 - a) + 255 * a);
      }
    }
  }

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

// Listing icons. Both stores upload these separately from the package: the
// manifest icons are what the browser shows in the toolbar and on the
// extensions page, while the store listing has its own image field. Chrome
// wants 128, AMO wants 32 and 64. Generated from the same mark so the listing
// and the installed extension cannot drift apart.
const listingDir = path.join(rootDir, 'docs', 'store');
if (!fs.existsSync(listingDir)) fs.mkdirSync(listingDir, { recursive: true });

for (const size of [32, 64, 128]) {
  const filePath = path.join(listingDir, `listing-icon-${size}.png`);
  try {
    fs.writeFileSync(filePath, createPNG(size, size));
    console.log(`${filePath}`);
  } catch (err) {
    console.error(`Error writing ${filePath}: ${err.message}`);
    hadError = true;
  }
}

if (hadError) {
  process.exit(1);
}
