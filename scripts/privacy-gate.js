// CI privacy gate: fails the build if the *built* userscript contains a
// live URL pointing anywhere other than my.uscis.gov.
//
// This is the automated version of the claim in README.md / SECURITY.md
// that "my.uscis.gov is the only origin this code may contact" — it checks
// the actual shipped artifact, not just the source, so a build-step bug
// can't silently ship a different origin than what was audited.
//
//   node scripts/privacy-gate.js
//
// Method:
//   1. Read userscript/caselens.user.js.
//   2. Drop full-line comments (lines that are ONLY a `//` comment, e.g.
//      the userscript metadata header) — those aren't live code paths.
//   3. Scan every remaining line for http(s):// URLs and collect the host
//      of each one.
//   4. Any host not on the allow-list fails the gate.
//
// Allow-list, and why each entry is there even though it isn't
// my.uscis.gov:
//   - my.uscis.gov   the one origin CaseLens actually talks to.
//   - github.com     appears only in the `// @namespace` line of the
//                     userscript metadata header — a comment, stripped in
//                     step 2 above, but kept on the allow-list too as a
//                     defense-in-depth belt-and-suspenders in case comment
//                     stripping ever misses a variant of that line.
//   - www.w3.org     the SVG XML namespace literal
//                     ('http://www.w3.org/2000/svg') required to create SVG
//                     elements via document.createElementNS. It is a
//                     namespace identifier, not a network request — no
//                     code ever fetches it.

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');

// Every file that actually ships to a user, not just the userscript. The
// extensions carry their own copy of the core, and this gate never looked at
// either of them — so the audit claim it exists to defend was only ever
// checked on one of the three things people install.
var TARGETS = [
  path.join(ROOT, 'userscript', 'caselens.user.js'),
  path.join(ROOT, 'extensions', 'chrome', 'content.js'),
  path.join(ROOT, 'extensions', 'firefox', 'content.js')
];

var ALLOWED_HOSTS = ['my.uscis.gov', 'github.com', 'www.w3.org'];

var URL_RE = /https?:\/\/[^\s'"`)>,;]+/g;

function hostOf(url) {
  // Avoid relying on the WHATWG URL parser's leniency; a plain regex over
  // "scheme://host[/...]" is easier to reason about for an allow-list gate.
  var m = /^https?:\/\/([^/?#]+)/.exec(url);
  if (!m) return null;
  // Strip a userinfo or port if present (not expected here, but be exact).
  return m[1].replace(/^[^@]*@/, '').replace(/:\d+$/, '').toLowerCase();
}

function scan(target) {
  var content;
  try {
    content = fs.readFileSync(target, 'utf8');
  } catch (err) {
    console.error('privacy-gate: could not read ' + target + ' — run `node scripts/build.js` first.');
    console.error(err.message);
    process.exit(1);
  }

  var offenders = [];
  content.split('\n').forEach(function (line, idx) {
    if (/^\s*\/\//.test(line)) return; // full-line comment, not live code
    var matches = line.match(URL_RE);
    if (!matches) return;
    matches.forEach(function (url) {
      var host = hostOf(url);
      if (!host || ALLOWED_HOSTS.indexOf(host) === -1) {
        offenders.push('  ' + path.relative(ROOT, target) + ':' + (idx + 1) + ': ' +
          url + ' (host: ' + host + ')');
      }
    });
  });
  return offenders;
}

function main() {
  var offenders = [];
  TARGETS.forEach(function (target) {
    offenders = offenders.concat(scan(target));
  });

  if (offenders.length > 0) {
    console.error('privacy-gate: FAILED — found URL(s) outside the allow-list ' +
      '(' + ALLOWED_HOSTS.join(', ') + '):');
    offenders.forEach(function (o) { console.error(o); });
    process.exit(1);
  }

  console.log('privacy-gate: OK — every URL in all ' + TARGETS.length +
    ' shipped files resolves to an allow-listed host (' + ALLOWED_HOSTS.join(', ') + ').');
}

main();
