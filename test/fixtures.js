// ============================================================================
// USCIS Case Tracker — test fixtures
// ============================================================================
// Plain script (NOT a module). Defines window.USCIS_FIXTURES with realistic
// sample JSON matching the REAL, verified my.uscis.gov API shapes documented
// in docs/API-SCHEMA.md — captured live from a logged-in account, August 2026.
//
// ALL DATA BELOW IS INVENTED. Receipt numbers are placeholders in the
// IOE0000000001-0000000004 range, names are "SAMPLE, APPLICANT" /
// "COUNSEL, SAMPLE", and every opaque id (contentId, eventId, letterId) is a
// fabricated string. Nothing here was copied from a real account. This repo
// is public.
//
// Key facts this file encodes (see docs/API-SCHEMA.md for the full writeup):
//   - Every endpoint response is wrapped in {"data": ...}.
//   - The bare case-list endpoint (/api/cases) returns {"data": []} even
//     though the account has active cases. It is only an auth probe.
//   - /api/cases/{num}/history does not exist (404 live) and is NOT modeled
//     here at all.
//   - /api/cases/{FORM}/processing_times/{num} returns HTTP 204 (no body)
//     for most cases. One case (IOE0000000002) is the exception, so the
//     progress-bar path still gets exercised.
//   - /secure-messaging/.../receipt_info/{num} returns {"data": null} for
//     every case. The real office/location comes from case_status's
//     jurisdiction/jurisdictionDescription fields instead.
//
// Four fixture cases cover the observed spread:
//   IOE0000000001  I-485   active, rich (3 events incl. one unknown code,
//                          1 notice w/ appointment, 1 history entry, 6 docs,
//                          204 processing times)
//   IOE0000000002  I-765   closed/approved (8 events, 4 history entries
//                          covering LDA/SA/FTA0/IAF, 2 docs, processing
//                          times DOES return data)
//   IOE0000000003  I-131   sparse (1 event, no history, no notices, no
//                          docs, 204 processing times)
//   IOE0000000004  I-485J  minimal but valid (1 event, no history, 1 doc)
//
// Two top-level datasets:
//   USCIS_FIXTURES.normal  — steady-state data for all four cases.
//   USCIS_FIXTURES.changed — clone of `normal` with IOE0000000001 advanced
//     forward (approved, new document, new event) to exercise change
//     detection. Produced by makeChangedDataset() so the two datasets never
//     drift apart by accident.
//
// Consumed by test/harness.html, which stubs window.fetch to route requests
// at the real endpoint paths to this data before core/uscis-tracker-core.js
// is loaded, and also renders the receipt numbers as visible page text so
// the core's DOM-scraping auto-discovery (see discoverFromPage() in
// SECTION 3) has something real to find.
// ============================================================================

