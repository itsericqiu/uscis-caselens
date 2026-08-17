// Property fuzzing for the data and render pipelines, on fast-check.
//
//   node scripts/fuzz.js            (default run)
//   node scripts/fuzz.js --ci       (fixed seed, smaller run, for CI)
//   node scripts/fuzz.js --seed=N   (reproduce; fast-check also prints a
//                                    counterexample already shrunk to minimal)
//
// The panel's core claim is that a form, code, or payload nobody has ever
// seen produces a correct, sparse rendering — never a throw, never a guess.
// Example-based tests cannot cover that, so this generates hostile inputs by
// the thousands and checks two kinds of property:
//
// STRUCTURAL — nothing crashes, shapes hold:
//   stageInfo returns received-first / decision-present / one-stage-per-type,
//   no "you are here" on a closed case; dedupe never keeps an item it wasn't
//   given and is idempotent; the filed anchor sorts last; the full
//   buildCaseView → buildCaseCard render path never throws (a throw there is
//   a blank panel for a real user).
//
// SEMANTIC — what the panel SAYS is true of its input:
//   a stage claims "evidenced" if and only if the input contains matching
//   evidence (nothing fabricated, nothing suppressed); unmapped codes are
//   reported, not dropped; with "Hide receipt numbers" on, no payload can
//   make the full receipt number appear in rendered text; rendered text
//   never contains "[object Object]"; mutating exactly one field of a
//   snapshot makes diffSnapshots report exactly that kind of change.
//
// fast-check is a devDependency only. Nothing in the shipped artifact or the
// build depends on it — scripts/build.js is plain concatenation, and
// `node scripts/build.js --check` proves the shipped bytes regardless of
// what is installed here.

var fc = require('fast-check');
var internals = require('../test/internals.js');

var CI = process.argv.indexOf('--ci') !== -1;
var seedArg = null;
process.argv.slice(2).forEach(function (a) {
  var m = a.match(/^--seed=(-?\d+)$/);
  if (m) seedArg = parseInt(m[1], 10);
});
var SEED = seedArg !== null ? seedArg : (CI ? 20260812 : undefined);
var RUNS = CI ? 2000 : 8000;
var RUNS_HEAVY = CI ? 400 : 1500;   // full-render properties cost more

var BASE = { seed: SEED, verbose: 1 };
function opts(runs) {
  var o = { numRuns: runs, verbose: 1 };
  if (SEED !== undefined) o.seed = SEED;
  return o;
}

// ---------------------------------------------------------------------------
// Arbitraries

var NOW = Date.now();
var DAY = 86400000;

var garbageArb = fc.oneof(
  fc.constantFrom(null, undefined, 0, -1, 1.5, true, false, '', ' ', 'x',
    '__proto__', 'constructor', 'hasOwnProperty',
    '<script>alert(1)</script>', '"><img src=x onerror=1>',
    9e15, -9e15, 'IOE0000000001', 'not-a-date', '2026-13-45'),
  fc.string({ maxLength: 40 }),
  fc.constant('a'.repeat(3000)),
  fc.constant({}), fc.constant([]), fc.constant(['a']), fc.constant({ a: 1 })
);

var realCodeArb = fc.constantFrom('IAF', 'FTA0', 'SA', 'LDA', 'FNB', 'MA70',
  'IK', 'FJ', 'FKB', 'HG', 'DA', 'EA', 'IEA', 'LEA', 'RCV0', 'H001', 'APR0',
  'FSA0', 'IMAF', 'FN', 'II', 'IT', 'MBC');
var junkCodeArb = fc.constantFrom('ZZ9', 'QQQQ', 'A', '1234', 'sa',
  '__proto__', '', ' ', 'D A');
var codeArb = fc.oneof(
  { weight: 5, arbitrary: realCodeArb },
  { weight: 3, arbitrary: junkCodeArb },
  { weight: 1, arbitrary: garbageArb }
);

var timeArb = fc.oneof(
  { weight: 1, arbitrary: fc.constant(null) },
  { weight: 1, arbitrary: fc.constant(undefined) },
  { weight: 2, arbitrary: fc.integer({ min: 1, max: 400 }).map(function (d) { return NOW + d * DAY; }) },
  { weight: 6, arbitrary: fc.integer({ min: 0, max: 900 }).map(function (d) { return NOW - d * DAY - 7777; }) }
);

