// Packages CaseLens's browser extensions and userscript into distributable
// artifacts: caselens-chrome.zip, caselens-firefox.zip, caselens.user.js.
//
// Shared by both CI workflows so the archive layout is defined in exactly
// one place:
//   - .github/workflows/ci.yml runs this on every push to main and uploads
//     the result as a build artifact, so there's something installable to
//     hand to a store even before the first tagged release exists (CI
//     artifacts expire per the repo's retention setting — see
//     docs/PUBLISHING.md).
//   - .github/workflows/release.yml runs this same script when a v* tag is
//     pushed, then attaches the same three files to a GitHub Release,
//     which is the durable, publicly linkable copy.
//
// Requires the system `zip` binary (present on GitHub-hosted ubuntu-latest
// runners and on macOS). That's a build-time tool, not a runtime
// dependency, so it doesn't conflict with the zero-npm-dependency rule in
// CONTRIBUTING.md — nothing shipped to users depends on it.
//
//   node scripts/package.js [outDir]     (outDir defaults to repo root)
//
// Zips the CONTENTS of each extensions/<browser>/ directory (not the
// parent folder), because both the Chrome Web Store and AMO require
// manifest.json to sit at the archive root.

var fs = require('fs');
var path = require('path');
var execFileSync = require('child_process').execFileSync;

var ROOT = path.join(__dirname, '..');
var outDir = path.resolve(process.argv[2] || ROOT);

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

var TARGETS = [
  { dir: 'extensions/chrome', zip: 'caselens-chrome.zip' },
  { dir: 'extensions/firefox', zip: 'caselens-firefox.zip' }
];

TARGETS.forEach(function (t) {
  var srcDir = path.join(ROOT, t.dir);
  if (!fs.existsSync(path.join(srcDir, 'manifest.json'))) {
    console.error('package: ' + t.dir + '/manifest.json not found. Run `node scripts/build.js` first.');
    process.exit(1);
  }
  var zipPath = path.join(outDir, t.zip);
  try { fs.unlinkSync(zipPath); } catch (e) { /* fine if it didn't exist */ }
  execFileSync('zip', ['-r', '-X', zipPath, '.', '-x', '.DS_Store'], { cwd: srcDir, stdio: 'inherit' });
  console.log('wrote ' + path.relative(ROOT, zipPath));
});

var userscriptSrc = path.join(ROOT, 'userscript', 'caselens.user.js');
if (!fs.existsSync(userscriptSrc)) {
  console.error('package: ' + path.relative(ROOT, userscriptSrc) + ' not found. Run `node scripts/build.js` first.');
  process.exit(1);
}
var userscriptDest = path.join(outDir, 'caselens.user.js');
fs.copyFileSync(userscriptSrc, userscriptDest);
console.log('wrote ' + path.relative(ROOT, userscriptDest));
