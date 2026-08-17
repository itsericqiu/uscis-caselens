// Headless-Chrome regression gate for CaseLens's printable record (1.20).
//
// Printing works by mounting a plain `<div class="uscistr-print">` inside
// `.uscistr-root`, flipping `document.body.className` to include
// `uscistr-printing`, and relying on a print stylesheet keyed on that class
// to hide the rest of the host page (my.uscis.gov) so only the record
// prints. See `withPrintMode` / `buildPrintDocument` in
// core/uscis-tracker-core.js.
//
// That host-hiding is the property this gate exists to protect. If the CSS
// selector that hides the host page ever stops matching — a typo, a
// specificity fight with my.uscis.gov's own stylesheet, a class rename on
// one side but not the other — nothing throws and nothing looks wrong in
// the browser chrome. The failure mode is a PDF that contains someone's
// USCIS dashboard, account menu, and everything else on the host page,
// generated silently, that nobody notices until it's already been shared.
// That combination (catastrophic + invisible) is exactly what a fixed
// assertion in CI is for.
//
// The other assertions pin the rest of the contract:
//   - the print document itself renders (non-trivial length) and lays out
//     under print media (`.uscistr-root` becomes non-fixed, `.uscistr-print`
//     becomes visible) — the mount could succeed while the print CSS that
//     makes it *visible* silently fails to match, same failure shape as the
//     host-hiding bug but pointed the other way (nothing prints at all).
//   - the document carries no interactive chrome (anchors, buttons, svgs,
//     aria-expanded nodes) — this is a printed page, not the app, and any of
//     those leaking through is a sign the wrong subtree got mounted.
//     Anchors get their own line on purpose: this repo doesn't control
//     my.uscis.gov's print stylesheet, and some print stylesheets rewrite
//     `a[href]::after` to append the raw URL next to link text. A record
//     with zero anchors can't be exposed by that rule; this assertion is
//     what keeps that true.
//   - Full record vs. Masked copy actually differ in what they leak — a
//     real receipt number present/absent, and the masked-copy disclaimer
//     present/absent. Mixing these up is a privacy bug, not a cosmetic one.
//   - teardown is unconditional: after every print (however it ends,
//     including Cancel, which never calls printRecord at all) the body
//     class, the mounted print node, and the document title must all be
//     back to how they started. A leaked `uscistr-printing` class would
//     leave the host page hidden after the user is done, which reads as a
//     broken page.
//
// Zero dependencies, same shape as scripts/smoke-test.js: starts
// `python3 -m http.server` and headless Chrome itself, drives it over the
// DevTools Protocol via scripts/cdp-lite.js. Uses its own ports so it can
// run alongside (or independently of) smoke-test.js.
//
//   node scripts/print-check.js
//
// Exits 0 on success, 1 on any failure, printing exactly what failed.

var fs = require('fs');
var path = require('path');
var http = require('http');
var spawn = require('child_process').spawn;

var ROOT = path.join(__dirname, '..');
var HTTP_PORT = Number(process.env.PRINT_HTTP_PORT) || 8901;
var CDP_PORT = Number(process.env.PRINT_CDP_PORT) || 9334;
var BASE = 'http://localhost:' + HTTP_PORT + '/test/harness.html';

// The harness's normal scenario stages four cases in over simulated
// fetch delays; this is the fixed wait a proven manual run of this same
// check used to let all four land before printing anything.
var CASES_WAIT_MS = 32000;
var PANEL_OPEN_WAIT_MS = 1000;
var POPOVER_WAIT_MS = 600;
var PRINT_ACTION_WAIT_MS = 600;

var failures = [];

function fail(label, detail) {
  failures.push(label + (detail ? ': ' + detail : ''));
  console.error('FAIL - ' + label + (detail ? ': ' + detail : ''));
}

function pass(label) {
  console.log('PASS - ' + label);
}

function check(cond, label, detail) {
  if (cond) pass(label);
  else fail(label, detail);
}

function findChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  var candidates = [
    // browser-actions/setup-chrome and most Linux CI runners.
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    // Local macOS installs.
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium'
  ];
  for (var i = 0; i < candidates.length; i++) {
    if (fs.existsSync(candidates[i])) return candidates[i];
  }
  return null;
}

