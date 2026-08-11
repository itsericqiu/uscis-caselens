// Extract one version's section from CHANGELOG.md, for use as GitHub release
// notes.
//
//   node scripts/release-notes.js 1.2.0
//
// Prints the body of the matching `## <version>` section to stdout. Exits 1
// with nothing on stdout if there is no such section, which lets the workflow
// fall back to GitHub's auto-generated commit list rather than publishing a
// release with empty notes.
//
// Handwritten notes beat a list of commit subjects: someone deciding whether to
// update wants to know what changed for them, not how many commits it took.

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

function main() {
  var version = process.argv[2];
  if (!version) {
    process.stderr.write('usage: node scripts/release-notes.js <version>\n');
    process.exit(1);
  }

  var file = path.join(__dirname, '..', 'CHANGELOG.md');
  if (!fs.existsSync(file)) {
    process.stderr.write('release-notes: CHANGELOG.md not found\n');
    process.exit(1);
  }

  var section = extract(fs.readFileSync(file, 'utf8'), version);
  if (!section) {
    process.stderr.write('release-notes: no "## ' + version + '" section in CHANGELOG.md\n');
    process.exit(1);
  }

  process.stdout.write(section + '\n');
}

if (require.main === module) main();
module.exports = { extract: extract };