var itemArb = fc.record({
  id: fc.string({ maxLength: 8 }),
  provenance: fc.constantFrom('official', 'coded', 'notice', 'document', 'local', 'anchor', 'junk'),
  kind: fc.constantFrom('event', 'status', 'appointment', 'document', 'backend', 'filed', 'notice', 'change'),
  code: fc.oneof({ weight: 7, arbitrary: codeArb }, { weight: 3, arbitrary: fc.constant(null) }),
  sortAt: timeArb,
  displayAt: timeArb,
  precision: fc.constantFrom('day', 'second', null),
  label: fc.oneof(fc.constant(null), fc.constant(''), fc.string({ maxLength: 60 }), fc.constant('<b>x</b>')),
  generatedAt: timeArb,
  docStageType: fc.oneof(
    { weight: 6, arbitrary: fc.constant(undefined) },
    { weight: 2, arbitrary: fc.constantFrom('appointment', 'decision') },
    { weight: 1, arbitrary: fc.constant('junktype') })
}, { requiredKeys: ['id', 'provenance', 'kind', 'code', 'sortAt', 'displayAt'] });

var formArb = fc.constantFrom('I-485', 'I-765', 'I-131', 'I-485J', 'N-400',
  'I-90', 'I-751', 'I-821', 'I-130', 'I-999', 'X-1', '', null, undefined,
  'i-485', '__proto__', 'FORM WITH SPACES');

var viewArb = fc.record({
  items: fc.array(itemArb, { maxLength: 12 }),
  upcoming: fc.array(itemArb, { maxLength: 3 }),
  evidenceCount: fc.constantFrom(0, 0, 0, 1, 2, 7, -1, null, undefined),
  detail: fc.oneof(
    { weight: 9, arbitrary: fc.record({
        formType: formArb,
        closed: fc.constantFrom(true, false, false, null, undefined, 'yes', 'false', 0, 1),
        submissionDate: fc.constantFrom('2026-03-14', '03-14-2026 00:00:00', null, undefined, 'garbage', 12345)
      }) },
    { weight: 1, arbitrary: fc.constant(null) }),
  notice: fc.oneof(
    { weight: 6, arbitrary: fc.record({
        actionCode: codeArb,
        actionCodeDate: fc.constantFrom('2026-07-12', null, undefined, 'x'),
        formNumber: formArb
      }) },
    { weight: 4, arbitrary: fc.constant(null) })
});

// Endpoint payloads, realistic through hostile.
var payloadArb = fc.oneof(
  { weight: 1, arbitrary: fc.constantFrom({ __error: 'HTTP 500' }, { __error: '' }, { __empty: true }) },
  { weight: 1, arbitrary: garbageArb },
  { weight: 6, arbitrary: fc.record({
      receiptNumber: fc.constantFrom('IOE0000000001', 'nope', 12, null),
      formType: formArb,
      submissionDate: fc.constantFrom('2026-03-14', 'x', 0, null, ['2026-03-14']),
      updatedAtTimestamp: fc.constantFrom('2026-08-02T10:00:00Z', 'x', {}, 17, null),
      closed: fc.constantFrom(true, false, 'true', 0, null),
      actionRequired: fc.constantFrom(true, false, 'yes', 1, null),
      events: fc.array(fc.oneof(
        { weight: 4, arbitrary: fc.record({
            eventCode: codeArb,
            eventTimestamp: fc.constantFrom('2026-07-09T21:59:03Z', 'x', null)
          }) },
        { weight: 1, arbitrary: garbageArb }), { maxLength: 6 }),
      notices: fc.oneof(
        { weight: 4, arbitrary: fc.array(fc.record({
            actionType: fc.constantFrom('Appointment Scheduled', 'Other Thing', null, 7),
            generationDate: fc.constantFrom('2026-06-19T23:43:31Z', 'x', null),
            appointmentDateTime: fc.constantFrom('2026-07-09T19:00:00Z', null, 'x', '2026-07-09'),
            letterId: fc.constantFrom('440000000', null, 9)
          }), { maxLength: 3 }) },
        { weight: 1, arbitrary: garbageArb }),
      historicalCaseStatuses: fc.oneof(
        { weight: 4, arbitrary: fc.array(fc.record({
            date: fc.constantFrom('07-12-2026 10:00:00', 'x', null),
            actionCode: codeArb,
            statusTitle: fc.constantFrom('USCIS Is Currently Processing Your Case', '', null, 5)
          }), { maxLength: 4 }) },
        { weight: 1, arbitrary: garbageArb }),
      statusTitle: fc.constantFrom('Case Was Received', '<a href=x>y</a>', 8, null, undefined),
      currentActionCode: codeArb,
      currentActionCodeDate: fc.constantFrom('2026-07-12T00:00:00Z', 'x', null),
      jurisdiction: fc.constantFrom('NSC', null, 3),
      jurisdictionDescription: fc.constantFrom('NEBRASKA SERVICE CENTER (NSC)', null)
    }, { requiredKeys: [] }) }
);