function get(url) {
  return new Promise(function (resolve, reject) {
    http.get(url, function (res) {
      var body = '';
      res.on('data', function (c) { body += c; });
      res.on('end', function () { resolve({ status: res.statusCode, body: body }); });
    }).on('error', reject);
  });
}

function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

function waitFor(url, tries, delayMs) {
  var attempt = function (n) {
    return get(url).catch(function (err) {
      if (n <= 0) throw err;
      return sleep(delayMs).then(function () { return attempt(n - 1); });
    });
  };
  return attempt(tries);
}

// Same stub used to prove this check out by hand: replaces window.print
// with a synchronous function that reads the DOM print media computes right
// now (Emulation.setEmulatedMedia has already told Chrome to compute styles
// as if printing) and stashes the result on window.__printProbe instead of
// actually opening a print dialog.
var STUB = '(function(){' +
  'window.__printProbe = null;' +
  'window.print = function(){' +
  '  function cs(sel){var n=document.querySelector(sel); if(!n) return "MISSING";' +
  '    var s=getComputedStyle(n); return s.display+"|"+s.position;}' +
  '  var doc=document.querySelector(".uscistr-print");' +
  '  var hostShown=[].slice.call(document.body.children).filter(function(n){' +
  '    return String(n.className||"").indexOf("uscistr")===-1 && getComputedStyle(n).display!=="none";})' +
  '    .map(function(n){return n.tagName+"."+(n.id||n.className||"?");});' +
  '  window.__printProbe = {' +
  '    bodyClass: document.body.className, title: document.title,' +
  '    hostStillVisible: hostShown,' +
  '    root: cs(".uscistr-root"), printDoc: cs(".uscistr-print"),' +
  '    anchors: doc ? doc.querySelectorAll("a").length : -1,' +
  '    buttons: doc ? doc.querySelectorAll("button").length : -1,' +
  '    svgs: doc ? doc.querySelectorAll("svg").length : -1,' +
  '    imgs: doc ? doc.querySelectorAll("img").length : -1,' +
  '    ariaExpanded: doc ? doc.querySelectorAll("[aria-expanded]").length : -1,' +
  '    chars: doc ? doc.textContent.length : -1,' +
  '    leaksReceipt: doc ? doc.textContent.indexOf("IOE0000000001")!==-1 : null,' +
  '    saysMasked: doc ? doc.textContent.indexOf("Masked copy")!==-1 : null' +
  '  };' +
  // A real browser fires afterprint once the dialog closes, and teardown is
  // driven by that rather than by print() returning — because print() does not
  // block on Safari. The stub must therefore fire it too, or this gate would
  // test a teardown path no browser actually takes.
  '  setTimeout(function(){ try { window.dispatchEvent(new Event("afterprint")); } catch(e) {} }, 0);' +
  '};return "stubbed";})()';

// Measures the open choice popover: what it is anchored to, how tall it ended
// up, whether it fits its panel, and whether its children have real height.
var POPOVER_GEOMETRY = '(function(){' +
  'var pop=document.querySelector(".uscistr-print-choice");' +
  'if(!pop) return JSON.stringify({found:false});' +
  'var panel=document.querySelector(".uscistr-panel");' +
  'var r=pop.getBoundingClientRect(), pa=panel.getBoundingClientRect();' +
  'var kids=[].slice.call(pop.children).map(function(c){return c.getBoundingClientRect().height;});' +
  'return JSON.stringify({' +
  '  found:true,' +
  '  offsetParent: pop.offsetParent ? String(pop.offsetParent.className||"").trim().split(/\\s+/)[0] : null,' +
  '  height: Math.round(r.height), width: Math.round(r.width),' +
  '  insidePanel: (r.top >= pa.top - 1 && r.bottom <= pa.bottom + 1 &&' +
  '                r.left >= pa.left - 1 && r.right <= pa.right + 1),' +
  '  smallestChild: kids.length ? Math.round(Math.min.apply(null, kids)) : -1' +
  '});})()';

// A print() that behaves like Safari's: returns straight away, fires nothing.
var SILENT_PRINT_STUB =
  '(function(){window.print=function(){};return "stubbed";})()';

function clickText(label) {
  return '(function(){var b=[].slice.call(document.querySelectorAll(".uscistr-root button"))' +
    '.filter(function(x){return (x.textContent||"").trim()===' + JSON.stringify(label) + ';})[0];' +
    'if(b){b.click(); return "clicked";} return "NOT FOUND";})()';
}

