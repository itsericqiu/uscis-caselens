#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Paths relative to this script's location
const rootDir = path.join(__dirname, '..');
const codesFile = path.join(rootDir, 'core', 'uscis-codes.js');
const coreFile = path.join(rootDir, 'core', 'uscis-tracker-core.js');
const userscriptOut = path.join(rootDir, 'userscript', 'caselens.user.js');
const chromeContentOut = path.join(rootDir, 'extensions', 'chrome', 'content.js');
const firefoxContentOut = path.join(rootDir, 'extensions', 'firefox', 'content.js');
const chromeManifest = path.join(rootDir, 'extensions', 'chrome', 'manifest.json');
const firefoxManifest = path.join(rootDir, 'extensions', 'firefox', 'manifest.json');

// Read codes file (event code dictionary) and core file
let codesContent;
try {
  codesContent = fs.readFileSync(codesFile, 'utf8');
} catch (err) {
  console.error(`Error reading ${codesFile}:`, err.message);
  process.exit(1);
}

let coreContent;
try {
  coreContent = fs.readFileSync(coreFile, 'utf8');
} catch (err) {
  console.error(`Error reading ${coreFile}:`, err.message);
  process.exit(1);
}

// Extract VERSION
const versionMatch = coreContent.match(/var VERSION = '([^']+)'/);
if (!versionMatch) {
  console.error('Error: VERSION not found in core file');
  process.exit(1);
}
const VERSION = versionMatch[1];

// The codes file defines USCIS_CODE_MEANINGS as a plain top-level `var`, and
// must be concatenated BEFORE the core file (which wraps itself in an IIFE)
// so the constant is defined by the time the core code references it.
const combinedContent = codesContent + '\n' + coreContent;

// Userscript header template
const userscriptHeader = `// ==UserScript==
// @name         CaseLens — USCIS Case Tracker
// @namespace    https://github.com/itsericqiu/uscis-caselens
// @version      ${VERSION}
// @description  See all your USCIS cases in one place. Everything stays in your browser.
// @match        https://my.uscis.gov/*
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==
`;

const checkMode = process.argv.includes('--check');

function writeOrCheck(filePath, content) {
  if (checkMode) {
    try {
      const existing = fs.readFileSync(filePath, 'utf8');
      if (existing === content) {
        console.log(`OK: ${filePath}`);
        return true;
      } else {
        console.log(`MISMATCH: ${filePath}`);
        return false;
      }
    } catch (err) {
      console.log(`MISSING: ${filePath}`);
      return false;
    }
  } else {
    try {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`${filePath}`);
      return true;
    } catch (err) {
      console.error(`Error writing ${filePath}:`, err.message);
      return false;
    }
  }
}

function updateManifest(manifestPath, version) {
  if (checkMode) {
    try {
      const content = fs.readFileSync(manifestPath, 'utf8');
      const manifest = JSON.parse(content);
      const updated = JSON.stringify(manifest, null, 2) + '\n';
      // Check if version field exists and matches
      if (manifest.version !== version) {
        console.log(`MISMATCH: ${manifestPath}`);
        return false;
      }
      if (content !== updated) {
        console.log(`MISMATCH: ${manifestPath}`);
        return false;
      }
      console.log(`OK: ${manifestPath}`);
      return true;
    } catch (err) {
      console.log(`MISSING: ${manifestPath}`);
      return false;
    }
  } else {
    try {
      const content = fs.readFileSync(manifestPath, 'utf8');
      const manifest = JSON.parse(content);
      manifest.version = version;
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
      console.log(`${manifestPath}`);
      return true;
    } catch (err) {
      console.error(`Error updating ${manifestPath}:`, err.message);
      return false;
    }
  }
}

let allOk = true;

// Generate outputs
allOk &= writeOrCheck(userscriptOut, userscriptHeader + '\n' + combinedContent);
allOk &= writeOrCheck(chromeContentOut, combinedContent);
allOk &= writeOrCheck(firefoxContentOut, combinedContent);
allOk &= updateManifest(chromeManifest, VERSION);
allOk &= updateManifest(firefoxManifest, VERSION);

if (checkMode && !allOk) {
  process.exit(1);
}