var docArb = fc.oneof(
  { weight: 4, arbitrary: fc.record({
      fileName: fc.constantFrom('a.tif', 'Appointment Scheduled.pdf', null, 9, 'x'.repeat(300)),
      type: fc.constantFrom('Other', 'Appointment Scheduled', 'I-765 C09 Standalone Approval', 'G-28', null, 4, ''),
      createDate: fc.constantFrom('2026-06-19T23:43:31.809+0000', 'x', null),
      sourceType: fc.constantFrom('USCIS Generated', 'Applicant Provided', 'Weird', null, 2),
      contentId: fc.constantFrom('abc', null)
    }, { requiredKeys: [] }) },
  { weight: 1, arbitrary: garbageArb }
);

var documentsArb = fc.oneof(
  { weight: 1, arbitrary: fc.constantFrom({ __error: 'HTTP 404' }, { __empty: true }, null) },
  { weight: 4, arbitrary: fc.array(docArb, { maxLength: 5 }) }
);

var resultArb = fc.record({
  fetchedAt: fc.constant(new Date(NOW).toISOString()),
  caseDetail: payloadArb,
  caseStatus: payloadArb,
  documents: documentsArb,
  location: fc.constantFrom({ __empty: true }, null, { office: 'X' }),
  processingTimes: fc.constantFrom({ __empty: true }, null,
    { estimatedTimeframe: '11 Months to 14 Months' }, { estimatedTimeframe: 'garbage' })
});

// A well-formed snapshot for the one-field-mutation diff property.
var cleanSnapshotArb = fc.record({
  status: fc.constantFrom('Case Was Received', 'Processing', 'Approved'),
  statusAt: fc.constant('2026-07-12'),
  backendAt: fc.constant('2026-08-01T00:00:00Z'),
  office: fc.constantFrom('NEBRASKA SERVICE CENTER', 'TEXAS SERVICE CENTER'),
  docNames: fc.array(fc.constantFrom('a.tif', 'b.tif', 'c.tif'), { maxLength: 3 }),
  formType: fc.constantFrom('I-485', 'I-765'),
  closed: fc.constant(false),
  actionRequired: fc.constant(false),
  evidenceCount: fc.constant(0),
  appointments: fc.constant([])
});

// ---------------------------------------------------------------------------
// The semantic ground truth for stage evidence, derived INDEPENDENTLY of the
// implementation: which stage types does this view actually contain evidence
// for? stageInfo must claim exactly these — nothing fabricated, nothing
// suppressed.
function expectedEvidence(A, view) {
  var types = {};
  function addCode(code) {
    var t = A.stageTypeOfCode(code);
    if (t) types[t] = true;
  }
  var i;
  if (view.notice && view.notice.actionCode) addCode(view.notice.actionCode);
  for (i = 0; i < view.items.length; i++) {
    addCode(view.items[i].code);
    if (view.items[i].kind === 'appointment') types.appointment = true;
    if (view.items[i].kind === 'document' &&
        (view.items[i].docStageType === 'appointment' || view.items[i].docStageType === 'decision')) {
      // Only stage types the shipped tables actually contain count as
      // document evidence; junk docStageType values must be ignored.
      types[view.items[i].docStageType] = true;
    }
  }
  for (i = 0; i < view.upcoming.length; i++) {
    addCode(view.upcoming[i].code);
    if (view.upcoming[i].kind === 'appointment') types.appointment = true;
  }
  if (typeof view.evidenceCount === 'number' && view.evidenceCount > 0) types.evidence = true;
  return types;
}