function readTeardownState() {
  return "(function(){return {" +
    "bodyClass: document.body.className," +
    "printNodes: document.querySelectorAll('.uscistr-print').length," +
    "title: document.title" +
    "};})()";
}

// Asserts the probe captured by a Full record print (assertions 1-8 from
// the design). Called once, right after the Full record print fires.
function assertFullRecordProbe(probe) {
  if (!probe) {
    fail('full record print produced a probe', 'window.__printProbe was ' + JSON.stringify(probe));
    return;
  }

  // (1) The catastrophic-and-silent one: nothing but CaseLens's own nodes
  // may still be visible on the body once print mode is active.
  check(Array.isArray(probe.hostStillVisible) && probe.hostStillVisible.length === 0,
    'full record: host page is fully hidden under print media',
    'still visible: ' + JSON.stringify(probe.hostStillVisible));

  check(/\|static$/.test(probe.root),
    'full record: .uscistr-root computes position: static under print',
    'got "' + probe.root + '"');

  check(/^block\|/.test(probe.printDoc),
    'full record: .uscistr-print computes display: block under print',
    'got "' + probe.printDoc + '"');

  check(typeof probe.chars === 'number' && probe.chars > 500,
    'full record: print document is non-trivial (chars > 500)',
    'got ' + probe.chars + ' chars');

  // Its own line: my.uscis.gov's own print stylesheet is out of this
  // project's control and some print stylesheets rewrite `a[href]::after`
  // to expose the raw href next to link text. A print document with zero
  // anchors cannot be exposed by that rule, so this line is what keeps
  // that guarantee true rather than assumed.
  check(probe.anchors === 0,
    'full record: print document has zero anchors',
    'got ' + probe.anchors);

  check(probe.buttons === 0,
    'full record: print document has zero buttons',
    'got ' + probe.buttons);

  check(probe.svgs === 0,
    'full record: print document has zero svgs',
    'got ' + probe.svgs);

  check(probe.imgs === 0,
    'full record: print document has zero imgs',
    'got ' + probe.imgs);

  check(probe.ariaExpanded === 0,
    'full record: print document has zero [aria-expanded] nodes',
    'got ' + probe.ariaExpanded);

  check(typeof probe.title === 'string' && probe.title.indexOf('caselens-record-') === 0,
    'full record: document.title starts with "caselens-record-"',
    'got "' + probe.title + '"');

  check(probe.leaksReceipt === true,
    'full record: contains the real receipt number',
    'leaksReceipt was ' + probe.leaksReceipt);

  check(probe.saysMasked === false,
    'full record: does not carry the masked-copy disclaimer',
    'saysMasked was ' + probe.saysMasked);
}

// Assertions 9-10: the masked copy must invert exactly the two privacy
// facts that matter — the real receipt number gone, the disclaimer present.
function assertMaskedCopyProbe(probe) {
  if (!probe) {
    fail('masked copy print produced a probe', 'window.__printProbe was ' + JSON.stringify(probe));
    return;
  }

  check(probe.leaksReceipt === false,
    'masked copy: real receipt number is not present',
    'leaksReceipt was ' + probe.leaksReceipt);

  check(probe.saysMasked === true,
    'masked copy: carries the masked-copy disclaimer',
    'saysMasked was ' + probe.saysMasked);
}

// Assertions 11-13, shared by every exit from print mode: a completed Full
// record print, a completed Masked copy print, and a Cancel click that
// never printed at all.
function assertTeardown(state, harnessTitle, contextLabel) {
  if (!state) {
    fail(contextLabel + ': teardown state was readable', 'got ' + JSON.stringify(state));
    return;
  }

  check(String(state.bodyClass || '').indexOf('uscistr-printing') === -1,
    contextLabel + ': body class no longer carries uscistr-printing',
    'got "' + state.bodyClass + '"');

  check(state.printNodes === 0,
    contextLabel + ': zero .uscistr-print nodes remain in the DOM',
    'got ' + state.printNodes);

  check(state.title === harnessTitle,
    contextLabel + ': document.title is restored to the harness title',
    'got "' + state.title + '", expected "' + harnessTitle + '"');
}

