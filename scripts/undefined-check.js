// Fail the build if the shipped bundle calls a function it never defines.
//
//   node scripts/undefined-check.js
//
// `node --check` only parses. A call to a function that does not exist is
// perfectly valid syntax and throws only when that line runs — so a helper
// dropped during a refactor sits latent until a user hits the one code path
// that needs it. That is exactly what happened: `documentLabel` and
// `isRecentDocument` were called by the documents section and defined nowhere,
// which made the panel vanish the moment a case with documents rendered.
// Nothing caught it, because parsing passed and the smoke test only asserted
// that a panel appears at all.
//
// This is a deliberately simple static check: collect every declared name in
// the bundle, collect every `name(` call site, and report calls that resolve
// to neither a declaration nor a known global. It is not a type checker and
// does not try to be.

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var BUNDLE = path.join(ROOT, 'userscript', 'caselens.user.js');

// Globals the bundle is entitled to call. Anything not here and not declared
// in the file is a bug.
var KNOWN_GLOBALS = [
  'require', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'String', 'Number', 'Boolean',
  'Array', 'Object', 'Date', 'Math', 'JSON', 'RegExp', 'Error', 'TypeError',
  'Promise', 'fetch', 'encodeURIComponent', 'decodeURIComponent',
  'encodeURI', 'decodeURI', 'URL', 'Blob', 'FileReader', 'Notification',
  'Intl', 'localStorage', 'document', 'window', 'navigator', 'location',
  'console', 'alert', 'confirm', 'if', 'for', 'while', 'switch', 'catch',
  'return', 'typeof', 'function', 'new', 'else', 'do', 'try', 'finally'
];

function main() {
  if (!fs.existsSync(BUNDLE)) {
    console.error('undefined-check: ' + BUNDLE + ' not found — run `node scripts/build.js` first.');
    process.exit(1);
  }
  var src = fs.readFileSync(BUNDLE, 'utf8');

  // Order matters: strings first, then comments. Doing it the other way round
  // truncates a line at the // inside a URL literal, which leaves an unbalanced
  // quote and makes the string regex swallow whole regions of real code —
  // including the function declarations this check is looking for.
  var code = src
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .split('\n')
    .map(function (line) { return line.replace(/\/\/.*$/, ''); })
    .join('\n')
    // Blank regex-literal bodies so a token like `HTTP (\d{3})` inside one
    // isn't read as a call to HTTP(). Approximate but sufficient here: a slash
    // that isn't a comment, followed by non-slash content, to a closing slash.
    .replace(/\/(?![\/*])(?:[^\/\\\n]|\\.)+\/[gimsuy]*/g, '/RE/');

  var declared = Object.create(null);
  var re;

  // function foo(...)
  re = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g;
  var m;
  while ((m = re.exec(code)) !== null) declared[m[1]] = true;

  // var foo = function / var foo = ... (covers assigned function expressions)
  re = /\bvar\s+([A-Za-z_$][\w$]*)\s*=/g;
  while ((m = re.exec(code)) !== null) declared[m[1]] = true;

  // function parameters, so callbacks invoked by name aren't flagged
  re = /\bfunction\s*[A-Za-z_$\w$]*\s*\(([^)]*)\)/g;
  while ((m = re.exec(code)) !== null) {
    m[1].split(',').forEach(function (p) {
      var name = p.trim();
      if (name) declared[name] = true;
    });
  }

  KNOWN_GLOBALS.forEach(function (g) { declared[g] = true; });

  var offenders = Object.create(null);
  re = /(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g;
  while ((m = re.exec(code)) !== null) {
    var name = m[2];
    if (declared[name]) continue;
    if (!offenders[name]) {
      var upto = code.slice(0, m.index).split('\n').length;
      offenders[name] = upto;
    }
  }

  var names = Object.keys(offenders);
  if (names.length) {
    console.error('undefined-check: FAILED — the bundle calls functions it never defines:');
    names.forEach(function (n) {
      console.error('  ' + n + '()  first called around ' + path.basename(BUNDLE) + ':' + offenders[n]);
    });
    console.error('\nThese throw at runtime the moment that code path executes.');
    process.exit(1);
  }

  console.log('undefined-check: OK — every called function is defined in the bundle.');
}

main();
