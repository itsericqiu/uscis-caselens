// Load the shipped core into Node so its pure functions can be unit-tested.
//
// The whole tool is one IIFE with no exports — deliberately, because the thing
// people install has to be exactly the thing they can read. That leaves no seam
// for tests, so this makes one WITHOUT touching the shipped bytes: it reads the
// three core files, appends an export of the internals it wants, and evaluates
// the result in a vm sandbox with the smallest possible DOM stubs.
//
// `node scripts/build.js --check` still proves the artifacts are byte-identical
// to the sources, and this file never writes to them.
//
// Only genuinely pure functions belong here. Anything that renders or touches
// real storage should be exercised by the harness and the smoke test instead.

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..');

// The functions worth testing directly. Keep this list short and honest: a name
// here that no test uses is dead weight, and a name missing here means the test
// file cannot reach it.
var EXPORTS = [
  // `loadAll` is here so a test can populate state.prefs. Nothing else in the
  // core runs at load time (init() stops at the auth probe, which cannot
  // succeed with no network), so preferences are otherwise null and every
  // redaction path short-circuits — which would make the redaction tests pass
  // by doing nothing.
  'loadAll',
  'parseUscisDate', 'daysBetween', 'startOfLocalDay', 'sameLocalDay',
  'formatDateAs', 'formatDate', 'formatDateFull', 'formatDayLabel', 'relativeDate',
  'normalize', 'diffSnapshots', 'carryForwardUnread', 'isAbsentValue',
  'snapshotHasContent', 'resultHasAnyData', 'payloadUsable', 'payloadFailed',
  'flattenValue', 'strictBool', 'stripHtml', 'pick', 'plural',
  'isValidReceiptNumber', 'redactRawJson', 'redactNumber', 'displayFileName',
  'stageIndexOfCode', 'describeCode', 'learnedKey', 'documentLabel',
  'decorateAndDedupeTimeline', 'countNewHistory', 'normalizeText', 'hasTimeComponent',
  'middleTruncate', 'parseEstimateMonths', 'futureAppointments'
];

function fakeElement() {
  var node = {
    style: {}, className: '', childNodes: [], attributes: {},
    setAttribute: function (k, v) { this.attributes[k] = v; },
    getAttribute: function (k) { return this.attributes[k] || null; },
    removeAttribute: function (k) { delete this.attributes[k]; },
    appendChild: function (c) { this.childNodes.push(c); return c; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    addEventListener: function () {},
    classList: { add: function () {}, remove: function () {}, contains: function () { return false; } }
  };
  return node;
}

function load(prefs) {
  var src = ['uscis-codes.js', 'uscis-style.js', 'uscis-tracker-core.js']
    .map(function (f) { return fs.readFileSync(path.join(ROOT, 'core', f), 'utf8'); })
    .join('\n');

  // The IIFE ends with `})();` on its own line. Replace only the LAST one, and
  // fail loudly rather than silently testing nothing if that shape ever changes.
  var marker = '\n})();';
  var at = src.lastIndexOf(marker);
  if (at === -1) throw new Error('test/internals.js: could not find the core IIFE terminator');

  var exportLines = EXPORTS.map(function (name) {
    // typeof guard so a renamed function surfaces as undefined in the test
    // rather than as a ReferenceError while loading.
    return '    ' + name + ': (typeof ' + name + " === 'function' ? " + name + ' : undefined),';
  }).join('\n');

  src = src.slice(0, at) + '\n  __exports = {\n' + exportLines + '\n  };\n})();';

  var storage = {};
  var sandbox = {
    __exports: null,
    console: console,
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    setInterval: function () { return 0; }, clearInterval: function () {},
    localStorage: {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
      setItem: function (k, v) { storage[k] = String(v); },
      removeItem: function (k) { delete storage[k]; },
      key: function (i) { return Object.keys(storage)[i] || null; },
      get length() { return Object.keys(storage).length; }
    },
    document: {
      readyState: 'complete',
      createElement: fakeElement,
      createElementNS: fakeElement,
      createTextNode: function (t) { return { text: t }; },
      createDocumentFragment: fakeElement,
      documentElement: fakeElement(),
      body: fakeElement(),
      head: fakeElement(),
      addEventListener: function () {},
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; }
    },
    location: { href: 'https://my.uscis.gov/account', hostname: 'my.uscis.gov' },
    navigator: { language: 'en-US' },
    URL: URL,
    Intl: Intl,
    // No network: any fetch during load is a bug in this harness, not a test.
    fetch: function () { return Promise.reject(new Error('no network in unit tests')); }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'caselens-core-under-test.js' });

  var api = sandbox.__exports;
  if (!api) throw new Error('test/internals.js: core did not export its internals');

  // Give tests a way to set preferences (redaction) and read storage.
  api.__storage = storage;
  api.__sandbox = sandbox;
  if (prefs) {
    storage['uscisTracker.prefs.v1'] = JSON.stringify(prefs);
    if (typeof api.loadAll !== 'function') {
      throw new Error('test/internals.js: loadAll is not exported, so prefs cannot be applied');
    }
    api.loadAll();
  }
  return api;
}

module.exports = { load: load, EXPORTS: EXPORTS };