function runChecks(CDP) {
  var client;
  var harnessTitle;

  return CDP.connect(CDP_PORT)
    .then(function (c) {
      client = c;
      return client.send('Page.enable');
    })
    .then(function () {
      // Chrome only computes print-media styles for real when an actual
      // print dialog opens (which window.print() would trigger) — since
      // window.print() gets stubbed out below, emulation is what makes
      // getComputedStyle inside the stub see print rules at all.
      return client.send('Emulation.setEmulatedMedia', { media: 'print' });
    })
    .then(function () {
      return client.send('Page.navigate', { url: BASE + '?scenario=normal' });
    })
    .then(function () {
      return sleep(CASES_WAIT_MS);
    })
    .then(function () {
      return client.eval("(function(){var p=document.querySelector('.uscistr-pill'); if(p){p.click(); return true;} return false;})()");
    })
    .then(function (clicked) {
      check(clicked === true, 'launcher pill was found and clicked', 'clicked=' + clicked);
      return sleep(PANEL_OPEN_WAIT_MS);
    })
    .then(function () {
      // The intro overlay isn't guaranteed on every run; dismiss it if
      // present and move on either way.
      return client.eval(clickText('Got it'));
    })
    .then(function () {
      return sleep(300);
    })
    .then(function () {
      return client.eval('document.title');
    })
    .then(function (title) {
      harnessTitle = title;
      return client.eval(STUB);
    })
    .then(function (stubbed) {
      check(stubbed === 'stubbed', 'window.print stub installed', 'got ' + JSON.stringify(stubbed));

      // --- Full record ---
      return client.eval(clickText('Print…'));
    })
    .then(function (clicked) {
      check(clicked === 'clicked', 'Print… button found (before full record)', 'got ' + clicked);
      return sleep(POPOVER_WAIT_MS);
    })
    .then(function () {
      // The choice popover's own geometry. It shipped collapsed to a 14px
      // sliver on a phone: mounted inside the footer, whose backdrop-filter
      // makes it a containing block, so `max-height: calc(100% - 52px)`
      // resolved against 34px and squashed every child to nothing. Assert the
      // anchor and the resulting size, not just that the buttons are clickable
      // — they were clickable while being invisible.
      return client.eval(POPOVER_GEOMETRY);
    })
    .then(function (raw) {
      var g = typeof raw === 'string' ? JSON.parse(raw) : raw;
      check(g && g.found, 'print choice popover is in the DOM', JSON.stringify(g));
      check(g && g.offsetParent === 'uscistr-panel',
        'popover anchors to the panel, not the footer', 'anchored to ' + (g && g.offsetParent));
      check(g && g.height >= 120,
        'popover is not collapsed (>=120px tall)', 'height was ' + (g && g.height) + 'px');
      check(g && g.insidePanel, 'popover sits inside the panel bounds', JSON.stringify(g));
      check(g && g.smallestChild >= 12,
        'popover children are not squashed flat', 'smallest child ' + (g && g.smallestChild) + 'px');
      return client.eval(clickText('Full record'));
    })
    .then(function (clicked) {
      check(clicked === 'clicked', 'Full record button found', 'got ' + clicked);
      return sleep(PRINT_ACTION_WAIT_MS);
    })
    .then(function () {
      return client.eval('window.__printProbe');
    })
    .then(function (probe) {
      assertFullRecordProbe(probe);
      return client.eval(readTeardownState());
    })
    .then(function (state) {
      assertTeardown(state, harnessTitle, 'after full record print');

      // --- Masked copy ---
      return client.eval(clickText('Print…'));
    })
    .then(function (clicked) {
      check(clicked === 'clicked', 'Print… button found (before masked copy)', 'got ' + clicked);
      return sleep(POPOVER_WAIT_MS);
    })
    .then(function () {
      return client.eval(clickText('Masked copy'));
    })
    .then(function (clicked) {
      check(clicked === 'clicked', 'Masked copy button found', 'got ' + clicked);
      return sleep(PRINT_ACTION_WAIT_MS);
    })
    .then(function () {
      return client.eval('window.__printProbe');
    })
    .then(function (probe) {
      assertMaskedCopyProbe(probe);
      return client.eval(readTeardownState());
    })
    .then(function (state) {
      assertTeardown(state, harnessTitle, 'after masked copy print');

      // --- The Safari case ---
      // window.print() blocks on desktop Chrome and Firefox but returns
      // immediately on Safari, iOS especially, with the print UI presented
      // afterwards. Teardown used to run in a `finally` right after print()
      // returned, so on Safari the document and the body class were gone
      // before anything rendered and Safari printed the underlying page with
      // the panel sitting on top of it. This stub reproduces that browser: it
      // records nothing and fires no afterprint. Print mode must still be
      // standing when print() has returned.
      return client.eval(SILENT_PRINT_STUB);
    })
    .then(function (stubbed) {
      check(stubbed === 'stubbed', 'non-blocking print stub installed', 'got ' + stubbed);
      return client.eval(clickText('Print…'));
    })
    .then(function () { return sleep(POPOVER_WAIT_MS); })
    .then(function () { return client.eval(clickText('Full record')); })
    .then(function () { return sleep(PRINT_ACTION_WAIT_MS); })
    .then(function () {
      return client.eval(readTeardownState());
    })
    .then(function (raw) {
      var s = typeof raw === 'string' ? JSON.parse(raw) : raw;
      check(s && s.printNodes === 1,
        'non-blocking print: the record is still mounted after print() returns',
        'print nodes in DOM: ' + (s && s.printNodes));
      check(s && /uscistr-printing/.test(String(s.bodyClass)),
        'non-blocking print: body still carries uscistr-printing',
        'body class: ' + (s && s.bodyClass));
      // Now let the browser say printing finished, the way a real one does.
      return client.eval('(function(){window.dispatchEvent(new Event("afterprint"));return "fired";})()');
    })
    .then(function () { return sleep(600); })
    .then(function () { return client.eval(readTeardownState()); })
    .then(function (state) {
      assertTeardown(state, harnessTitle, 'after afterprint fires');

      // --- Cancel ---
      return client.eval(clickText('Print…'));
    })
    .then(function (clicked) {
      check(clicked === 'clicked', 'Print… button found (before cancel)', 'got ' + clicked);
      return sleep(POPOVER_WAIT_MS);
    })
    .then(function () {
      return client.eval(clickText('Cancel'));
    })
    .then(function (clicked) {
      check(clicked === 'clicked', 'Cancel button found', 'got ' + clicked);
      return sleep(PRINT_ACTION_WAIT_MS);
    })
    .then(function () {
      return client.eval(readTeardownState());
    })
    .then(function (state) {
      assertTeardown(state, harnessTitle, 'after cancel');
      return client.close();
    })
    .catch(function (err) {
      fail('print check threw', err && err.message ? err.message : String(err));
      if (client) return client.close().catch(function () {});
    });
}

