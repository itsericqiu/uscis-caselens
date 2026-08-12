// Fail the build if user-facing copy speaks in the first person.
//
//   node scripts/copy-check.js
//
// The panel reports facts about someone's immigration case. "We could not read
// this" invents a narrator who has opinions and can be doubted; "This could not
// be read" is the same fact with nobody in it. The tool is not a person and
// gains nothing by sounding like one.
//
// Scans quoted string literals in core/, skipping comments — comments are for
// maintainers and may say whatever is clearest there.
//
// This is a style gate, not a correctness one. It exists because the drift is
// invisible in review: each individual "we" reads fine, and only the
// accumulation is the problem.

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var FILES = [
  path.join(ROOT, 'core', 'uscis-tracker-core.js')
];

// Whole words only, so "website" and "user" are unaffected.
var FIRST_PERSON = /\b(we|We|our|Our|ours|us|Us|I'd|I've)\b/;

// A literal shorter than this is a class name, a key, or a fragment — not a
// sentence anyone reads.
var MIN_SENTENCE = 12;

function main() {
  var offenders = [];

  FILES.forEach(function (file) {
    var lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach(function (line, idx) {
      if (line.replace(/^\s+/, '').indexOf('//') === 0) return;   // comment line

      var re = /'([^'\\\n]{12,})'|"([^"\\\n]{12,})"/g;
      var m;
      while ((m = re.exec(line)) !== null) {
        var text = m[1] || m[2];
        if (text.length < MIN_SENTENCE) continue;
        if (text.indexOf(' ') === -1) continue;                   // not prose
        if (!FIRST_PERSON.test(text)) continue;
        offenders.push({
          file: path.relative(ROOT, file),
          line: idx + 1,
          text: text.slice(0, 90)
        });
      }
    });
  });

  if (offenders.length) {
    console.error('copy-check: FAILED — ' + offenders.length +
      ' user-facing string(s) written in the first person:');
    offenders.slice(0, 15).forEach(function (o) {
      console.error('  ' + o.file + ':' + o.line + '  ' + o.text);
    });
    if (offenders.length > 15) console.error('  … and ' + (offenders.length - 15) + ' more');
    console.error('\nState the fact without a narrator: "could not be read", not "we could not read".');
    process.exit(1);
  }

  console.log('copy-check: OK — no first-person user-facing copy.');
}

main();
