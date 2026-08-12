// Fail the build if the stylesheet has orphaned declarations or unbalanced
// braces.
//
//   node scripts/css-check.js
//
// The stylesheet is a JS array of CSS strings, so a mistake in it is valid
// JavaScript and `node --check` passes. That happened: a line-based sweep for
// unused class names deleted selector lines but left their declaration bodies
// behind. A declaration with no selector makes the CSS parser treat the
// following rule as part of its broken prelude and drop it — so removing dead
// rules silently deleted live ones.
//
// The damage was invisible because nothing errors: `.uscistr-progress-label`
// simply stopped applying, and the tool's own disclaimers began rendering
// larger and darker than USCIS's actual status text.

var fs = require('fs');
var path = require('path');

var FILE = path.join(__dirname, '..', 'core', 'uscis-style.js');

function cssOf(line) {
  var m = line.match(/^\s*"(.*)",?\s*$/);
  return m ? m[1] : null;
}

function main() {
  var lines = fs.readFileSync(FILE, 'utf8').split('\n');
  var depth = 0;
  var orphans = [];

  for (var i = 0; i < lines.length; i++) {
    var css = cssOf(lines[i]);
    if (css === null) continue;

    // A property declaration outside any block has lost its selector.
    if (depth === 0 && /^\s*[a-z-]+\s*:/.test(css)) {
      orphans.push({ line: i + 1, text: css.slice(0, 70) });
    }

    depth += (css.match(/\{/g) || []).length;
    depth -= (css.match(/\}/g) || []).length;

    if (depth < 0) {
      console.error('css-check: FAILED — unbalanced closing brace at ' +
        path.basename(FILE) + ':' + (i + 1));
      process.exit(1);
    }
  }

  // Hardcoded font sizes bypass the type scale. That is how the scale stopped
  // controlling anything: seven tokens existed, but 19 rules set a literal px
  // value instead, so most of the panel's text ended up in a 1px band and
  // nothing looked more important than anything else. Sizes belong in the
  // tokens at the top of the file, where the steps can be seen together.
  var literals = [];
  for (var k = 0; k < lines.length; k++) {
    var rule = cssOf(lines[k]);
    if (rule === null) continue;
    if (/font-size:\s*[0-9]/.test(rule) && rule.indexOf('--ust-fs-') === -1) {
      literals.push({ line: k + 1, text: rule.trim().slice(0, 70) });
    }
  }
  if (literals.length) {
    console.error('css-check: FAILED — ' + literals.length +
      ' rule(s) set a font size directly instead of using a --ust-fs-* token:');
    literals.slice(0, 12).forEach(function (o) {
      console.error('  ' + path.basename(FILE) + ':' + o.line + '  ' + o.text);
    });
    console.error('\nAdd a token at the top of the file if a new step is genuinely needed.');
    process.exit(1);
  }

  if (orphans.length) {
    console.error('css-check: FAILED — ' + orphans.length +
      ' declaration(s) outside any rule. Each one also breaks the rule that follows it:');
    orphans.slice(0, 12).forEach(function (o) {
      console.error('  ' + path.basename(FILE) + ':' + o.line + '  ' + o.text);
    });
    if (orphans.length > 12) console.error('  … and ' + (orphans.length - 12) + ' more');
    process.exit(1);
  }

  if (depth !== 0) {
    console.error('css-check: FAILED — ' + depth + ' unclosed rule(s) in ' + path.basename(FILE));
    process.exit(1);
  }

  console.log('css-check: OK — no orphaned declarations, braces balanced.');
}

main();