function main() {
  var chromePath = findChrome();
  if (!chromePath) {
    console.error('PRINT CHECK FAILED: no Chrome/Chromium binary found. Set CHROME_PATH or install one.');
    process.exit(1);
  }

  var server = spawn('python3', ['-m', 'http.server', String(HTTP_PORT)], {
    cwd: ROOT,
    stdio: 'ignore'
  });

  var userDataDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'caselens-print-check-'));
  var chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=' + CDP_PORT,
    '--user-data-dir=' + userDataDir,
    '--no-sandbox',
    '--disable-gpu',
    'about:blank'
  ], { stdio: 'ignore' });

  var cleanup = function () {
    try { chrome.kill(); } catch (e) {}
    try { server.kill(); } catch (e) {}
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
  };
  process.on('exit', cleanup);

  waitFor('http://localhost:' + HTTP_PORT + '/test/harness.html', 40, 250)
    .catch(function (err) {
      throw new Error('local http server on :' + HTTP_PORT + ' never came up: ' + (err && err.message));
    })
    .then(function () {
      return waitFor('http://localhost:' + CDP_PORT + '/json/version', 40, 250);
    })
    .catch(function (err) {
      throw new Error('headless Chrome debugging port :' + CDP_PORT + ' never came up: ' + (err && err.message));
    })
    .then(function () {
      var CDP = require(path.join(__dirname, 'cdp-lite.js'));
      return runChecks(CDP);
    })
    .then(function () {
      cleanup();
      if (failures.length > 0) {
        console.error('\n' + failures.length + ' print check(s) failed.');
        process.exit(1);
      }
      console.log('\nAll print check assertions passed.');
      process.exit(0);
    })
    .catch(function (err) {
      cleanup();
      console.error('PRINT CHECK FAILED: ' + (err && err.message ? err.message : String(err)));
      process.exit(1);
    });
}

main();