(function () {
  'use strict';

  var CASE_1 = 'IOE0000000001'; // I-485,  active, rich
  var CASE_2 = 'IOE0000000002'; // I-765,  closed/approved
  var CASE_3 = 'IOE0000000003'; // I-131,  sparse
  var CASE_4 = 'IOE0000000004'; // I-485J, minimal but valid

  var CASE_NUMBERS = [CASE_1, CASE_2, CASE_3, CASE_4];

  // ---- date helpers ---------------------------------------------------
  // All dates are computed relative to "now" so the fixtures stay
  // realistic (e.g. "~40 days ago") no matter when the harness is run.

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }
  function pad3(n) {
    if (n < 10) return '00' + n;
    if (n < 100) return '0' + n;
    return String(n);
  }

  // Date object N days from now (negative = past). Optional hour/min/sec
  // pin the time-of-day so ordering between fixtures is deterministic.
  function offsetDate(days, hour, minute, second) {
    var d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(
      typeof hour === 'number' ? hour : 12,
      typeof minute === 'number' ? minute : 0,
      typeof second === 'number' ? second : 0,
      0
    );
    return d;
  }

  function daysAgo(n, hour, minute, second) {
    return offsetDate(-n, hour, minute, second);
  }

  // Full ISO timestamp, e.g. "2026-07-09T21:58:24.000Z". Used for
  // submissionTimestamp, updatedAtTimestamp, currentActionCodeDate,
  // generationDate, appointmentDateTime, eventTimestamp, etc. — every
  // timestamp field the real API returns as plain ISO-8601.
  function iso(d) {
    return d.toISOString();
  }

  // Date-only field, e.g. "2026-07-31" — used for submissionDate/updatedAt.
  function dateOnly(d) {
    return d.toISOString().slice(0, 10);
  }

  // Documents' createDate uses "+0000" instead of "Z", e.g.
  // "2026-06-04T02:09:53.542+0000" — reproduce that exact shape here so the
  // fixtures don't quietly normalize away a real API quirk.
  function isoOffset(d) {
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) +
      'T' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds()) +
      '.' + pad3(d.getUTCMilliseconds()) + '+0000';
  }

  // historicalCaseStatuses[].date uses "MM-DD-YYYY HH:mm:ss" — the odd
  // format the core has to hand-parse (see parseUscisDate in the core).
  // Built from the same local getters parseUscisDate() reads back with, so
  // round-tripping through the harness produces a sane, in-order timeline.
  function uscisHistDate(d) {
    return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '-' + d.getFullYear() + ' ' +
      pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  // Fabricated opaque ids — obviously synthetic, fixed width, never derived
  // from anything real.
  function fakeContentId(n) {
    var body = 'fixture-content-id-' + pad3(n) + '-0000000000000000000';
    return body.slice(0, 43);
  }
  function fakeEventId(n) {
    return '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
  }
  function fakeLetterId(n) {
    return '44000000' + n;
  }

  // ---- shared status prose (invented, but shaped like the real thing) ---

  var STATUS_TEXT_HTML_1 =
    'As of ' + 'August 2026, we are processing your case at our field office. ' +
    'If you move while your case is pending, please tell us by visiting ' +
    '<a href="https://www.uscis.gov/addresschange" target="_blank">www.uscis.gov/addresschange</a>. ' +
    'You do not need to contact us at this time.';

  var STATUS_TEXT_HTML_2 =
    'We ordered your new card. Once we produce it, we will mail it to the ' +
    'address you gave us. If you move before you get your card, go to ' +
    '<a href="https://www.uscis.gov/addresschange" target="_blank">www.uscis.gov/addresschange</a> ' +
    'to give us your new address.';

  var STATUS_TEXT_CHANGED_1 =
    'On ' + 'August 2026, USCIS approved your case. If we need something ' +
    'from you we will contact you. You may also visit ' +
    '<a href="https://www.uscis.gov/addresschange" target="_blank">www.uscis.gov/addresschange</a> ' +
    'if you move.';

  // ==========================================================================
  // CASE 1 — IOE0000000001, I-485, active, rich
  // ==========================================================================
  // updatedAtTimestamp (backend record touch) must be ~3 weeks NEWER than
  // currentActionCodeDate (the public status date) so the "USCIS worked on
  // your case behind the scenes" signal fires: status dated 30 days ago,
  // record updated 9 days ago (21-day gap).

  var C1_ACTION_CODE_DATE = daysAgo(30, 21, 58, 24);
  var C1_UPDATED_AT = daysAgo(9, 13, 7, 45);
  var C1_SUBMITTED = daysAgo(150, 0, 0, 0);

  var CASE_1_DETAIL = {
    receiptNumber: CASE_1,
    submissionDate: dateOnly(C1_SUBMITTED),
    submissionTimestamp: iso(C1_SUBMITTED),
    formType: 'I-485',
    formName: 'Application to Register Permanent Residence or Adjust Status',
    updatedAt: dateOnly(C1_UPDATED_AT),
    updatedAtTimestamp: iso(C1_UPDATED_AT),
    closed: false,
    actionRequired: false,
    applicantName: 'SAMPLE, APPLICANT',
    representativeName: null,
    isPremiumProcessed: false,
    elisChannelType: 'Lockbox',
    concurrentCases: [],
    documents: [],
    evidenceRequests: [],
    addendums: [],
    notices: [
      {
        receiptNumber: CASE_1,
        letterId: fakeLetterId(1),
        generationDate: iso(daysAgo(45, 16, 30, 0)),
        appointmentDateTime: iso(daysAgo(-10, 9, 0, 0)), // upcoming: 10 days from now
        actionType: 'Appointment Scheduled'
      }
    ],
    events: [
      {
        receiptNumber: CASE_1,
        eventId: fakeEventId(1),
        eventCode: 'IAF',
        createdAt: dateOnly(daysAgo(148)),
        createdAtTimestamp: iso(daysAgo(148, 8, 15, 0)),
        updatedAt: dateOnly(daysAgo(148)),
        updatedAtTimestamp: iso(daysAgo(148, 8, 15, 0)),
        eventDateTime: dateOnly(daysAgo(148)),
        eventTimestamp: iso(daysAgo(148, 8, 15, 0))
      },
      {
        // Deliberately NOT in the core's CODE_HINTS table, to exercise the
        // untranslated-code display path (raw code shown, no guessed text).
        receiptNumber: CASE_1,
        eventId: fakeEventId(2),
        eventCode: 'ZZ9',
        createdAt: dateOnly(daysAgo(90)),
        createdAtTimestamp: iso(daysAgo(90, 11, 42, 10)),
        updatedAt: dateOnly(daysAgo(90)),
        updatedAtTimestamp: iso(daysAgo(90, 11, 42, 10)),
        eventDateTime: dateOnly(daysAgo(90)),
        eventTimestamp: iso(daysAgo(90, 11, 42, 10))
      },
      {
        receiptNumber: CASE_1,
        eventId: fakeEventId(3),
        eventCode: 'FTA0',
        createdAt: dateOnly(C1_ACTION_CODE_DATE),
        createdAtTimestamp: iso(C1_ACTION_CODE_DATE),
        updatedAt: dateOnly(C1_ACTION_CODE_DATE),
        updatedAtTimestamp: iso(C1_ACTION_CODE_DATE),
        eventDateTime: dateOnly(C1_ACTION_CODE_DATE),
        eventTimestamp: iso(C1_ACTION_CODE_DATE)
      }
    ]
  };

  var CASE_1_STATUS = {
    receiptNumber: CASE_1,
    formType: 'I-485',
    currentActionCode: 'FTA0',
    currentActionCodeDate: iso(C1_ACTION_CODE_DATE),
    statusTitle: 'USCIS Is Currently Processing Your Case',
    statusText: STATUS_TEXT_HTML_1,
    statusTitleSpanish: 'USCIS Está Procesando Su Caso Actualmente',
    statusTextSpanish:
      'Al ' + 'de agosto de 2026, estamos procesando su caso. ' +
      'Si se muda mientras su caso esta pendiente, avisenos visitando ' +
      '<a href="https://www.uscis.gov/addresschange" target="_blank">www.uscis.gov/addresschange</a>.',
    jurisdiction: 'NSC',
    jurisdictionDescription: 'NEBRASKA SERVICE CENTER',
    message: "Query was successful for payload {'receipt_number': '" + CASE_1 + "'}",
    isPremiumProcessed: false,
    isPremiumRefunded: false,
    historicalCaseStatuses: [
      {
        date: uscisHistDate(C1_ACTION_CODE_DATE),
        actionCode: 'FTA0',
        statusTitle: 'USCIS Is Currently Processing Your Case',
        statusTitleSpanish: 'USCIS Está Procesando Su Caso Actualmente'
      }
    ]
  };

  // Shaped like a real account (verified live 2026-08-12): USCIS-generated
  // documents always carry a specific `type` — "Account Acceptance Notice",
  // "Appointment Scheduled" — while the applicant's own uploads are type
  // "Other" or "G-28" with sourceType "Applicant Provided". The appointment
  // document's createDate matches its notice's generationDate on purpose:
  // that is the shape the timeline dedupe (one letter seen through two
  // endpoints) has to handle.
  var CASE_1_DOCUMENTS = [
    { fileName: 'Account Acceptance Notice.pdf', contentId: fakeContentId(1), type: 'Account Acceptance Notice', createDate: isoOffset(daysAgo(149, 2, 9, 53)), sourceType: 'USCIS Generated' },
    { fileName: CASE_1 + '-0000000000001-part1.tif', contentId: fakeContentId(2), type: 'Other', createDate: isoOffset(daysAgo(148, 3, 22, 11)), sourceType: 'Applicant Provided' },
    { fileName: CASE_1 + '-0000000000002-part1.tif', contentId: fakeContentId(3), type: 'Other', createDate: isoOffset(daysAgo(95, 14, 5, 47)), sourceType: 'Applicant Provided' },
    { fileName: CASE_1 + '-0000000000003-part1.tif', contentId: fakeContentId(4), type: 'G-28', createDate: isoOffset(daysAgo(94, 9, 0, 3)), sourceType: 'Applicant Provided' },
    { fileName: 'Appointment Scheduled.pdf', contentId: fakeContentId(5), type: 'Appointment Scheduled', createDate: isoOffset(daysAgo(45, 16, 31, 22)), sourceType: 'USCIS Generated' },
    { fileName: CASE_1 + '-0000000000005-part1.tif', contentId: fakeContentId(6), type: 'Other', createDate: isoOffset(daysAgo(30, 21, 59, 8)), sourceType: 'Applicant Provided' }
  ];

  // ==========================================================================
  // CASE 2 — IOE0000000002, I-765, closed/approved
  // ==========================================================================
  // historicalCaseStatuses covers IAF -> FTA0 -> SA -> LDA (oldest to
  // newest) so the self-harvesting code-translation layer (harvestCodeText
  // in the core) has real code/text pairs to learn from — "SA" in
  // particular is observed live but NOT in the core's shipped CODE_HINTS.

  var C2_SUBMITTED = daysAgo(200, 0, 0, 0);
  var C2_IAF_DATE = daysAgo(198, 9, 10, 0);
  var C2_FTA0_DATE = daysAgo(160, 10, 0, 0);
  var C2_SA_DATE = daysAgo(20, 12, 30, 0);
  var C2_LDA_DATE = daysAgo(5, 8, 45, 0);
  var C2_UPDATED_AT = daysAgo(4, 6, 0, 0);

  var CASE_2_DETAIL = {
    receiptNumber: CASE_2,
    submissionDate: dateOnly(C2_SUBMITTED),
    submissionTimestamp: iso(C2_SUBMITTED),
    formType: 'I-765',
    formName: 'Application for Employment Authorization',
    updatedAt: dateOnly(C2_UPDATED_AT),
    updatedAtTimestamp: iso(C2_UPDATED_AT),
    closed: true,
    actionRequired: false,
    applicantName: 'SAMPLE, APPLICANT',
    representativeName: 'COUNSEL, SAMPLE',
    isPremiumProcessed: false,
    elisChannelType: 'Lockbox',
    concurrentCases: [],
    documents: [],
    evidenceRequests: [],
    addendums: [],
    notices: [],
    events: [
      { receiptNumber: CASE_2, eventId: fakeEventId(11), eventCode: 'IAF', createdAt: dateOnly(C2_IAF_DATE), createdAtTimestamp: iso(C2_IAF_DATE), updatedAt: dateOnly(C2_IAF_DATE), updatedAtTimestamp: iso(C2_IAF_DATE), eventDateTime: dateOnly(C2_IAF_DATE), eventTimestamp: iso(C2_IAF_DATE) },
      { receiptNumber: CASE_2, eventId: fakeEventId(12), eventCode: 'FSA0', createdAt: dateOnly(daysAgo(190)), createdAtTimestamp: iso(daysAgo(190, 9, 0, 0)), updatedAt: dateOnly(daysAgo(190)), updatedAtTimestamp: iso(daysAgo(190, 9, 0, 0)), eventDateTime: dateOnly(daysAgo(190)), eventTimestamp: iso(daysAgo(190, 9, 0, 0)) },
      { receiptNumber: CASE_2, eventId: fakeEventId(13), eventCode: 'FTA0', createdAt: dateOnly(C2_FTA0_DATE), createdAtTimestamp: iso(C2_FTA0_DATE), updatedAt: dateOnly(C2_FTA0_DATE), updatedAtTimestamp: iso(C2_FTA0_DATE), eventDateTime: dateOnly(C2_FTA0_DATE), eventTimestamp: iso(C2_FTA0_DATE) },
      { receiptNumber: CASE_2, eventId: fakeEventId(14), eventCode: 'FNA', createdAt: dateOnly(daysAgo(150)), createdAtTimestamp: iso(daysAgo(150, 10, 0, 0)), updatedAt: dateOnly(daysAgo(150)), updatedAtTimestamp: iso(daysAgo(150, 10, 0, 0)), eventDateTime: dateOnly(daysAgo(150)), eventTimestamp: iso(daysAgo(150, 10, 0, 0)) },
      { receiptNumber: CASE_2, eventId: fakeEventId(15), eventCode: 'FNB', createdAt: dateOnly(daysAgo(135)), createdAtTimestamp: iso(daysAgo(135, 13, 20, 0)), updatedAt: dateOnly(daysAgo(135)), updatedAtTimestamp: iso(daysAgo(135, 13, 20, 0)), eventDateTime: dateOnly(daysAgo(135)), eventTimestamp: iso(daysAgo(135, 13, 20, 0)) },
      { receiptNumber: CASE_2, eventId: fakeEventId(16), eventCode: 'MA70', createdAt: dateOnly(daysAgo(133)), createdAtTimestamp: iso(daysAgo(133, 7, 0, 0)), updatedAt: dateOnly(daysAgo(133)), updatedAtTimestamp: iso(daysAgo(133, 7, 0, 0)), eventDateTime: dateOnly(daysAgo(133)), eventTimestamp: iso(daysAgo(133, 7, 0, 0)) },
      // SA — approved. Not in CODE_HINTS; learned only via harvesting from
      // this case's own historicalCaseStatuses below.
      { receiptNumber: CASE_2, eventId: fakeEventId(17), eventCode: 'SA', createdAt: dateOnly(C2_SA_DATE), createdAtTimestamp: iso(C2_SA_DATE), updatedAt: dateOnly(C2_SA_DATE), updatedAtTimestamp: iso(C2_SA_DATE), eventDateTime: dateOnly(C2_SA_DATE), eventTimestamp: iso(C2_SA_DATE) },
      { receiptNumber: CASE_2, eventId: fakeEventId(18), eventCode: 'LDA', createdAt: dateOnly(C2_LDA_DATE), createdAtTimestamp: iso(C2_LDA_DATE), updatedAt: dateOnly(C2_LDA_DATE), updatedAtTimestamp: iso(C2_LDA_DATE), eventDateTime: dateOnly(C2_LDA_DATE), eventTimestamp: iso(C2_LDA_DATE) }
    ]
  };

  var CASE_2_STATUS = {
    receiptNumber: CASE_2,
    formType: 'I-765',
    currentActionCode: 'LDA',
    currentActionCodeDate: iso(C2_LDA_DATE),
    statusTitle: 'New Card Is Being Produced',
    statusText: STATUS_TEXT_HTML_2,
    statusTitleSpanish: 'Se Está Produciendo Su Nueva Tarjeta',
    statusTextSpanish:
      'Ordenamos su nueva tarjeta. Una vez que la produzcamos, se la enviaremos ' +
      'por correo a la direccion que nos proporciono. Visite ' +
      '<a href="https://www.uscis.gov/addresschange" target="_blank">www.uscis.gov/addresschange</a> ' +
      'si se muda.',
    jurisdiction: 'NBC',
    jurisdictionDescription: 'NATIONAL BENEFITS CENTER',
    message: "Query was successful for payload {'receipt_number': '" + CASE_2 + "'}",
    isPremiumProcessed: false,
    isPremiumRefunded: false,
    historicalCaseStatuses: [
      { date: uscisHistDate(C2_IAF_DATE), actionCode: 'IAF', statusTitle: 'We Emailed You a Receipt Notice', statusTitleSpanish: 'Le Enviamos un Recibo por Correo Electronico' },
      { date: uscisHistDate(C2_FTA0_DATE), actionCode: 'FTA0', statusTitle: 'USCIS Is Currently Processing Your Case', statusTitleSpanish: 'USCIS Está Procesando Su Caso Actualmente' },
      { date: uscisHistDate(C2_SA_DATE), actionCode: 'SA', statusTitle: 'Your Case Has Been Approved', statusTitleSpanish: 'Su Caso Ha Sido Aprobado' },
      { date: uscisHistDate(C2_LDA_DATE), actionCode: 'LDA', statusTitle: 'We Produced Your New Card', statusTitleSpanish: 'Produjimos Su Nueva Tarjeta' }
    ]
  };

  var CASE_2_DOCUMENTS = [
    { fileName: CASE_2 + '-0000000000000-part1.tif', contentId: fakeContentId(21), type: 'Other', createDate: isoOffset(daysAgo(198, 9, 30, 0)), sourceType: 'Applicant Provided' },
    // USCIS names the outcome in the document type itself — the shape observed
    // on a live approval, and the timeline row that carries USCIS's own words
    // for a decision whose event code (SA) is absent from the published schema.
    { fileName: 'I-765 C09 Standalone Approval.pdf', contentId: fakeContentId(22), type: 'I-765 C09 Standalone Approval', createDate: isoOffset(daysAgo(4, 6, 5, 0)), sourceType: 'USCIS Generated' }
  ];

  // ==========================================================================
  // CASE 3 — IOE0000000003, I-131, sparse
  // ==========================================================================
  // 1 event, 0 history entries, 0 notices, 0 documents, 204 processing
  // times, null location — the "does a nearly-empty case still look
  // intentional" test.

  var C3_SUBMITTED = daysAgo(60, 0, 0, 0);
  var C3_ACTION_CODE_DATE = daysAgo(58, 8, 0, 0);

  var CASE_3_DETAIL = {
    receiptNumber: CASE_3,
    submissionDate: dateOnly(C3_SUBMITTED),
    submissionTimestamp: iso(C3_SUBMITTED),
    formType: 'I-131',
    formName: 'Application for Travel Document',
    updatedAt: dateOnly(C3_ACTION_CODE_DATE),
    updatedAtTimestamp: iso(C3_ACTION_CODE_DATE),
    closed: false,
    actionRequired: false,
    applicantName: 'SAMPLE, APPLICANT',
    representativeName: null,
    isPremiumProcessed: false,
    elisChannelType: 'Service Center',
    concurrentCases: [],
    documents: [],
    evidenceRequests: [],
    addendums: [],
    notices: [],
    events: [
      {
        receiptNumber: CASE_3,
        eventId: fakeEventId(31),
        eventCode: 'IAF',
        createdAt: dateOnly(C3_ACTION_CODE_DATE),
        createdAtTimestamp: iso(C3_ACTION_CODE_DATE),
        updatedAt: dateOnly(C3_ACTION_CODE_DATE),
        updatedAtTimestamp: iso(C3_ACTION_CODE_DATE),
        eventDateTime: dateOnly(C3_ACTION_CODE_DATE),
        eventTimestamp: iso(C3_ACTION_CODE_DATE)
      }
    ]
  };

  var CASE_3_STATUS = {
    receiptNumber: CASE_3,
    formType: 'I-131',
    currentActionCode: 'IAF',
    currentActionCodeDate: iso(C3_ACTION_CODE_DATE),
    statusTitle: 'Case Was Received and A Receipt Notice Was Emailed',
    statusText:
      'We received your Form I-131, Application for Travel Document, and mailed ' +
      'you a receipt notice. We will notify you by mail when we make a decision ' +
      'or if we need something from you. Please visit ' +
      '<a href="https://www.uscis.gov/addresschange" target="_blank">www.uscis.gov/addresschange</a> ' +
      'if you move.',
    statusTitleSpanish: 'Recibimos Su Caso y Le Enviamos un Recibo por Correo Electronico',
    statusTextSpanish:
      'Recibimos su Formulario I-131, Solicitud de Documento de Viaje, y le enviamos ' +
      'un recibo. Le notificaremos por correo cuando tomemos una decision.',
    jurisdiction: 'TSC',
    jurisdictionDescription: 'TEXAS SERVICE CENTER',
    message: "Query was successful for payload {'receipt_number': '" + CASE_3 + "'}",
    isPremiumProcessed: false,
    isPremiumRefunded: false,
    historicalCaseStatuses: []
  };

  var CASE_3_DOCUMENTS = [];

  // ==========================================================================
  // CASE 4 — IOE0000000004, I-485J, minimal but valid
  // ==========================================================================

  var C4_SUBMITTED = daysAgo(20, 0, 0, 0);
  var C4_ACTION_CODE_DATE = daysAgo(19, 10, 15, 0);

  var CASE_4_DETAIL = {
    receiptNumber: CASE_4,
    submissionDate: dateOnly(C4_SUBMITTED),
    submissionTimestamp: iso(C4_SUBMITTED),
    formType: 'I-485J',
    formName: 'Confirmation of Bona Fide Job Offer or Request for Job Portability',
    updatedAt: dateOnly(C4_ACTION_CODE_DATE),
    updatedAtTimestamp: iso(C4_ACTION_CODE_DATE),
    closed: false,
    actionRequired: false,
    applicantName: 'SAMPLE, APPLICANT',
    representativeName: null,
    isPremiumProcessed: false,
    elisChannelType: 'Lockbox',
    concurrentCases: [],
    documents: [],
    evidenceRequests: [],
    addendums: [],
    notices: [],
    events: [
      {
        receiptNumber: CASE_4,
        eventId: fakeEventId(41),
        eventCode: 'IAF',
        createdAt: dateOnly(C4_ACTION_CODE_DATE),
        createdAtTimestamp: iso(C4_ACTION_CODE_DATE),
        updatedAt: dateOnly(C4_ACTION_CODE_DATE),
        updatedAtTimestamp: iso(C4_ACTION_CODE_DATE),
        eventDateTime: dateOnly(C4_ACTION_CODE_DATE),
        eventTimestamp: iso(C4_ACTION_CODE_DATE)
      }
    ]
  };

  var CASE_4_STATUS = {
    receiptNumber: CASE_4,
    formType: 'I-485J',
    currentActionCode: 'IAF',
    currentActionCodeDate: iso(C4_ACTION_CODE_DATE),
    statusTitle: 'Case Was Received',
    statusText:
      'We received your Form I-485J, Confirmation of Bona Fide Job Offer or ' +
      'Request for Job Portability. We will notify you by mail when we make a ' +
      'decision. Visit ' +
      '<a href="https://www.uscis.gov/addresschange" target="_blank">www.uscis.gov/addresschange</a> ' +
      'if you move.',
    statusTitleSpanish: 'Recibimos Su Caso',
    statusTextSpanish: 'Recibimos su Formulario I-485J. Le notificaremos por correo.',
    jurisdiction: 'NSC',
    jurisdictionDescription: 'NEBRASKA SERVICE CENTER',
    message: "Query was successful for payload {'receipt_number': '" + CASE_4 + "'}",
    isPremiumProcessed: false,
    isPremiumRefunded: false,
    historicalCaseStatuses: []
  };

  var CASE_4_DOCUMENTS = [
    { fileName: CASE_4 + '-0000000000000-part1.tif', contentId: fakeContentId(41), type: 'G-28', createDate: isoOffset(daysAgo(19, 10, 20, 0)), sourceType: 'Applicant Provided' }
  ];

  // ---- processing_times ---------------------------------------------------
  // GET .../cases/{FORM}/processing_times/{num}
  // null here means "the harness must answer HTTP 204 with an empty body" —
  // the realistic default, per docs/API-SCHEMA.md #5. Only case 2 gets real
  // data, so the progress-bar path is still exercised somewhere.

  var PROCESSING_TIMES = {};
  PROCESSING_TIMES[CASE_1] = null; // 204, no body
  PROCESSING_TIMES[CASE_2] = { estimatedTimeframe: '7.5 Months', medianProcessingTime: 172 };
  PROCESSING_TIMES[CASE_3] = null; // 204, no body
  PROCESSING_TIMES[CASE_4] = null; // 204, no body

  // ---- normal dataset -----------------------------------------------------

  var CASES = {};
  CASES[CASE_1] = { detail: CASE_1_DETAIL, status: CASE_1_STATUS, documents: CASE_1_DOCUMENTS };
  CASES[CASE_2] = { detail: CASE_2_DETAIL, status: CASE_2_STATUS, documents: CASE_2_DOCUMENTS };
  CASES[CASE_3] = { detail: CASE_3_DETAIL, status: CASE_3_STATUS, documents: CASE_3_DOCUMENTS };
  CASES[CASE_4] = { detail: CASE_4_DETAIL, status: CASE_4_STATUS, documents: CASE_4_DOCUMENTS };

  var NORMAL = {
    // Real API shape: an empty array even though cases exist. Kept as a
    // dataset field (rather than a constant) so scenario overrides in the
    // harness can still special-case it if ever needed.
    caseList: [],
    cases: CASES,
    // Every case's location lookup returns {"data": null} in reality — see
    // docs/API-SCHEMA.md #4. Modeled as a single shared constant rather than
    // per-case since it never varies.
    processingTimes: PROCESSING_TIMES
  };

  // ---- "changed" dataset generator --------------------------------------
  // Deep-clones NORMAL and advances IOE0000000001 forward one step:
  // approved, new document, new event. Case 2/3/4 are left untouched. Used
  // to exercise change-detection/diff logic across a refresh.

  function makeChangedDataset() {
    var ds = clone(NORMAL);
    var detail = ds.cases[CASE_1].detail;
    var status = ds.cases[CASE_1].status;

    var now = new Date();

    status.statusTitle = 'Case Was Approved';
    status.statusText = STATUS_TEXT_CHANGED_1;
    // The Spanish strings must move with the English ones — USCIS ships both,
    // and leaving them out of sync made the Español toggle contradict the
    // status directly above it.
    status.statusTitleSpanish = 'Su Caso Fue Aprobado';
    status.statusTextSpanish =
      'El ' + dateOnly(now) + ', aprobamos su Formulario I-485, Solicitud para ' +
      'Registrar Residencia Permanente o Ajustar Estatus. Le enviaremos un aviso ' +
      'de aprobación por correo.';
    status.currentActionCode = 'SA';
    status.currentActionCodeDate = iso(now);

    detail.updatedAt = dateOnly(now);
    detail.updatedAtTimestamp = iso(now);

    detail.documents = []; // this field is always empty on the real detail payload; documents live on the separate endpoint
    ds.cases[CASE_1].documents.push({
      fileName: CASE_1 + '-0000000000001-part1.tif',
      contentId: fakeContentId(7),
      type: 'Other',
      createDate: isoOffset(now),
      sourceType: 'Applicant Provided'
    });

    detail.events.push({
      receiptNumber: CASE_1,
      eventId: fakeEventId(4),
      eventCode: 'SA',
      createdAt: dateOnly(now),
      createdAtTimestamp: iso(now),
      updatedAt: dateOnly(now),
      updatedAtTimestamp: iso(now),
      eventDateTime: dateOnly(now),
      eventTimestamp: iso(now)
    });

    return ds;
  }

  var CHANGED = makeChangedDataset();

  // USCIS is waiting for something from this person, with a deadline whose
  // consequence is denial. This is the highest-consequence state the panel can
  // render — the amber demand line on a collapsed row, the case sorting to the
  // top, and the attention banner — and until now no scenario produced it, so
  // it was the one path only ever seen by hand-editing state in a console.
  function makeActionRequiredDataset() {
    var ds = clone(NORMAL);
    var detail = ds.cases[CASE_1].detail;
    var now = new Date();
    var sent = new Date(now.getTime() - 9 * 24 * 60 * 60 * 1000);

    // The structured boolean USCIS supplies. Everything the panel colours or
    // sorts on comes from this, never from reading the status prose.
    detail.actionRequired = true;

    detail.evidenceRequests = [{
      receiptNumber: CASE_1,
      requestId: fakeEventId(9),
      createdAt: dateOnly(sent),
      createdAtTimestamp: iso(sent)
    }];

    // IK — "Request for additional evidence sent" in the NIEM schema, and one
    // of the four codes allowed to raise the attention banner.
    detail.events.push({
      receiptNumber: CASE_1,
      eventId: fakeEventId(10),
      eventCode: 'IK',
      createdAt: dateOnly(sent),
      createdAtTimestamp: iso(sent),
      updatedAt: dateOnly(sent),
      updatedAtTimestamp: iso(sent),
      eventDateTime: dateOnly(sent),
      eventTimestamp: iso(sent)
    });

    return ds;
  }

  var ACTION_REQUIRED = makeActionRequiredDataset();

  // ---- public fixtures object --------------------------------------------

  window.USCIS_FIXTURES = {
    caseNumbers: CASE_NUMBERS,
    normal: NORMAL,
    changed: CHANGED,
    actionRequired: ACTION_REQUIRED,
    // exposed so the harness (or future scenarios) can derive further
    // variants from a clean copy without re-running makeChangedDataset().
    makeChangedDataset: makeChangedDataset
  };
})();