// Click every collapsed disclosure in a fake-DOM tree so lazily-rendered
// content actually exists before a test inspects it. Returns how many were
// opened — a caller that gets 0 has inspected nothing and should say so rather
// than report success.
function expandAll(node) {
  // Opening a group renders its children, which may themselves be collapsed
  // groups — so one pass is not enough. Iterate to a fixed point, bounded so a
  // pathological shape cannot spin.
  var total = 0;
  for (var pass = 0; pass < 12; pass++) {
    var state = { opened: 0, seen: 0 };
    (function walk(n) {
      if (!n || typeof n !== 'object' || state.seen > 4000) return;
      state.seen++;
      if (n.attributes && n.attributes['aria-expanded'] === 'false' &&
          typeof n.dispatch === 'function') {
        if (n.dispatch('click')) state.opened++;
      }
      var kids = n.childNodes || [];
      for (var i = 0; i < kids.length; i++) walk(kids[i]);
    })(node);
    total += state.opened;
    if (!state.opened) break;
  }
  return total;
}

// Walk the fake-DOM tree collecting every piece of text the panel would show.
function collectText(node, out) {
  if (!node || typeof node !== 'object') return out;
  if (typeof node.textContent === 'string' && node.textContent) out.push(node.textContent);
  if (typeof node.text === 'string' && node.text) out.push(node.text);
  var attrs = node.attributes || {};
  ['title', 'aria-label', 'placeholder'].forEach(function (a) {
    if (typeof attrs[a] === 'string') out.push(attrs[a]);
  });
  var kids = node.childNodes || [];
  for (var i = 0; i < kids.length; i++) collectText(kids[i], out);
  return out;
}

// ---------------------------------------------------------------------------
var failed = false;
function run(name, prop, runs) {
  var res = fc.check(prop, opts(runs));
  if (res.failed) {
    failed = true;
    console.error('\nFUZZ FAIL [' + name + '] seed=' + res.seed + ' path=' + res.counterexamplePath);
    try {
      console.error('  shrunk counterexample: ' +
        JSON.stringify(res.counterexample, function (k, v) { return v === undefined ? '<undef>' : v; }).slice(0, 3000));
    } catch (e) { console.error('  counterexample not serialisable'); }
    console.error('  reproduce: node scripts/fuzz.js --seed=' + res.seed);
  } else {
    console.log('fuzz: ' + name + ' — ' + runs + ' runs OK');
  }
}

var A = internals.load({ redact: false });
var ENTRY = { number: 'IOE0000000001' };
var OK_STATES = { evidenced: 1, current: 1, 'not-reported': 1, ahead: 1 };

// --- 1. stageInfo: structure + evidence semantics ---------------------------
run('stageInfo structure+semantics', fc.property(viewArb, function (view) {
  var info = A.stageInfo(ENTRY, view);   // must not throw
  var stages = info.stages;
  if (!Array.isArray(stages) || !stages.length) return false;
  if (stages[0].type !== 'received') return false;
  var seen = {};
  var currentCount = 0;
  var decisionIdx = -1;
  var cardIdx = -1;
  for (var i = 0; i < stages.length; i++) {
    var s = stages[i];
    if (seen[s.type] || !OK_STATES[s.state]) return false;
    seen[s.type] = true;
    if (typeof s.label !== 'string' || !s.label) return false;
    if (s.type === 'decision') decisionIdx = i;
    if (s.type === 'card') cardIdx = i;
    if (s.state === 'current') currentCount++;
  }
  if (decisionIdx === -1) return false;
  if (cardIdx !== -1 && cardIdx < decisionIdx) return false;
  var closed = !!(view.detail && view.detail.closed === true);
  if (closed && currentCount > 0) return false;
  if (!closed && currentCount !== 1) return false;

  // SEMANTICS: evidenced iff the input evidences it. The spine is exempt by
  // definition (received always evidenced; review is position; decision may
  // be evidenced by `closed`), so the check covers the middle + card.
  var expect = expectedEvidence(A, view);
  var MIDDLE = ['appointment', 'biometrics', 'evidence', 'interview', 'card'];
  for (i = 0; i < MIDDLE.length; i++) {
    var t = MIDDLE[i];
    var stage = null;
    for (var j = 0; j < stages.length; j++) if (stages[j].type === t) stage = stages[j];
    var claimed = !!(stage && stage.state === 'evidenced');
    if (claimed && !expect[t]) return false;              // fabricated
    if (expect[t] && !claimed) return false;              // suppressed
  }
  // Decision may be claimed only via a decision code or the closed boolean.
  var dec = stages[decisionIdx];
  if (dec.state === 'evidenced' && !expect.decision && !closed) return false;
  if (expect.decision && dec.state !== 'evidenced') return false;

  // Determinism.
  var again = A.stageInfo(ENTRY, view);
  return JSON.stringify(again.stages.map(function (x) { return x.type + x.state; })) ===
         JSON.stringify(stages.map(function (x) { return x.type + x.state; }));
}), RUNS);

