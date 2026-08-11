// Headless-Chrome smoke test for CaseLens's local test harness.
//
// Verifies two behaviors that must never regress:
//
//   1. ?scenario=loggedOut renders NOTHING — zero elements matching
//      [class*=uscistr]. This is the core privacy guarantee: no panel, no
//      launcher pill, no injected <style>, nothing at all, when the tracker
//      cannot confirm the user is signed in to USCIS.
//   2. ?scenario=normal renders a panel (or launcher pill) and produces no
//      console errors while doing it.
//
// Zero dependencies: starts `python3 -m http.server` itself, and drives
// headless Chrome over the DevTools Protocol using the zero-dependency
// client in scripts/cdp-lite.js (same one scripts/screenshots.js uses).
//
//   node scripts/smoke-test.js
//
// Runs the same way locally and in CI. Exits 0 on success, 1 on any
// failure, printing exactly what failed.

var fs = require('fs');
var path = require('path');
var http = require('http');
var spawn = require('child_process').spawn;

var ROOT = path.join(__dirname, '..');
// Overridable only for local runs where the default ports are already in
// use by something else (e.g. another process already serving the repo).
// CI always gets the defaults below.
var HTTP_PORT = Number(process.env.SMOKE_HTTP_PORT) || 8899;
var CDP_PORT = Number(process.env.SMOKE_CDP_PORT) || 9333;
var BASE = 'http://localhost:' + HTTP_PORT + '/test/harness.html';
var NORMAL_TIMEOUT_MS = 30000;
var POLL_MS = 500;

var failures = [];

function fail(label, detail) {
  failures.push(label + (detail ? ': ' + detail : ''));
  console.error('FAIL - ' + label + (detail ? ': ' + detail : ''));
}

