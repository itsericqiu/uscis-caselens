// Extract release notes from CHANGELOG.md for a GitHub release.
//
//   node scripts/release-notes.js 1.9.0            (that section only)
//   node scripts/release-notes.js 1.9.0 --since 1.7.1   (everything after 1.7.1)
//
// Prints the body of the matching `## <version>` section to stdout. Exits 1
// with nothing on stdout if there is no such section, which lets the workflow
// fall back to GitHub's auto-generated commit list rather than publishing a
// release with empty notes.
//
// Handwritten notes beat a list of commit subjects: someone deciding whether to
// update wants to know what changed for them, not how many commits it took.
//
// --since exists because releases are cut per VERSION bump, not per commit.
// Pushing several bumps together tags only the last one, so a reader upgrading
// from the previously released version would never see the notes for the
// versions skipped over. That happened between 1.7.1 and 1.9.0: the redaction
// widening and the attention-banner fix shipped inside 1.9.0 with their notes
// stranded in sections nothing published.

var fs = require('fs');
var path = require('path');

function extract(markdown, version) {
  var lines = markdown.split('\n');
  var wanted = String(version).replace(/^v/, '');
  var start = -1;

  for (var i = 0; i < lines.length; i++) {
    var m = lines[i].match(/^##\s+v?([0-9][^\s]*)\s*$/);
    if (m && m[1] === wanted) { start = i + 1; break; }
  }
  if (start === -1) return null;

  var body = [];
  for (var j = start; j < lines.length; j++) {
    if (/^##\s+v?[0-9]/.test(lines[j])) break;   // next version heading
    body.push(lines[j]);
  }

  while (body.length && body[0].trim() === '') body.shift();
  while (body.length && body[body.length - 1].trim() === '') body.pop();

  return body.length ? body.join('\n') : null;
}

// Every version heading in file order (newest first, as the changelog is
// written).
function versionsInOrder(markdown) {
  var out = [];
  markdown.split('\n').forEach(function (line) {
    var m = line.match(/^##\s+v?([0-9][^\s]*)\s*$/);
    if (m) out.push(m[1]);
  });
  return out;
}

// Notes for `version`, plus every version between it and `since` (exclusive).
// Each carries its own heading so a reader can tell which change came with
// which version.
function extractSince(markdown, version, since) {
  var all = versionsInOrder(markdown);
  var wanted = String(version).replace(/^v/, '');
  var floor = String(since || '').replace(/^v/, '');

  var startIdx = all.indexOf(wanted);
  if (startIdx === -1) return null;
  var endIdx = floor ? all.indexOf(floor) : -1;
  if (endIdx === -1) endIdx = all.length;      // unknown floor: take this one only
  if (endIdx <= startIdx) endIdx = startIdx + 1;

  var chunks = [];
  for (var i = startIdx; i < endIdx; i++) {
    var body = extract(markdown, all[i]);
    if (!body) continue;
    chunks.push(i === startIdx ? body : '## ' + all[i] + '\n\n' + body);
  }
  return chunks.length ? chunks.join('\n\n') : null;
}

function main() {
  var args = process.argv.slice(2);
  var version = args[0];
  var since = null;
  var sinceFlag = args.indexOf('--since');
  if (sinceFlag !== -1) since = args[sinceFlag + 1] || null;

  if (!version) {
    process.stderr.write('usage: node scripts/release-notes.js <version> [--since <version>]\n');
    process.exit(1);
  }

  var file = path.join(__dirname, '..', 'CHANGELOG.md');
  if (!fs.existsSync(file)) {
    process.stderr.write('release-notes: CHANGELOG.md not found\n');
    process.exit(1);
  }

  var markdown = fs.readFileSync(file, 'utf8');
  var section = since
    ? extractSince(markdown, version, since)
    : extract(markdown, version);

  if (!section) {
    process.stderr.write('release-notes: no "## ' + version + '" section in CHANGELOG.md\n');
    process.exit(1);
  }

  process.stdout.write(section + '\n');
}

if (require.main === module) main();
module.exports = { extract: extract, extractSince: extractSince };