// --- 2. unmapped codes are reported, never silently dropped -----------------
run('unmapped codes reported', fc.property(viewArb, function (view) {
  var info = A.stageInfo(ENTRY, view);
  if (!Array.isArray(info.unmapped)) return false;
  // Every string code in the view that maps to nothing must be in unmapped.
  var want = {};
  function note(code) {
    if (typeof code === 'string' && code && !A.stageTypeOfCode(code)) {
      want[code.toUpperCase()] = true;
    }
  }
  if (view.notice) note(view.notice.actionCode);
  view.items.forEach(function (it) { note(it.code); });
  view.upcoming.forEach(function (it) { note(it.code); });
  var got = {};
  info.unmapped.forEach(function (c) { got[String(c).toUpperCase()] = true; });
  for (var c in want) {
    if (Object.prototype.hasOwnProperty.call(want, c) && !got[c]) return false;
  }
  return true;
}), RUNS);

// --- 3. pipeline: normalize → self-diff is empty → carry-forward safe -------
run('normalize/diff/carry pipeline', fc.property(resultArb, resultArb, function (rA, rB) {
  var snapA = A.normalize(rA);
  var snapB = A.normalize(rB);
  if (!Array.isArray(A.diffSnapshots(snapA, snapB))) return false;
  var clone = JSON.parse(JSON.stringify(snapA));
  if (A.diffSnapshots(snapA, clone).length !== 0) return false;
  A.carryForwardUnread(snapB, snapA, rB);
  A.snapshotHasContent(snapA);
  A.resultHasAnyData(rA);
  return true;
}), RUNS);

// --- 4. diff tells the truth about single mutations -------------------------
run('single-field mutation diffs truthfully', fc.property(
  cleanSnapshotArb,
  fc.constantFrom('status', 'office', 'document'),
  function (snap, which) {
    var next = JSON.parse(JSON.stringify(snap));
    if (which === 'status') next.status = snap.status + ' X';
    if (which === 'office') next.office = snap.office + ' X';
    if (which === 'document') next.docNames = snap.docNames.concat(['new.tif']);
    var changes = A.diffSnapshots(snap, next);
    var ofKind = changes.filter(function (c) { return c.kind === which; });
    if (ofKind.length !== 1) return false;
    if (which === 'status' && !(ofKind[0].from === snap.status && ofKind[0].to === next.status)) return false;
    if (which === 'document' && ofKind[0].to !== 'new.tif') return false;
    // And nothing else may be reported.
    return changes.length === 1;
  }), RUNS);

// --- 5. dedupe/sort: keeps only inputs, idempotent, filed last --------------
run('dedupe/sort structure', fc.property(fc.array(itemArb, { maxLength: 15 }), function (items) {
  var kept = A.decorateAndDedupeTimeline(items, null);
  if (!Array.isArray(kept)) return false;
  for (var k = 0; k < kept.length; k++) {
    if (items.indexOf(kept[k]) === -1) return false;
  }
  var sorted = A.sortTimelineItems(kept);
  if (sorted.length !== kept.length) return false;
  var lastNonFiled = -1;
  var firstFiled = Infinity;
  for (k = 0; k < sorted.length; k++) {
    var dated = sorted[k].sortAt !== null && sorted[k].sortAt !== undefined;
    if (sorted[k].kind === 'filed' && dated && k < firstFiled) firstFiled = k;
    if (sorted[k].kind !== 'filed' && k > lastNonFiled) lastNonFiled = k;
  }
  if (firstFiled !== Infinity && lastNonFiled > firstFiled) return false;
  return A.decorateAndDedupeTimeline(sorted, null).length === sorted.length;
}), RUNS);