function pass(label) {
  console.log('PASS - ' + label);
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

// Injected into the page before any of its own scripts run, so it captures
// console.error calls, uncaught exceptions, and unhandled promise
// rejections from the very first tick.
var ERROR_COLLECTOR_SOURCE = [
  '(function () {',
  '  window.__caselensErrors = [];',
  '  var origError = console.error;',
  '  console.error = function () {',
  '    window.__caselensErrors.push(Array.prototype.slice.call(arguments).map(String).join(" "));',
  '    return origError.apply(console, arguments);',
  '  };',
  '  window.addEventListener("error", function (e) {',
  '    window.__caselensErrors.push("uncaught error: " + (e && e.message));',
  '  });',
  '  window.addEventListener("unhandledrejection", function (e) {',
  '    var reason = e && e.reason;',
  '    window.__caselensErrors.push("unhandled rejection: " + (reason && reason.message ? reason.message : String(reason)));',
  '  });',
  '})();'
].join('\n');

function countTrackerElements(client) {
  return client.eval("document.querySelectorAll('[class*=uscistr]').length");
}

function waitForTrackerElements(client, timeoutMs) {
  var start = Date.now();
  var poll = function () {
    return countTrackerElements(client).then(function (count) {
      if (count > 0) return count;
      if (Date.now() - start > timeoutMs) return count;
      return sleep(POLL_MS).then(poll);
    });
  };
  return poll();
}

function checkLoggedOut(CDP) {
  var client;
  return CDP.connect(CDP_PORT)
    .then(function (c) {
      client = c;
      return client.send('Page.enable');
    })
    .then(function () {
      return client.send('Page.addScriptToEvaluateOnNewDocument', { source: ERROR_COLLECTOR_SOURCE });
    })
    .then(function () {
      return client.send('Page.navigate', { url: BASE + '?scenario=loggedOut' });
    })
    .then(function () {
      // loggedOut should render nothing almost immediately (no fetches to
      // wait on beyond the single failed auth probe) — a short fixed wait
      // plus one poll is enough, and keeps the false-negative window tight.
      return sleep(3000);
    })
    .then(function () {
      return countTrackerElements(client);
    })
    .then(function (count) {
      if (count === 0) {
        pass('loggedOut renders zero [class*=uscistr] elements');
      } else {
        fail('loggedOut must render nothing', count + ' element(s) matching [class*=uscistr] found');
      }
      return client.close();
    })
    .catch(function (err) {
      fail('loggedOut scenario check threw', err && err.message ? err.message : String(err));
      if (client) return client.close().catch(function () {});
    });
}

function checkNormal(CDP) {
  var client;
  return CDP.connect(CDP_PORT)
    .then(function (c) {
      client = c;
      return client.send('Page.enable');
    })
    .then(function () {
      return client.send('Page.addScriptToEvaluateOnNewDocument', { source: ERROR_COLLECTOR_SOURCE });
    })
    .then(function () {
      return client.send('Page.navigate', { url: BASE + '?scenario=normal' });
    })
    .then(function () {
      return waitForTrackerElements(client, NORMAL_TIMEOUT_MS);
    })
    .then(function (count) {
      if (count > 0) {
        pass('normal scenario renders a panel/pill (' + count + ' [class*=uscistr] element(s))');
      } else {
        fail('normal scenario should render a panel or launcher pill', 'zero elements after ' + NORMAL_TIMEOUT_MS + 'ms');
      }
      // Opening the panel is where cards render, and card rendering is where a
      // missing helper throws. Asserting only that a pill appears let a
      // ReferenceError ship that made the panel vanish on open for anyone whose
      // case had documents.
      return client.eval("(function(){var p=document.querySelector('.uscistr-pill'); if (p) p.click(); return !!p;})()");
    })
    .then(function () {
      return sleep(2500);
    })
    .then(function () {
      return client.eval('document.querySelectorAll(".uscistr-card").length');
    })
    .then(function (cards) {
      if (cards > 0) {
        pass('panel opens and renders ' + cards + ' case card(s)');
      } else {
        fail('panel should render case cards when opened', 'zero .uscistr-card elements after opening');
      }
      // The status USCIS published has to actually reach the row. Asserting
      // only that cards render let a wrong endpoint mapping ship: every card
      // drew fine and every row read "No status published yet", because the
      // status endpoint was being served the case-detail payload. A panel that
      // renders perfectly and says nothing true is the failure that matters
      // most here, and it is invisible to an element count.
      return client.eval(
        "(function(){" +
        "var rows=[].slice.call(document.querySelectorAll('.uscistr-collapsed-status'));" +
        "return rows.map(function(r){return r.textContent;});" +
        "})()");
    })
    .then(function (statuses) {
      statuses = statuses || [];
      var withStatus = statuses.filter(function (s) {
        return s && s.indexOf('No status published') === -1 && s.indexOf("Couldn't read") === -1;
      });
      if (statuses.length && withStatus.length === statuses.length) {
        pass('every collapsed row carries USCIS\'s own status (' + withStatus.length + ' rows)');
      } else {
        fail('collapsed rows should show the status USCIS published',
          'got ' + JSON.stringify(statuses));
      }
      return client.eval('window.__caselensErrors || []');
    })
    .then(function (errors) {
      errors = errors || [];
      if (errors.length === 0) {
        pass('normal scenario logs no console errors');
      } else {
        fail('normal scenario logged console errors', JSON.stringify(errors));
      }
      return client.close();
    })
    .catch(function (err) {
      fail('normal scenario check threw', err && err.message ? err.message : String(err));
      if (client) return client.close().catch(function () {});
    });
}

function main() {
  var chromePath = findChrome();
  if (!chromePath) {
    console.error('SMOKE TEST FAILED: no Chrome/Chromium binary found. Set CHROME_PATH or install one.');
    process.exit(1);
  }

  var server = spawn('python3', ['-m', 'http.server', String(HTTP_PORT)], {
    cwd: ROOT,
    stdio: 'ignore'
  });

  var userDataDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'caselens-smoke-'));
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
      return checkLoggedOut(CDP).then(function () { return checkNormal(CDP); });
    })
    .then(function () {
      cleanup();
      if (failures.length > 0) {
        console.error('\n' + failures.length + ' smoke test check(s) failed.');
        process.exit(1);
      }
      console.log('\nAll smoke test checks passed.');
      process.exit(0);
    })
    .catch(function (err) {
      cleanup();
      console.error('SMOKE TEST FAILED: ' + (err && err.message ? err.message : String(err)));
      process.exit(1);
    });
}

main();
