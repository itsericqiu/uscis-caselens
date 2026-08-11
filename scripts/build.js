#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Paths relative to this script's location
const rootDir = path.join(__dirname, '..');
const styleFile = path.join(rootDir, 'core', 'uscis-style.js');
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

let coreContent, styleContent;
try {
  coreContent = fs.readFileSync(coreFile, 'utf8');
  styleContent = fs.readFileSync(styleFile, 'utf8');
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
// Order matters: both files declare top-level vars the core closure reads.
// The shipped artifact is this concatenation and nothing else.
const combinedContent = codesContent + '\n' + styleContent + '\n' + coreContent;

// Userscript header template
// download/updateURL point at the latest tagged release rather than the raw
// file on main: GitHub keeps that redirect current, and it means an installed
// copy only ever moves between versions that passed CI, never to whatever is
// mid-work on the default branch.
const userscriptHeader = `// ==UserScript==
// @name         CaseLens — USCIS Case Tracker
// @namespace    https://github.com/itsericqiu/uscis-caselens
// @version      ${VERSION}
// @description  See all your USCIS cases in one place. Everything stays in your browser.
// @match        https://my.uscis.gov/*
// @run-at       document-idle
// @noframes
// @homepageURL  https://github.com/itsericqiu/uscis-caselens
// @supportURL   https://github.com/itsericqiu/uscis-caselens/issues
// @downloadURL  https://github.com/itsericqiu/uscis-caselens/releases/latest/download/caselens.user.js
// @updateURL    https://github.com/itsericqiu/uscis-caselens/releases/latest/download/caselens.user.js
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

// The zero-permissions claim in README.md and SECURITY.md was previously
// enforced by nothing: --check only compared the version field, so a manifest
// could gain <all_urls>, a background worker, or a second content script and
// still report OK. These are the shapes both manifests must keep.
const EXPECTED_MANIFEST = {
  manifest_version: 3,
  content_scripts: [{
    matches: ['https://my.uscis.gov/*'],
    js: ['content.js'],
    run_at: 'document_idle'
  }]
};
const FORBIDDEN_MANIFEST_KEYS = ['permissions', 'host_permissions', 'background', 'web_accessible_resources', 'externally_connectable'];

function assertManifestShape(file, manifest) {
  const problems = [];
  for (const key of FORBIDDEN_MANIFEST_KEYS) {
    if (key in manifest) problems.push(`declares "${key}" — this extension must request nothing`);
  }
  if (manifest.manifest_version !== EXPECTED_MANIFEST.manifest_version) {
    problems.push(`manifest_version is ${manifest.manifest_version}, expected ${EXPECTED_MANIFEST.manifest_version}`);
  }
  const actual = JSON.stringify(manifest.content_scripts);
  const expected = JSON.stringify(EXPECTED_MANIFEST.content_scripts);
  if (actual !== expected) problems.push(`content_scripts is ${actual}, expected ${expected}`);
  if (problems.length) {
    console.error(`FAIL: ${file}`);
    for (const p of problems) console.error(`  ${p}`);
    return false;
  }
  return true;
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
      if (!assertManifestShape(manifestPath, manifest)) return false;
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
      if (!assertManifestShape(manifestPath, manifest)) return false;
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