// --- 6. full render: never throws, never leaks internals --------------------
run('render throw-safety + no leaked internals', fc.property(resultArb, function (res) {
  var entry = { number: 'IOE0000000001', label: null, addedAt: NOW, result: res,
    changedSince: false, loading: false };
  A.buildCaseView(entry);
  var card = A.buildCaseCard(entry, [entry]);
  var texts = collectText(card, []);
  for (var i = 0; i < texts.length; i++) {
    if (texts[i].indexOf('[object Object]') !== -1) return false;
  }
  return true;
}), RUNS_HEAVY);

// --- 7. redaction holds against hostile payloads ----------------------------
(function () {
  var R = internals.load({ redact: true });
  run('redaction: full receipt never rendered', fc.property(resultArb, function (res) {
    var entry = { number: 'IOE0000000001', label: null, addedAt: NOW, result: res,
      changedSince: false, loading: false };
    R.buildCaseView(entry);
    var card = R.buildCaseCard(entry, [entry]);
    var texts = collectText(card, []);
    for (var i = 0; i < texts.length; i++) {
      if (texts[i].indexOf('IOE0000000001') !== -1) return false;
    }
    return true;
  }), RUNS_HEAVY);
})();

// --- 7b. the record view walks arbitrary API shapes -------------------------
// Unlike every other renderer, this one is not driven by a list of known
// fields — it enumerates whatever arrived. So the shapes it must survive are
// unbounded by construction, which is precisely what property testing is for.
(function () {
  // Arbitrary JSON-ish values, nested deeply enough to exercise the depth cap.
  var jsonValueArb = fc.letrec(function (tie) {
    return {
      value: fc.oneof(
        { weight: 6, arbitrary: fc.oneof(garbageArb, fc.string({ maxLength: 30 }),
            fc.integer(), fc.boolean(), fc.constant(null)) },
        { weight: 2, arbitrary: fc.array(tie('value'), { maxLength: 5 }) },
        { weight: 2, arbitrary: fc.dictionary(
            fc.oneof(fc.string({ minLength: 1, maxLength: 14 }),
              fc.constantFrom('applicantName', 'address', 'letterId', 'receiptNumber',
                'formType', '__proto__', 'constructor')),
            tie('value'), { maxKeys: 6 }) }
      )
    };
  }).value;

  var R = internals.load({ redact: true });

  run('record view renders any shape without throwing', fc.property(jsonValueArb, function (v) {
    var node = R.buildRecordFields({ data: v });   // must not throw
    return !!node;
  }), RUNS_HEAVY);

  // The privacy property that matters: with redaction on, no sensitive field's
  // value can reach rendered text, at any depth, inside any container.
  run('record view never renders a sensitive value when redaction is on', fc.property(
    fc.oneof(
      fc.record({ applicantName: fc.constant('SECRET-NAME') }),
      fc.record({ nested: fc.record({ address: fc.constant('SECRET-NAME') }) }),
      fc.record({ list: fc.array(fc.record({ letterId: fc.constant('SECRET-NAME') }), { minLength: 1, maxLength: 3 }) }),
      fc.record({ deep: fc.record({ deeper: fc.record({ email: fc.constant('SECRET-NAME') }) }) })
    ),
    function (payload) {
      var node = R.buildRecordFields({ data: payload });
      // Groups render lazily, so force every collapsed body open before
      // reading the text — an unopened group passes this test vacuously,
      // which is exactly what it did until the fake DOM learned to dispatch.
      // (A flat payload has nothing to open, which is fine; the anti-vacuity
      // check is that SOMETHING rendered, not that a group existed.)
      expandAll(node);
      var texts = collectText(node, []);
      if (!texts.length) return false;   // rendered nothing means checked nothing
      for (var i = 0; i < texts.length; i++) {
        if (texts[i].indexOf('SECRET-NAME') !== -1) return false;
      }
      return true;
    }), RUNS_HEAVY);
})();

