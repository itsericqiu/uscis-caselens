// Unit tests for the pure functions behind everything the panel says.
//
//   node test/unit.js
//
// These exist because reading this code is not enough. Every test below either
// pins down a bug that actually shipped, or guards a claim the UI makes about
// someone's immigration case. The date tests in particular: a filing date once
// rendered a day early for every user west of UTC, and it took a live install
// to notice.
//
// No framework, no dependencies — same rule as the rest of the project.

var internals = require('./internals.js');

var passed = 0;
var failures = [];
var group = '';

function describe(name) { group = name; }

function ok(cond, label, detail) {
  if (cond) { passed++; return; }
  failures.push({ group: group, label: label, detail: detail || '' });
}

function eq(actual, expected, label) {
  ok(actual === expected, label, 'expected ' + JSON.stringify(expected) +
    ', got ' + JSON.stringify(actual));
}

// ---------------------------------------------------------------------------

function run() {
  var A = internals.load();

  // --- dates ---------------------------------------------------------------
  // The bug class with a history: USCIS sends calendar dates and real instants
  // in different shapes, and reading a calendar date as an instant moves it a
  // day for anyone west of UTC.
  describe('parseUscisDate — date-only values keep their calendar day');
  [
    '2026-06-04',
    '2026-06-04T00:00:00Z',
    '2026-06-04T00:00:00.000Z',
    '2026-06-04T00:00:00.0Z',
    '2026-06-04T00:00:00.000000Z',
    '2026-06-04T00:00Z',
    '2026-06-04T00:00:00+0000',
    '2026-06-04T00:00:00.000+00:00'
  ].forEach(function (shape) {
    eq(A.formatDateFull(shape), 'June 4, 2026', shape);
  });

  describe('parseUscisDate — USCIS history format');
  eq(A.formatDateFull('07-10-2026 00:00:00'), 'July 10, 2026', 'MM-DD-YYYY HH:mm:ss');

  describe('parseUscisDate — refuses impossible dates instead of rolling over');
  ['2026-13-45', '13-45-2026', '0000-00-00', '99-99-9999', '2026-02-30'].forEach(function (bad) {
    eq(A.parseUscisDate(bad), null, bad);
  });

  describe('parseUscisDate — non-strings are not coerced');
  [null, undefined, {}, [], ['2026-05-29'], 0, false].forEach(function (bad) {
    eq(A.parseUscisDate(bad), null, JSON.stringify(bad));
  });

  describe('daysBetween — consecutive calendar days are always 1 apart');
  (function () {
    var bad = 0;
    var d = new Date(2026, 0, 1);
    for (var i = 0; i < 730; i++) {
      var next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      if (A.daysBetween(d.getTime(), next.getTime()) !== 1) bad++;
      d = next;
    }
    eq(bad, 0, 'two years of consecutive days');
  })();

  // --- change detection ----------------------------------------------------
  describe('diffSnapshots');
  eq(A.diffSnapshots(null, { status: 'X' }).length, 0, 'first fetch reports nothing');
  eq(A.diffSnapshots({ status: 'A' }, { status: 'B' })[0].kind, 'status', 'status change detected');
  eq(A.diffSnapshots({ status: 'A' }, { status: 'A' }).length, 0, 'unchanged status is silent');

  (function () {
    // Documents are a multiset: USCIS reuses filenames, and a second copy of a
    // name is a second document.
    var prev = { docNames: ['a.tif'] };
    var next = { docNames: ['a.tif', 'a.tif'] };
    var changes = A.diffSnapshots(prev, next).filter(function (c) { return c.kind === 'document'; });
    eq(changes.length, 1, 'a repeated filename counts as a new document');
  })();

  // --- the fabricated-change bug -------------------------------------------
  // A partial endpoint failure used to blank the fields that endpoint supplies.
  // The damage landed on the NEXT check, when the recovered data diffed against
  // absence and every document was reported as new.
  describe('carryForwardUnread — a failed endpoint cannot manufacture changes');
  (function () {
    var prev = {
      status: 'USCIS Is Currently Processing Your Case', statusAt: '2026-07-12',
      docNames: ['a.tif', 'b.tif'], office: 'NEBRASKA SERVICE CENTER',
      formType: 'I-485', closed: false, actionRequired: false,
      evidenceCount: 0, appointments: [{ label: 'Biometrics', at: 4102444800000 }],
      backendAt: '2026-08-02'
    };
    // documents errored; everything else answered as before.
    var snap = {
      status: prev.status, statusAt: prev.statusAt, docNames: [], office: prev.office,
      formType: 'I-485', closed: false, actionRequired: false,
      evidenceCount: 0, appointments: prev.appointments, backendAt: prev.backendAt
    };
    var result = {
      caseDetail: { some: 'data' },
      caseStatus: { some: 'data' },
      documents: { __error: 'HTTP 500' }
    };
    A.carryForwardUnread(snap, prev, result);
    eq(snap.docNames.length, 2, 'document list is kept, not blanked');
    eq(A.diffSnapshots(prev, snap).length, 0, 'no change is reported');
  })();

  (function () {
    // The mirror case: the endpoint answered and the list genuinely emptied.
    var prev = { docNames: ['a.tif'], status: 'S' };
    var snap = { docNames: [], status: 'S' };
    var result = { caseDetail: { d: 1 }, caseStatus: { d: 1 }, documents: { d: 1 } };
    A.carryForwardUnread(snap, prev, result);
    eq(snap.docNames.length, 0, 'a real emptying is still recorded');
  })();

  (function () {
    // caseDetail failing must not wipe the cached obligation.
    var prev = { closed: false, actionRequired: true, evidenceCount: 2, formType: 'I-485' };
    var snap = { closed: null, actionRequired: null, evidenceCount: 0, formType: null };
    A.carryForwardUnread(snap, prev, { caseDetail: { __error: 'x' }, caseStatus: { d: 1 } });
    eq(snap.actionRequired, true, 'an outstanding request survives a failed check');
    eq(snap.evidenceCount, 2, 'the evidence count survives');
    eq(snap.formType, 'I-485', 'identity survives');
  })();

  // --- "we could not read it" vs "there is nothing" -------------------------
  describe('resultHasAnyData — an all-empty check is not a successful read');
  eq(A.resultHasAnyData({
    caseDetail: { __empty: true }, caseStatus: { __empty: true },
    documents: { __empty: true }, location: { __empty: true }, processingTimes: { __empty: true }
  }), false, 'every endpoint answering with nothing is not a read');
  eq(A.resultHasAnyData({
    caseDetail: { formType: 'I-485' }, caseStatus: { __empty: true }, documents: { __empty: true }
  }), true, 'one substantive answer is a read');
  eq(A.resultHasAnyData({
    caseDetail: { __error: 'x' }, caseStatus: { __error: 'x' }, documents: { __error: 'x' },
    location: { __empty: true }, processingTimes: { __empty: true }
  }), false, 'supplementary endpoints alone are not a read');

  // --- the stage rail ------------------------------------------------------
  describe('stageIndexOfCode');
  (function () {
    var seq = [
      { name: 'Received', codes: ['RCV0', 'IAF'] },
      { name: 'Biometrics', codes: ['FNA'] },
      { name: 'Decision', codes: ['DA'] }
    ];
    eq(A.stageIndexOfCode(seq, 'FNA'), 1, 'known code maps to its stage');
    eq(A.stageIndexOfCode(seq, 'fna'), 1, 'lookup is case-insensitive');
    eq(A.stageIndexOfCode(seq, 'ZZ9'), -1, 'unknown code maps nowhere');
    eq(A.stageIndexOfCode(seq, '__proto__'), -1, 'prototype keys map nowhere');
  })();

  // --- redaction -----------------------------------------------------------
  // This is a privacy control implemented as a regex over escaped JSON. It gets
  // the strictest tests in the file.
  describe('redactRawJson');
  (function () {
    var R = internals.load({ redact: true });
    function hidden(json, label) {
      var out = R.redactRawJson(json);
      ok(out.indexOf('[hidden]') !== -1, label, 'not masked: ' + out);
      return out;
    }
    hidden('{"applicantName": "SAMPLE, APPLICANT"}', 'plain name');
    var esc = hidden('{"applicantName": "O\\"BRIEN, PAT", "x": 1}', 'name containing an escaped quote');
    ok(esc.indexOf('BRIEN') === -1, 'escaped quote does not leak the rest of the value', esc);
    hidden('{"address": "1 Main St"}', 'address');
    hidden('{"letterId": "440000001"}', 'letter id');

    var num = R.redactRawJson('{"receiptNumber": "IOE0912345678"}');
    ok(num.indexOf('IOE0912345678') === -1, 'uppercase receipt number is masked', num);
    var lower = R.redactRawJson('{"receiptNumber": "ioe0912345678"}');
    ok(lower.indexOf('ioe0912345678') === -1, 'lowercase receipt number is masked', lower);

    ok(R.displayFileName('IOE0912345678-0000-part1.tif').indexOf('IOE0912345678') === -1,
      'document filenames are masked', R.displayFileName('IOE0912345678-0000-part1.tif'));

    var off = internals.load({ redact: false });
    eq(off.redactRawJson('{"applicantName": "X"}'), '{"applicantName": "X"}',
      'nothing is masked when the setting is off');
  })();

  describe('isValidReceiptNumber');
  ok(A.isValidReceiptNumber('IOE0912345678'), 'IOE accepted');
  ok(A.isValidReceiptNumber('EAC2412345678'), 'paper-filed prefix accepted (format is the rule)');
  ok(!A.isValidReceiptNumber('__proto__'), 'prototype key rejected');
  ok(!A.isValidReceiptNumber('IOE091234567'), 'twelve characters rejected');
  ok(!A.isValidReceiptNumber(null), 'null rejected');

  // --- small helpers with sharp edges --------------------------------------
  describe('flattenValue / strictBool');
  eq(A.flattenValue({ name: 'NEBRASKA' }), 'NEBRASKA', 'object with a name flattens to it');
  eq(A.flattenValue(null), null, 'null stays null');
  eq(A.strictBool(true), true, 'true is a fact');
  eq(A.strictBool(false), false, 'false is a fact');
  eq(A.strictBool(undefined), null, 'absence is not false');
  eq(A.strictBool('true'), null, 'a string is not a boolean');

  describe('stripHtml');
  eq(A.stripHtml('Go to <a href="x">uscis.gov</a> now'), 'Go to uscis.gov now', 'tags removed');

  describe('plural');
  eq(A.plural(1, 'change'), '1 change', 'singular');
  eq(A.plural(2, 'change'), '2 changes', 'plural');

  // ---------------------------------------------------------------------------
  if (failures.length) {
    console.error('\nunit: FAILED — ' + failures.length + ' of ' + (passed + failures.length) + ' checks\n');
    failures.forEach(function (f) {
      console.error('  [' + f.group + '] ' + f.label);
      if (f.detail) console.error('      ' + f.detail);
    });
    process.exit(1);
  }
  console.log('unit: OK — ' + passed + ' checks passed.');
}

run();
