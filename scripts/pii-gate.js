// CI PII gate: fails the build if a real-looking USCIS receipt number is
// committed anywhere in the repo.
//
// CONTRIBUTING.md requires every example receipt number to be an
// IOE0000000000-style placeholder ("Never commit real case data"). This is
// the automated check for that rule: it scans every git-tracked file for
// anything matching the receipt-number shape (IOE followed by 10 digits)
// and fails unless it's on the small allow-list of known placeholders used
// throughout the docs, fixtures, and source comments.
//
//   node scripts/pii-gate.js
//
// Scans git-tracked files (via `git ls-files`). Before the first commit
// there are none, which would let the gate pass without inspecting anything —
// exactly the commit where real data is most likely to slip in — so it falls
// back to the staged set, then the working tree, and fails outright rather
// than reporting success on an empty scan.

var fs = require('fs');
var path = require('path');
var execFileSync = require('child_process').execFileSync;

var ROOT = path.join(__dirname, '..');

// Every prefix USCIS issues, not just the online-filing one. Paper-filed
// receipts (EAC, WAC, LIN, SRC, MSC, YSC and others) are exactly as sensitive,
// and an IOE-only pattern would have waved one straight into a public repo.
var RECEIPT_RE = /\b[A-Z]{3}[0-9]{10}\b/g;

var ALLOWED = {};
for (var i = 0; i <= 9; i++) {
  ALLOWED['IOE000000000' + i] = true;
}
ALLOWED['IOE0912345678'] = true;

// Skip binaries — receipt numbers only ever appear as text, and reading
// PNG/zip bytes as utf8 just risks noisy false "matches" on decoded bytes.
var BINARY_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.zip', '.woff', '.woff2', '.ttf'];

function listTrackedFiles() {
  var out = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\0').filter(Boolean);
}

// Files staged for the very first commit aren't "tracked" yet, so `git
// ls-files` is empty and the scan would pass without looking at anything —
// precisely the commit where real data is most likely to slip in. Fall back
// to the staged set, then to the working tree.
function listStagedFiles() {
  var out = execFileSync('git', ['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR'],
    { cwd: ROOT, encoding: 'utf8' });
  return out.split('\0').filter(Boolean);
}

var SKIP_DIRS = { '.git': true, 'node_modules': true, 'dist': true };

function listWorkingTree(dir, rel, acc) {
  var entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.forEach(function (entry) {
    if (SKIP_DIRS[entry.name]) return;
    var childRel = rel ? rel + '/' + entry.name : entry.name;
    var childAbs = path.join(dir, entry.name);
    if (entry.isDirectory()) listWorkingTree(childAbs, childRel, acc);
    else if (entry.isFile()) acc.push(childRel);
  });
  return acc;
}

// Widest set of files this repo state can offer, so the gate is never a no-op.
function filesToScan() {
  var tracked = listTrackedFiles();
  if (tracked.length) return { files: tracked, source: 'tracked' };

  var staged = listStagedFiles();
  if (staged.length) return { files: staged, source: 'staged' };

  return { files: listWorkingTree(ROOT, '', []), source: 'working-tree' };
}

function main() {
  var files, source;
  try {
    var found = filesToScan();
    files = found.files;
    source = found.source;
  } catch (err) {
    console.error('pii-gate: `git ls-files` failed — is this running inside a git repo?');
    console.error(err.message);
    process.exit(1);
  }

  var offenders = [];

  files.forEach(function (rel) {
    if (BINARY_EXT.indexOf(path.extname(rel).toLowerCase()) !== -1) return;
    var full = path.join(ROOT, rel);
    var content;
    try {
      content = fs.readFileSync(full, 'utf8');
    } catch (err) {
      return; // unreadable (deleted/renamed mid-scan, submodule, etc.) — skip
    }

    var lines = content.split('\n');
    lines.forEach(function (line, idx) {
      var matches = line.match(RECEIPT_RE);
      if (!matches) return;
      matches.forEach(function (num) {
        if (!ALLOWED[num]) {
          offenders.push(rel + ':' + (idx + 1) + ': ' + num);
        }
      });
    });
  });

  if (offenders.length > 0) {
    console.error('pii-gate: FAILED — receipt number(s) found that are not on the placeholder allow-list:');
    offenders.forEach(function (o) { console.error('  ' + o); });
    console.error('\nAllowed placeholders: IOE0000000000-IOE0000000009, IOE0912345678.');
    console.error('If this is real case data, remove it. If it is a new placeholder, add it to the allow-list in scripts/pii-gate.js.');
    process.exit(1);
  }

  if (!files.length) {
    console.error('pii-gate: FAILED — found no files to scan. Refusing to pass vacuously.');
    process.exit(1);
  }

  console.log('pii-gate: OK — no non-placeholder receipt numbers found in ' +
    files.length + ' file(s) [' + source + '].');
}

main();