// --- 7c. the printable record ------------------------------------------------
// buildPrintDocument/buildPrintCase/buildPrintFields build the DOM tree the
// browser turns into a PDF (docs/design/06-print-record.md). Two properties
// mirror what already holds for the screen record view — arbitrary shapes
// render without throwing, and masked output never leaks a sensitive value —
// plus two mirroring what already holds for the screen card render: the whole
// buildCaseView -> buildPrintDocument pipeline never throws, and masking
// never leaks the receipt number. The one property with no screen equivalent
// is #2: the print walker has no disclosures to click, so expandAll must find
// nothing left to open.
(function () {
  // Same shape as 7b's jsonValueArb, defined locally because 7b's is closed
  // over that IIFE.
  var jsonValueArb = fc.letrec(function (tie) {
    return {
      value: fc.oneof(
        { weight: 6, arbitrary: fc.oneof(garbageArb, fc.string({ maxLength: 30 }),
            fc.integer(), fc.boolean(), fc.constant(null)) },
        { weight: 2, arbitrary: fc.array(tie('value'), { maxLength: 5 }) },
        { weight: 2, arbitrary: fc.dictionary(
            fc.oneof(fc.string({ minLength: 1, maxLength: 14 }),
              fc.constantFrom('applicantName', 'address', 'letterId', 'receiptNumber',
                'formType', '__proto__', 'constructor')),
            tie('value'), { maxKeys: 6 }) }
      )
    };
  }).value;

  var R = internals.load({ redact: true });

  run('print fields render any shape without throwing', fc.property(jsonValueArb, function (v) {
    var node = R.buildPrintFields({ data: v }, false);   // must not throw
    return !!node;
  }), RUNS_HEAVY);

  // The print walker is eager — no group is left collapsed for a reader to
  // click, because paper cannot click. expandAll returns how many collapsed
  // disclosures it found and opened; a print tree must offer none.
  run('print fields are fully expanded', fc.property(jsonValueArb, function (v) {
    var node = R.buildPrintFields({ data: v }, false);
    return expandAll(node) === 0;
  }), RUNS_HEAVY);

  // Same sensitive-field shapes as 7b's leak property, run through the print
  // builder instead of the record view.
  run('masked print never renders a sensitive value', fc.property(
    fc.oneof(
      fc.record({ applicantName: fc.constant('SECRET-NAME') }),
      fc.record({ nested: fc.record({ address: fc.constant('SECRET-NAME') }) }),
      fc.record({ list: fc.array(fc.record({ letterId: fc.constant('SECRET-NAME') }), { minLength: 1, maxLength: 3 }) }),
      fc.record({ deep: fc.record({ deeper: fc.record({ email: fc.constant('SECRET-NAME') }) }) })
    ),
    function (payload) {
      var node = R.buildPrintFields({ data: payload }, true);
      var texts = collectText(node, []);
      if (!texts.length) return false;   // rendered nothing means checked nothing
      for (var i = 0; i < texts.length; i++) {
        if (texts[i].indexOf('SECRET-NAME') !== -1) return false;
      }
      return true;
    }), RUNS_HEAVY);
})();

(function () {
  var R4 = internals.load({ redact: false });
  run('a whole-case print never throws', fc.property(resultArb, function (res) {
    var entry = { number: 'IOE0000000001', label: null, addedAt: NOW, result: res,
      changedSince: false, loading: false };
    R4.buildCaseView(entry);
    var doc = R4.buildPrintDocument([entry], { redact: false, generatedAt: NOW });
    return collectText(doc, []).length > 0;
  }), RUNS_HEAVY);

  var R5 = internals.load({ redact: true });
  run('masked whole-case print never leaks the receipt number', fc.property(resultArb, function (res) {
    var entry = { number: 'IOE0000000001', label: null, addedAt: NOW, result: res,
      changedSince: false, loading: false };
    R5.buildCaseView(entry);
    var doc = R5.buildPrintDocument([entry], { redact: true, generatedAt: NOW });
    var texts = collectText(doc, []);
    if (!texts.length) return false;   // rendered nothing means checked nothing
    for (var i = 0; i < texts.length; i++) {
      if (texts[i].indexOf('IOE0000000001') !== -1) return false;
    }
    return true;
  }), RUNS_HEAVY);
})();

// --- 8. scalar helpers over the garbage pool --------------------------------
run('scalar helpers never throw', fc.property(garbageArb, function (g) {
  A.parseUscisDate(g); A.relativeDate(g); A.formatDateFull(g); A.stripHtml(g);
  A.displayFileName(g); A.isValidReceiptNumber(g); A.hasTimeComponent(g);
  A.parseEstimateMonths(g); A.stageTypeOfCode(g); A.flattenValue(g);
  A.middleTruncate(g, 20);
  return true;
}), RUNS);

// ---------------------------------------------------------------------------
if (failed) {
  console.error('\nfuzz: FAILED');
  process.exit(1);
}
console.log('fuzz: OK — all properties held.');
