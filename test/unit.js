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
  describe('stageTypeOfCode');
  eq(A.stageTypeOfCode('FNB'), 'biometrics', 'known code maps to its step');
  eq(A.stageTypeOfCode('fnb'), 'biometrics', 'lookup is case-insensitive');
  eq(A.stageTypeOfCode('ZZ9'), null, 'unknown code maps nowhere');
  eq(A.stageTypeOfCode('__proto__'), null, 'prototype keys map nowhere');
  eq(A.stageTypeOfCode('SA'), 'decision', 'observed-but-unpublished codes are declared, not invisible');

  describe('stageInfo — stages materialise from evidence, never from a per-form script');
  (function () {
    var now = new Date().getTime();
    var day = 24 * 60 * 60 * 1000;
    function mkView(over) {
      var v = {
        items: [], upcoming: [], evidenceCount: 0,
        detail: { formType: over.formType || null, closed: !!over.closed,
          submissionDate: over.filed || null },
        notice: null
      };
      var k;
      for (k in over) {
        if (k === 'items' || k === 'upcoming' || k === 'evidenceCount' || k === 'notice') v[k] = over[k];
      }
      return v;
    }
    function types(info) {
      return info.stages.map(function (s) { return s.type + ':' + s.state; }).join(' ');
    }
    var entry = { number: 'IOE0000000000' };

    // The floor: an unknown form with no mappable codes still gets the spine.
    var bare = A.stageInfo(entry, mkView({ formType: 'I-999',
      items: [{ code: 'ZZ9', displayAt: now - day, kind: 'event' }] }));
    eq(types(bare), 'received:evidenced review:current decision:ahead',
      'unknown form, unknown code: the definitional spine and nothing invented');
    eq(bare.unmapped.join(','), 'ZZ9', 'the unmapped code is reported, not dropped');

    // Prefill from form instructions renders NOT-REPORTED, never hollow-ahead.
    var i485 = A.stageInfo(entry, mkView({ formType: 'I-485', filed: '2026-03-14',
      items: [
        { code: 'IAF', displayAt: now - 100 * day, kind: 'event' },
        { code: 'FTA0', displayAt: now - 60 * day, kind: 'event' },
        { kind: 'appointment', displayAt: now - 30 * day, code: null }
      ] }));
    eq(types(i485),
      'received:evidenced appointment:evidenced biometrics:not-reported review:current decision:ahead',
      'attended-but-unreported biometrics shows as not-reported, with the real appointment evidenced');

    // Evidence upgrades prefill: one stage per type, never two.
    var withBio = A.stageInfo(entry, mkView({ formType: 'I-485',
      items: [{ code: 'FNB', displayAt: now - 10 * day, kind: 'event' }] }));
    var bioStages = withBio.stages.filter(function (s) { return s.type === 'biometrics'; });
    eq(bioStages.length, 1, 'prefill plus evidence is one stage');
    eq(bioStages[0].state, 'evidenced', 'and the evidence wins');

    // A future appointment sorts after the current marker — date order, no clamp.
    var future = A.stageInfo(entry, mkView({ formType: 'I-999',
      upcoming: [{ kind: 'appointment', displayAt: now + 10 * day, code: null }] }));
    eq(types(future), 'received:evidenced review:current appointment:evidenced decision:ahead',
      'an upcoming appointment renders ahead of the present position');

    // Closed evidences Decision without saying how; card pins after decision.
    var closed = A.stageInfo(entry, mkView({ formType: 'I-765', closed: true,
      items: [
        { code: 'FTA0', displayAt: now - 40 * day, kind: 'event' },
        { code: 'SA', displayAt: now - 20 * day, kind: 'event' },
        { code: 'LDA', displayAt: now - 10 * day, kind: 'event' }
      ] }));
    eq(types(closed),
      'received:evidenced review:evidenced biometrics:not-reported decision:evidenced card:evidenced',
      'a finished case reads as history: no current marker, card after decision');

    // Structured evidence requests are stage evidence without any code.
    var rfe = A.stageInfo(entry, mkView({ formType: 'I-999', evidenceCount: 1 }));
    eq(types(rfe), 'received:evidenced evidence:evidenced review:current decision:ahead',
      'evidenceRequests[] alone materialises the evidence step');

    // Interview lifecycle: a cancellation is interview-step activity.
    eq(A.stageTypeOfCode('FKB'), 'interview', 'cancelled interview is still interview activity');
  })();

  describe('stage tables — every stage code is published or declared observed');
  (function () {
    var codes = A.__tables.USCIS_CODE_STAGES;
    var niem = A.__tables.USCIS_CODE_MEANINGS;
    var observed = A.__tables.USCIS_OBSERVED_CODES;
    var bad = [];
    var c;
    for (c in codes) {
      if (!Object.prototype.hasOwnProperty.call(codes, c)) continue;
      if (!niem[c] && !observed[c]) bad.push(c);
    }
    eq(bad.join(','), '', 'no stage code exists outside NIEM + the observed list');
    var badType = [];
    var LABELS = A.__tables.STAGE_TYPE_LABELS;
    for (c in codes) {
      if (!Object.prototype.hasOwnProperty.call(codes, c)) continue;
      if (!LABELS[codes[c]]) badType.push(c + '->' + codes[c]);
    }
    eq(badType.join(','), '', 'every mapping targets a real stage type');
    var badExpected = [];
    var EXPECTED = A.__tables.FORM_EXPECTED_STEPS;
    for (c in EXPECTED) {
      if (!Object.prototype.hasOwnProperty.call(EXPECTED, c)) continue;
      for (var e = 0; e < EXPECTED[c].length; e++) {
        if (!LABELS[EXPECTED[c][e]]) badExpected.push(c + '->' + EXPECTED[c][e]);
      }
    }
    eq(badExpected.join(','), '', 'every expected step names a real stage type');
  })();

  // --- the export ----------------------------------------------------------
  describe('buildExportPayload — a records file, not tool state');
  (function () {
    var payload = A.buildExportPayload();
    eq(payload.kind, 'caselens-record', 'the file names its kind');
    eq(Array.isArray(payload.cases), true, 'cases is an array');
    eq(typeof payload.exportedAt, 'string', 'export is timestamped');
    // The envelope carries no tool-state keys: prefs, dismissed and codeText
    // stopped being export material when import was removed — they restore
    // nothing and are nobody's records.
    eq('prefs' in payload, false, 'prefs are not exported');
    eq('dismissed' in payload, false, 'dismissals are not exported');
    eq('codeText' in payload, false, 'learned code text is not exported');
  })();

  // --- redaction -----------------------------------------------------------
  // This is a privacy control implemented as a regex over escaped JSON. It gets
  // the strictest tests in the file.
  // --- timeline dedupe -----------------------------------------------------
  describe('decorateAndDedupeTimeline — a merged row never sorts off its own day');
  (function () {
    // Official row is a bare date (local end-of-day); the coded row is a real
    // instant that lands on the PREVIOUS local day. Adopting its sort key put
    // the row below a genuine earlier row while still displaying the later date.
    var dayEnd = new Date(2026, 6, 10, 23, 59, 59).getTime();
    var prevDayEvening = new Date(2026, 6, 9, 18, 0, 0).getTime();
    var items = [
      { id: 'o', provenance: 'official', code: 'FTA0', label: 'Processing',
        sortAt: dayEnd, displayAt: dayEnd },
      { id: 'c', provenance: 'coded', code: 'FTA0', label: 'Processing',
        sortAt: prevDayEvening, displayAt: prevDayEvening }
    ];
    var out = A.decorateAndDedupeTimeline(items, {});
    var official = null;
    for (var i = 0; i < out.length; i++) if (out[i].id === 'o') official = out[i];
    ok(official !== null, 'the official row survives', JSON.stringify(out));
    eq(official.corroborated, true, 'it is marked corroborated');
    ok(A.sameLocalDay(official.sortAt, official.displayAt),
      'its sort key stays on the day it displays',
      'sortAt=' + official.sortAt + ' displayAt=' + official.displayAt);
  })();

  describe('decorateAndDedupeTimeline — "first seen" attaches to the nearest match');
  (function () {
    // The same status title twice, as happens after an evidence response.
    // History arrives oldest-first, so taking the first match marked the 2025
    // row instead of the recent one.
    var old = new Date(2025, 1, 3).getTime();
    var recent = new Date(2026, 6, 1).getTime();
    var seen = new Date(2026, 6, 20).getTime();
    var items = [
      { id: 'old', provenance: 'official', label: 'USCIS Is Processing Your Case',
        sortAt: old, displayAt: old },
      { id: 'recent', provenance: 'official', label: 'USCIS Is Processing Your Case',
        sortAt: recent, displayAt: recent },
      { id: 'local', provenance: 'local', kind: 'status', to: 'USCIS Is Processing Your Case',
        sortAt: seen, displayAt: seen }
    ];
    A.decorateAndDedupeTimeline(items, {});
    eq(items[0].firstSeenLocally, undefined, 'the older row is not marked');
    eq(items[1].firstSeenLocally, seen, 'the nearest preceding row is marked');
  })();

  describe('countNewHistory — works at the history cap');
  (function () {
    var h = [{ at: 'c' }, { at: 'b' }, { at: 'a' }];
    eq(A.countNewHistory(h, 'b', 3), 1, 'one new entry, array length unchanged');
    eq(A.countNewHistory(h, 'c', 3), 0, 'nothing new');
    eq(A.countNewHistory(h, 'gone', 3), 3, 'previous newest trimmed away');
  })();

  describe('relativeDate — no phantom "24 hours"');
  (function () {
    var now = new Date().getTime();
    var t = new Date(now - (23.7 * 60 * 60 * 1000)).toISOString();
    eq(A.relativeDate(t), '23 hours ago', '23h42m reads as 23 hours');
  })();

  describe('hasTimeComponent — a date is not a midnight appointment');
  eq(A.hasTimeComponent('2026-07-09T19:00:00.000Z'), true, 'real instant');
  eq(A.hasTimeComponent('2026-07-09T00:00:00.000Z'), false, 'UTC midnight is a bare date');
  eq(A.hasTimeComponent('2026-07-09T00:00:00+0000'), false, 'the +0000 spelling too');
  eq(A.hasTimeComponent('2026-07-09'), false, 'bare date');
  eq(A.hasTimeComponent(null), false, 'null');

  // --- helpers that other behaviour is built on --------------------------
  describe('pick — first non-empty candidate key');
  eq(A.pick({ b: 'x' }, ['a', 'b']), 'x', 'falls through to the second key');
  eq(A.pick({ a: '', b: 'x' }, ['a', 'b']), 'x', 'empty string is not an answer');
  eq(A.pick(null, ['a']), null, 'null object');
  eq(A.pick({}, ['a']), null, 'no candidate present');

  describe('payloadUsable / payloadFailed');
  eq(A.payloadUsable({ a: 1 }), true, 'data is usable');
  eq(A.payloadUsable({ __empty: true }), false, 'empty is not usable');
  eq(A.payloadUsable({ __error: 'x' }), false, 'error is not usable');
  eq(A.payloadUsable(null), false, 'null is not usable');
  eq(A.payloadFailed({ __error: 'x' }), true, 'error is a failure');
  eq(A.payloadFailed({ __empty: true }), false, 'empty is an answer, not a failure');

  describe('snapshotHasContent');
  eq(A.snapshotHasContent(null), false, 'no snapshot');
  eq(A.snapshotHasContent({}), false, 'empty snapshot');
  eq(A.snapshotHasContent({ status: 'X' }), true, 'a status counts');
  eq(A.snapshotHasContent({ docNames: ['a'] }), true, 'documents count');

  describe('normalize — only records what USCIS reported');
  (function () {
    var snap = A.normalize({
      fetchedAt: '2026-08-01T00:00:00.000Z',
      caseDetail: { formType: 'I-485', closed: false, actionRequired: true, evidenceRequests: [1, 2] },
      caseStatus: { statusTitle: 'Case Was Received', currentActionCode: 'IAF' }
    });
    eq(snap.formType, 'I-485', 'form type recorded');
    eq(snap.status, 'Case Was Received', 'status recorded');
    eq(snap.actionRequired, true, 'structured boolean recorded');
    eq(snap.evidenceCount, 2, 'evidence count recorded');
    eq(snap.closed, false, 'false is a fact, not an absence');
  })();

  (function () {
    // A failed detail endpoint must not be recorded as "not closed".
    var snap = A.normalize({ fetchedAt: 'x', caseDetail: { __error: 'boom' }, caseStatus: { __empty: true } });
    eq(snap.closed, null, 'unknown stays null');
    eq(snap.actionRequired, null, 'unknown stays null');
    eq(snap.formType, null, 'nothing invented');
  })();

  describe('parseEstimateMonths');
  eq(A.parseEstimateMonths({ estimatedTimeframe: '11 months' }), 11, 'free text months');
  eq(A.parseEstimateMonths({ range: { value: 8, unit: 'months' } }), 8, 'structured range');
  eq(A.parseEstimateMonths({ estimatedTimeframe: '8 to 10 weeks' }), null, 'weeks are not readable');
  eq(A.parseEstimateMonths({ __empty: true }), null, 'empty payload');

  describe('middleTruncate');
  eq(A.middleTruncate('short', 20), 'short', 'below the limit is untouched');
  ok(A.middleTruncate('abcdefghijklmnopqrstuvwxyz', 10).length <= 11,
    'long strings are shortened', A.middleTruncate('abcdefghijklmnopqrstuvwxyz', 10));

  describe('futureAppointments — only what has not happened yet');
  (function () {
    var future = new Date(new Date().getTime() + 9 * 864e5).toISOString();
    var past = new Date(new Date().getTime() - 9 * 864e5).toISOString();
    var out = A.futureAppointments({ notices: [
      { appointmentDateTime: future, actionType: 'Biometrics' },
      { appointmentDateTime: past, actionType: 'Old' },
      { actionType: 'Not an appointment' }
    ] });
    eq(out.length, 1, 'past and non-appointments are dropped');
    eq(out[0].label, 'Biometrics', 'label carried');
  })();

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
