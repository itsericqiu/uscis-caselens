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
  'parseUscisDate', 'daysBetween', 'sameLocalDay',
  'formatDate', 'formatDateFull', 'relativeDate',
  'normalize', 'diffSnapshots', 'carryForwardUnread', 'snapshotHasContent', 'resultHasAnyData', 'payloadUsable', 'payloadFailed',
  'flattenValue', 'strictBool', 'stripHtml', 'pick', 'plural',
  'isValidReceiptNumber', 'redactRawJson', 'displayFileName',
  'stageTypeOfCode', 'stageInfo', 'decorateAndDedupeTimeline', 'countNewHistory', 'hasTimeComponent',
  'middleTruncate', 'parseEstimateMonths', 'futureAppointments',
  // Fuzzing surface (scripts/fuzz.js): these pull hostile generated payloads
  // through the same paths real API responses take. buildCaseView/buildCaseCard
  // exercise nearly the whole render pipeline against the fake-DOM stubs —
  // a throw anywhere in there is a blank panel for a real user.
  'sortTimelineItems', 'collectTimelineItems', 'buildCaseView', 'buildCaseCard',
  'buildExportPayload',
  // The record view (docs/design/05-record-view.md). redactFieldValue is the
  // single redaction policy both renderers must obey; buildRecordFields walks
  // arbitrary API shapes, which is exactly what the fuzzer should hammer.
  'redactFieldValue', 'humanizeFieldKey', 'buildRecordFields', 'caseResponses',
  // The printable record (docs/design/06-print-record.md). Only the pure half
  // is reachable: printRecord and withPrintMode touch window.print and the
  // live document, neither of which exists in this sandbox — the same split
  // that keeps buildExportPayload testable and exportRecord not.
  // redactValueWith is the policy behind redactFieldValue, exported so a test
  // can prove the two have not forked.
  'buildPrintDocument', 'buildPrintCase', 'buildPrintFields', 'redactValueWith'
];

function fakeElement() {
  var node = {
    style: {}, className: '', childNodes: [], attributes: {},
    // el() wires every handler through addEventListener. This used to be a
    // no-op, so the sandbox silently discarded all of them — and any test that
    // "opened" a disclosure passed vacuously, having rendered nothing. A
    // record-view privacy test did exactly that: it reported no leak because
    // the nested content it was checking had never been built.
    _handlers: {},
    setAttribute: function (k, v) { this.attributes[k] = v; },
    getAttribute: function (k) { return this.attributes[k] || null; },
    removeAttribute: function (k) { delete this.attributes[k]; },
    appendChild: function (c) { this.childNodes.push(c); return c; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    addEventListener: function (type, fn) {
      if (typeof fn !== 'function') return;
      (this._handlers[type] = this._handlers[type] || []).push(fn);
    },
    // Tests dispatch through this rather than reaching for .onclick, which
    // el() never sets.
    dispatch: function (type) {
      var list = this._handlers[type] || [];
      for (var i = 0; i < list.length; i++) {
        list[i]({ currentTarget: this, target: this, preventDefault: function () {} });
      }
      return list.length;
    },
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

  // Data tables under test. TABLE_EXPORTS live at the top level of
  // uscis-codes.js or inside the core IIFE; the typeof guard covers both.
  var TABLE_EXPORTS = [
    'USCIS_CODE_MEANINGS', 'USCIS_CODE_STAGES', 'USCIS_OBSERVED_CODES',
    'STAGE_TYPE_LABELS', 'FORM_EXPECTED_STEPS'
  ];
  var tableLines = TABLE_EXPORTS.map(function (name) {
    return '      ' + name + ': (typeof ' + name + " !== 'undefined' ? " + name + ' : undefined),';
  }).join('\n');

  src = src.slice(0, at) + '\n  __exports = {\n' + exportLines +
    '\n    __tables: {\n' + tableLines + '\n    }\n  };\n})();';

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
      // Tag names are recorded because the printable record has to prove a
      // negative: no <a>, no <button>, no <svg> anywhere in it. my.uscis.gov's
      // own print stylesheet rewrites anchors to show their href, so an anchor
      // that sneaks in would deface a printed immigration record. Nothing else
      // in the core reads tagName off a node it built, so this is additive.
      createElement: function (tag) {
        var node = fakeElement();
        node.tagName = String(tag || 'div').toUpperCase();
        return node;
      },
      createElementNS: function (ns, tag) {
        var node = fakeElement();
        node.tagName = String(tag || 'div').toUpperCase();
        return node;
      },
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
