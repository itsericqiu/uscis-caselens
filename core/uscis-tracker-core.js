// ============================================================================
// CaseLens — core (USCIS case tracker)
// ============================================================================
//
// PRIVACY CONTRACT (the whole point of this file being readable):
//   - Runs only on my.uscis.gov and talks ONLY to these same-origin endpoints:
//       1. https://my.uscis.gov/account/case-service/api/cases                     (auth probe)
//       2. https://my.uscis.gov/account/case-service/api/cases/{num}               (case detail + events)
//       3. https://my.uscis.gov/account/case-service/api/case_status/{num}         (status + history + office)
//       4. https://my.uscis.gov/account/case-service/api/cases/{num}/documents     (documents)
//       5. https://my.uscis.gov/account/case-service/api/cases/{FORM}/processing_times/{num}
//       6. https://my.uscis.gov/secure-messaging/api/case-service/receipt_info/{num} (extra location)
//     Every URL the code can build lives in ENDPOINTS below — there is no other
//     place a network address appears. Endpoints 5 and 6 are frequently empty;
//     see docs/API-SCHEMA.md for schemas verified against a live account.
//   - Auth = your existing browser session cookies. No passwords, no tokens stored.
//   - Everything you save (case numbers, labels, history) lives in this
//     browser's localStorage under keys prefixed "uscisTracker.". Nothing is
//     ever sent anywhere else. No analytics, no telemetry, no third parties.
//   - No eval, no innerHTML: all DOM is built with createElement/textContent.
//
// This file is the single source of truth. The userscript and the Chrome and
// Firefox extensions are generated from it and core/uscis-codes.js — verify with
// `node scripts/build.js --check`.
// ============================================================================

(function () {
  'use strict';

  if (window.__uscisTrackerInjected) return;
  window.__uscisTrackerInjected = true;

  // ==========================================================================
  // SECTION 1: Constants
  // ==========================================================================

  var VERSION = '1.6.1';

  var STORAGE_KEYS = {
    cases: 'uscisTracker.cases.v1',      // [{ number, label, addedAt }]
    snapshots: 'uscisTracker.snapshots.v1', // { [number]: SNAPSHOT (see normalize) }
    history: 'uscisTracker.history.v1',  // { [number]: [{ at, kind, from, to }] } newest-first
    prefs: 'uscisTracker.prefs.v1',      // { panelPos, collapsed, dark, refreshMs, notify, redact }
    // { v: 2, byCode: { "CODE|FORM": { text, from: receiptNumber } } } harvested
    // from your own cases. See harvestCodeText() for why the key carries the
    // form type and the value remembers which case the wording came from.
    codeText: 'uscisTracker.codeText.v1',
    // Receipt numbers the user explicitly removed. Auto-discovery reads the
    // account page on every load, so without this a removed case reappears on
    // the next refresh and Remove looks broken.
    dismissed: 'uscisTracker.dismissed.v1'
  };

  var CASE_NUMBER_RE = /^IOE[0-9]{10}$/i;
  var RECEIPT_NUMBER_RE = /\b(IOE[0-9]{10})\b/g; // for scraping the account page
  var DEFAULT_FORM_TYPE = 'I-765';
  var HISTORY_CAP = 200;
  var MIN_REFRESH_MS = 5 * 60 * 1000;
  var DEFAULT_REFRESH_MS = 15 * 60 * 1000;
  var STAGGER_MS = 300;

  var BASE = 'https://my.uscis.gov';

  // Case numbers and form types are interpolated into paths, and a user may
  // type anything into the add-case box. Encoding here means no input can
  // escape its path segment or reshape the URL, for every endpoint at once.
  function seg(value) {
    return encodeURIComponent(String(value === null || value === undefined ? '' : value));
  }

  var ENDPOINTS = {
    caseList: function () { return BASE + '/account/case-service/api/cases'; },
    caseStatus: function (n) { return BASE + '/account/case-service/api/cases/' + seg(n); },
    location: function (n) { return BASE + '/secure-messaging/api/case-service/receipt_info/' + seg(n); },
    receiptNotice: function (n) { return BASE + '/account/case-service/api/case_status/' + seg(n); },
    processingTimes: function (n, form) { return BASE + '/account/case-service/api/cases/' + seg(form) + '/processing_times/' + seg(n); },
    documents: function (n) { return BASE + '/account/case-service/api/cases/' + seg(n) + '/documents'; }
  };

  // --------------------------------------------------------------------------
  // DATA MODEL — the single place that records which response fields we read.
  //
  // Verified against a live account (see docs/API-SCHEMA.md). The first key in
  // each list is what the API actually returned; the rest are defensive
  // fallbacks kept because these endpoints are undocumented and may change.
  // Every extraction in sections 4 and 5 reads from this map — no other
  // function embeds its own field names.
  // --------------------------------------------------------------------------
  var FIELDS = {
    // GET /api/cases/{num} — case detail. Arrays: events, notices, documents.
    caseStatus: {
      receiptNumber: ['receiptNumber', 'caseNumber'],
      formType: ['formType', 'formNumber', 'form', 'caseType'],
      formName: ['formName', 'formTitle'],
      submissionDate: ['submissionTimestamp', 'submissionDate', 'filedDate'],
      // When USCIS last touched the record — moves even when the public
      // status does not. This powers the "backend activity" signal.
      updatedAt: ['updatedAtTimestamp', 'updatedAt', 'lastUpdatedDate', 'modifyDate'],
      closed: ['closed'],
      actionRequired: ['actionRequired'],
      premium: ['isPremiumProcessed'],
      applicantName: ['applicantName'],
      representativeName: ['representativeName'],
      events: ['events'],
      notices: ['notices'],
      concurrentCases: ['concurrentCases'],
      evidenceRequests: ['evidenceRequests']
    },
    // GET /api/case_status/{num} — richest endpoint: status text, office, history.
    receiptNotice: {
      receiptNumber: ['receiptNumber', 'caseNumber'],
      status: ['statusTitle', 'status', 'statusText', 'currentStatus'],
      statusDetail: ['statusText', 'description', 'statusDescription'],
      // USCIS ships its own Spanish translations in the same payload.
      statusSpanish: ['statusTitleSpanish'],
      statusDetailSpanish: ['statusTextSpanish'],
      actionCode: ['currentActionCode'],
      actionCodeDate: ['currentActionCodeDate'],
      formType: ['formType', 'formNumber'],
      office: ['jurisdictionDescription', 'jurisdiction'],
      officeCode: ['jurisdiction'],
      history: ['historicalCaseStatuses'],
      premiumRefunded: ['isPremiumRefunded']
    },
    // Entries inside receiptNotice.history[]
    historyItem: {
      date: ['date'],
      actionCode: ['actionCode'],
      text: ['statusTitle', 'description', 'text'],
      textSpanish: ['statusTitleSpanish']
    },
    // Entries inside caseStatus.events[]
    eventItem: {
      code: ['eventCode'],
      date: ['eventTimestamp', 'eventDateTime', 'createdAtTimestamp', 'createdAt'],
      recordedAt: ['createdAtTimestamp', 'createdAt']
    },
    // Entries inside caseStatus.notices[]
    noticeItem: {
      type: ['actionType'],
      generatedAt: ['generationDate'],
      appointmentAt: ['appointmentDateTime'],
      letterId: ['letterId']
    },
    // GET /api/cases/{num}/documents — array of these.
    documentItem: {
      name: ['fileName', 'name', 'title', 'documentName'],
      date: ['createDate', 'date', 'postedDate', 'createdDate'],
      id: ['contentId'],
      type: ['type'],
      source: ['sourceType'],
      url: ['url', 'downloadUrl', 'href']
    },
    // GET /secure-messaging/.../receipt_info/{num} — usually null.
    location: {
      office: ['office', 'fieldOffice', 'serviceCenter', 'location'],
      address: ['address', 'officeAddress']
    },
    // GET /api/cases/{FORM}/processing_times/{num} — usually HTTP 204 empty.
    processingTimes: {
      estimate: ['estimatedTimeframe', 'processingTime', 'rangeText', 'formattedRange'],
      medianDays: ['medianProcessingTime', 'medianDays']
    }
  };

  // Event-code meanings now come from core/uscis-codes.js (the NIEM federal
  // schema, 492 codes) plus wording harvested from the user's own cases.
  // See describeCode().

  var DEFAULT_PREFS = {
    panelPos: null,
    collapsed: true,
    dark: false,
    refreshMs: DEFAULT_REFRESH_MS,
    notify: false,
    redact: false
  };

  // Mutable app state (not persisted except via the storage layer)
  var state = {
    cases: [],            // [{ number, label, addedAt, result: null|{...}, loading: false, changedSince: false }]
    sessionExpired: false,
    authenticated: false,
    discoveredCases: null, // from auth probe, for "Import my cases"
    prefs: null
  };

  // ==========================================================================
  // SECTION 2: Storage  (implemented by agent A)
  // ==========================================================================
  // load(key, fallback) / save(key, value): JSON localStorage wrappers, try/caught.
  // loadAll(): populate state.cases (+ merge default prefs).
  // persistCases(), persistPrefs(), getSnapshot(n), setSnapshot(n, snap),
  // getHistory(n), appendHistory(n, entries) — trims to HISTORY_CAP.

  // Read a JSON value from localStorage. Falls back to `fallback` whenever the
  // key is missing, the stored text isn't valid JSON, or the parsed value's
  // shape doesn't match what the caller expects (array vs. plain object).
  function load(key, fallback) {
    var raw = null;
    try {
      raw = localStorage.getItem(key);
      if (raw === null) return fallback;

      var parsed = JSON.parse(raw);

      if (Array.isArray(fallback)) {
        if (Array.isArray(parsed)) return parsed;
        rescueUnreadable(key, raw);
        return fallback;
      }
      if (fallback !== null && typeof fallback === 'object') {
        var isPlainObject = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
        if (isPlainObject) return parsed;
        rescueUnreadable(key, raw);
        return fallback;
      }
      return parsed;
    } catch (e) {
      rescueUnreadable(key, raw);
      return fallback;
    }
  }

  // Data that cannot be rebuilt if we throw it away. Everything USCIS sends is
  // re-fetchable and every harvested label re-derivable, but the change history
  // is this panel's own observation of what moved and when — if a future
  // version reads it with a different shape in mind, load()'s type check would
  // quietly hand back an empty object and the record would be gone. So an
  // unusable value is copied aside before the default is used, and never
  // overwritten in place.
  var IRREPLACEABLE_KEYS = {};
  IRREPLACEABLE_KEYS['uscisTracker.history.v1'] = true;
  IRREPLACEABLE_KEYS['uscisTracker.cases.v1'] = true;

  function rescueUnreadable(key, raw) {
    if (!IRREPLACEABLE_KEYS[key] || !raw) return;
    var backup = key + '.unreadable';
    try {
      // Keep the first copy: a later bad write must not overwrite the good
      // data rescued from the first one.
      if (localStorage.getItem(backup) === null) localStorage.setItem(backup, raw);
    } catch (e) {
      // Storage full or unavailable. Nothing further we can do, and the
      // original value is still in place under its own key.
    }
  }

  // Write a JSON value to localStorage. Swallows errors (quota exceeded,
  // storage disabled in private browsing, etc.) so a save never crashes the app.
  // Set once if any write is refused. Surfaced in the panel, because silently
  // failing to record history is the one failure this tool must not hide.
  var storageFailed = false;

  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      // Quota exceeded, or storage disabled in private browsing. Report it so
      // callers can avoid acting on a write that did not happen — see
      // applyFetchResult, where a lost snapshot would otherwise make the same
      // change be re-detected and re-notified on every refresh, forever.
      storageFailed = true;
      return false;
    }
  }


  // Populate state.cases and state.prefs from localStorage. Safe to call
  // multiple times; always rebuilds both from scratch.
  function loadAll() {
    var storedCases = load(STORAGE_KEYS.cases, []);
    state.cases = [];
    for (var i = 0; i < storedCases.length; i++) {
      var c = storedCases[i];
      if (!c || typeof c !== 'object' || !c.number) continue;
      state.cases.push({
        number: c.number,
        label: typeof c.label === 'string' ? c.label : '',
        addedAt: c.addedAt || new Date().toISOString(),
        result: null,
        loading: false,
        changedSince: false
      });
    }

    var storedPrefs = load(STORAGE_KEYS.prefs, {});
    var prefs = {};
    var key;
    for (key in DEFAULT_PREFS) {
      if (DEFAULT_PREFS.hasOwnProperty(key)) prefs[key] = DEFAULT_PREFS[key];
    }
    for (key in storedPrefs) {
      if (storedPrefs.hasOwnProperty(key)) prefs[key] = storedPrefs[key];
    }

    if (typeof prefs.refreshMs !== 'number' || isNaN(prefs.refreshMs)) {
      prefs.refreshMs = DEFAULT_REFRESH_MS;
    }
    if (prefs.refreshMs < MIN_REFRESH_MS) {
      prefs.refreshMs = MIN_REFRESH_MS;
    }

    state.prefs = prefs;
  }

  // Save state.cases back to localStorage, stripping runtime-only fields
  // (result, loading, changedSince) so we only persist what the user added.
  function persistCases() {
    var toSave = [];
    for (var i = 0; i < state.cases.length; i++) {
      var c = state.cases[i];
      toSave.push({ number: c.number, label: c.label, addedAt: c.addedAt });
    }
    save(STORAGE_KEYS.cases, toSave);
  }

  function persistPrefs() {
    save(STORAGE_KEYS.prefs, state.prefs);
  }

  function getSnapshot(number) {
    var snapshots = load(STORAGE_KEYS.snapshots, {});
    return snapshots[number] || null;
  }

  function setSnapshot(number, snap) {
    var snapshots = load(STORAGE_KEYS.snapshots, {});
    snapshots[number] = snap;
    return save(STORAGE_KEYS.snapshots, snapshots);
  }

  // History is stored newest-first, per case number.
  function getHistory(number) {
    var all = load(STORAGE_KEYS.history, {});
    return Array.isArray(all[number]) ? all[number] : [];
  }

  // Prepend new entries (already newest-first among themselves) to the
  // existing history for this case, then trim to HISTORY_CAP entries.
  function appendHistory(number, entries) {
    if (!entries || !entries.length) return;
    var all = load(STORAGE_KEYS.history, {});
    var existing = Array.isArray(all[number]) ? all[number] : [];
    var combined = entries.concat(existing);
    if (combined.length > HISTORY_CAP) {
      combined = combined.slice(0, HISTORY_CAP);
    }
    all[number] = combined;
    save(STORAGE_KEYS.history, all);
  }

  // ==========================================================================
  // SECTION 3: Fetch layer  (implemented by agent A)
  // ==========================================================================
  // fetchJSON(url) -> Promise<object|{__error, __auth?}>  (never rejects)
  //   401/403 -> { __error, __auth: true }; 404 -> friendly message; other
  //   non-OK -> HTTP code message; network error -> message.
  // sleep(ms)
  // checkAuthenticated() -> Promise<{ authenticated: bool, caseList: array|null }>
  //   GET ENDPOINTS.caseList(); authenticated iff res.ok AND content-type json
  //   AND res.url doesn't look like a sign-in redirect. Stores discovered case
  //   list when the response contains one.
  // guessFormType(caseStatusData) -> string (candidate keys, DEFAULT_FORM_TYPE fallback)
  // fetchAllForCase(number) -> Promise<result>
  //   caseStatus first, then history/location/receiptNotice/processingTimes/documents
  //   SEQUENTIALLY with STAGGER_MS between calls. Result:
  //   { fetchedAt, formTypeUsed, caseStatus, location, receiptNotice, processingTimes, documents }
  //   Sets state.sessionExpired if any __auth.

  // GET a URL with the browser's existing session cookies and parse the JSON
  // body. Never rejects — every failure mode (auth, 404, other HTTP error,
  // bad JSON, network failure) resolves to a plain { __error } object so
  // callers never need try/catch.
  function fetchJSON(url) {
    return fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' }
    }).then(function (res) {
      if (res.status === 401 || res.status === 403) {
        return { __error: 'Not logged in to my.uscis.gov (or session expired).', __auth: true };
      }
      if (res.status === 404) {
        return { __error: 'No data at this endpoint for this case.' };
      }
      // 204 No Content is USCIS's normal answer for "we have no data here" —
      // the processing-times endpoint returns it constantly. Not an error.
      if (res.status === 204) {
        return { __empty: true };
      }
      if (!res.ok) {
        return { __error: 'Request failed (HTTP ' + res.status + ').' };
      }
      return res.text().then(function (text) {
        if (!text) return { __empty: true };
        var parsed;
        try {
          parsed = JSON.parse(text);
        } catch (e) {
          return { __error: 'Response was not valid JSON.' };
        }
        return unwrapEnvelope(parsed);
      });
    }).catch(function (err) {
      var message = (err && err.message) ? err.message : String(err);
      return { __error: 'Network error: ' + message };
    });
  }

  // Every my.uscis.gov endpoint wraps its payload in { "data": ... }. Unwrap it
  // once here so the rest of the code never thinks about the envelope. A null
  // payload (which the location endpoint returns routinely) becomes __empty.
  function unwrapEnvelope(parsed) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return parsed;
    if (!Object.prototype.hasOwnProperty.call(parsed, 'data')) return parsed;

    var inner = parsed.data;
    if (inner === null || inner === undefined) return { __empty: true };
    if (Array.isArray(inner)) return { __list: inner };
    if (typeof inner === 'object') return inner;
    // A scalar `data` (never observed). Treated as "answered, nothing usable"
    // rather than inventing a sentinel no caller reads.
    return { __empty: true };
  }

  // Endpoints that return a bare array arrive as { __list: [...] } from
  // unwrapEnvelope. This pulls the array back out for callers that want it.
  function asList(payload) {
    if (!payload || payload.__error || payload.__empty) return null;
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.__list)) return payload.__list;
    return null;
  }


  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  // Probe the case-list endpoint to determine whether the user has an active
  // my.uscis.gov session. A sign-in redirect typically comes back as an HTML
  // page (wrong content-type) or a URL containing "sign" — either is treated
  // as "not authenticated" rather than an error. As a side effect, stashes
  // any case list found in the response for the auto-discovery flow.
  function checkAuthenticated() {
    return fetch(ENDPOINTS.caseList(), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' }
    }).then(function (res) {
      var contentType = res.headers.get('content-type') || '';
      var url = res.url || '';
      var looksAuthenticated = res.ok && contentType.indexOf('json') !== -1 && url.indexOf('sign') === -1;

      if (!looksAuthenticated) {
        return { authenticated: false };
      }

      // The body is only a bonus: on a real account this endpoint returns an
      // empty list even when cases exist, so discovery does not depend on it
      // (see discoverFromPage). A JSON 200 is all we need to know we're in.
      return res.text().then(function (text) {
        try {
          var data = JSON.parse(text);
          var list = null;
          if (Array.isArray(data)) list = data;
          else if (data && Array.isArray(data.data)) list = data.data;
          else if (data && Array.isArray(data.cases)) list = data.cases;
          if (list && list.length) state.discoveredCases = list;
        } catch (e) {
          // Authenticated, but the body wasn't JSON we can use for discovery.
        }
        return { authenticated: true };
      });
    }).catch(function () {
      return { authenticated: false };
    });
  }

  // Best-effort guess at which form type to use for the processing-times
  // lookup, since that endpoint needs a form number in its URL.
  function guessFormType(caseStatusData) {
    if (!caseStatusData || caseStatusData.__error) return DEFAULT_FORM_TYPE;
    var value = pick(caseStatusData, FIELDS.caseStatus.formType);
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    return DEFAULT_FORM_TYPE;
  }

  // Read receipt numbers straight out of the account page, which server-renders
  // them as "Receipt # IOE#########". This is how auto-discovery actually works:
  // the case-list endpoint returns an empty array even for accounts with active
  // cases. Costs no network request at all.
  function discoverFromPage() {
    var found = [];
    var seen = {};
    var text = '';
    try {
      text = document.body ? (document.body.innerText || document.body.textContent || '') : '';
    } catch (e) {
      return found;
    }

    RECEIPT_NUMBER_RE.lastIndex = 0;
    var match = RECEIPT_NUMBER_RE.exec(text);
    while (match !== null) {
      var number = match[1].toUpperCase();
      if (!seen[number]) {
        seen[number] = true;
        found.push({ number: number, label: '' });
      }
      match = RECEIPT_NUMBER_RE.exec(text);
    }
    return found;
  }

  // Fetch every endpoint for one case, strictly one at a time (never in
  // parallel) with a short pause between requests so we don't hammer an
  // undocumented API. caseStatus goes first because its form type feeds the
  // processing-times URL.
  function fetchAllForCase(number) {
    var result = {
      // When the attempt started. NOT evidence that anything was learned —
      // succeededAt is set below only if at least one endpoint answered.
      fetchedAt: new Date().toISOString(),
      succeededAt: null,
      formTypeUsed: DEFAULT_FORM_TYPE,
      caseStatus: null,
      location: null,
      receiptNotice: null,
      processingTimes: null,
      documents: null
    };

    return fetchJSON(ENDPOINTS.caseStatus(number))
      .then(function (caseStatus) {
        result.caseStatus = caseStatus;
        result.formTypeUsed = guessFormType(caseStatus);
        return sleep(STAGGER_MS);
      })
      .then(function () {
        return fetchJSON(ENDPOINTS.location(number));
      })
      .then(function (location) {
        result.location = location;
        return sleep(STAGGER_MS);
      })
      .then(function () {
        return fetchJSON(ENDPOINTS.receiptNotice(number));
      })
      .then(function (receiptNotice) {
        result.receiptNotice = receiptNotice;
        return sleep(STAGGER_MS);
      })
      .then(function () {
        return fetchJSON(ENDPOINTS.processingTimes(number, result.formTypeUsed));
      })
      .then(function (processingTimes) {
        result.processingTimes = processingTimes;
        return sleep(STAGGER_MS);
      })
      .then(function () {
        return fetchJSON(ENDPOINTS.documents(number));
      })
      .then(function (documents) {
        result.documents = documents;

        var parts = [
          result.caseStatus, result.location,
          result.receiptNotice, result.processingTimes, result.documents
        ];
        var anyAuthError = false;
        for (var i = 0; i < parts.length; i++) {
          if (parts[i] && parts[i].__auth) {
            anyAuthError = true;
            break;
          }
        }
        state.sessionExpired = anyAuthError;
        if (resultHasAnyData(result)) result.succeededAt = new Date().toISOString();

        return result;
      });
  }

  // Every case we can find for this user, deduped: receipt numbers scraped
  // from the account page (the reliable source) plus anything the case-list
  // endpoint happened to return (usually nothing).
  function discoveredCaseNumbers() {
    var out = [];
    var seen = {};

    function add(number, label) {
      if (!number || !/^[A-Z]{3}[0-9]{10}$/.test(number)) return;
      if (seen[number]) return;
      seen[number] = true;
      out.push({ number: number, label: label || '' });
    }

    var fromPage = discoverFromPage();
    for (var p = 0; p < fromPage.length; p++) {
      add(fromPage[p].number, fromPage[p].label);
    }

    var list = state.discoveredCases;
    if (!Array.isArray(list)) return out;

    var numberKeys = ['receiptNumber', 'caseNumber', 'number', 'receipt_number'];
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (!item || typeof item !== 'object') continue;

      var number = null;
      for (var k = 0; k < numberKeys.length; k++) {
        var candidate = item[numberKeys[k]];
        if (typeof candidate === 'string' && candidate.trim()) {
          number = candidate.trim().toUpperCase();
          break;
        }
      }

      var label = pick(item, FIELDS.caseStatus.formType);
      add(number, typeof label === 'string' ? label.trim() : '');
    }

    return out;
  }

  // ==========================================================================
  // SECTION 4: Normalize + diff  (implemented by agent A)
  // ==========================================================================
  // pick(obj, keys) -> first non-empty candidate value or null
  // normalize(result) -> snapshot { at, status, lastUpdated, office, docNames (sorted), formType }
  // diffSnapshots(prev, next) -> [{ at, kind, from, to }]  (empty if prev falsy)
  // applyFetchResult(entry, result): normalize, diff vs stored snapshot, append
  //   history, set entry.changedSince on changes, store new snapshot, maybeNotify.
  // maybeNotify(entry, changes): Notification only if prefs.notify && permission granted.

  // A receipt number we are willing to store and put into a request URL.
  // Backup files are user-supplied and may be corrupt or hostile, so anything
  // that isn't three letters plus ten digits is rejected outright.
  function isValidReceiptNumber(value) {
    return typeof value === 'string' && /^[A-Z]{3}[0-9]{10}$/i.test(value);
  }

  // Look through `keys` in order and return the first value on `obj` that
  // isn't undefined, null, or ''. Returns null if none match or obj isn't an
  // object — this is the one place we absorb "the API renamed a field again".
  function pick(obj, keys) {
    if (!obj || typeof obj !== 'object') return null;
    for (var i = 0; i < keys.length; i++) {
      var value = obj[keys[i]];
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return null;
  }

  // JSON.stringify that never throws (e.g. on a circular structure from a
  // misbehaving endpoint). Used only as a last-resort display fallback.
  function safeStringify(obj) {
    try {
      return JSON.stringify(obj);
    } catch (e) {
      return null;
    }
  }

  // Reduce a raw fetchAllForCase() result down to the small set of fields we
  // actually compare across refreshes to detect change.
  function normalize(result) {
    var snap = {
      at: (result && result.fetchedAt) || null,
      status: null,        // official status title, e.g. "Case Was Received"
      actionCode: null,    // e.g. "FTA0"
      lastUpdated: null,   // date attached to the public status
      backendAt: null,     // when USCIS last touched the record (may be newer)
      office: null,
      docNames: [],
      // Stable facts about the case, kept so a card can still be rendered
      // from cache when a later fetch fails. Neither changes over a case's
      // life, so showing them from cache states nothing that stopped being true.
      formName: null,
      submissionDate: null,
      // Only ever the form type USCIS actually reported. result.formTypeUsed
      // may be DEFAULT_FORM_TYPE, which exists to build a URL — recording it
      // here would turn a fallback into a stated fact about the case.
      formType: null
    };
    if (!result) return snap;

    var observedForm = pick(result.caseStatus, FIELDS.caseStatus.formType);
    if (observedForm === null) {
      observedForm = pick(result.receiptNotice, FIELDS.receiptNotice.formType);
    }
    snap.formType = observedForm !== null ? String(observedForm) : null;

    var observedName = pick(result.caseStatus, FIELDS.caseStatus.formName);
    snap.formName = observedName !== null ? String(observedName) : null;

    var observedFiled = pick(result.caseStatus, FIELDS.caseStatus.submissionDate);
    snap.submissionDate = observedFiled !== null ? String(observedFiled) : null;

    // Status and office come from the case_status endpoint, which carries the
    // official wording, the action code, and the jurisdiction.
    var notice = result.receiptNotice;
    if (notice && !notice.__error && !notice.__empty) {
      var statusValue = pick(notice, FIELDS.receiptNotice.status);
      snap.status = statusValue !== null ? stripHtml(String(statusValue)) : null;

      var codeValue = pick(notice, FIELDS.receiptNotice.actionCode);
      snap.actionCode = codeValue !== null ? String(codeValue) : null;

      snap.lastUpdated = pick(notice, FIELDS.receiptNotice.actionCodeDate);
      snap.office = flattenValue(pick(notice, FIELDS.receiptNotice.office));
    }

    // The case-detail endpoint carries the record's own updated-at stamp, which
    // moves when USCIS works a case even if the public status is unchanged.
    var caseStatus = result.caseStatus;
    if (caseStatus && !caseStatus.__error && !caseStatus.__empty) {
      snap.backendAt = pick(caseStatus, FIELDS.caseStatus.updatedAt);
      if (snap.lastUpdated === null) {
        snap.lastUpdated = snap.backendAt;
      }
    }

    // Fall back to the secondary location endpoint only if jurisdiction was absent.
    if (snap.office === null) {
      var location = result.location;
      if (location && !location.__error && !location.__empty) {
        snap.office = flattenValue(pick(location, FIELDS.location.office));
      }
    }

    var docList = documentList(result.documents);
    if (docList) {
      var names = [];
      for (var i = 0; i < docList.length; i++) {
        var name = pick(docList[i], FIELDS.documentItem.name);
        if (name !== null) names.push(String(name));
      }
      names.sort();
      snap.docNames = names;
    }

    return snap;
  }

  // Documents arrive as a bare array inside the data envelope.
  function documentList(documents) {
    if (!documents || documents.__error || documents.__empty) return null;
    var list = asList(documents);
    if (list) return list;
    if (Array.isArray(documents.documents)) return documents.documents;
    return null;
  }

  // Reduce an unknown value (string, number, or nested object) to a display
  // string, preferring a human-looking name when handed an object.
  function flattenValue(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'object') {
      var name = pick(value, ['name', 'description', 'title']);
      return name !== null ? String(name) : safeStringify(value);
    }
    return String(value);
  }

  // USCIS status prose embeds real HTML anchors. We never inject markup, so
  // tags are stripped to plain text before the value is used anywhere.
  function stripHtml(text) {
    if (typeof text !== 'string') return text;
    if (text.indexOf('<') === -1) return text;
    return text
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Compare two snapshots and describe what changed, for the local history
  // log and for notifications. Returns [] if there's no previous snapshot to
  // compare against (i.e. this is the first fetch for this case).
  function diffSnapshots(prev, next) {
    var changes = [];
    if (!prev) return changes;

    if (next.status !== null && String(next.status) !== String(prev.status)) {
      changes.push({ at: next.at, kind: 'status', from: prev.status, to: next.status });
    }

    // USCIS moved the record's updated-at stamp without changing the public
    // status: the case was worked on behind the scenes. The website never
    // surfaces this, so it is reported separately and never as a status change.
    if (next.backendAt !== null &&
        String(next.backendAt) !== String(prev.backendAt) &&
        String(next.status) === String(prev.status)) {
      changes.push({ at: next.at, kind: 'backend', from: prev.backendAt, to: next.backendAt });
    }

    // Counted, not set-membership: USCIS reuses filenames, and a second file
    // with a name we have already seen is still a new document on this case.
    var remaining = Object.create(null);
    var i;
    var name;
    if (Array.isArray(prev.docNames)) {
      for (i = 0; i < prev.docNames.length; i++) {
        name = prev.docNames[i];
        remaining[name] = (remaining[name] || 0) + 1;
      }
    }
    if (Array.isArray(next.docNames)) {
      for (i = 0; i < next.docNames.length; i++) {
        name = next.docNames[i];
        if (remaining[name]) {
          remaining[name] -= 1;
          continue;
        }
        changes.push({ at: next.at, kind: 'document', from: null, to: name });
      }
    }

    if (next.office !== null && String(next.office) !== String(prev.office)) {
      changes.push({ at: next.at, kind: 'office', from: prev.office, to: next.office });
    }

    return changes;
  }

  // After a fetch completes for a case entry: normalize the result, diff it
  // against the last stored snapshot, record any changes to history, flag
  // the entry so the UI can badge it, notify if enabled, then always store
  // the fresh snapshot (even when nothing changed).
  function applyFetchResult(entry, result) {
    entry.result = result;

    // Learn USCIS's own wording for any action codes this response explains,
    // so bare codes on other cases can be labeled without guessing.
    harvestCodeText(result);

    // If every endpoint failed we learned nothing about this case. Storing a
    // snapshot anyway would record defaults as if they were facts — the form
    // type falls back to DEFAULT_FORM_TYPE, and the timestamp would claim a
    // successful check that never happened. Keep the previous snapshot (or
    // none) and let the UI report the failure instead.
    if (!resultHasAnyData(result)) return;

    var snap = normalize(result);
    var prevSnap = getSnapshot(entry.number);

    // A form type USCIS told us before is still a fact about this case even if
    // this refresh came back empty — form types don't change. Carry it forward
    // so the card keeps its identity instead of degrading to "Case". Only
    // identity is retained; status and dates must always reflect this fetch.
    if (snap.formType === null && prevSnap && prevSnap.formType) {
      snap.formType = prevSnap.formType;
    }

    // Every endpoint answered, and every one of them was empty. That tells us
    // nothing new about the case, and overwriting a snapshot that has real
    // content with this one would throw away the only copy the card can fall
    // back on — see caseRenderState()'s 'stale'.
    if (!snapshotHasContent(snap) && snapshotHasContent(prevSnap)) return;

    var changes = diffSnapshots(prevSnap, snap);

    // Order matters. If the snapshot write fails, the next refresh diffs
    // against the stale snapshot, re-detects the identical change, and
    // notifies again — every 15 minutes, forever. Only record the change once
    // the state it was measured against is actually stored.
    if (!setSnapshot(entry.number, snap)) return;

    if (changes.length) {
      appendHistory(entry.number, changes);
      entry.changedSince = true;
      maybeNotify(entry, changes);
    }
  }

  // A stored snapshot is only worth showing the user when it carries something
  // USCIS actually told us. An entry that exists but holds nothing is not a
  // record of the case, so it never counts as an earlier copy to fall back on.
  function snapshotHasContent(snap) {
    if (!snap) return false;
    if (snap.status || snap.lastUpdated || snap.backendAt || snap.office) return true;
    return !!(snap.docNames && snap.docNames.length);
  }

  // True when at least one endpoint returned usable data. An endpoint that
  // answered "nothing here" (__empty) counts as a real answer about the case;
  // an error does not.
  function resultHasAnyData(result) {
    if (!result) return false;
    var parts = [
      result.caseStatus, result.receiptNotice, result.location,
      result.processingTimes, result.documents
    ];
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      if (part && !part.__error) return true;
    }
    return false;
  }

  // Fire a browser Notification for the first detected change, but only if
  // the user opted in and the browser has already granted permission — we
  // never prompt for permission from here.
  function maybeNotify(entry, changes) {
    if (!state.prefs || !state.prefs.notify) return;
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    if (!changes || !changes.length) return;

    // Backend activity is real but unexplainable: we know the record was
    // touched, not what it means. Interrupting someone for that — often at
    // night, often after months of waiting — presents as news when it isn't.
    // It stays visible in the panel and timeline, but never pushes on its own.
    var notifiable = null;
    for (var i = 0; i < changes.length; i++) {
      if (changes[i].kind !== 'backend') {
        notifiable = changes[i];
        break;
      }
    }
    if (!notifiable) return;

    try {
      var who = entry.label || entry.number;
      new Notification('USCIS case update', { body: who + ': ' + describeChange(notifiable) });
    } catch (e) {
      // Notification construction can throw in some contexts; never let a
      // notification failure break the refresh flow.
    }
  }

  // One sentence describing a detected change, used by notifications and the
  // timeline. Deliberately factual: it reports what moved, never what it means
  // for the case.
  function describeChange(change) {
    if (!change) return '';
    if (change.kind === 'status') {
      return 'Status changed to "' + change.to + '"';
    }
    if (change.kind === 'document') {
      return 'New document: ' + change.to;
    }
    if (change.kind === 'office') {
      return 'Office changed to ' + change.to;
    }
    if (change.kind === 'backend') {
      return 'USCIS updated this case record (status text unchanged)';
    }
    return 'Case updated';
  }

  // The harvest map's scope. USCIS writes different customer-facing wording
  // for the same action code on different forms — the same `IAF` is a receipt
  // notice on an I-485 and something else again on a Supplement J — so a map
  // keyed by code alone hands one case's sentence to another case's event.
  // Both halves of the key are required: a code we cannot attribute to a form
  // is not recorded at all.
  function harvestKey(code, formType) {
    if (!code || !formType) return null;
    return String(code).toUpperCase() + '|' + String(formType).toUpperCase();
  }

  // Shape-versioned because the v1 map was keyed by bare code. Those entries
  // cannot be attributed to a form now, and guessing would reintroduce exactly
  // the bleed this key change exists to stop, so an old map is dropped rather
  // than migrated: the next refresh re-harvests it from the user's own cases.
  function loadHarvest() {
    var stored = load(STORAGE_KEYS.codeText, {});
    if (!stored || stored.v !== 2 || !stored.byCode || typeof stored.byCode !== 'object') {
      return { v: 2, byCode: {} };
    }
    return stored;
  }

  // Record the official wording USCIS pairs with each action code, so bare
  // event codes elsewhere can be labeled in USCIS's own words rather than a
  // third party's guess. Stored locally like everything else.
  function harvestCodeText(result) {
    if (!result) return;
    var notice = result.receiptNotice;
    if (!notice || notice.__error || notice.__empty) return;

    var formType = pick(notice, FIELDS.receiptNotice.formType);
    if (formType === null) formType = pick(result.caseStatus, FIELDS.caseStatus.formType);
    var from = pick(notice, FIELDS.receiptNotice.receiptNumber);
    if (from === null) from = pick(result.caseStatus, FIELDS.caseStatus.receiptNumber);

    var dict = loadHarvest();
    var changed = false;

    function record(code, text) {
      var key = harvestKey(code, formType);
      if (!key || !text) return;
      var clean = stripHtml(String(text));
      if (!clean) return;
      var existing = dict.byCode[key];
      if (existing && existing.text === clean && existing.from === from) return;
      dict.byCode[key] = { text: clean, from: from === null ? null : String(from) };
      changed = true;
    }

    record(pick(notice, FIELDS.receiptNotice.actionCode), pick(notice, FIELDS.receiptNotice.status));

    var history = pick(notice, FIELDS.receiptNotice.history);
    if (Array.isArray(history)) {
      for (var i = 0; i < history.length; i++) {
        record(
          pick(history[i], FIELDS.historyItem.actionCode),
          pick(history[i], FIELDS.historyItem.text)
        );
      }
    }

    if (changed) save(STORAGE_KEYS.codeText, dict);
  }

  // Translate an event code for display, in the caller's own case's context.
  // Returns the source alongside the text so the UI can say where the words
  // came from. The raw code is always shown by the UI regardless.
  //
  // Order of trust: wording USCIS published for THIS case beats the federal
  // schema, which beats wording USCIS published for another of the user's
  // cases on the same form. That last tier stays below NIEM deliberately — it
  // is real USCIS prose, but it was written about a different case, and on a
  // tool whose job is reporting change it must never look like this case's
  // own status.
  function describeCode(code, formType, caseNumber) {
    if (!code) return null;
    var key = String(code).toUpperCase();

    var harvested = loadHarvest().byCode[harvestKey(code, formType)] || null;
    if (harvested && caseNumber && harvested.from === String(caseNumber)) {
      return { text: harvested.text, source: 'uscis' };
    }
    // The official federal schema (NIEM). These are USCIS's internal
    // operations phrases, so the UI labels them as a system description
    // rather than presenting them as the wording USCIS wrote to this person.
    if (codeTableLoaded()) {
      if (USCIS_CODE_MEANINGS[key]) {
        return { text: USCIS_CODE_MEANINGS[key], source: 'niem' };
      }
      if (harvested) {
        return { text: harvested.text, source: 'uscis-other' };
      }
      // Genuinely absent from the published schema — an honest unknown.
      return null;
    }

    // The dictionary itself failed to load. We cannot tell whether this code
    // has a published meaning, so we must not claim it has none. Reported as
    // 'unavailable' so the UI stays silent about meaning instead of printing
    // a confident denial that a correct build would never print.
    if (harvested) return { text: harvested.text, source: 'uscis-other' };
    return { text: null, source: 'unavailable' };
  }

  // Whether the event-code dictionary is present. The build concatenates
  // core/uscis-codes.js ahead of this file; if that ever breaks, every code
  // would otherwise degrade into "no published meaning" — turning a packaging
  // fault into a false statement about the user's case. Warn once, loudly.
  var warnedMissingCodeTable = false;
  function codeTableLoaded() {
    var present = (typeof USCIS_CODE_MEANINGS !== 'undefined') &&
      USCIS_CODE_MEANINGS && typeof USCIS_CODE_MEANINGS === 'object';
    if (!present && !warnedMissingCodeTable) {
      warnedMissingCodeTable = true;
      if (window.console && window.console.warn) {
        window.console.warn('[CaseLens] Event-code dictionary (core/uscis-codes.js) is not loaded. ' +
          'Event codes will be shown without descriptions rather than being reported as having none.');
      }
    }
    return present;
  }

  // ==========================================================================
  // SECTION 5: Derived display helpers  (implemented by agent A — pure functions)
  // ==========================================================================
  // relativeDate(iso) -> "2 days ago" | "in 3 months" | '' (coarse units)
  // parseEstimateMonths(processingTimes) -> number|null ("X Months" patterns in
  //   estimatedTimeframe/processingTime/rangeText/range fields)
  // progressInfo(receivedDateIso, months) -> { pct, etaText }|null (pct clamped 0-100)
  // redactNumber(n) -> 'IOE09•••••678' style mask
  // summaryText(entry) -> plain-text case summary for clipboard (honors prefs.redact)
  // extractUscisEvents(result) -> [{ source, at, code, text }] merged event list
  // summarize* helpers (caseStatus/location/receiptNotice/processingTimes/documents)
  //   via pick() candidate keys — see plan; always null-safe.

  // --------------------------------------------------------------------------
  // DAY ARITHMETIC — one definition of "a day", used by everything.
  //
  // A day here is a calendar day, local midnight to local midnight, because
  // this is a tool for people counting days on a calendar. Two helpers that
  // each rounded a millisecond delta their own way is how the same date came
  // to print "30 days ago" in one line and "29 days ago" in the next, and how
  // "Day N" gained an off-by-one across a daylight-saving boundary.
  // --------------------------------------------------------------------------
  var MS_PER_DAY = 24 * 60 * 60 * 1000;

  function startOfLocalDay(ms) {
    var d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }

  function endOfLocalDay(ms) {
    var d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
  }

  function sameLocalDay(a, b) {
    if (a === null || b === null) return false;
    return startOfLocalDay(a) === startOfLocalDay(b);
  }

  // Whole calendar days from one instant to another; negative when `toMs` is
  // the earlier of the two. The only day-difference function in this file.
  function daysBetween(fromMs, toMs) {
    return Math.round((startOfLocalDay(toMs) - startOfLocalDay(fromMs)) / MS_PER_DAY);
  }

  // Calendar days between a date USCIS gave us and today, or null when the
  // value is unusable. Negative for a date in the future.
  function daysSince(value) {
    var ms = parseUscisDate(value);
    if (ms === null) return null;
    return daysBetween(ms, new Date().getTime());
  }

  // Coarse, human-friendly relative time for the panel's own clock — when we
  // last checked, when we last looked. Below a day it reports elapsed time;
  // from a day up it counts calendar days like everything else.
  function relativeDate(iso) {
    if (!iso) return '';
    var ms = parseUscisDate(iso);
    if (ms === null) return '';

    var now = new Date().getTime();
    var diffMs = now - ms;
    var future = diffMs < 0;
    var absSeconds = Math.abs(diffMs) / 1000;

    function phrase(value, unit) {
      var word = value === 1 ? unit : unit + 's';
      return future ? ('in ' + value + ' ' + word) : (value + ' ' + word + ' ago');
    }

    if (absSeconds < 60) return future ? 'in a moment' : 'just now';

    var absMinutes = absSeconds / 60;
    if (absMinutes < 60) return phrase(Math.round(absMinutes), 'minute');

    var absHours = absMinutes / 60;
    if (absHours < 24) return phrase(Math.round(absHours), 'hour');

    var absDays = Math.abs(daysBetween(ms, now));
    if (absDays <= 60) return phrase(absDays, 'day');

    var absMonths = Math.round(absDays / 30.4);
    if (absMonths < 24) return phrase(absMonths, 'month');

    return phrase(Math.round(absDays / 365), 'year');
  }

  // Extract an estimated processing time in months from whatever shape the
  // processing-times endpoint happens to return. Undocumented API, so we try
  // a structured { range: { value, unit } } shape first, then fall back to
  // regexing "X months" out of free-text fields.
  function parseEstimateMonths(processingTimes) {
    if (!processingTimes || processingTimes.__error || processingTimes.__empty) return null;

    if (processingTimes.range && typeof processingTimes.range === 'object') {
      var value = processingTimes.range.value;
      var unit = processingTimes.range.unit;
      if (typeof value === 'number' && typeof unit === 'string' && /month/i.test(unit)) {
        return value;
      }
    }

    var text = pick(processingTimes, FIELDS.processingTimes.estimate);
    if (typeof text !== 'string') return null;

    var match = text.match(/([\d.]+)\s*month/i);
    if (!match) return null;

    var months = parseFloat(match[1]);
    return isNaN(months) ? null : months;
  }

  // How far this case is through the range USCIS itself published for it.
  // Returns a percentage and nothing else: this function once also returned a
  // projected decision month, which is the predicted date the whole tool is
  // built to refuse, and it was one caller away from being printed.
  function progressInfo(receivedDateIso, months) {
    if (!receivedDateIso || typeof months !== 'number' || !(months > 0)) return null;

    var received = parseUscisDate(receivedDateIso);
    if (received === null) return null;

    var elapsedDays = daysBetween(received, new Date().getTime());
    var pct = Math.round((elapsedDays / (months * 30.4)) * 100);
    if (pct < 0) pct = 0;
    if (pct > 100) pct = 100;

    return { pct: pct };
  }

  // Mask the middle of a case number for screen-sharing safety, e.g.
  // "IOE091234567890" -> "IOE09•••••890". Numbers too short to usefully
  // redact are returned unchanged.
  function redactNumber(n) {
    if (typeof n !== 'string' || n.length < 10) return n;
    return n.slice(0, 5) + '•••••' + n.slice(-3);
  }

  // "Hide receipt numbers" is used before sharing a screenshot, so it has to
  // cover the raw JSON too — that payload carries the applicant's and
  // representative's names as well as the receipt number, and masking the
  // card heading while leaving them visible one click away defeats the point.
  function redactRawJson(text) {
    if (!state.prefs || !state.prefs.redact) return text;
    if (typeof text !== 'string') return text;

    return text
      .replace(/[A-Z]{3}[0-9]{10}/g, function (n) { return redactNumber(n); })
      .replace(/("(?:applicantName|representativeName)"\s*:\s*)"[^"]*"/g, '$1"[hidden]"');
  }

  // Case number as it should be shown in the UI, honoring the user's redact
  // preference.
  function displayNumber(n) {
    if (state.prefs && state.prefs.redact) return redactNumber(n);
    return n;
  }

  // Plain-text summary of one case, suitable for copying to clipboard (e.g.
  // to paste into an email to a lawyer). Skips any line whose data is
  // missing rather than showing "null" or "undefined".
  function summaryText(entry) {
    var lines = [];
    if (entry.label) lines.push(entry.label);
    lines.push(displayNumber(entry.number));

    var result = entry.result;
    var detail = result ? summarizeCaseStatus(result.caseStatus) : null;
    var notice = result ? summarizeReceiptNotice(result.receiptNotice) : null;
    var processing = result ? summarizeProcessingTimes(result.processingTimes) : null;

    if (detail && (detail.formType || detail.formName)) {
      lines.push('Form: ' + [detail.formType, detail.formName].filter(Boolean).join(' — '));
    }
    if (notice && notice.status) {
      lines.push('Status: ' + notice.status);
    }
    if (notice && notice.actionCodeDate) {
      lines.push('Status date: ' + formatDate(notice.actionCodeDate));
    }
    if (detail && detail.submissionDate) {
      var filedDays = daysSince(detail.submissionDate);
      lines.push('Filed: ' + formatDate(detail.submissionDate) +
        (filedDays !== null ? ' (' + filedDays + ' days ago)' : ''));
    }
    if (detail && detail.backendUpdatedAt) {
      lines.push('Record last updated: ' + formatDate(detail.backendUpdatedAt));
    }
    if (notice && notice.office) {
      lines.push('Office: ' + notice.office);
    }
    if (processing && processing.estimate) {
      lines.push('Processing estimate: ' + processing.estimate);
    }

    lines.push('via CaseLens (local, unofficial)');

    return lines.join('\n');
  }

  // Short absolute date, e.g. "Jul 9, 2026". Returns '' when unparseable.
  function formatDate(value) {
    var ms = parseUscisDate(value);
    if (ms === null) return '';
    var d = new Date(ms);
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  // USCIS's history entries use "MM-DD-YYYY HH:mm:ss", which no browser parses
  // consistently. Everything else is ISO. This handles both and returns a
  // timestamp in milliseconds, or null when the value is unusable.
  function parseUscisDate(value) {
    if (!value) return null;

    // USCIS sends calendar dates two ways: bare "2026-05-29", and the same day
    // as UTC midnight ("2026-05-29T00:00:00.000Z"). Both mean a date, not an
    // instant. Parsing them as UTC and then rendering in the viewer's zone
    // moves them a day backwards anywhere west of Greenwich — which showed a
    // case filed May 29 as "filed May 28" and shifted every day count by one.
    // Build these as local dates so the calendar day survives.
    if (typeof value === 'string') {
      var dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.000)?Z)?$/);
      if (dateOnly) {
        var local = new Date(+dateOnly[1], +dateOnly[2] - 1, +dateOnly[3]);
        return isNaN(local.getTime()) ? null : local.getTime();
      }
    }
    if (typeof value !== 'string') {
      var direct = new Date(value);
      return isNaN(direct.getTime()) ? null : direct.getTime();
    }

    var m = value.match(/^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/);
    if (m) {
      var parsed = new Date(
        parseInt(m[3], 10),
        parseInt(m[1], 10) - 1,
        parseInt(m[2], 10),
        m[4] ? parseInt(m[4], 10) : 0,
        m[5] ? parseInt(m[5], 10) : 0,
        m[6] ? parseInt(m[6], 10) : 0
      );
      return isNaN(parsed.getTime()) ? null : parsed.getTime();
    }

    var iso = new Date(value);
    return isNaN(iso.getTime()) ? null : iso.getTime();
  }

  // Every event USCIS gives us for a case, from two sources of differing
  // richness, tagged with provenance so the UI can be honest about where each
  // line came from:
  //   'status'  — dated entry with USCIS's own wording (historicalCaseStatuses)
  //   'event'   — coded machine event, text only if we can translate the code
  //   'notice'  — a generated notice or scheduled appointment
  // Not sorted here; the UI orders them.
  function extractUscisEvents(result) {
    var events = [];
    if (!result) return events;

    // Both are the scope describeCode() resolves a code within, and both must
    // be what USCIS reported: result.formTypeUsed may be DEFAULT_FORM_TYPE,
    // which exists to build a URL and is not a fact about this case.
    var formType = pick(result.caseStatus, FIELDS.caseStatus.formType);
    if (formType === null) formType = pick(result.receiptNotice, FIELDS.receiptNotice.formType);
    var caseNumber = pick(result.caseStatus, FIELDS.caseStatus.receiptNumber);
    if (caseNumber === null) caseNumber = pick(result.receiptNotice, FIELDS.receiptNotice.receiptNumber);

    var notice = result.receiptNotice;
    if (notice && !notice.__error && !notice.__empty) {
      var history = pick(notice, FIELDS.receiptNotice.history);
      if (Array.isArray(history)) {
        for (var i = 0; i < history.length; i++) {
          var h = history[i];
          var hText = pick(h, FIELDS.historyItem.text);
          events.push({
            source: 'status',
            at: parseUscisDate(pick(h, FIELDS.historyItem.date)),
            code: pick(h, FIELDS.historyItem.actionCode),
            text: hText !== null ? stripHtml(String(hText)) : null,
            textSpanish: stripHtml(pick(h, FIELDS.historyItem.textSpanish) || ''),
            official: true
          });
        }
      }
    }

    var caseStatus = result.caseStatus;
    if (caseStatus && !caseStatus.__error && !caseStatus.__empty) {
      var raw = pick(caseStatus, FIELDS.caseStatus.events);
      if (Array.isArray(raw)) {
        for (var j = 0; j < raw.length; j++) {
          var e = raw[j];
          var code = pick(e, FIELDS.eventItem.code);
          var translated = describeCode(code, formType, caseNumber);
          events.push({
            source: 'event',
            at: parseUscisDate(pick(e, FIELDS.eventItem.date)),
            code: code !== null ? String(code) : null,
            text: translated ? translated.text : null,
            textSource: translated ? translated.source : null,
            official: !!(translated && translated.source === 'uscis')
          });
        }
      }

      var notices = pick(caseStatus, FIELDS.caseStatus.notices);
      if (Array.isArray(notices)) {
        for (var k = 0; k < notices.length; k++) {
          var n = notices[k];
          var appointmentAt = pick(n, FIELDS.noticeItem.appointmentAt);
          events.push({
            source: 'notice',
            at: parseUscisDate(pick(n, FIELDS.noticeItem.generatedAt)),
            code: null,
            text: flattenValue(pick(n, FIELDS.noticeItem.type)),
            appointmentAt: appointmentAt || null,
            official: true
          });
        }
      }
    }

    return events;
  }

  // The case-detail endpoint: what was filed, and when USCIS last touched it.
  function summarizeCaseStatus(data) {
    if (!data || data.__error || data.__empty) return null;
    return {
      receiptNumber: pick(data, FIELDS.caseStatus.receiptNumber),
      formType: pick(data, FIELDS.caseStatus.formType),
      formName: pick(data, FIELDS.caseStatus.formName),
      submissionDate: pick(data, FIELDS.caseStatus.submissionDate),
      backendUpdatedAt: pick(data, FIELDS.caseStatus.updatedAt),
      closed: pick(data, FIELDS.caseStatus.closed) === true,
      actionRequired: pick(data, FIELDS.caseStatus.actionRequired) === true,
      premium: pick(data, FIELDS.caseStatus.premium) === true,
      representativeName: pick(data, FIELDS.caseStatus.representativeName)
    };
  }

  // The case_status endpoint: official status wording, action code, office, and
  // the dated status history. This is the richest source we have.
  function summarizeReceiptNotice(data) {
    if (!data || data.__error || data.__empty) return null;

    var statusValue = pick(data, FIELDS.receiptNotice.status);
    var detailValue = pick(data, FIELDS.receiptNotice.statusDetail);
    var statusEs = pick(data, FIELDS.receiptNotice.statusSpanish);
    var detailEs = pick(data, FIELDS.receiptNotice.statusDetailSpanish);
    var history = pick(data, FIELDS.receiptNotice.history);

    return {
      receiptNumber: pick(data, FIELDS.receiptNotice.receiptNumber),
      formNumber: pick(data, FIELDS.receiptNotice.formType),
      status: statusValue !== null ? stripHtml(String(statusValue)) : null,
      statusDetail: detailValue !== null ? stripHtml(String(detailValue)) : null,
      statusSpanish: statusEs !== null ? stripHtml(String(statusEs)) : null,
      statusDetailSpanish: detailEs !== null ? stripHtml(String(detailEs)) : null,
      actionCode: pick(data, FIELDS.receiptNotice.actionCode),
      actionCodeDate: pick(data, FIELDS.receiptNotice.actionCodeDate),
      office: flattenValue(pick(data, FIELDS.receiptNotice.office)),
      historyCount: Array.isArray(history) ? history.length : 0
    };
  }

  // The secondary location endpoint. Usually returns nothing at all; the real
  // office name comes from the case_status jurisdiction instead.
  function summarizeLocation(data) {
    if (!data || data.__error || data.__empty) return null;
    return {
      office: flattenValue(pick(data, FIELDS.location.office)),
      address: flattenValue(pick(data, FIELDS.location.address))
    };
  }

  // Processing-time estimates. In practice this endpoint answers 204 with no
  // body, so callers must handle null and fall back to elapsed time.
  function summarizeProcessingTimes(data) {
    if (!data || data.__error || data.__empty) return null;
    var estimate = pick(data, FIELDS.processingTimes.estimate);
    var medianDays = pick(data, FIELDS.processingTimes.medianDays);
    if (estimate === null && medianDays === null) return null;
    return { estimate: estimate, medianDays: medianDays };
  }

  function summarizeDocuments(data) {
    var list = documentList(data);
    if (!list) return null;

    var out = [];
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      out.push({
        name: pick(item, FIELDS.documentItem.name),
        date: pick(item, FIELDS.documentItem.date),
        type: pick(item, FIELDS.documentItem.type),
        source: pick(item, FIELDS.documentItem.source),
        url: pick(item, FIELDS.documentItem.url)
      });
    }
    return out;
  }

  // ==========================================================================
  // SECTION 6: UI
  // ==========================================================================
  // Everything below builds DOM with createElement/createElementNS and
  // textContent only — there is no HTML string anywhere in this file, so a
  // hostile value coming back from an undocumented API can never become
  // markup. The design this implements lives in docs/design/ (SPEC.md is
  // binding); the two rules that shape most of it:
  //   1. Never show the user something we cannot derive from their own case
  //      data. No medians, no predicted dates, no synthesized percentages.
  //   2. Colour may encode state only from a structured boolean the API sent
  //      (actionRequired, closed) or from our own "changed since you looked"
  //      observation. Never from pattern-matching status prose.
  // --------------------------------------------------------------------------

  // Module-level UI state. None of this is persisted directly — it's either
  // derived from state/prefs (which are persisted) or purely transient
  // (drag-in-progress, popover open/closed, unsaved add-case form text).
  var ROOT = null;                 // the single fixed-position container in document.body
  var uiState = {
    settingsOpen: false,
    addNumberValue: '',
    addLabelValue: '',
    addError: null,               // validation message from the last failed submit
    addPendingNumber: null        // the number that failed validation, for "Add anyway"
  };
  var dragState = null;            // in-progress panel drag, or null
  var refreshTimerId = null;       // setInterval handle for periodic refreshAll()

  // ---- UI constants ---------------------------------------------------------

  // Stage sequences per form type (docs/design/03 §4.2). A stage owns a set of
  // action/event codes; a case sits at the highest stage any of its observed
  // codes maps to. Forms absent from this table get NO stage rail at all — we
  // do not guess a sequence for a form we have not verified.
  var STAGE_SEQUENCES = {
    'I-485': [
      { label: 'Recv', name: 'Received', codes: ['RCV0', 'H001', 'IAF', 'IAA'] },
      { label: 'Bio', name: 'Biometrics', codes: ['FNA', 'IMAF', 'FNB', 'MA70', 'H008', 'FNG', 'FNH'] },
      { label: 'Review', name: 'Under review', codes: ['FSA0', 'FTA0', 'FT0'] },
      { label: 'Intvw', name: 'Interview', codes: ['FH', 'FHB', 'FJ', 'IM', 'HG', 'FM'] },
      { label: 'Decision', name: 'Decision', codes: ['DA', 'DB', 'SA', 'APR0', 'IEA', 'IEC', 'IEE'] },
      { label: 'Card', name: 'Card produced', codes: ['LAA', 'LBA', 'LDA', 'LEA'] }
    ],
    'I-765': [
      { label: 'Recv', name: 'Received', codes: ['RCV0', 'H001', 'IAF', 'IAA'] },
      { label: 'Bio', name: 'Biometrics', codes: ['FNA', 'IMAF', 'FNB', 'MA70', 'H008', 'FNG', 'FNH'] },
      { label: 'Review', name: 'Under review', codes: ['FSA0', 'FTA0', 'FT0'] },
      { label: 'Approved', name: 'Approved', codes: ['DA', 'DB', 'SA', 'IEA', 'IEE'] },
      { label: 'Card', name: 'Card produced', codes: ['LAA', 'LBA', 'LDA', 'LEA'] }
    ],
    'I-131': [
      { label: 'Recv', name: 'Received', codes: ['RCV0', 'H001', 'IAF', 'IAA'] },
      { label: 'Bio', name: 'Biometrics', codes: ['FNA', 'IMAF', 'FNB', 'MA70', 'H008', 'FNG', 'FNH'] },
      { label: 'Review', name: 'Under review', codes: ['FSA0', 'FTA0', 'FT0'] },
      { label: 'Approved', name: 'Approved', codes: ['DA', 'DB', 'SA', 'IEA', 'IEE'] },
      { label: 'Document', name: 'Document produced', codes: ['LAA', 'LBA', 'LDA', 'LEA'] }
    ],
    'I-485J': [
      { label: 'Recv', name: 'Received', codes: ['RCV0', 'H001', 'IAF', 'IAA'] },
      { label: 'Review', name: 'Under review', codes: ['FSA0', 'FTA0', 'FT0'] },
      { label: 'Done', name: 'Reviewed', codes: ['DA', 'DB', 'SA'] }
    ]
  };

  // Supplement J legitimately shows nothing for months; say so rather than let
  // an all-quiet rail read as a stuck case.
  var STAGE_FOOTNOTES = {
    'I-485J': 'Supplement J often shows no visible movement at all until the underlying I-485 is decided.'
  };

  // Codes that mean USCIS may need something from the applicant, or that a
  // case has been held/denied. Used only to raise a factual banner — never to
  // characterise the outcome.
  var ATTENTION_CODES = {
    FBA: 1, IK: 1, II: 1, EA: 1, IFA: 1, LFA: 1, FKA: 1, FS: 1, KH: 1
  };

  var PROV_RANK = { official: 0, notice: 1, coded: 2, document: 3, local: 4, anchor: 5 };
  var DEDUPE_WINDOW_MS = 36 * 60 * 60 * 1000;   // official (day) x coded (second), same code
  var GAP_LABEL_MIN_DAYS = 14;
  var BACKEND_MIN_LAG_MS = 3 * 24 * 60 * 60 * 1000;  // §4.3: below 3 days it is noise
  var TIMELINE_FOLD = 4;                        // rows shown before "Show all"

  var MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  var WEEKDAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // ---- DOM helpers ----------------------------------------------------------

  // Build one DOM element without ever touching innerHTML. `attrs` keys:
  //   'class'      -> className
  //   'text'       -> textContent
  //   'checked'/'disabled'/'selected' -> set as a live DOM property (not
  //                   setAttribute) so falsy values actually clear the state
  //                   instead of leaving a stale/always-present attribute
  //   'value'      -> set as a live DOM property (works for <select> too)
  //   keys starting with 'on' + a function -> addEventListener
  //   anything else (title, type, placeholder, href, target, rel, ...) -> setAttribute
  // null/undefined attr values are skipped entirely. `children` may contain
  // strings (become text nodes), elements, or null/undefined (skipped) so
  // callers can inline conditional children without extra filtering.
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    var key;
    if (attrs) {
      for (key in attrs) {
        if (!attrs.hasOwnProperty(key)) continue;
        var value = attrs[key];
        if (value === null || value === undefined) continue;

        if (key === 'class') {
          node.className = value;
        } else if (key === 'text') {
          node.textContent = value;
        } else if (key.indexOf('on') === 0 && key.length > 2 && typeof value === 'function') {
          node.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (key === 'checked' || key === 'disabled' || key === 'selected') {
          node[key] = !!value;
        } else if (key === 'value') {
          node.value = value;
        } else {
          node.setAttribute(key, value);
        }
      }
    }
    if (children) {
      for (var i = 0; i < children.length; i++) {
        var child = children[i];
        if (child === null || child === undefined) continue;
        node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
      }
    }
    return node;
  }

  function clearNode(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  var SVG_NS = 'http://www.w3.org/2000/svg';

  // SVG elements need createElementNS and per-attribute setAttribute; el()
  // above would produce an HTML element of the same tag name that never paints.
  function svgTag(tag, attrs) {
    var node = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      for (var key in attrs) {
        if (attrs.hasOwnProperty(key)) node.setAttribute(key, String(attrs[key]));
      }
    }
    return node;
  }

  // Every glyph in the panel. Shapes carry NO fill=/stroke= attributes: a
  // presentation attribute loses to any author rule, and the host-CSS defence
  // in the stylesheet sets `svg * { fill: none; stroke: none }`. Paint comes
  // from .uscistr-ico (and the .uscistr-fill / -thin / -faint / -hair helper
  // classes) instead. See docs/design/02 §5.1 — this was learned the hard way.
  var ICONS = {
    // Timeline node glyphs — provenance is carried by SHAPE first, colour last.
    disc: { view: '0 0 12 12', shapes: [['circle', { cx: 6, cy: 6, r: 4, 'class': 'uscistr-fill' }]] },
    discRing: { view: '0 0 12 12', shapes: [
      ['circle', { cx: 6, cy: 6, r: 4, 'class': 'uscistr-fill' }],
      ['circle', { cx: 6, cy: 6, r: 5.25, 'class': 'uscistr-thin uscistr-faint' }]
    ] },
    ring: { view: '0 0 12 12', shapes: [['circle', { cx: 6, cy: 6, r: 3.75 }]] },
    ringDashed: { view: '0 0 12 12', shapes: [['circle', { cx: 6, cy: 6, r: 3.75, 'stroke-dasharray': '2.2 2' }]] },
    diamond: { view: '0 0 12 12', shapes: [['path', { d: 'M6 1.7 L10.3 6 L6 10.3 L1.7 6 Z' }]] },
    pulse: { view: '0 0 12 12', shapes: [
      ['circle', { cx: 6, cy: 6, r: 3, 'class': 'uscistr-fill' }],
      ['circle', { cx: 6, cy: 6, r: 5.4, 'class': 'uscistr-thin uscistr-faint' }]
    ] },
    cap: { view: '0 0 12 12', shapes: [['rect', { x: 2.5, y: 2.5, width: 7, height: 7, rx: 1.2, 'class': 'uscistr-fill' }]] },
    calendar: { view: '0 0 12 12', shapes: [
      ['rect', { x: 1.5, y: 2.5, width: 9, height: 8, rx: 1.5, 'class': 'uscistr-hair' }],
      ['path', { d: 'M1.5 5h9', 'class': 'uscistr-hair' }],
      ['path', { d: 'M4 1.5v2M8 1.5v2', 'class': 'uscistr-hair' }]
    ] },
    page: { view: '0 0 12 12', shapes: [
      ['path', { d: 'M2.5 1.5h4.2L9.5 4.3v6.2a.7.7 0 0 1-.7.7H2.5a.7.7 0 0 1-.7-.7V2.2a.7.7 0 0 1 .7-.7z', 'class': 'uscistr-hair' }],
      ['path', { d: 'M6.6 1.6v2.8h2.8', 'class': 'uscistr-hair' }]
    ] },
    alert: { view: '0 0 12 12', shapes: [
      ['path', { d: 'M6 1.6 11 10.4H1z', 'class': 'uscistr-hair' }],
      ['path', { d: 'M6 5v2.6', 'class': 'uscistr-hair' }],
      ['circle', { cx: 6, cy: 9.1, r: 0.75, 'class': 'uscistr-fill' }]
    ] },
    // Panel chrome.
    refresh: { view: '0 0 16 16', shapes: [
      ['path', { d: 'M13.4 8a5.4 5.4 0 1 1-1.6-3.8' }],
      ['path', { d: 'M13.5 2.3v3h-3' }]
    ] },
    gear: { view: '0 0 16 16', shapes: [
      ['circle', { cx: 8, cy: 8, r: 2.1 }],
      ['path', { d: 'M8 1.7v1.5M8 12.8v1.5M14.3 8h-1.5M3.2 8H1.7M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1M12.4 12.4l-1.1-1.1M4.7 4.7 3.6 3.6' }]
    ] },
    minimize: { view: '0 0 16 16', shapes: [['path', { d: 'M3.5 8h9' }]] },
    chevron: { view: '0 0 16 16', shapes: [['path', { d: 'M6 3.5 10.5 8 6 12.5' }]] },
    copy: { view: '0 0 16 16', shapes: [
      ['rect', { x: 5.6, y: 5.6, width: 8, height: 8, rx: 1.6 }],
      ['path', { d: 'M10.4 5.6v-1a1.6 1.6 0 0 0-1.6-1.6H4a1.6 1.6 0 0 0-1.6 1.6v4.8A1.6 1.6 0 0 0 4 11h1' }]
    ] },
    warning: { view: '0 0 16 16', shapes: [
      ['path', { d: 'M8 2.2 14.6 13.4H1.4z' }],
      ['path', { d: 'M8 6.4v3' }],
      ['circle', { cx: 8, cy: 11.6, r: 0.85, 'class': 'uscistr-fill' }]
    ] },
    doc: { view: '0 0 16 16', shapes: [
      ['path', { d: 'M3.4 2.6h5.2l4 4v6.8a1 1 0 0 1-1 1H3.4a1 1 0 0 1-1-1V3.6a1 1 0 0 1 1-1z' }],
      ['path', { d: 'M8.6 2.7v4h4' }]
    ] },
    search: { view: '0 0 16 16', shapes: [
      ['circle', { cx: 7, cy: 7, r: 4.4 }],
      ['path', { d: 'M10.3 10.3 14 14' }]
    ] },
    shield: { view: '0 0 16 16', shapes: [
      ['path', { d: 'M8 1.8 13.2 4v4.1c0 3-2.2 5.3-5.2 6.1-3-0.8-5.2-3.1-5.2-6.1V4z' }],
      ['path', { d: 'M5.9 8.1 7.4 9.6l2.8-3' }]
    ] }
  };

  function buildIcon(name) {
    var spec = ICONS[name];
    if (!spec) return null;
    var svg = svgTag('svg', {
      viewBox: spec.view,
      'class': 'uscistr-ico',
      'aria-hidden': 'true',
      focusable: 'false'
    });
    for (var i = 0; i < spec.shapes.length; i++) {
      svg.appendChild(svgTag(spec.shapes[i][0], spec.shapes[i][1]));
    }
    return svg;
  }

  function chip(text, variant, withDot) {
    var node = el('span', { 'class': 'uscistr-chip uscistr-chip-' + (variant || 'neutral') });
    if (withDot) node.appendChild(el('span', { 'class': 'uscistr-chip-dot' }));
    node.appendChild(document.createTextNode(text));
    return node;
  }

  function codeChip(code) {
    return el('span', { 'class': 'uscistr-code', text: String(code) });
  }

  function metaSep() {
    return el('span', { 'class': 'uscistr-muted', text: '·' });
  }

  // ---- STYLE ----------------------------------------------------------------
  // The complete visual system from docs/design/02-visual-system.md §6, plus
  // the timeline/stage-rail components from 03. Every rule is scoped under
  // .uscistr-root so this can be injected into any my.uscis.gov page without
  // leaking onto the host page — and, just as important, without the host
  // page's CSS leaking in: .uscistr-root sets `all: initial`, a universal
  // descendant reset neutralises inherited properties, and every component
  // rule carries >= 2 classes so it outranks both. Dark mode is the single
  // class .uscistr-dark on the root container.
  //
  // NEVER put transform / filter / backdrop-filter / contain / will-change on
  // .uscistr-root: each would make it a containing block for its
  // position:fixed children and break panel placement.
  var STYLE = CASELENS_STYLE;

  function injectStyle() {
    if (document.getElementById('uscistr-style')) return;
    var styleEl = document.createElement('style');
    styleEl.id = 'uscistr-style';
    styleEl.textContent = STYLE;
    document.head.appendChild(styleEl);
  }

  // ---- date + text helpers (display only) ----------------------------------

  // "July 18, 2026". The month is always spelled out: 07/18/2026 is genuinely
  // ambiguous to a large share of this audience, and these strings get pasted
  // into emails to attorneys.
  function formatDateFull(value) {
    var ms = parseUscisDate(value);
    if (ms === null) return '';
    var d = new Date(ms);
    return MONTHS_FULL[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  // "Jul 18" for the current year, "Jul 18, 2026" otherwise. Timeline meta only.
  function formatDayLabel(ms) {
    if (ms === null || ms === undefined) return '';
    var d = new Date(ms);
    if (isNaN(d.getTime())) return '';
    var base = formatDate(ms);
    if (d.getFullYear() === new Date().getFullYear()) {
      return base.replace(', ' + d.getFullYear(), '');
    }
    return base;
  }

  // "5:58 PM" in the viewer's own zone. Only ever called for values that
  // actually carried a time — never for day-precision entries.
  // The short zone label for this device, e.g. "EDT". USCIS sends appointments
  // as a real UTC instant, so rendering it in the local zone shows the very
  // same moment — naming the zone is what makes that unambiguous. If the label
  // reads PDT and the office is Eastern, the mismatch is visible instead of
  // silently misleading.
  function localZoneLabel(ms) {
    try {
      var parts = new Intl.DateTimeFormat('en-US', {
        timeZoneName: 'short', hour: 'numeric'
      }).formatToParts(new Date(ms));
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].type === 'timeZoneName') return parts[i].value;
      }
    } catch (e) {
      // Intl unavailable or unhappy — fall back to no label rather than guess.
    }
    return '';
  }

  function formatTimeOfDay(ms) {
    if (ms === null || ms === undefined) return '';
    var d = new Date(ms);
    if (isNaN(d.getTime())) return '';
    var hours = d.getHours();
    var suffix = hours >= 12 ? 'PM' : 'AM';
    var display = hours % 12;
    if (display === 0) display = 12;
    var mins = d.getMinutes();
    return display + ':' + (mins < 10 ? '0' + mins : mins) + ' ' + suffix;
  }

  function formatWeekday(ms) {
    var d = new Date(ms);
    if (isNaN(d.getTime())) return '';
    return WEEKDAYS_FULL[d.getDay()];
  }

  function plural(n, word) {
    return n + ' ' + word + (n === 1 ? '' : 's');
  }

  // "1 year, 22 days" — used only past the one-year mark, where "395 days"
  // stops being a number anyone can feel.
  function longDuration(days) {
    if (days < 365) return plural(days, 'day');
    var years = Math.floor(days / 365);
    var rest = days - years * 365;
    if (rest === 0) return plural(years, 'year');
    return plural(years, 'year') + ', ' + plural(rest, 'day');
  }

  function normalizeText(value) {
    return String(value === null || value === undefined ? '' : value)
      .toLowerCase().replace(/[\s.]+/g, ' ').trim();
  }

  // Middle-truncate a filename so both the case number and the part suffix
  // survive; a plain ellipsis at the end would hide the only part that differs.
  function middleTruncate(value, max) {
    var text = String(value);
    if (text.length <= max) return text;
    var head = Math.ceil((max - 1) / 2);
    var tail = Math.floor((max - 1) / 2);
    return text.slice(0, head) + '…' + text.slice(text.length - tail);
  }

  // What we can honestly say about one endpoint's response without having
  // stored the HTTP status: fetchJSON's own vocabulary, mapped back.
  function payloadStatus(payload) {
    if (payload === null || payload === undefined) return { text: 'not requested', variant: 'quiet' };
    if (payload.__auth) return { text: 'sign-in required', variant: 'warn' };
    if (payload.__error) {
      var matched = String(payload.__error).match(/HTTP (\d{3})/);
      if (matched) return { text: 'HTTP ' + matched[1], variant: 'danger' };
      if (String(payload.__error).indexOf('No data at this endpoint') === 0) return { text: 'HTTP 404', variant: 'warn' };
      if (String(payload.__error).indexOf('not valid JSON') !== -1) return { text: 'unreadable body', variant: 'danger' };
      if (String(payload.__error).indexOf('Network error') === 0) return { text: 'no response', variant: 'danger' };
      return { text: 'error', variant: 'danger' };
    }
    // Answered, with nothing in it: either a 204 or a null data envelope.
    // We did not record which, so the chip does not claim one.
    if (payload.__empty) return { text: 'no content', variant: 'quiet' };
    return { text: 'HTTP 200', variant: 'neutral' };
  }

  function payloadFailed(payload) {
    return !!(payload && payload.__error);
  }

  // The two endpoints a card is made of. Everything else is supplementary;
  // losing both of these is losing the case for this check.
  function coreSourcesFailed(result) {
    return payloadFailed(result.caseStatus) && payloadFailed(result.receiptNotice);
  }

  // ---- panel positioning / dragging ----------------------------------------

  // Keep at least a sliver of the header on-screen no matter how far the
  // panel was dragged, and never let it be dragged fully off any edge.
  function clampPanelPos(x, y) {
    var minVisible = 80;
    var headerH = 46;
    var maxX = window.innerWidth - minVisible;
    var minX = -(400 - minVisible);
    var maxY = window.innerHeight - headerH;
    if (x > maxX) x = maxX;
    if (x < minX) x = minX;
    if (y < 0) y = 0;
    if (y > maxY) y = maxY;
    return { x: x, y: y };
  }

  function positionPanel(panel) {
    var pos = state.prefs.panelPos;
    if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
      var clamped = clampPanelPos(pos.x, pos.y);
      panel.style.left = clamped.x + 'px';
      panel.style.top = clamped.y + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    }
    // Otherwise the stylesheet's default (bottom-right) stands.
  }

  function startDrag(e) {
    // Let header buttons (refresh/settings/minimize) handle their own clicks.
    if (e.target && e.target.closest && e.target.closest('button')) return;
    var panel = e.currentTarget.parentNode;
    var rect = panel.getBoundingClientRect();
    dragState = { startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top, panel: panel };
    panel.className = 'uscistr-panel uscistr-is-dragging';
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
    e.preventDefault();
  }

  function onDragMove(e) {
    if (!dragState) return;
    var x = dragState.origX + (e.clientX - dragState.startX);
    var y = dragState.origY + (e.clientY - dragState.startY);
    var clamped = clampPanelPos(x, y);
    dragState.panel.style.left = clamped.x + 'px';
    dragState.panel.style.top = clamped.y + 'px';
    dragState.panel.style.right = 'auto';
    dragState.panel.style.bottom = 'auto';
  }

  function onDragEnd() {
    if (!dragState) return;
    var rect = dragState.panel.getBoundingClientRect();
    dragState.panel.className = 'uscistr-panel';
    state.prefs.panelPos = { x: rect.left, y: rect.top };
    persistPrefs();
    dragState = null;
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
  }

  // ---- launcher pill --------------------------------------------------------

  function changedCaseCount() {
    var count = 0;
    for (var i = 0; i < state.cases.length; i++) {
      if (state.cases[i].changedSince) count++;
    }
    return count;
  }

  function brandMark(className) {
    var mark = el('div', { 'class': className });
    // Inline style beats the universal reset's `background: none` — this is
    // the one place the sheet expects an inline paint (02 §5.1).
    mark.style.background = 'linear-gradient(140deg, #2C7A75 0%, #14403E 100%)';
    return mark;
  }

  function buildPill() {
    var changed = changedCaseCount();
    var children = [
      brandMark('uscistr-pill-mark'),
      el('span', { 'class': 'uscistr-pill-label uscistr-brand-name', text: 'CaseLens' })
    ];
    if (state.cases.length) {
      children.push(el('span', { 'class': 'uscistr-pill-count', text: String(state.cases.length) }));
    }
    if (changed > 0) {
      children.push(el('span', { 'class': 'uscistr-pill-dot' }));
    }
    return el('button', {
      'class': 'uscistr-pill',
      type: 'button',
      title: changed > 0
        ? 'Open CaseLens (Alt+U) — ' + plural(changed, 'case') + ' changed since you last looked'
        : 'Open CaseLens (Alt+U)',
      'aria-label': 'Open CaseLens',
      onclick: function () {
        state.prefs.collapsed = false;
        persistPrefs();
        render();
      }
    }, children);
  }

  // ---- panel: header, banner, add-case form, empty state, footer ------------

  function iconButton(iconName, label, onClick, extraClass) {
    var btn = el('button', {
      'class': 'uscistr-icon-btn' + (extraClass ? ' ' + extraClass : ''),
      type: 'button',
      title: label,
      'aria-label': label,
      onclick: onClick
    });
    var icon = buildIcon(iconName);
    if (icon) btn.appendChild(icon);
    return btn;
  }

  function anyCaseLoading() {
    for (var i = 0; i < state.cases.length; i++) {
      if (state.cases[i].loading) return true;
    }
    return false;
  }

  // Newest check that actually returned something. A failed attempt is not a
  // check: reporting one as "checked just now" tells someone their cases were
  // looked at when nothing was learned.
  function newestFetchedAt() {
    var newest = null;
    for (var i = 0; i < state.cases.length; i++) {
      var result = state.cases[i].result;
      if (!result || !result.succeededAt) continue;
      var ms = parseUscisDate(result.succeededAt);
      if (ms !== null && (newest === null || ms > newest)) newest = ms;
    }
    if (newest !== null) return newest;

    // Nothing succeeded this session; fall back to the stored snapshots, which
    // are only ever written from a successful read.
    var snapshots = load(STORAGE_KEYS.snapshots, {});
    for (var key in snapshots) {
      if (!snapshots.hasOwnProperty(key) || !snapshots[key]) continue;
      var snapMs = parseUscisDate(snapshots[key].at);
      if (snapMs !== null && (newest === null || snapMs > newest)) newest = snapMs;
    }
    return newest;
  }

  // Cases whose most recent attempt failed outright.
  function failedCaseCount() {
    var failed = 0;
    for (var i = 0; i < state.cases.length; i++) {
      var entry = state.cases[i];
      if (entry.loading || !entry.result) continue;
      if (!entry.result.succeededAt) failed++;
    }
    return failed;
  }

  // One line answering "anything new anywhere?" before the user reads a card.
  function headerSubtitle() {
    if (!state.cases.length) return 'No cases tracked yet';
    var parts = [plural(state.cases.length, 'case')];
    var changed = changedCaseCount();
    var failed = failedCaseCount();
    var newest = newestFetchedAt();

    // "nothing new" is a claim about the cases. It may only be made when we
    // actually heard back. When checks failed we learned nothing, which is a
    // different statement and has to read differently.
    if (changed > 0) {
      parts.push(changed + ' with something new');
    } else if (failed > 0) {
      parts.push("couldn't check " + failed);
    } else if (newest !== null) {
      parts.push('nothing new');
    }

    if (anyCaseLoading()) {
      parts.push('checking now');
    } else if (failed > 0) {
      parts.push(newest !== null
        ? 'last successful check ' + relativeDate(new Date(newest).toISOString())
        : 'not checked yet');
    } else if (newest !== null) {
      parts.push('checked ' + relativeDate(new Date(newest).toISOString()));
    }
    return parts.join(' · ');
  }

  function buildHeader() {
    var refreshBtn = iconButton('refresh', 'Refresh all cases', function (e) {
      e.stopPropagation();
      refreshAll();
    }, anyCaseLoading() ? 'uscistr-is-busy' : null);

    var gearBtn = iconButton('gear', 'Settings', function (e) {
      e.stopPropagation();
      uiState.settingsOpen = !uiState.settingsOpen;
      render();
    }, uiState.settingsOpen ? 'uscistr-is-on' : null);
    // The outside-click handler runs on mousedown, before this click fires.
    // Without this marker it would close the popover a moment before the gear
    // reopened it, and the button would never appear to toggle off.
    gearBtn.setAttribute('data-uscistr-settings-toggle', '1');

    var minBtn = iconButton('minimize', 'Minimize', function (e) {
      e.stopPropagation();
      state.prefs.collapsed = true;
      persistPrefs();
      render();
    });

    return el('div', { 'class': 'uscistr-header', onmousedown: startDrag }, [
      el('div', { 'class': 'uscistr-brand' }, [
        brandMark('uscistr-mark'),
        el('div', { 'class': 'uscistr-titles' }, [
          el('div', { 'class': 'uscistr-title uscistr-brand-name', text: 'CaseLens' }),
          el('div', { 'class': 'uscistr-subtitle', text: headerSubtitle() })
        ])
      ]),
      el('span'),
      el('div', { 'class': 'uscistr-header-actions' }, [refreshBtn, gearBtn, minBtn])
    ]);
  }

  function banner(variant, iconName, title, lines, actions) {
    var body = el('div', { 'class': 'uscistr-banner-body' }, [
      el('div', { 'class': 'uscistr-banner-title', text: title })
    ]);
    for (var i = 0; i < lines.length; i++) {
      if (!lines[i]) continue;
      body.appendChild(el('div', { 'class': 'uscistr-banner-text', text: lines[i] }));
    }
    var wrap = el('div', {
      'class': 'uscistr-banner' + (variant ? ' uscistr-banner-' + variant : ''),
      role: 'status'
    });
    var icon = buildIcon(iconName);
    wrap.appendChild(icon || el('span'));
    wrap.appendChild(body);
    wrap.appendChild(actions || el('span'));
    return wrap;
  }

  // Three jobs, in order: name the cause, say it is neither the user's fault
  // nor a data loss, give exactly one action.
  function buildSessionBanner() {
    var actions = el('div', { 'class': 'uscistr-banner-actions' }, [
      el('button', {
        'class': 'uscistr-btn uscistr-btn-sm', type: 'button', text: 'Refresh',
        onclick: function () { refreshAll(); }
      })
    ]);
    return banner('', 'warning', 'Your USCIS sign-in has timed out.', [
      'This happens on the USCIS site too, after a period of inactivity.',
      'Your saved cases and history are safe in this browser.',
      'Sign in again at my.uscis.gov, then choose Refresh.'
    ], actions);
  }

  function addCase(number, label) {
    for (var i = 0; i < state.cases.length; i++) {
      if (state.cases[i].number === number) return; // duplicate: skip silently
    }
    state.cases.push({
      number: number,
      label: label,
      addedAt: new Date().toISOString(),
      result: null,
      loading: false,
      changedSince: false
    });
    // Adding a case back is an explicit undo of any earlier removal.
    setDismissed(number, false);
    persistCases();
    uiState.addNumberValue = '';
    uiState.addLabelValue = '';
    uiState.addError = null;
    uiState.addPendingNumber = null;
    render();
    refreshCase(number);
  }

  function handleAddCase(rawNumber, rawLabel) {
    var number = (rawNumber || '').trim().toUpperCase();
    var label = (rawLabel || '').trim();
    if (!number) return;

    if (!CASE_NUMBER_RE.test(number)) {
      // Not a hard block: USCIS has issued other prefixes, and a person
      // holding a receipt notice knows better than this regular expression.
      uiState.addNumberValue = number;
      uiState.addLabelValue = label;
      // Don't claim receipt numbers always start with IOE — paper-filed cases
      // use EAC, WAC, LIN, SRC, MSC, YSC and others. Those are real receipt
      // numbers; they just live in a system these endpoints can't reach.
      uiState.addError = 'That does not look like a receipt number. A receipt number is 13 characters: ' +
        'three letters and ten digits, like IOE0912345678, printed on your I-797C notice.';
      uiState.addPendingNumber = number;
      render();
      return;
    }
    addCase(number, label);
  }

  function buildAddCaseForm() {
    var numberInput = el('input', {
      'class': 'uscistr-input uscistr-mono' + (uiState.addError ? ' uscistr-is-invalid' : ''),
      type: 'text',
      placeholder: 'IOE receipt number',
      'aria-label': 'Receipt number',
      value: uiState.addNumberValue,
      oninput: function (e) { uiState.addNumberValue = e.target.value; }
    });
    var labelInput = el('input', {
      'class': 'uscistr-input', type: 'text', placeholder: 'Nickname (optional)',
      'aria-label': 'Nickname for this case',
      value: uiState.addLabelValue,
      oninput: function (e) { uiState.addLabelValue = e.target.value; }
    });
    var addBtn = el('button', { 'class': 'uscistr-btn uscistr-btn-primary', type: 'submit', text: 'Add' });

    var form = el('form', {
      'class': 'uscistr-add-form',
      onsubmit: function (e) {
        e.preventDefault();
        handleAddCase(numberInput.value, labelInput.value);
      }
    }, [numberInput, labelInput, addBtn]);

    if (uiState.addError) {
      form.appendChild(el('div', { 'class': 'uscistr-add-error' }, [
        el('div', { 'class': 'uscistr-field-error', text: uiState.addError }),
        el('button', {
          'class': 'uscistr-btn uscistr-btn-sm uscistr-btn-outline', type: 'button', text: 'Add anyway',
          onclick: function () {
            addCase(uiState.addPendingNumber, (uiState.addLabelValue || '').trim());
          }
        })
      ]));
    }
    return form;
  }

  // Never "0 cases" and never "you have none": a person logged into USCIS who
  // is told they have no cases reads it as their case being gone.
  function buildEmptyState() {
    var wrap = el('div', { 'class': 'uscistr-empty' });
    var iconWrap = el('div', { 'class': 'uscistr-empty-icon' });
    var icon = buildIcon('search');
    if (icon) iconWrap.appendChild(icon);
    wrap.appendChild(iconWrap);
    wrap.appendChild(el('div', { 'class': 'uscistr-empty-title', text: 'No cases found on your account yet.' }));
    wrap.appendChild(el('div', {
      'class': 'uscistr-empty-text',
      text: "If you know a receipt number, add it above — it's the 13-character code starting with IOE on your I-797C notice from USCIS."
    }));
    return wrap;
  }

  function exportBackup() {
    var payload = {
      version: VERSION,
      exportedAt: new Date().toISOString(),
      cases: load(STORAGE_KEYS.cases, []),
      snapshots: load(STORAGE_KEYS.snapshots, {}),
      history: load(STORAGE_KEYS.history, {}),
      prefs: load(STORAGE_KEYS.prefs, {})
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var dateStr = new Date().toISOString().slice(0, 10);
    var a = el('a', { href: url, download: 'caselens-backup-' + dateStr + '.json' });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function parseDateSafe(iso) {
    if (!iso) return null;
    var t = new Date(iso).getTime();
    return isNaN(t) ? null : t;
  }

  // Merge an imported backup into localStorage: union cases by number (never
  // overwrite an existing label), concat + dedupe history per case by
  // at+kind+to, keep existing snapshots unless a case has none locally, and
  // ignore imported prefs entirely (a restored backup shouldn't silently
  // change this browser's dark-mode/notify/redact settings).
  function mergeImport(parsed) {
    if (!parsed || typeof parsed !== 'object') {
      window.alert('That file does not look like a CaseLens backup.');
      return;
    }

    var i, key;

    var byNumber = {};
    var existingCases = load(STORAGE_KEYS.cases, []);
    for (i = 0; i < existingCases.length; i++) byNumber[existingCases[i].number] = existingCases[i];
    var importedCases = Array.isArray(parsed.cases) ? parsed.cases : [];
    for (i = 0; i < importedCases.length; i++) {
      var c = importedCases[i];
      if (!c || !isValidReceiptNumber(c.number)) continue;
      if (!byNumber[c.number]) {
        byNumber[c.number] = {
          number: c.number,
          label: typeof c.label === 'string' ? c.label : '',
          addedAt: c.addedAt || new Date().toISOString()
        };
      }
    }
    var mergedCases = [];
    for (key in byNumber) { if (byNumber.hasOwnProperty(key)) mergedCases.push(byNumber[key]); }
    save(STORAGE_KEYS.cases, mergedCases);

    var existingHistory = load(STORAGE_KEYS.history, {});
    var importedHistory = (parsed.history && typeof parsed.history === 'object') ? parsed.history : {};
    var mergedHistory = {};
    for (key in existingHistory) {
      if (existingHistory.hasOwnProperty(key) && Array.isArray(existingHistory[key])) {
        mergedHistory[key] = existingHistory[key].slice();
      }
    }
    for (key in importedHistory) {
      if (!importedHistory.hasOwnProperty(key)) continue;
      if (!isValidReceiptNumber(key)) continue;
      var incoming = Array.isArray(importedHistory[key]) ? importedHistory[key] : [];
      var combined = (mergedHistory[key] || []).concat(incoming);
      var seen = {};
      var deduped = [];
      for (i = 0; i < combined.length; i++) {
        var h = combined[i];
        if (!h) continue;
        var dedupeKey = h.at + '|' + h.kind + '|' + h.to;
        if (seen[dedupeKey]) continue;
        seen[dedupeKey] = true;
        deduped.push(h);
      }
      deduped.sort(function (a, b) {
        var ta = parseDateSafe(a.at), tb = parseDateSafe(b.at);
        if (ta === null && tb === null) return 0;
        if (ta === null) return 1;
        if (tb === null) return -1;
        return tb - ta;
      });
      if (deduped.length > HISTORY_CAP) deduped = deduped.slice(0, HISTORY_CAP);
      mergedHistory[key] = deduped;
    }
    save(STORAGE_KEYS.history, mergedHistory);

    var existingSnapshots = load(STORAGE_KEYS.snapshots, {});
    var importedSnapshots = (parsed.snapshots && typeof parsed.snapshots === 'object') ? parsed.snapshots : {};
    var mergedSnapshots = {};
    for (key in importedSnapshots) {
      if (importedSnapshots.hasOwnProperty(key) && isValidReceiptNumber(key)) {
        mergedSnapshots[key] = importedSnapshots[key];
      }
    }
    for (key in existingSnapshots) { if (existingSnapshots.hasOwnProperty(key)) mergedSnapshots[key] = existingSnapshots[key]; }
    save(STORAGE_KEYS.snapshots, mergedSnapshots);

    // prefs: intentionally not merged/imported.

    loadAll();
    render();
    refreshAll();
  }

  function importBackup(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var parsed;
      try {
        parsed = JSON.parse(reader.result);
      } catch (e) {
        window.alert('That file is not valid JSON.');
        return;
      }
      mergeImport(parsed);
    };
    reader.onerror = function () {
      window.alert('Could not read that file.');
    };
    reader.readAsText(file);
  }

  // Always present, never dismissible: the panel is a mirror, and it says so.
  function buildStandingDisclaimer() {
    return el('div', {
      'class': 'uscistr-standing',
      text: 'Unofficial tool. Not USCIS, not legal advice. my.uscis.gov is the authority on your case — if this panel and that site disagree, believe the site.'
    });
  }

  function buildFooter() {
    var exportBtn = el('button', {
      'class': 'uscistr-btn uscistr-btn-sm', type: 'button', text: 'Export', onclick: exportBackup
    });
    var fileInput = el('input', {
      type: 'file', accept: 'application/json', 'class': 'uscistr-hidden-file',
      onchange: function (e) {
        var file = e.target.files && e.target.files[0];
        if (file) importBackup(file);
        e.target.value = '';
      }
    });
    var importBtn = el('button', {
      'class': 'uscistr-btn uscistr-btn-sm', type: 'button', text: 'Import',
      onclick: function () { fileInput.click(); }
    });

    var left = el('div', { 'class': 'uscistr-footer-left' }, [
      // The persistent line is the authority statement, not the privacy one.
      // This panel reads an undocumented API and normalises some of its
      // quirks — notably dates, which USCIS sends in more than one shape. If
      // USCIS changes those shapes, our handling could be the thing that is
      // wrong. Whoever is reading this needs to know, at all times and without
      // scrolling, which source wins. The privacy claim is in the tooltip and
      // stated at length in the README.
      el('span', {
        'class': 'uscistr-truncate',
        title: 'CaseLens is unofficial and reads an undocumented USCIS API. Dates and ' +
          'labels are interpreted from that data and can be wrong. Your mailed notices ' +
          'and my.uscis.gov are authoritative. Everything this panel stores stays in ' +
          'this browser; it talks only to my.uscis.gov.',
        text: 'Unofficial · your USCIS notices are authoritative'
      })
    ]);
    var right = el('div', { 'class': 'uscistr-footer-right' }, [
      exportBtn, importBtn, fileInput,
      el('span', { 'class': 'uscistr-footer-sep', text: '|' }),
      el('span', { 'class': 'uscistr-version', text: 'v' + VERSION })
    ]);
    return el('div', { 'class': 'uscistr-footer' }, [left, right]);
  }

  // ---- settings popover -----------------------------------------------------

  function switchRow(labelText, description, checked, onToggle) {
    var toggle = el('button', {
      'class': 'uscistr-switch',
      type: 'button',
      role: 'switch',
      'aria-checked': checked ? 'true' : 'false',
      'aria-label': labelText,
      onclick: onToggle
    });
    var text = el('div', {}, [
      el('div', { 'class': 'uscistr-popover-label', text: labelText }),
      description ? el('div', { 'class': 'uscistr-popover-desc', text: description }) : null
    ]);
    return el('div', { 'class': 'uscistr-popover-row' }, [text, toggle]);
  }

  function buildSettingsPopover() {
    var currentMins = Math.round(state.prefs.refreshMs / 60000);
    var options = [5, 15, 30, 60];
    var refreshSelect = el('select', {
      'class': 'uscistr-select',
      'aria-label': 'Refresh interval',
      onchange: function (e) {
        var mins = parseInt(e.target.value, 10);
        state.prefs.refreshMs = mins * 60 * 1000;
        persistPrefs();
        restartRefreshTimer();
        render();
      }
    });
    for (var i = 0; i < options.length; i++) {
      refreshSelect.appendChild(el('option', {
        value: String(options[i]), text: options[i] + ' minutes', selected: options[i] === currentMins
      }));
    }

    var intervalRow = el('div', { 'class': 'uscistr-popover-row' }, [
      el('div', {}, [
        el('div', { 'class': 'uscistr-popover-label', text: 'Check every' }),
        el('div', { 'class': 'uscistr-popover-desc', text: 'Only while this tab is visible.' })
      ]),
      refreshSelect
    ]);

    var notifyRow = switchRow(
      'Desktop notifications',
      'Status, document and office changes only. Never behind-the-scenes record updates.',
      !!state.prefs.notify,
      function () {
        var next = !state.prefs.notify;
        if (next && typeof Notification !== 'undefined' && Notification.permission === 'default') {
          Notification.requestPermission();
        }
        state.prefs.notify = next;
        persistPrefs();
        render();
      }
    );

    var darkRow = switchRow('Dark mode', null, !!state.prefs.dark, function () {
      state.prefs.dark = !state.prefs.dark;
      persistPrefs();
      render();
    });

    var redactRow = switchRow(
      'Hide receipt numbers',
      'Masks the middle of every receipt number, for screen sharing.',
      !!state.prefs.redact,
      function () {
        state.prefs.redact = !state.prefs.redact;
        persistPrefs();
        render();
      }
    );

    return el('div', { 'class': 'uscistr-popover', role: 'group', 'aria-label': 'Settings' }, [
      el('div', { 'class': 'uscistr-popover-head', text: 'Settings' }),
      intervalRow,
      el('div', { 'class': 'uscistr-popover-sep' }),
      notifyRow,
      darkRow,
      redactRow
    ]);
  }

  // ==========================================================================
  // Timeline: collect -> dedupe -> sort -> decorate  (docs/design/03 §3)
  // ==========================================================================

  // Everything USCIS gave us for this case, plus what this tool observed,
  // normalized to one shape:
  //   { id, provenance, kind, sortAt, displayAt, precision, code, label, ... }
  // sortAt is what we order by; displayAt + precision is all the renderer is
  // allowed to print. A day-precision entry never gets a printed time.
  function collectTimelineItems(entry) {
    var items = [];
    var result = entry.result;
    var i;
    if (!result) return items;

    var detail = summarizeCaseStatus(result.caseStatus);
    var notice = summarizeReceiptNotice(result.receiptNotice);

    // Read the raw notices alongside so an appointment row can name the letter
    // id USCIS put on the notice. extractUscisEvents() pushes notice rows in
    // array order, so index alignment holds.
    var rawNotices = [];
    if (result.caseStatus && !result.caseStatus.__error && !result.caseStatus.__empty) {
      var maybeNotices = pick(result.caseStatus, FIELDS.caseStatus.notices);
      if (Array.isArray(maybeNotices)) rawNotices = maybeNotices;
    }
    var noticeIndex = 0;

    var uscisEvents = extractUscisEvents(result);
    for (i = 0; i < uscisEvents.length; i++) {
      var ev = uscisEvents[i];
      if (ev.source === 'status') {
        // historicalCaseStatuses carries a date and USCIS's own wording. It is
        // day precision: sortAt goes to end-of-day so the human sentence leads
        // the machine events it produced.
        items.push({
          id: 'hist:' + i,
          provenance: 'official',
          kind: 'status',
          sortAt: ev.at === null ? null : endOfLocalDay(ev.at),
          displayAt: ev.at,
          precision: 'day',
          code: ev.code === null || ev.code === undefined ? null : String(ev.code),
          label: ev.text || null,
          labelEs: ev.textSpanish || null
        });
      } else if (ev.source === 'event') {
        items.push({
          id: 'evt:' + i,
          provenance: 'coded',
          kind: 'event',
          sortAt: ev.at,
          displayAt: ev.at,
          precision: 'second',
          code: ev.code === null || ev.code === undefined ? null : String(ev.code),
          // describeCode() reports where the words came from, and each tier
          // gets its own treatment (SPEC "Event codes"):
          //   'uscis'       -> USCIS's own wording, published for THIS case.
          //                    No label needed.
          //   'niem'        -> the federal schema's description of the code.
          //                    Official, but an internal-operations phrase and
          //                    not this case's status — labelled "system
          //                    description".
          //   'uscis-other' -> USCIS's wording for this code on another of the
          //                    user's cases of the same form. Real prose about
          //                    a different case, so it is labelled as such.
          //   null          -> nobody publishes a meaning. Say exactly that.
          //   'unavailable' -> the dictionary didn't load, so we don't know
          //                    whether a meaning exists. Show the code with no
          //                    claim either way; never assert there is none.
          labelSource: ev.textSource === 'uscis' ? 'harvested'
            : ev.textSource === 'niem' ? 'niem'
            : ev.textSource === 'uscis-other' ? 'other-case'
            : ev.textSource === 'unavailable' ? 'unknown-source'
            : 'none',
          label: ev.text || null
        });
      } else if (ev.source === 'notice') {
        var raw = rawNotices[noticeIndex] || null;
        noticeIndex++;
        var apptMs = ev.appointmentAt ? parseUscisDate(ev.appointmentAt) : null;
        items.push({
          id: 'notice:' + i,
          provenance: 'notice',
          kind: apptMs !== null ? 'appointment' : 'notice',
          sortAt: apptMs !== null ? apptMs : ev.at,
          displayAt: apptMs !== null ? apptMs : ev.at,
          precision: 'second',
          code: null,
          label: ev.text || 'Notice on file',
          generatedAt: ev.at,
          letterId: raw ? pick(raw, FIELDS.noticeItem.letterId) : null
        });
      }
    }

    // The current status, when the history array does not already carry it.
    // Sparse cases have an empty history and would otherwise have no row for
    // the status the card is headlining.
    if (notice && notice.status && notice.actionCodeDate) {
      var currentMs = parseUscisDate(notice.actionCodeDate);
      if (currentMs !== null) {
        var alreadyThere = false;
        for (i = 0; i < items.length; i++) {
          if (items[i].provenance === 'official' &&
              String(items[i].code) === String(notice.actionCode) &&
              sameLocalDay(items[i].displayAt, currentMs)) {
            alreadyThere = true;
            break;
          }
        }
        if (!alreadyThere) {
          items.push({
            id: 'current',
            provenance: 'official',
            kind: 'status',
            sortAt: currentMs,
            displayAt: currentMs,
            precision: 'second',
            code: notice.actionCode === null || notice.actionCode === undefined ? null : String(notice.actionCode),
            label: notice.status,
            labelEs: notice.statusSpanish,
            body: notice.statusDetail,
            bodyEs: notice.statusDetailSpanish
          });
        }
      }
    }

    // Locally detected changes. These are the only rows whose timestamp is
    // ours rather than USCIS's, and they say so in every rendering.
    var history = getHistory(entry.number);
    for (i = 0; i < history.length; i++) {
      var change = history[i];
      if (!change) continue;
      var noticedAt = parseUscisDate(change.at);
      if (change.kind === 'backend') {
        // The value that moved is a USCIS timestamp; prefer it over our
        // detection time, which only records when a browser tab was open.
        var movedTo = parseUscisDate(change.to);
        items.push({
          id: 'local:' + i,
          provenance: 'local',
          kind: 'backend',
          sortAt: movedTo !== null ? movedTo : noticedAt,
          displayAt: movedTo !== null ? movedTo : noticedAt,
          precision: 'second',
          code: null,
          label: 'USCIS touched your record',
          noticedAt: noticedAt
        });
        continue;
      }
      items.push({
        id: 'local:' + i,
        provenance: 'local',
        kind: change.kind || 'change',
        sortAt: noticedAt,
        displayAt: noticedAt,
        precision: 'second',
        code: null,
        label: describeChange(change),
        from: change.from,
        to: change.to,
        noticedAt: noticedAt
      });
    }

    // Backend activity synthesized from this fetch: the record moved while the
    // public status did not. Gated at 3 days — below that it is plausibly the
    // same action written twice, and a shrug rendered as a signal is noise.
    if (detail && detail.backendUpdatedAt && notice && notice.actionCodeDate) {
      var backendMs = parseUscisDate(detail.backendUpdatedAt);
      var statusMs = parseUscisDate(notice.actionCodeDate);
      if (backendMs !== null && statusMs !== null && backendMs - statusMs > BACKEND_MIN_LAG_MS) {
        var duplicated = false;
        for (i = 0; i < items.length; i++) {
          if (items[i].kind === 'backend' && items[i].displayAt !== null &&
              Math.abs(items[i].displayAt - backendMs) < 1000) {
            duplicated = true;
            break;
          }
        }
        if (!duplicated) {
          items.push({
            id: 'backend:' + backendMs,
            provenance: 'local',
            kind: 'backend',
            sortAt: backendMs,
            displayAt: backendMs,
            precision: 'second',
            code: null,
            label: 'USCIS touched your record',
            lagDays: daysBetween(statusMs, backendMs),
            statusAt: statusMs
          });
        }
      }
    }

    // Anchors. The filed row is day 0 and is never folded away.
    if (detail && detail.submissionDate) {
      var filedMs = parseUscisDate(detail.submissionDate);
      if (filedMs !== null) {
        items.push({
          id: 'filed',
          provenance: 'anchor',
          kind: 'filed',
          sortAt: startOfLocalDay(filedMs),
          displayAt: filedMs,
          precision: 'day',
          code: null,
          label: 'Filed',
          formType: detail.formType ? String(detail.formType) : null
        });
      }
    }

    return items;
  }

  // Passes 1-4 of §3: official x coded on equal codes, local rows absorbed by
  // the official row that says the same thing, and API-duplicated events.
  function dedupeTimelineItems(items, docNames) {
    var i, j;

    // Pass 1 — an official day-precision row and a coded row carrying the same
    // code within 36h are the same event seen twice. The official row wins on
    // text and adopts the coded row's precise sort key, but keeps DAY display
    // precision: USCIS only ever told us the date.
    for (i = 0; i < items.length; i++) {
      var official = items[i];
      if (official.provenance !== 'official' || !official.code || official.sortAt === null) continue;
      var best = null;
      var bestDelta = 0;
      for (j = 0; j < items.length; j++) {
        var coded = items[j];
        if (coded.provenance !== 'coded' || coded.removed || coded.sortAt === null) continue;
        if (String(coded.code) !== String(official.code)) continue;
        var delta = Math.abs(coded.sortAt - official.sortAt);
        if (delta > DEDUPE_WINDOW_MS) continue;
        if (best === null || delta < bestDelta) { best = coded; bestDelta = delta; }
      }
      if (best) {
        official.corroborated = true;
        official.loggedAt = best.displayAt;
        official.sortAt = best.sortAt;
        best.removed = true;
      }
    }

    // Pass 2 — a local "status changed to X" row and an official row saying X
    // are the same event. Printing both, with two different dates, is the most
    // confusing failure mode of a naive merge; instead the official row gains
    // "You first saw this on ...".
    for (i = 0; i < items.length; i++) {
      var local = items[i];
      if (local.provenance !== 'local' || local.kind !== 'status' || local.removed) continue;
      for (j = 0; j < items.length; j++) {
        var match = items[j];
        if (match.provenance !== 'official' || match.removed) continue;
        if (normalizeText(match.label) !== normalizeText(local.to)) continue;
        if (match.sortAt === null || local.sortAt === null || match.sortAt > local.sortAt) continue;
        match.firstSeenLocally = local.displayAt;
        local.removed = true;
        break;
      }
    }

    // Pass 3 — a local "new document" row is redundant when the documents
    // section already lists that file with USCIS's own date.
    for (i = 0; i < items.length; i++) {
      var localDoc = items[i];
      if (localDoc.provenance !== 'local' || localDoc.kind !== 'document' || localDoc.removed) continue;
      if (docNames && docNames[String(localDoc.to)]) localDoc.removed = true;
    }

    // Pass 4 — identical coded events (same code, same second) the API
    // sometimes returns twice.
    var seenCoded = {};
    for (i = 0; i < items.length; i++) {
      var item = items[i];
      if (item.provenance !== 'coded' || item.removed || item.sortAt === null) continue;
      var key = item.code + '|' + Math.floor(item.sortAt / 1000);
      if (seenCoded[key]) { item.removed = true; continue; }
      seenCoded[key] = true;
    }

    var kept = [];
    for (i = 0; i < items.length; i++) {
      if (!items[i].removed) kept.push(items[i]);
    }
    return kept;
  }

  function precisionRank(item) {
    return item.precision === 'day' ? 0 : 1;
  }

  // Newest first. Ties break by trust, then by precision, then by id — the
  // last one exists so the list never reshuffles between renders, which
  // matters because a timeline that moves on refresh destroys exactly the
  // confidence this panel is trying to build.
  function sortTimelineItems(items) {
    var dated = [];
    var undated = [];
    var i;
    for (i = 0; i < items.length; i++) {
      if (items[i].sortAt === null || items[i].sortAt === undefined) undated.push(items[i]);
      else dated.push(items[i]);
    }
    dated.sort(function (a, b) {
      if (b.sortAt !== a.sortAt) return b.sortAt - a.sortAt;
      var rank = (PROV_RANK[a.provenance] || 9) - (PROV_RANK[b.provenance] || 9);
      if (rank !== 0) return rank;
      var prec = precisionRank(a) - precisionRank(b);
      if (prec !== 0) return prec;
      return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
    });

    // The filed anchor is the origin of the record and always renders last,
    // even when something else shares its calendar day.
    var ordered = [];
    var filed = null;
    for (i = 0; i < dated.length; i++) {
      if (dated[i].kind === 'filed') filed = dated[i];
      else ordered.push(dated[i]);
    }
    ordered = ordered.concat(undated);
    if (filed) ordered.push(filed);
    return ordered;
  }

  // Three or more consecutive backend rows collapse into one. Without this a
  // case that gets touched weekly buries its real events.
  function collapseBackendRuns(items) {
    var out = [];
    var i = 0;
    while (i < items.length) {
      if (items[i].kind !== 'backend') { out.push(items[i]); i++; continue; }
      var j = i;
      while (j < items.length && items[j].kind === 'backend') j++;
      var run = items.slice(i, j);
      if (run.length >= 3) {
        out.push({
          id: run[0].id + '+run',
          provenance: 'local',
          kind: 'backend',
          sortAt: run[0].sortAt,
          displayAt: run[0].displayAt,
          precision: 'second',
          code: null,
          label: 'USCIS touched your record ' + run.length + ' times',
          runCount: run.length,
          runFrom: run[run.length - 1].displayAt,
          runTo: run[0].displayAt
        });
      } else {
        out = out.concat(run);
      }
      i = j;
    }
    return out;
  }

  // What kind of card this is, decided once and read by every section below.
  //
  //   'unchecked' — added but never fetched
  //   'loading'   — first fetch in flight, nothing to show yet
  //   'fresh'     — this check read real data; the card speaks for right now
  //   'stale'     — this check told us nothing and we hold an earlier copy:
  //                 show that copy, marked, rather than blanking the card
  //   'blank'     — this check failed and there is no earlier copy at all
  //   'empty'     — every endpoint answered, all of them empty, nothing cached
  //
  // Two rules depend on this being one decision rather than several. Copy that
  // asserts absence ("USCIS hasn't published a status yet", "that's common for
  // recently filed cases") is reachable ONLY from 'fresh': a fetch that failed
  // knows nothing about what USCIS has published. And a card is never emptied
  // while a snapshot exists — a 2am session timeout must not be
  // indistinguishable from "my cases are gone".
  function caseRenderState(entry, view) {
    if (!entry.result) return entry.loading ? 'loading' : 'unchecked';
    if (view.hasData) return 'fresh';
    if (snapshotHasContent(view.lastKnown)) return 'stale';
    return coreSourcesFailed(entry.result) ? 'blank' : 'empty';
  }

  // Everything the card needs, computed once per render.
  function buildCaseView(entry) {
    var result = entry.result;
    var view = {
      detail: null, notice: null, docs: null, processing: null,
      items: [], upcoming: [], office: null, officeCode: null,
      evidenceCount: 0, hasData: false,
      // fromCache: this card is drawn from a stored snapshot because the
      // latest fetch failed. cachedAt is when that snapshot was taken.
      fromCache: false, cachedAt: null,
      lastKnown: getSnapshot(entry.number), state: null
    };
    if (!result) {
      view.state = caseRenderState(entry, view);
      // Not fetched yet this session, but a previous session left a snapshot —
      // show it rather than an empty shell while the refresh runs.
      if (view.state === 'unchecked' && snapshotHasContent(view.lastKnown)) {
        applyCachedSnapshot(view);
      }
      return view;
    }

    view.detail = summarizeCaseStatus(result.caseStatus);
    view.notice = summarizeReceiptNotice(result.receiptNotice);
    view.docs = summarizeDocuments(result.documents);
    view.processing = summarizeProcessingTimes(result.processingTimes);
    view.hasData = !!(view.detail || view.notice || view.docs);

    view.office = view.notice && view.notice.office ? view.notice.office : null;
    if (!view.office) {
      var location = summarizeLocation(result.location);
      if (location && location.office) view.office = location.office;
    }
    if (result.receiptNotice && !result.receiptNotice.__error && !result.receiptNotice.__empty) {
      var code = pick(result.receiptNotice, FIELDS.receiptNotice.officeCode);
      view.officeCode = code === null ? null : String(code);
    }
    if (result.caseStatus && !result.caseStatus.__error && !result.caseStatus.__empty) {
      var requests = pick(result.caseStatus, FIELDS.caseStatus.evidenceRequests);
      if (Array.isArray(requests)) view.evidenceCount = requests.length;
    }

    var docNames = Object.create(null);
    if (view.docs) {
      for (var d = 0; d < view.docs.length; d++) {
        if (view.docs[d].name) docNames[String(view.docs[d].name)] = true;
      }
    }

    var items = dedupeTimelineItems(collectTimelineItems(entry), docNames);
    items = sortTimelineItems(items);

    // A scheduled appointment is the only forward-looking thing we can
    // honestly show. It leaves the history rail until its date passes.
    var now = new Date().getTime();
    var history = [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].kind === 'appointment' && items[i].sortAt !== null && items[i].sortAt > now) {
        view.upcoming.push(items[i]);
      } else {
        history.push(items[i]);
      }
    }
    view.items = collapseBackendRuns(history);
    view.state = caseRenderState(entry, view);
    if (view.state === 'stale') applyCachedSnapshot(view);
    return view;
  }

  // This fetch told us nothing, but we have a stored snapshot from one that
  // did. Render that instead of emptying the card: a person who opens the
  // panel after a session timeout came to see their case, and blanking it is
  // indistinguishable from the case having disappeared. Everything filled in
  // here was observed on a real earlier read; the card marks itself stale and
  // dates it, so nothing is presented as current.
  function applyCachedSnapshot(view) {
    var snap = view.lastKnown;
    if (!snap) return;

    view.fromCache = true;
    view.cachedAt = snap.at || null;

    if (!view.detail) {
      view.detail = {
        receiptNumber: null,
        formType: snap.formType || null,
        formName: snap.formName || null,
        submissionDate: snap.submissionDate || null,
        backendUpdatedAt: snap.backendAt || null,
        // Deliberately left null, not false: these drive the state pill and
        // attention styling. `false` would be read as a fact ("In progress")
        // and could contradict the case's real state, so a cached card makes
        // no claim about them at all.
        closed: null,
        actionRequired: null,
        premium: null,
        representativeName: null
      };
    }

    if (!view.notice) {
      view.notice = {
        receiptNumber: null,
        formNumber: snap.formType || null,
        status: snap.status || null,
        statusDetail: null,
        statusSpanish: null,
        statusDetailSpanish: null,
        actionCode: snap.actionCode || null,
        actionCodeDate: snap.lastUpdated || null,
        office: snap.office || null,
        historyCount: 0
      };
    }

    if (!view.office && snap.office) view.office = snap.office;
  }

  // ---- timeline rendering ---------------------------------------------------

  // Node shape is the primary provenance channel and is legible at 12px;
  // colour is reinforcement only.
  function timelineGlyph(item) {
    if (item.attention) return { icon: 'alert', tone: 'attention' };
    if (item.provenance === 'official') {
      return { icon: item.corroborated ? 'discRing' : 'disc', tone: 'official' };
    }
    if (item.provenance === 'notice') {
      return { icon: item.kind === 'appointment' ? 'calendar' : 'page', tone: 'official' };
    }
    if (item.provenance === 'coded') {
      return { icon: 'ring', tone: codeIsTheLabel(item) ? 'quiet' : 'coded' };
    }
    if (item.kind === 'backend') return { icon: 'ringDashed', tone: 'quiet' };
    if (item.kind === 'filed') return { icon: 'cap', tone: 'quiet' };
    return { icon: 'diamond', tone: 'local' };
  }

  // Rows where the raw code is all we have to lead with, either because
  // nobody publishes a meaning or because we could not look one up. The two
  // are different claims and the disclosure keeps them apart, but they render
  // the same way: the code, and no wording around it.
  function codeIsTheLabel(item) {
    return item.provenance === 'coded' &&
      (item.labelSource === 'none' || item.labelSource === 'unknown-source');
  }

  // The label a row leads with. Untranslated codes render as the raw code —
  // "Case event FTA0" plus "we don't know what this means" is a better row
  // than a confident wrong one.
  function timelineLabel(item, spanish) {
    if (spanish && item.labelEs) return item.labelEs;
    if (item.label) return item.label;
    if (item.code) return 'Case event ' + item.code;
    return 'Case event';
  }

  function timelineMetaParts(item) {
    var parts = [];
    var dateText = item.displayAt === null ? '' : formatDayLabel(item.displayAt);

    if (item.provenance === 'official') {
      parts.push(dateText);
      parts.push('USCIS');
      if (item.corroborated && item.loggedAt !== null && item.loggedAt !== undefined) {
        parts.push('logged ' + formatTimeOfDay(item.loggedAt));
      }
    } else if (item.provenance === 'coded') {
      parts.push(dateText);
      parts.push('USCIS event' + (item.code ? ' ' + item.code : ''));
    } else if (item.provenance === 'notice') {
      parts.push(item.kind === 'appointment'
        ? 'Notice generated ' + formatDayLabel(item.generatedAt)
        : dateText);
      parts.push(item.letterId ? 'USCIS notice ' + item.letterId : 'USCIS notice');
    } else if (item.kind === 'backend') {
      parts.push(item.runCount
        ? formatDayLabel(item.runFrom) + ' – ' + formatDayLabel(item.runTo)
        : dateText);
      parts.push('record updated, status unchanged');
    } else if (item.kind === 'filed') {
      parts.push(dateText);
      parts.push((item.formType ? item.formType + ' ' : '') + 'received by USCIS');
      parts.push('day 0');
    } else {
      // Locally observed. "Noticed" leads, so a reader scanning the meta
      // column sees the provenance before anything that looks like an
      // official timestamp.
      parts.push('Noticed ' + dateText + (item.displayAt === null ? '' : ', ' + formatTimeOfDay(item.displayAt)));
      parts.push('by this tool');
    }
    if (item.attention) parts.push('needs attention');
    return parts;
  }

  // The body behind a row: the full official prose, the exact timestamp, and a
  // plain-English sentence about where the words came from.
  function timelineBody(item, spanish) {
    var lines = [];
    if (item.provenance === 'official') {
      var body = spanish && item.bodyEs ? item.bodyEs : item.body;
      if (body) lines.push(body);
      if (item.code) {
        lines.push('Action code ' + item.code + ' · reported by USCIS on ' + formatDateFull(item.displayAt) + '.');
      }
      if (item.corroborated && item.loggedAt) {
        lines.push('USCIS also logged this as a coded event at ' + formatTimeOfDay(item.loggedAt) + '.');
      }
      if (item.firstSeenLocally) {
        lines.push('You first saw this on ' + formatDateFull(item.firstSeenLocally) + '.');
      }
    } else if (item.provenance === 'coded') {
      if (item.labelSource === 'harvested') {
        lines.push('USCIS logged code ' + item.code + ' on ' + formatDateFull(item.displayAt) +
          ' at ' + formatTimeOfDay(item.displayAt) + '. The wording above is USCIS’s own: it is the status text USCIS published for this code on one of your cases.');
      } else if (item.labelSource === 'niem') {
        lines.push('USCIS sent only the code ' + item.code + '. "' + item.label +
          '" is that code’s description in the federal data standard USCIS publishes (NIEM).');
        lines.push('That is an internal operations phrase describing what the system did — it is not the status USCIS writes for you about this case, and it can read very differently from the wording on my.uscis.gov.');
        lines.push('What is certain: USCIS logged an event coded ' + item.code + ' on ' + formatDateFull(item.displayAt) + '.');
      } else if (item.labelSource === 'other-case') {
        lines.push('USCIS sent only the code ' + item.code + '. "' + item.label +
          '" is the wording USCIS published for that code on a different case of yours on the same form — not on this one.');
        lines.push('It is shown because it is USCIS’s own language, and kept below the federal description because USCIS did not write it about this case.');
        lines.push('What is certain: USCIS logged an event coded ' + item.code + ' on ' + formatDateFull(item.displayAt) + '.');
      } else if (item.labelSource === 'unknown-source') {
        lines.push('USCIS logged an event coded ' + item.code + ' on ' + formatDateFull(item.displayAt) + '.');
        lines.push('The published code list did not load in this copy of the panel, so we cannot look this code up. That is a fault in this tool, not a gap in your record — we would rather say nothing about the code than say it has no meaning.');
      } else {
        lines.push('USCIS logged this code on your case, and no meaning for it is published — not in the status text USCIS wrote for this account, and not in the federal schema.');
        lines.push('USCIS does use codes outside the published standard, so this is a gap in public documentation rather than a problem with the case. We would rather say so than guess.');
        lines.push('It does not move this case forward or back on the stage map above: an unrecognised code does not vote.');
      }
    } else if (item.kind === 'backend') {
      if (item.runCount) {
        lines.push('USCIS modified its internal copy of this case ' + item.runCount + ' times between ' +
          formatDateFull(item.runFrom) + ' and ' + formatDateFull(item.runTo) + '. The public status did not change in that time.');
      } else {
        lines.push('USCIS’s internal copy of this case was modified on ' + formatDateFull(item.displayAt) +
          (item.lagDays ? ' — ' + plural(item.lagDays, 'day') + ' after the visible status was set' : '') + '.');
      }
      lines.push('The public status did not change. This sometimes comes before visible movement, and sometimes means nothing we can see. We show it because my.uscis.gov does not.');
    } else if (item.provenance === 'notice') {
      lines.push('USCIS generated this notice on ' + formatDateFull(item.generatedAt) + '.');
      lines.push('Check the notice in your USCIS account for the address and what to bring.');
    } else if (item.provenance === 'local' && item.kind === 'status') {
      lines.push('Was: "' + (item.from === null || item.from === undefined ? 'not recorded' : item.from) + '".');
      lines.push('USCIS does not publish when this changed — ' + formatDateFull(item.displayAt) + ', ' +
        formatTimeOfDay(item.displayAt) + ' is when this tool first saw it.');
    } else if (item.provenance === 'local') {
      lines.push('This tool noticed this between two checks. USCIS did not publish a date for it.');
    }
    return lines;
  }

  function buildTimelineRow(entry, item, isLast, spanish) {
    var glyph = timelineGlyph(item);
    var nodeCell = el('div', { 'class': 'uscistr-node uscistr-node-' + glyph.tone + (isLast ? ' uscistr-node-last' : '') });
    var icon = buildIcon(glyph.icon);
    if (icon) nodeCell.appendChild(icon);

    var borrowedLabel = item.provenance === 'coded' &&
      (item.labelSource === 'niem' || item.labelSource === 'other-case');

    var labelText = timelineLabel(item, spanish);
    var labelClass = 'uscistr-timeline-text';
    if (codeIsTheLabel(item)) labelClass += ' uscistr-is-quiet';
    if (item.attention) labelClass += ' uscistr-is-attention';
    // A dotted underline is the standard web affordance for "this word has a
    // caveat attached": it survives greyscale and costs no horizontal space.
    if (borrowedLabel) labelClass += ' uscistr-unofficial-label';

    var head = el('div', { 'class': 'uscistr-timeline-head' }, [
      el('span', { 'class': labelClass, text: labelText }),
      // The raw code is always visible next to a decoded label. When the code
      // IS the label there is no point printing it twice.
      (item.code && !codeIsTheLabel(item)) ? codeChip(item.code) : null
    ]);

    var metaParts = timelineMetaParts(item);
    var meta = el('div', { 'class': 'uscistr-timeline-meta' });
    for (var m = 0; m < metaParts.length; m++) {
      if (!metaParts[m]) continue;
      if (m > 0) meta.appendChild(metaSep());
      if (m === 0) meta.appendChild(el('span', { 'class': 'uscistr-timeline-date', text: metaParts[m] }));
      else meta.appendChild(el('span', { text: metaParts[m] }));
    }
    if (borrowedLabel) {
      meta.appendChild(metaSep());
      meta.appendChild(chip(item.labelSource === 'niem' ? 'system description' : 'from another case', 'quiet'));
    }

    var bodyLines = timelineBody(item, spanish);
    var cell = el('div', { 'class': 'uscistr-timeline-cell' });
    var stack = el('div', { 'class': 'uscistr-timeline-body' }, [head, meta]);
    if (item.fileName) {
      stack.appendChild(el('div', { 'class': 'uscistr-timeline-sub', text: middleTruncate(item.fileName, 44), title: item.fileName }));
    }
    if (item.firstSeenLocally) {
      stack.appendChild(el('div', {
        'class': 'uscistr-timeline-note',
        text: 'You first saw this on ' + formatDayLabel(item.firstSeenLocally) + '.'
      }));
    }

    if (!bodyLines.length) {
      cell.appendChild(stack);
      return el('div', { 'class': 'uscistr-timeline-row' }, [nodeCell, cell]);
    }

    var expanded = !!(entry.uiOpenRows && entry.uiOpenRows[item.id]);
    var toggle = el('button', {
      'class': 'uscistr-row-toggle',
      type: 'button',
      'aria-expanded': expanded ? 'true' : 'false',
      title: borrowedLabel
        ? labelText + ' — not USCIS wording about this case'
        : labelText,
      onclick: function () {
        if (!entry.uiOpenRows) entry.uiOpenRows = {};
        entry.uiOpenRows[item.id] = !entry.uiOpenRows[item.id];
        render();
      }
    }, [stack]);
    cell.appendChild(toggle);

    if (expanded) {
      var disclosure = el('div', { 'class': 'uscistr-disclosure' });
      for (var b = 0; b < bodyLines.length; b++) {
        disclosure.appendChild(el('p', { text: bodyLines[b] }));
      }
      // Something concrete to take to a forum or a lawyer when we cannot help.
      // Clipboard only: nothing here is ever transmitted anywhere. It lives
      // inside the disclosure because a button on every unexplained row is a
      // column of buttons on exactly the cases with the least to say.
      if (item.provenance === 'coded' && item.labelSource === 'none') {
        disclosure.appendChild(codeCopyButton(entry, item));
      }
      cell.appendChild(disclosure);
    }
    return el('div', { 'class': 'uscistr-timeline-row' }, [nodeCell, cell]);
  }

  // Everything we know about one unrecognised code, in a form that can be
  // pasted into a forum post or an email. Clipboard only — this tool never
  // sends a case number anywhere.
  function codeDetailsText(entry, item) {
    var detail = entry.result ? summarizeCaseStatus(entry.result.caseStatus) : null;
    var lines = [];
    lines.push('USCIS event code: ' + item.code);
    if (detail && detail.formType) lines.push('Form: ' + detail.formType);
    lines.push('Case: ' + displayNumber(entry.number));
    if (item.displayAt !== null && item.displayAt !== undefined) {
      lines.push('Logged: ' + formatDateFull(item.displayAt) + ' at ' + formatTimeOfDay(item.displayAt));
    }
    lines.push('No published meaning for this code: it is not in the status text USCIS wrote for this account, and not in the federal NIEM schema.');
    lines.push('via CaseLens (local, unofficial)');
    return lines.join('\n');
  }

  function codeCopyButton(entry, item) {
    var label = 'Copy code details';
    var btn = el('button', {
      'class': 'uscistr-btn uscistr-btn-sm uscistr-btn-ghost uscistr-code-copy',
      type: 'button',
      text: label,
      title: 'Copies this code and its date to the clipboard. Nothing is sent anywhere.',
      onclick: function () {
        function flash(text) {
          btn.textContent = text;
          setTimeout(function () { btn.textContent = label; }, 1500);
        }
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(codeDetailsText(entry, item)).then(
              function () { flash('Copied'); },
              function () { flash('Copy failed'); }
            );
          } else {
            flash('Copy failed');
          }
        } catch (e) {
          flash('Copy failed');
        }
      }
    });
    return btn;
  }

  function gapRow(days) {
    return el('div', { 'class': 'uscistr-gap' }, [
      el('div', { 'class': 'uscistr-node uscistr-node-quiet uscistr-node-through' }),
      el('div', { 'class': 'uscistr-gap-text', text: '— ' + plural(days, 'day') + ' —' })
    ]);
  }

  // Merged, newest first, folded to the most recent few plus the filed anchor.
  function buildTimeline(entry, view) {
    var wrap = el('div', { 'class': 'uscistr-timeline' });
    var items = view.items;
    var spanish = !!entry.uiSpanish;
    var i;

    // "We could not read it" and "USCIS has published nothing" are different
    // claims about the record, and they never get the same sentence.
    var sourcesUnread = payloadFailed(entry.result.caseStatus) || payloadFailed(entry.result.receiptNotice);

    if (!items.length) {
      wrap.appendChild(el('div', { 'class': 'uscistr-note', text: sourcesUnread
        ? 'We could not read this case’s history on this check, so this list is not the whole record. That is a problem reading the data, and says nothing about the case itself.'
        : "USCIS hasn't published any history for this case — only its current status. This panel will record anything that changes from now on."
      }));
      return wrap;
    }

    var showAll = !!entry.uiShowAllEvents;
    var visible;
    if (showAll || items.length <= TIMELINE_FOLD + 1) {
      visible = items;
    } else {
      visible = items.slice(0, TIMELINE_FOLD);
      // The origin of the record is always on screen, so the fold never hides
      // where the case started.
      if (items[items.length - 1].kind === 'filed') visible = visible.concat([items[items.length - 1]]);
    }

    var onlyLocal = true;
    for (i = 0; i < items.length; i++) {
      if (items[i].provenance !== 'local') { onlyLocal = false; break; }
    }
    if (onlyLocal) {
      wrap.appendChild(el('div', { 'class': 'uscistr-note', text:
        'Nothing here came from USCIS yet. These entries are changes this panel noticed between checks.'
      }));
    }

    var unexplainedCodes = [];
    for (i = 0; i < items.length; i++) {
      if (items[i].labelSource === 'none' && items[i].code) unexplainedCodes.push(items[i].code);
    }

    for (i = 0; i < visible.length; i++) {
      var isLast = i === visible.length - 1;
      wrap.appendChild(buildTimelineRow(entry, visible[i], isLast, spanish));
      // Gap labels convert a list of dates into a visible rhythm, and make the
      // current silence comparable to past silences. Not next to a backend row
      // though: that row already carries its own lag in days, and the two
      // numbers side by side measure different things.
      if (!isLast && visible[i].displayAt !== null && visible[i + 1].displayAt !== null &&
          visible[i].kind !== 'backend' && visible[i + 1].kind !== 'backend') {
        var gap = daysBetween(visible[i + 1].displayAt, visible[i].displayAt);
        if (gap >= GAP_LABEL_MIN_DAYS) wrap.appendChild(gapRow(gap));
      }
    }

    // One footnote for the whole list rather than a sentence under every
    // unexplained row: the fact is about the public documentation, not about
    // any single event, and repeating it made the sparsest cases the loudest.
    if (unexplainedCodes.length) {
      wrap.appendChild(el('div', { 'class': 'uscistr-timeline-footnote', text:
        'No published meaning for ' + unexplainedCodes.join(', ') +
        '. USCIS uses codes outside the published standard; that is a gap in public documentation, not a problem with the case. Open the row for what we can say.' }));
    }

    // Naming the gap, rather than just the failure, lets a reader calibrate
    // how much of the list to trust.
    if (sourcesUnread) {
      var missing = payloadFailed(entry.result.caseStatus)
        ? 'Coded events and notices could not be loaded on this check'
        : 'The status history could not be loaded on this check';
      wrap.appendChild(el('div', { 'class': 'uscistr-note', text: missing +
        ', so this timeline may be missing entries. Everything shown is still real.' }));
    }

    if (!showAll && visible.length < items.length) {
      wrap.appendChild(el('button', {
        'class': 'uscistr-btn uscistr-btn-sm uscistr-btn-outline uscistr-timeline-fold',
        type: 'button',
        text: 'Show all (' + items.length + ')',
        onclick: function () { entry.uiShowAllEvents = true; render(); }
      }));
    } else if (showAll && items.length > TIMELINE_FOLD + 1) {
      wrap.appendChild(el('button', {
        'class': 'uscistr-btn uscistr-btn-sm uscistr-btn-ghost uscistr-timeline-fold',
        type: 'button',
        text: 'Show fewer',
        onclick: function () { entry.uiShowAllEvents = false; render(); }
      }));
    }
    return wrap;
  }

  // ---- progress module ------------------------------------------------------

  function stageIndexOfCode(seq, code) {
    if (!code) return -1;
    var wanted = String(code).toUpperCase();
    for (var i = 0; i < seq.length; i++) {
      for (var j = 0; j < seq[i].codes.length; j++) {
        if (seq[i].codes[j] === wanted) return i;
      }
    }
    return -1;
  }

  // Where the case has reached, and — separately — which stages we actually
  // have a code for. Those are two different facts and the rail was showing
  // only the first: an I-485 approved on an interview waiver reached the
  // decision stage without ever evidencing an interview, and filling every
  // segment below the index claimed the interview happened.
  //
  // The index is monotonic and sticky: a stage never regresses, even when
  // USCIS's current code moves backward (an interview gets descheduled and the
  // case returns to FTA0). Regressions belong in the timeline, with the event
  // that caused them. `evidenced` is not sticky in the same way — it is simply
  // the set of stages some observed code mapped to.
  // The sequence index of the earliest stage that a still-future appointment
  // says has not happened. Returns -1 when nothing is pending.
  function earliestPendingAppointmentStage(seq, view) {
    if (!view.upcoming || !view.upcoming.length) return -1;

    var lowest = -1;
    for (var u = 0; u < view.upcoming.length; u++) {
      var item = view.upcoming[u];
      if (item.kind !== 'appointment') continue;

      // Match the appointment to a stage by name. Biometrics is the case that
      // matters in practice; the label is USCIS's own notice wording.
      var label = String(item.label || '').toLowerCase();
      var wanted = null;
      if (label.indexOf('biometric') !== -1 || label.indexOf('fingerprint') !== -1) wanted = 'Bio';
      else if (label.indexOf('interview') !== -1) wanted = 'Intvw';
      if (!wanted) continue;

      for (var i = 0; i < seq.length; i++) {
        if (seq[i].name === wanted && (lowest === -1 || i < lowest)) lowest = i;
      }
    }
    return lowest;
  }

  function stageInfo(entry, view) {
    var formType = view.detail && view.detail.formType ? String(view.detail.formType).toUpperCase()
      : (view.notice && view.notice.formNumber ? String(view.notice.formNumber).toUpperCase() : null);
    var seq = formType ? STAGE_SEQUENCES[formType] : null;
    if (!seq) return { mode: 'none', formType: formType };

    var codes = [];
    var seen = {};
    var i;
    function addCode(code) {
      if (!code) return;
      var key = String(code).toUpperCase();
      if (seen[key]) return;
      seen[key] = true;
      codes.push(key);
    }
    if (view.notice && view.notice.actionCode) addCode(view.notice.actionCode);
    for (i = 0; i < view.items.length; i++) addCode(view.items[i].code);
    for (i = 0; i < view.upcoming.length; i++) addCode(view.upcoming[i].code);

    var best = -1;
    var evidenced = {};
    var unmapped = [];
    var foreign = [];
    for (i = 0; i < codes.length; i++) {
      var idx = stageIndexOfCode(seq, codes[i]);
      if (idx >= 0) evidenced[idx] = true;
      if (idx < 0) {
        // A code this form's sequence does not contain. If some OTHER form's
        // sequence knows it as a stage this form lacks — an interview code on
        // an I-765, say — then our model of this form is the thing that is
        // wrong, and the rail is the disposable part. Otherwise the code
        // simply does not vote.
        if (stageNameElsewhere(seq, codes[i])) foreign.push(codes[i]);
        else unmapped.push(codes[i]);
      } else if (idx > best) {
        best = idx;
      }
    }
    if (foreign.length) {
      return { mode: 'mismatch', seq: seq, formType: formType, unmapped: unmapped, foreign: foreign };
    }
    if (best < 0) {
      return { mode: 'indeterminate', seq: seq, formType: formType, unmapped: unmapped };
    }
    // A scheduled appointment that hasn't happened yet is structured evidence
    // that its stage is still ahead. Without this the marker could sit past
    // Biometrics on a card that says, 400px above, that biometrics is in ten
    // days — and someone could read their appointment as already handled.
    // Structured data outranks anything inferred from codes.
    var pendingStage = earliestPendingAppointmentStage(seq, view);
    if (pendingStage > 0 && best >= pendingStage) best = pendingStage - 1;

    // Monotonic and sticky: a stage index never decreases within a session.
    if (typeof entry.uiMaxStage === 'number' && entry.uiMaxStage > best) best = entry.uiMaxStage;
    if (pendingStage > 0 && best >= pendingStage) best = pendingStage - 1;
    entry.uiMaxStage = best;

    // The structured boolean outranks anything we inferred from codes. It
    // moves the index, never the evidence: a closed case has reached the end
    // of the sequence, but that says nothing about the stages in between.
    var closed = !!(view.detail && view.detail.closed);
    if (closed) best = seq.length - 1;

    return {
      mode: 'known', seq: seq, formType: formType, index: best,
      evidenced: evidenced, unmapped: unmapped, closed: closed
    };
  }

  // True when `code` belongs to a stage in some other form's sequence whose
  // name this form's sequence does not have at all.
  function stageNameElsewhere(seq, code) {
    var ownNames = {};
    var i, j;
    for (i = 0; i < seq.length; i++) ownNames[seq[i].name] = true;
    for (var form in STAGE_SEQUENCES) {
      if (!STAGE_SEQUENCES.hasOwnProperty(form)) continue;
      var other = STAGE_SEQUENCES[form];
      for (i = 0; i < other.length; i++) {
        if (ownNames[other[i].name]) continue;
        for (j = 0; j < other[i].codes.length; j++) {
          if (other[i].codes[j] === code) return true;
        }
      }
    }
    return false;
  }

  // Never more than 5 segments on screen at 400px. A 6-stage form shows stages
  // 1-5 until the fifth is reached, then re-renders with 1-2 collapsed into a
  // single Filed cap.
  function stageSegments(info) {
    var seq = info.seq;
    var index = info.mode === 'known' ? info.index : -1;
    var segments = [];
    var i;
    if (seq.length <= 5 || index < 4) {
      var count = Math.min(seq.length, 5);
      for (i = 0; i < count; i++) segments.push({ label: seq[i].label, name: seq[i].name, stage: i });
      return segments;
    }
    segments.push({ label: 'Filed', name: 'Filed', stage: 1, collapsed: true });
    for (i = 2; i < seq.length; i++) segments.push({ label: seq[i].label, name: seq[i].name, stage: i });
    return segments;
  }

  // True when some observed code actually mapped to this segment. A collapsed
  // segment stands for the stages it swallowed, so evidence for any of them
  // counts as evidence for it.
  function segmentEvidenced(info, seg) {
    var evidenced = info.evidenced || {};
    if (!seg.collapsed) return !!evidenced[seg.stage];
    for (var s = 0; s <= seg.stage; s++) {
      if (evidenced[s]) return true;
    }
    return false;
  }

  // Three states, not two. A segment behind the current one is filled only
  // when a code put the case there; otherwise the connector is solid (the case
  // is past it) but the node stays hollow (we never saw it happen). Claiming
  // an interview or a biometrics appointment that never occurred is a false
  // statement about someone's own case.
  function buildStageRail(info) {
    var segments = stageSegments(info);
    var index = info.mode === 'known' ? info.index : -1;
    var closed = info.mode === 'known' && info.closed;
    var rail = el('div', { 'class': 'uscistr-stage', role: 'img' });
    var current = null;
    var i;
    for (i = 0; i < segments.length; i++) {
      var seg = segments[i];
      var stateClass;
      var glyph;
      if (index < 0 || seg.stage > index) {
        stateClass = 'uscistr-is-ahead';
        glyph = 'ring';
      } else if (seg.stage === index) {
        // A closed case is finished, not waiting at a stage: the end of the
        // rail is a terminus and there is no "you are here".
        stateClass = closed ? 'uscistr-is-done' : 'uscistr-is-current';
        glyph = closed ? 'cap' : 'pulse';
        current = closed ? null : seg;
      } else if (segmentEvidenced(info, seg)) {
        stateClass = 'uscistr-is-done';
        glyph = seg.collapsed ? 'cap' : 'disc';
      } else {
        stateClass = 'uscistr-is-passed';
        glyph = 'ring';
      }

      var node = el('div', { 'class': 'uscistr-stage-node' });
      var icon = buildIcon(glyph);
      if (icon) node.appendChild(icon);

      var segEl = el('div', { 'class': 'uscistr-stage-seg ' + stateClass }, [
        node,
        el('div', {
          'class': 'uscistr-stage-label',
          text: seg.label,
          title: stateClass === 'uscistr-is-passed'
            ? seg.name + ' — no code on this case marks this stage'
            : seg.name
        }),
        current === seg ? el('div', { 'class': 'uscistr-stage-here', text: '▲ you are here' }) : null
      ]);
      rail.appendChild(segEl);
    }
    rail.setAttribute('aria-label', current
      ? 'Stage ' + (segments.indexOf(current) + 1) + ' of ' + segments.length + ': ' + current.name +
        '. Stages ahead are typical, not scheduled.'
      : closed
        ? 'Stage map with ' + segments.length + ' stages. USCIS marks this case closed.'
        : 'Stage map with ' + segments.length + ' stages. This case could not be placed on it.');
    return rail;
  }

  // Days since the most recent movement, against this case's own longest
  // previous quiet stretch. Honest (it makes no claim about USCIS), personal
  // (it compares the user only to themselves), and it changes between visits
  // even when the case does not.
  function quietInfo(view) {
    var times = [];
    var now = new Date().getTime();
    var i;
    for (i = 0; i < view.items.length; i++) {
      var item = view.items[i];
      if (item.kind === 'backend') continue;   // would reset the counter without the user learning anything
      if (item.provenance !== 'official' && item.provenance !== 'coded' && item.provenance !== 'notice') continue;
      if (item.displayAt === null || item.displayAt === undefined) continue;
      if (item.displayAt > now) continue;
      times.push(item.displayAt);
    }
    // Under three movements there is no rhythm to compare against yet.
    if (times.length < 3) return null;
    times.sort(function (a, b) { return a - b; });

    var maxPrior = 0;
    for (i = 1; i < times.length; i++) {
      var gap = daysBetween(times[i - 1], times[i]);
      if (gap > maxPrior) maxPrior = gap;
    }
    var current = daysBetween(times[times.length - 1], now);
    // Something moved today: there is no quiet stretch to measure.
    if (current <= 0) return null;
    return { currentDays: current, maxPriorDays: maxPrior };
  }

  // A sentence, not a gauge. A filling bar implies progress toward a goal, and
  // the only goal this one could measure is the user's own worst wait — which
  // every still-waiting case eventually exceeds, at which point the module's
  // only message is "you are now waiting longer than you ever have". So: no
  // bar, and once the current stretch passes the previous longest the
  // comparator is dropped rather than announced as a record.
  function buildQuietLine(quiet) {
    return el('div', { 'class': 'uscistr-quiet' }, [
      el('div', { 'class': 'uscistr-quiet-head' }, [
        el('span', { text: 'Quiet for ' + plural(quiet.currentDays, 'day') }),
        quiet.currentDays < quiet.maxPriorDays
          ? el('span', { 'class': 'uscistr-muted', text: 'longest so far: ' + plural(quiet.maxPriorDays, 'day') })
          : null
      ]),
      el('div', { 'class': 'uscistr-progress-label', text:
        'Measured against this case’s own history. It is not a comparison with anyone else, and it is not a warning.' })
    ]);
  }

  function buildProgressModule(entry, view) {
    var wrap = el('div', { 'class': 'uscistr-progress' });
    var detail = view.detail;
    var filedMs = detail && detail.submissionDate ? parseUscisDate(detail.submissionDate) : null;

    // B2 — elapsed framing. The numeric anchor, never a prediction.
    if (filedMs !== null) {
      var day = daysBetween(filedMs, new Date().getTime());
      wrap.appendChild(el('div', { 'class': 'uscistr-progress-head' }, [
        el('b', { text: 'Day ' + day }),
        el('span', { 'class': 'uscistr-muted', text: 'filed ' + formatDateFull(detail.submissionDate) })
      ]));
    } else {
      wrap.appendChild(el('div', { 'class': 'uscistr-progress-head' }, [
        el('b', { text: 'Filing date not in this record' }),
        el('span')
      ]));
    }

    // B1 — the stage rail. Equal-width segments: the geometry carries no time
    // information, so it cannot be misread as a gauge.
    var info = stageInfo(entry, view);
    if (info.mode === 'mismatch') {
      // Our sequence for this form is missing a stage the case has actually
      // reached. Trust the data over the model and drop the rail rather than
      // force the code into a shape it does not fit.
      wrap.appendChild(el('div', { 'class': 'uscistr-progress-label', text:
        'No stage map for this case: USCIS logged ' + info.foreign.join(', ') +
        ', which our ' + info.formType + ' stage list does not contain. Rather than force it into the wrong shape we leave the map out. Every event is still in the timeline below.' }));
    } else if (info.mode !== 'none') {
      wrap.appendChild(buildStageRail(info));
      if (info.mode === 'indeterminate') {
        wrap.appendChild(el('div', { 'class': 'uscistr-progress-label', text:
          'We cannot place this case on a stage map — USCIS has only sent codes with no published meaning (' +
          info.unmapped.join(', ') + '). The timeline below still shows everything USCIS logged.' }));
      } else if (info.closed) {
        wrap.appendChild(el('div', { 'class': 'uscistr-progress-label', text:
          'USCIS marks this case closed, so the map ends here.' }));
      }
      // Nothing is printed about what comes next. We have no population data
      // and never will: "cases at this stage usually move to X" was invented,
      // and forms skip stages routinely — an I-131 often rides on the I-485's
      // biometrics and never has its own.
      // Standing methodology. Identical on every card and every visit, so it
      // is disclosed rather than printed: four fixed paragraphs above the
      // timeline pushed the actual events off the first screen. The rail is
      // still labelled as our own reading — that claim is one click away and
      // in the button's own wording, never removed.
      var railNotes = [];
      if (info.unmapped.length && info.mode === 'known') {
        railNotes.push('Codes with no published meaning (' + info.unmapped.join(', ') +
          ') are in the timeline but do not move this map.');
      }
      if (STAGE_FOOTNOTES[info.formType]) railNotes.push(STAGE_FOOTNOTES[info.formType]);
      railNotes.push('This stage map is our own reading of the codes on this case, not a USCIS status. Segments are equal width on purpose: none of them measures time.');

      var railOpen = !!entry.uiShowRailNote;
      wrap.appendChild(el('button', {
        'class': 'uscistr-more', type: 'button',
        'aria-expanded': railOpen ? 'true' : 'false',
        text: railOpen ? 'Hide' : 'How we read this map',
        onclick: function () { entry.uiShowRailNote = !entry.uiShowRailNote; render(); }
      }));
      if (railOpen) {
        var railNote = el('div', { 'class': 'uscistr-disclosure' });
        for (var rn = 0; rn < railNotes.length; rn++) {
          railNote.appendChild(el('p', { text: railNotes[rn] }));
        }
        wrap.appendChild(railNote);
      }
    }

    // A closed case has stopped waiting, so none of the waiting machinery
    // below it runs: no quiet counter, and no percentage-complete on a case
    // that is complete.
    if (detail && detail.closed) return wrap;

    // B3 — the quiet stretch.
    var quiet = quietInfo(view);
    if (quiet) wrap.appendChild(buildQuietLine(quiet));

    // A percentage exists ONLY when USCIS itself published a range for this
    // case. That endpoint answers 204 for almost every case, so this almost
    // never renders — and it is never synthesized from elapsed time alone.
    var months = view.processing ? parseEstimateMonths(entry.result.processingTimes) : null;
    var progress = (view.processing && detail && detail.submissionDate)
      ? progressInfo(detail.submissionDate, months) : null;
    if (progress) {
      var fill = el('div', { 'class': 'uscistr-progress-fill' });
      fill.style.width = progress.pct + '%';
      wrap.appendChild(el('div', { 'class': 'uscistr-progress-track', role: 'img',
        'aria-label': progress.pct + ' percent through the range USCIS published for this case' }, [fill]));
      wrap.appendChild(el('div', { 'class': 'uscistr-progress-label', text:
        progress.pct + '% through the range USCIS published for this case (' +
        String(view.processing.estimate) + ').' }));
      // No ETA is printed from this. A range describes cases that already
      // finished; turning it into a date for THIS case would be the predicted
      // decision date the spec rejects outright.
      wrap.appendChild(el('div', { 'class': 'uscistr-progress-label', text:
        'That range describes cases USCIS has already finished. It is not a prediction about this one, and it is not a decision date.' }));
    } else if (filedMs !== null) {
      // "We could not read it" and "USCIS publishes none" are different
      // claims, and collapsing them would be its own small dishonesty. The
      // reasoning behind an absent estimate is identical on every card, so it
      // is stated once for the whole panel (see buildEstimateHelp) instead of
      // hanging a "Why is there no estimate?" button off each one.
      wrap.appendChild(el('div', { 'class': 'uscistr-progress-label', text:
        payloadFailed(entry.result.processingTimes)
          ? "We could not read USCIS's processing-time endpoint on this check, so we do not know whether one is published for this case."
          : 'USCIS publishes no processing-time estimate for this case.' }));
    }
    return wrap;
  }

  // ---- case card ------------------------------------------------------------

  // The state pills that sit on the eyebrow line, left of the form name.
  //
  // Colour encodes state ONLY from a structured boolean the API sent. Never
  // from status prose: we cannot classify an outcome from a sentence, so
  // nothing here is allowed to read as good or bad news. That is why the
  // default pill is neutral grey and says "In progress" rather than anything
  // that could be heard as reassurance.
  function stateChips(entry, view) {
    var chips = [];
    var detail = view.detail;
    if (!detail) return chips;
    if (detail.actionRequired) {
      chips.push(chip('Action required', 'warn', true));
    } else if (detail.closed) {
      // `closed === true` gets the settled/neutral treatment, not a green one:
      // closed says the file is finished, not that it went the user's way.
      chips.push(chip('Closed', 'neutral', true));
    } else if (detail.closed === false) {
      // The one derived pill, and it is still derived from a boolean USCIS
      // sent rather than from anything we read in the status text.
      chips.push(chip('In progress', 'neutral', true));
    }
    if (detail.premium) chips.push(chip('Premium', 'info'));
    return chips;
  }

  function buildCardHeader(entry, view) {
    var eyebrowChildren = [];
    var formType = view.detail && view.detail.formType ? String(view.detail.formType) : null;
    if (!formType) {
      // This check failed, but our own last snapshot still knows what this
      // case is. Identity should not vanish because a fetch did.
      var lastKnown = getSnapshot(entry.number);
      if (snapshotHasContent(lastKnown) && lastKnown.formType) formType = String(lastKnown.formType);
    }
    if (formType) eyebrowChildren.push(el('span', { 'class': 'uscistr-chip uscistr-chip-form', text: formType }));
    // The eyebrow carries identity and state only. The official form name is
    // up to 60 characters and wraps to two lines; putting it on this line
    // buries the state pill and makes every card open the same way.
    var pills = stateChips(entry, view);
    for (var p = 0; p < pills.length; p++) eyebrowChildren.push(pills[p]);

    var formName = view.detail && view.detail.formName ? String(view.detail.formName) : null;
    var titleText = formName || entry.label || 'Case';

    var receiptText = displayNumber(entry.number);
    var receiptBtn = el('button', {
      'class': 'uscistr-receipt' + (state.prefs.redact ? ' uscistr-is-redacted' : ''),
      type: 'button',
      title: 'Copy receipt number',
      onclick: function () {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(entry.number);
        } catch (e) { /* clipboard unavailable: the number is on screen anyway */ }
      }
    }, [el('span', { text: receiptText })]);
    var copyIcon = buildIcon('copy');
    if (copyIcon) receiptBtn.appendChild(copyIcon);

    var identity = el('div', { 'class': 'uscistr-card-title' }, [
      eyebrowChildren.length ? el('div', { 'class': 'uscistr-card-eyebrow' }, eyebrowChildren) : null,
      el('div', { 'class': 'uscistr-card-label', text: titleText }),
      receiptBtn,
      entry.label && formName ? el('div', { 'class': 'uscistr-muted uscistr-small', text: entry.label }) : null
    ]);

    // "Something moved" is the one thing a returning reader is looking for, so
    // it gets the top-right corner to itself rather than queueing behind the
    // state pills on the left.
    var actions = el('div', { 'class': 'uscistr-card-actions' });
    if (entry.changedSince) actions.appendChild(chip('NEW', 'accent'));
    actions.appendChild(iconButton('minimize', 'Collapse this case', function (e) {
      e.stopPropagation();
      setExpanded(entry.number, false);
      render();
    }));

    return el('div', { 'class': 'uscistr-card-header' }, [identity, actions]);
  }

  // "Something moved, here is what it was, here is the window it moved in."
  // Always names the previous value: a change with no "from" is a jump-scare.
  function buildChangeBand(entry) {
    if (!entry.changedSince) return null;
    var changes = entry.newChanges || [];
    var lines = [];
    var i;
    for (i = 0; i < changes.length && i < 3; i++) {
      var change = changes[i];
      if (change.kind === 'status') {
        lines.push('The status is now "' + change.to + '"' +
          (change.from ? ' (it was "' + change.from + '").' : '.'));
      } else if (change.kind === 'office') {
        lines.push('Office on record changed' + (change.from ? ' from ' + change.from : '') + ' to ' + change.to + '.');
      } else if (change.kind === 'document') {
        lines.push('New document on file: ' + change.to + '.');
      } else if (change.kind === 'backend') {
        lines.push("USCIS's record was updated. The public status text did not change.");
      }
    }
    if (!lines.length) lines.push('Something in this record changed since the last check.');

    // One flowing sentence, not a title plus a stack of body lines. This band
    // sits above the status headline on every changed card, so every row it
    // costs is a row of push-down on the thing the reader came to see. The
    // short date keeps the lead on one line; the full date and every change
    // line stay reachable in the tooltip and in the timeline below.
    var lastLookedMs = entry.lastLookedAt ? parseUscisDate(entry.lastLookedAt) : null;
    var sinceShort = lastLookedMs === null ? null : formatDayLabel(lastLookedMs);
    var lead = plural(changes.length || 1, 'change') +
      (sinceShort ? ' since ' + sinceShort : ' since the last check');

    var body = el('div', {}, [
      el('b', { text: lead }),
      document.createTextNode(' — ' + lines[0])
    ]);
    if (lines.length > 1) {
      body.appendChild(document.createTextNode(' ' + lines.slice(1).join(' ')));
    }

    var band = el('div', {
      'class': 'uscistr-change',
      title: (entry.lastLookedAt
        ? plural(changes.length || 1, 'change') + ' since the last check on ' + formatDateFull(entry.lastLookedAt)
        : lead) + '\n' + lines.join('\n')
    });
    var icon = buildIcon('shield');
    band.appendChild(icon || el('span'));
    band.appendChild(body);
    band.appendChild(el('button', {
      'class': 'uscistr-btn uscistr-btn-sm', type: 'button', text: 'Mark seen',
      title: 'Clears the marker. The entry stays in the timeline.',
      onclick: function () {
        entry.changedSince = false;
        entry.newChanges = null;
        render();
      }
    }));
    return band;
  }

  // Outranks everything on the card when present, because it has a deadline
  // attached. Never states what the user must do or by when.
  function buildObligationBand(entry, view) {
    var detail = view.detail;
    var now = new Date().getTime();

    // Appointments are NOT raised as a warning banner here. They are rendered
    // once, by buildUpcomingBand, in the restrained tinted treatment — a date
    // on the calendar is an obligation, not an alarm, and the amber banner
    // said "something is wrong" about a routine biometrics slot. Raising it
    // here as well printed the same appointment twice on the same card.
    if (detail && detail.actionRequired) {
      return banner('', 'warning', 'This case is marked "action required" by USCIS.', [
        'Sign in to my.uscis.gov and open the case to see what they are asking for.',
        'This panel can see the flag but not the request itself.'
      ], null);
    }
    if (view.evidenceCount > 0) {
      return banner('', 'warning', plural(view.evidenceCount, 'request') + ' for evidence is attached to this record.', [
        'Open the case on my.uscis.gov for the document and the deadline.'
      ], null);
    }
    // A just-attended or just-missed appointment stays visible for a week.
    for (var i = 0; i < view.items.length; i++) {
      var item = view.items[i];
      if (item.kind !== 'appointment' || item.displayAt === null) continue;
      if (now - item.displayAt > 7 * MS_PER_DAY) continue;
      return banner('info', 'calendar', 'Appointment on record: ' + formatWeekday(item.displayAt) + ', ' + formatDateFull(item.displayAt), [
        'This date has passed. The notice USCIS sent you is the authority on what happened.'
      ], null);
    }
    return null;
  }

  // A dated obligation, in the restrained tinted treatment rather than an
  // amber alarm. It sits above the status headline because it is the only
  // thing on the card with a deadline attached, and it carries the authority
  // caveat once, quietly, instead of as its own paragraph.
  function buildUpcomingBand(view) {
    if (!view.upcoming.length) return null;
    var wrap = el('div', { 'class': 'uscistr-stack' });
    var now = new Date().getTime();
    for (var u = 0; u < view.upcoming.length; u++) {
      var appt = view.upcoming[u];
      var apptZone = localZoneLabel(appt.displayAt);
      var iconWrap = el('span');
      var calIcon = buildIcon('calendar');
      if (calIcon) iconWrap.appendChild(calIcon);
      wrap.appendChild(el('div', {
        'class': 'uscistr-upcoming',
        title: 'Confirm the time and address on the notice USCIS sent you — that notice is the authority, not this panel.'
      }, [
        iconWrap,
        el('div', {}, [
          el('div', { 'class': 'uscistr-upcoming-title', text:
            appt.label + ' · ' + formatWeekday(appt.displayAt) + ', ' + formatDateFull(appt.displayAt) }),
          // USCIS sends this as a UTC instant with no office timezone, so the
          // time we can render is whatever this computer's clock makes of it —
          // a laptop still set to another zone shows a different hour, and near
          // midnight a different date. Calling it "local" implies local to the
          // office, which we cannot know. For a biometrics appointment that is
          // a costly thing to get wrong, so the label says what it actually is
          // and points at the notice.
          // USCIS sends this as a correctly-converted UTC instant — a 3:00 PM
          // Eastern appointment arrives as 19:00Z — so converting it to this
          // computer's clock gives the right wall time for anyone whose
          // machine is set to the office's zone, which is the normal case. It
          // is wrong for someone travelling with a laptop still on another
          // zone, and we cannot detect that, so the label says whose clock
          // this is and the notice is named as the authority.
          // The zone is named so a mismatch with the office is visible, and the
          // notice is named as the tiebreaker in the same breath — a time is
          // the one value here where acting on the wrong number means missing
          // an appointment.
          el('div', { 'class': 'uscistr-upcoming-meta', text:
            formatTimeOfDay(appt.displayAt) +
            (apptZone ? ' ' + apptZone : '') +
            ' · shown in your device’s time zone, which may not be the office’s.' +
            ' If this differs from your notice, follow the notice' +
            (appt.letterId ? ' (' + appt.letterId + ')' : '') + '.' })
        ]),
        el('span', { 'class': 'uscistr-upcoming-meta', text:
          'in ' + plural(daysBetween(now, appt.displayAt), 'day') })
      ]));
    }
    return wrap;
  }

  // The exact wording here is read hundreds of times by the same person. No
  // exclamation, no "still", no cheerleading, no number in a warning colour.
  // `backendMoved` is true when USCIS touched the record more recently than the
  // status changed. In that case "No change" alone contradicts the record-
  // updated note sitting a few lines below it, so the subject becomes the
  // visible status specifically.
  function noChangeLine(days, lastChangeMs, nothingPending, backendMoved) {
    if (days === null) return null;
    if (days <= 0) return 'Changed today.';

    var subject = backendMoved ? 'No visible status change' : 'No change';

    if (days <= 6) {
      return subject + ' since ' + formatWeekday(lastChangeMs) + ', ' + formatDateFull(lastChangeMs) +
        ' — ' + plural(days, 'day') + '.';
    }
    if (days <= 29) {
      return subject + ' for ' + plural(days, 'day') + '. Last change ' + formatDateFull(lastChangeMs) + '.';
    }
    if (days <= 89) {
      return subject + ' for ' + plural(days, 'day') + '. Quiet stretches of weeks or months are ordinary in these records.';
    }
    if (days <= 364) {
      return subject + ' for ' + plural(days, 'day') + '. Long quiet periods are ordinary here.' +
        (nothingPending ? ' Nothing in this record is asking anything of you.' : '');
    }
    return subject + ' for ' + longDuration(days) + '. This panel is still checking, and will still record the day it changes.';
  }

  function buildStatusBlock(entry, view) {
    var notice = view.notice;
    var block = el('div', { 'class': 'uscistr-status-block' });
    var spanish = !!entry.uiSpanish;

    // The headline is body text. It is never green, never red: we cannot
    // classify approval or denial from prose, and a colour would deliver a
    // verdict before the person has read a word.
    var headline = notice && notice.status
      ? (spanish && notice.statusSpanish ? notice.statusSpanish : notice.status)
      : "USCIS hasn't published a status for this case yet.";
    block.appendChild(el('div', { 'class': 'uscistr-status-text', text: headline }));

    // Status age: the absolute date leads because it is the verifiable one.
    var statusMs = null;
    if (notice && notice.actionCodeDate) statusMs = parseUscisDate(notice.actionCodeDate);
    if (statusMs === null) {
      for (var i = 0; i < view.items.length; i++) {
        if (view.items[i].provenance === 'official' && view.items[i].displayAt !== null) {
          statusMs = view.items[i].displayAt;
          break;
        }
      }
    }
    var ageRow = el('div', { 'class': 'uscistr-status-row' });
    var statusDays = statusMs === null ? null : daysBetween(statusMs, new Date().getTime());
    if (statusMs !== null) {
      // The day count is computed once, in whole calendar days, so this line
      // and the no-change line below can never disagree by a rounding step.
      var ageText;
      if (statusDays <= 0) ageText = 'Set today';
      else if (statusDays === 1) ageText = 'Set yesterday, ' + formatDateFull(statusMs);
      else ageText = 'Set ' + formatDateFull(statusMs) + ' · ' + plural(statusDays, 'day') + ' ago';
      ageRow.appendChild(el('span', { 'class': 'uscistr-muted uscistr-small', text: ageText }));
    } else if (view.detail && view.detail.backendUpdatedAt) {
      ageRow.appendChild(el('span', { 'class': 'uscistr-muted uscistr-small', text:
        'Record dated ' + formatDateFull(view.detail.backendUpdatedAt) }));
    }
    if (view.detail && view.detail.closed) {
      ageRow.appendChild(chip('This case is closed', 'neutral'));
    }
    if (ageRow.childNodes.length) block.appendChild(ageRow);

    if (statusMs !== null) {
      var nothingPending = !!(view.detail && view.detail.actionRequired === false) &&
        view.evidenceCount === 0 && view.upcoming.length === 0;
      // Whether the record moved after the status did. The backend note below
      // says so explicitly, so this line must not flatly claim "no change".
      var backendMs = (view.detail && view.detail.backendUpdatedAt)
        ? parseUscisDate(view.detail.backendUpdatedAt) : null;
      var backendMoved = backendMs !== null && statusMs !== null && backendMs > statusMs;
      var line = noChangeLine(statusDays, statusMs, nothingPending, backendMoved);
      if (line) block.appendChild(el('div', { 'class': 'uscistr-muted uscistr-small', text: line }));
    }

    // The official paragraph is collapsed: it is 80-150 words that do not
    // change between visits, and expanded it would bury the answer to
    // "did anything move".
    var detailText = notice ? (spanish && notice.statusDetailSpanish ? notice.statusDetailSpanish : notice.statusDetail) : null;
    if (detailText) {
      var open = !!entry.uiShowStatusText;
      var para = el('div', {
        'class': 'uscistr-status-desc' + (open ? '' : ' uscistr-is-clamped'),
        text: detailText
      });
      block.appendChild(para);
      block.appendChild(el('button', {
        'class': 'uscistr-more', type: 'button',
        'aria-expanded': open ? 'true' : 'false',
        text: open ? 'Show less' : 'Show full text',
        onclick: function () { entry.uiShowStatusText = !entry.uiShowStatusText; render(); }
      }));
    }

    // USCIS ships its own Spanish. This toggle swaps only USCIS-authored
    // strings — never a machine translation of our own chrome.
    if (notice && (notice.statusSpanish || notice.statusDetailSpanish)) {
      block.appendChild(el('button', {
        'class': 'uscistr-more', type: 'button',
        'aria-pressed': spanish ? 'true' : 'false',
        title: spanish
          ? 'Switch back to the English text USCIS wrote for this status.'
          : 'Español — the Spanish text USCIS wrote for this status. Not a translation by this panel.',
        text: spanish ? 'English' : 'Español',
        onclick: function () { entry.uiSpanish = !entry.uiSpanish; render(); }
      }));
    }
    return block;
  }

  // Real, verified, and invisible on my.uscis.gov — and never called progress,
  // never called good news, with no call to action because there is no action.
  function buildBackendNote(entry, view) {
    var detail = view.detail;
    var notice = view.notice;
    if (!detail || !detail.backendUpdatedAt || !notice || !notice.actionCodeDate) return null;
    var backendMs = parseUscisDate(detail.backendUpdatedAt);
    var statusMs = parseUscisDate(notice.actionCodeDate);
    if (backendMs === null || statusMs === null) return null;
    if (backendMs - statusMs <= BACKEND_MIN_LAG_MS) return null;

    var lag = daysBetween(statusMs, backendMs);
    var open = !!entry.uiShowBackendNote;
    var note = el('div', { 'class': 'uscistr-note' }, [
      el('div', { 'class': 'uscistr-note-title', text: 'Record updated after the current status' }),
      el('p', { text: "USCIS's record for this case was touched " + plural(lag, 'day') + ' after the status was set — on ' +
        formatDateFull(backendMs) + '. Their website does not show this.' })
    ]);
    note.appendChild(el('button', {
      'class': 'uscistr-more', type: 'button',
      'aria-expanded': open ? 'true' : 'false',
      text: open ? 'Show less' : 'Explain',
      onclick: function () { entry.uiShowBackendNote = !entry.uiShowBackendNote; render(); }
    }));
    if (open) {
      note.appendChild(el('p', { text: 'Every case in USCIS’s system carries a "last updated" date. For this case that date is ' +
        formatDateFull(backendMs) + ' — ' + plural(lag, 'day') + ' after the status above was written on ' + formatDateFull(statusMs) + '.' }));
      note.appendChild(el('p', { text: 'So something in their system wrote to this case’s record after the status was set. We can see that it happened. We cannot see what it was, and USCIS does not publish it anywhere.' }));
      note.appendChild(el('p', { text: 'It could be routine maintenance, an internal note, a batch job, or a step that has no public status. It is not a decision, it is not an approval, and it does not mean an answer is coming soon. If USCIS had decided something, the status above would say so.' }));
      note.appendChild(el('p', { text: 'Why show it at all: it is a real fact about this case that USCIS’s own website leaves out.' }));
    }
    return note;
  }

  // Raised only from codes, and it says which code and where the reading came
  // from. Never states what the user must do or by when.
  function buildAttentionBanner(view) {
    var found = null;
    var source = null;
    for (var i = 0; i < view.items.length; i++) {
      var item = view.items[i];
      if (!item.code) continue;
      if (!ATTENTION_CODES[String(item.code).toUpperCase()]) continue;
      item.attention = true;
      if (!found) {
        found = item;
        source = item.provenance === 'coded' ? item.labelSource : 'official';
      }
    }
    if (!found) return null;
    var lines = [
      (found.label || ('Code ' + found.code)) + ' was logged on ' + formatDateFull(found.displayAt) +
        ' (code ' + found.code + ').',
      'Check your USCIS account and any mail for the notice.'
    ];
    if (source === 'niem') {
      lines.push('This reading comes from the federal schema’s description of code ' + found.code +
        ', not from anything USCIS wrote about this case.');
    }
    return banner('danger', 'warning', 'USCIS may need something from you', lines, null);
  }

  // Dates are the one place this panel reshapes what USCIS sent: the API
  // returns calendar dates and real instants in different shapes, and we read
  // each accordingly. If USCIS changes those shapes, our handling becomes the
  // thing that is wrong — so every date row carries the same standing note
  // that the notice governs.
  var DATE_CAVEAT = 'Read from USCIS data by this panel. If it disagrees with ' +
    'your notice or my.uscis.gov, those are correct.';

  function fieldRow(labelText, valueChildren, caveat) {
    var wrap = document.createDocumentFragment();
    wrap.appendChild(el('div', { 'class': 'uscistr-field-label', text: labelText }));
    wrap.appendChild(el('div', {
      'class': 'uscistr-field-value',
      title: caveat || null
    }, valueChildren));
    return wrap;
  }

  function buildFieldRows(entry, view) {
    var wrap = el('div', { 'class': 'uscistr-fields' });
    var detail = view.detail;
    var notice = view.notice;

    if (detail && detail.submissionDate) {
      var filedMs = parseUscisDate(detail.submissionDate);
      wrap.appendChild(fieldRow('Filed', [
        el('span', { text: formatDateFull(detail.submissionDate) }),
        filedMs !== null ? el('span', { 'class': 'uscistr-rel', text: 'day ' + daysBetween(filedMs, new Date().getTime()) }) : null
      ], DATE_CAVEAT));
    }

    if (notice && notice.actionCodeDate) {
      wrap.appendChild(fieldRow('Status updated', [
        el('span', { text: formatDateFull(notice.actionCodeDate) }),
        el('span', { 'class': 'uscistr-rel', text: relativeDate(notice.actionCodeDate) }),
        notice.actionCode ? codeChip(notice.actionCode) : null
      ], DATE_CAVEAT));
    }

    if (detail && detail.backendUpdatedAt) {
      var backendMs = parseUscisDate(detail.backendUpdatedAt);
      var statusMs = notice && notice.actionCodeDate ? parseUscisDate(notice.actionCodeDate) : null;
      var newer = backendMs !== null && statusMs !== null && backendMs > statusMs;
      wrap.appendChild(fieldRow('Record touched', [
        el('span', { text: formatDateFull(detail.backendUpdatedAt) }),
        el('span', { 'class': 'uscistr-rel', text: relativeDate(detail.backendUpdatedAt) }),
        newer ? chip('newer than status', 'quiet') : null
      ], DATE_CAVEAT));
    }

    // People actively hunt for the office, so its absence is stated rather
    // than hidden.
    if (view.office) {
      wrap.appendChild(fieldRow('Service center', [
        el('span', { text: String(view.office) }),
        view.officeCode ? el('span', { 'class': 'uscistr-rel', text: '(' + view.officeCode + ')' }) : null
      ]));
    } else if (view.hasData) {
      wrap.appendChild(fieldRow('Service center', [
        el('span', { 'class': 'uscistr-muted', text: 'not listed in this record' })
      ]));
    }

    // No attorney is a normal state, not missing data: hide it when absent.
    if (detail && detail.representativeName) {
      wrap.appendChild(fieldRow('Representative', [el('span', {
        text: (state.prefs && state.prefs.redact) ? '[hidden]' : String(detail.representativeName)
      })]));
    }

    return wrap;
  }

  // Document URLs come from an undocumented API, so they are untrusted input.
  // Only same-origin my.uscis.gov links become clickable; anything else is
  // rendered as plain text. Three cases have to be rejected explicitly:
  //   "javascript:..."             — script execution
  //   "//evil.com/x"               — protocol-relative, resolves off-origin
  //   "https://my.uscis.gov.evil.com" — prefix match that is a different host
  // Document URLs come from an undocumented API and are untrusted. Hand-rolled
  // prefix checks are not safe here: the URL parser treats a backslash as a
  // separator and strips tab/CR/LF anywhere, so "/\\evil.com/x" and
  // "/<TAB>/evil.com" both resolve off-origin while looking relative. Let the
  // parser resolve it, then compare the origin it actually produced.
  function isSafeDocUrl(url) {
    if (typeof url !== 'string' || !url) return false;
    try {
      var resolved = new URL(url, location.href);
      return resolved.protocol === 'https:' && resolved.hostname === 'my.uscis.gov';
    } catch (e) {
      return false;
    }
  }

  // USCIS names uploaded files by identifiers — "IOE0000000001-0000000000000
  // -part1.tif" — which tells a reader nothing. When the name is only ids,
  // lead with what the document is and where it came from; the raw filename
  // stays available as a tooltip.
  //
  // This function was called by buildDocuments but never defined: a latent
  // ReferenceError that fired the moment a card with documents rendered,
  // which made the whole panel disappear after loading. It escaped every
  // check because node --check only parses, and the smoke test asserted that
  // a panel appears — not that it survives a refresh.
  function documentLabel(doc) {
    var name = doc && doc.name ? String(doc.name) : '';
    if (/^[A-Za-z]{3}[0-9]{10}-[0-9]+-part[0-9]+/.test(name)) {
      var parts = [];
      if (doc.type) parts.push(String(doc.type));
      if (doc.source) parts.push(String(doc.source));
      if (parts.length) return parts.join(' · ');
    }
    return name || '(unnamed document)';
  }

  // A document counts as new when this panel recorded first seeing it within
  // the last week. USCIS provides no "new" flag, so this is our own
  // observation and is scoped to it.
  var NEW_DOCUMENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

  function isRecentDocument(name, historyList) {
    if (!name || !historyList || !historyList.length) return false;
    var cutoff = new Date().getTime() - NEW_DOCUMENT_WINDOW_MS;
    for (var i = 0; i < historyList.length; i++) {
      var entry = historyList[i];
      if (!entry || entry.kind !== 'document' || String(entry.to) !== String(name)) continue;
      var at = parseUscisDate(entry.at);
      if (at !== null && at >= cutoff) return true;
    }
    return false;
  }

  // Said only when the fetch succeeded and USCIS listed nothing — never when a
  // read failed. "USCIS lists none" and "we could not read the list" are
  // different claims.
  function documentsNoteText(entry, view) {
    if (!view || !view.hasData) return null;
    if (view.docs && view.docs.length) return null;
    return 'USCIS lists no documents on this case. That is not the same as there being none — ' +
      'documents sent by post may never appear here.';
  }

  // One box for the absence notes. Two stacked dashed boxes read as two
  // warnings about a case where nothing is wrong.
  function noteBox(paragraphs) {
    var box = el('div', { 'class': 'uscistr-note' });
    var any = false;
    for (var i = 0; i < paragraphs.length; i++) {
      if (!paragraphs[i]) continue;
      box.appendChild(el('div', { 'class': 'uscistr-small', text: paragraphs[i] }));
      any = true;
    }
    return any ? box : null;
  }

  function buildDocuments(entry, view) {
    var docs = view.docs;
    if (!docs || !docs.length) return null;

    var historyList = getHistory(entry.number);
    var wrap = el('div', { 'class': 'uscistr-documents' });
    for (var i = 0; i < docs.length; i++) {
      var doc = docs[i];
      var label = documentLabel(doc);
      var fileName = doc.name ? String(doc.name) : '';

      var iconWrap = el('span');
      var icon = buildIcon('doc');
      if (icon) iconWrap.appendChild(icon);

      var nameChildren = [];
      if (doc.name && isSafeDocUrl(doc.url)) {
        nameChildren.push(el('a', {
          'class': 'uscistr-link', href: doc.url, target: '_blank', rel: 'noopener noreferrer',
          text: label, title: fileName
        }));
      } else {
        nameChildren.push(el('span', { text: label }));
      }

      var meta = el('div', { 'class': 'uscistr-doc-meta' }, [
        doc.date ? el('span', { 'class': 'uscistr-doc-date', text: formatDate(doc.date) || String(doc.date) }) : null,
        (doc.name && isRecentDocument(fileName, historyList)) ? chip('NEW', 'accent') : null
      ]);

      // One line per document. The human-readable source leads and the raw
      // filename trails it in mono, shrinking first — stacking them made every
      // row 57px, so six files cost more vertical space than the entire
      // timeline above them.
      var nameCell = el('div', { 'class': 'uscistr-doc-main' }, [
        el('span', {}, nameChildren),
        fileName ? el('span', { 'class': 'uscistr-doc-name', title: fileName, text: middleTruncate(fileName, 30) }) : null
      ]);

      wrap.appendChild(el('div', { 'class': 'uscistr-doc-row' }, [iconWrap, nameCell, meta]));
    }
    wrap.appendChild(el('div', { 'class': 'uscistr-progress-label', text:
      'USCIS lists these files on this case. This panel can see that they exist but cannot open them — download them from my.uscis.gov.' }));
    return wrap;
  }

  function buildCopyButton(entry) {
    var label = 'Copy summary';
    var btn = el('button', {
      'class': 'uscistr-btn uscistr-btn-sm uscistr-btn-outline', type: 'button', text: label,
      onclick: function () {
        function flash(text) {
          btn.textContent = text;
          setTimeout(function () { btn.textContent = label; }, 1500);
        }
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(summaryText(entry)).then(
              function () { flash('Copied'); },
              function () { flash('Copy failed'); }
            );
          } else {
            flash('Copy failed');
          }
        } catch (e) {
          flash('Copy failed');
        }
      }
    });
    return btn;
  }

  var RAW_JSON_SECTIONS = [
    { key: 'caseStatus', label: '/api/cases/{n}' },
    { key: 'receiptNotice', label: '/api/case_status/{n}' },
    { key: 'documents', label: '/api/cases/{n}/documents' },
    { key: 'processingTimes', label: '/processing_times/{n}' },
    { key: 'location', label: '/receipt_info/{n}' }
  ];

  function buildRawJson(entry) {
    var wrap = el('div', { 'class': 'uscistr-raw-wrap' });
    var result = entry.result;
    for (var i = 0; i < RAW_JSON_SECTIONS.length; i++) {
      var section = RAW_JSON_SECTIONS[i];
      var data = result[section.key];
      if (data === null || data === undefined) continue;

      var status = payloadStatus(data);
      var pre = el('pre', { 'class': 'uscistr-raw', hidden: 'hidden' });
      var chevron = buildIcon('chevron');

      var summary = el('button', {
        'class': 'uscistr-raw-summary', type: 'button', 'aria-expanded': 'false',
        onclick: (function (preEl, dataVal) {
          return function (e) {
            var button = e.currentTarget;
            var open = button.getAttribute('aria-expanded') === 'true';
            button.setAttribute('aria-expanded', open ? 'false' : 'true');
            if (open) {
              preEl.setAttribute('hidden', 'hidden');
            } else {
              // Stringify lazily on first expand rather than up front for
              // every endpoint on every render.
              if (!preEl.textContent) preEl.textContent = redactRawJson(JSON.stringify(dataVal, null, 2));
              preEl.removeAttribute('hidden');
            }
          };
        })(pre, data)
      });
      summary.appendChild(chevron || el('span'));
      summary.appendChild(el('span', { 'class': 'uscistr-raw-path', text: section.label }));
      summary.appendChild(chip(status.text, status.variant));

      wrap.appendChild(summary);
      wrap.appendChild(pre);
    }
    return wrap;
  }

  function sectionTitle(text, count) {
    return el('div', { 'class': 'uscistr-section-title' }, [
      el('span', { text: text }),
      (count === null || count === undefined) ? null : el('span', { 'class': 'uscistr-section-count', text: '· ' + count })
    ]);
  }

  function buildSkeleton() {
    var wrap = el('div', { 'class': 'uscistr-stack' });
    var widths = ['62%', '38%', '54%'];
    for (var i = 0; i < widths.length; i++) {
      var bar = el('div', { 'class': 'uscistr-skeleton uscistr-skeleton-bar' });
      bar.style.width = widths[i];
      wrap.appendChild(el('div', { 'class': 'uscistr-skeleton-row' }, [
        el('div', { 'class': 'uscistr-skeleton uscistr-skeleton-dot' }),
        bar
      ]));
    }
    return wrap;
  }

  // Any error shown next to an immigration case is read as being ABOUT the
  // case unless explicitly disclaimed. That disclaimer is not optional.
  function buildCaseErrorNote(entry) {
    var result = entry.result;
    var parts = [result.caseStatus, result.receiptNotice, result.documents, result.processingTimes, result.location];
    var failures = 0;
    var auth = false;
    var network = false;
    var unreadable = false;
    var i;
    for (i = 0; i < parts.length; i++) {
      if (!payloadFailed(parts[i])) continue;
      failures++;
      if (parts[i].__auth) auth = true;
      if (String(parts[i].__error).indexOf('Network error') === 0) network = true;
      if (String(parts[i].__error).indexOf('not valid JSON') !== -1) unreadable = true;
    }
    // A single quiet failure (usually processing times) is reported by its
    // endpoint chip, not by a banner over the whole card.
    var coreFailed = payloadFailed(result.caseStatus) && payloadFailed(result.receiptNotice);
    if (!coreFailed) return null;

    var snapshot = getSnapshot(entry.number);
    var lines = [];
    var title;
    if (auth) {
      title = 'Your USCIS sign-in has timed out.';
      lines.push('Sign in again at my.uscis.gov, then choose Refresh. Your saved cases and history are safe in this browser.');
    } else if (network) {
      title = "Couldn't reach USCIS just now.";
      lines.push('This is a connection problem between your browser and their servers — it says nothing about this case.');
    } else if (unreadable) {
      title = "USCIS's response for this case didn't look like it usually does.";
      lines.push('That usually means they changed something on their end, not that anything changed about this case. Check my.uscis.gov directly.');
    } else {
      title = "Couldn't load this case just now.";
      lines.push('This says nothing about the case itself — it is a problem reading the record.');
    }
    if (snapshotHasContent(snapshot) && snapshot.at) {
      lines.push('Last successful check: ' + formatDateFull(snapshot.at) + '.');
    } else {
      lines.push('This tool has no earlier copy of this case to show you.');
    }
    var actions = el('div', { 'class': 'uscistr-banner-actions' }, [
      el('button', {
        'class': 'uscistr-btn uscistr-btn-sm', type: 'button', text: 'Try again',
        onclick: function () { refreshCase(entry.number); }
      })
    ]);
    return banner('danger', 'warning', title, lines, actions);
  }

  // ---- collapse ------------------------------------------------------------
  //
  // Four cases produce roughly six screens of scrolling, and no single card
  // fits a viewport, so the question the panel exists to answer — has anything
  // moved? — needs a scroll to reach. Collapsing every card to a summary row
  // and expanding one turns that into a single glance. The collapsed stack is
  // itself the overview; a separate status board would render the same four
  // fields a second time, and tabs would make "anything new anywhere?" take
  // four clicks.

  function expandedMap() {
    var stored = load(STORAGE_KEYS.prefs, {});
    var map = stored && stored.expanded;
    return (map && typeof map === 'object') ? map : {};
  }

  function setExpanded(number, isOpen) {
    var map = expandedMap();
    map[String(number).toUpperCase()] = !!isOpen;
    state.prefs.expanded = map;
    persistPrefs();
  }

  // The card opened by default, when the reader hasn't chosen for themselves.
  // Obligations outrank everything: a deadline is the only thing on any card
  // that can be missed. A concluded case is never the default.
  function defaultExpandedNumber(ordered) {
    var i, entry, view;
    for (i = 0; i < ordered.length; i++) {
      entry = ordered[i];
      view = entry.result ? buildCaseView(entry) : null;
      if (!view) continue;
      if (view.upcoming.length || view.evidenceCount > 0 ||
          (view.detail && view.detail.actionRequired === true)) return entry.number;
    }
    for (i = 0; i < ordered.length; i++) {
      if (ordered[i].changedSince) return ordered[i].number;
    }
    for (i = 0; i < ordered.length; i++) {
      entry = ordered[i];
      view = entry.result ? buildCaseView(entry) : null;
      if (view && view.detail && view.detail.closed === true) continue;
      return entry.number;
    }
    return ordered.length ? ordered[0].number : null;
  }

  function isCardExpanded(entry, ordered) {
    var map = expandedMap();
    var key = String(entry.number).toUpperCase();
    // An explicit choice always wins, and persists.
    if (Object.prototype.hasOwnProperty.call(map, key)) return !!map[key];
    // With one case there is nothing to choose between, so opening it saves a
    // pointless click. With more than one, everything collapses: opening one
    // by rule guesses which case the reader came for and pushes the rest below
    // the fold. The collapsed rows carry enough — status, elapsed days, and any
    // deadline — to choose from without opening anything.
    if (ordered.length === 1) return true;
    return false;
  }

  // One row: has it changed, what is it, what does it say, how old is that.
  // Never less — this row alone has to answer "anything new?".
  function buildCollapsedCard(entry, view, onToggle) {
    var row = el('button', {
      'class': 'uscistr-collapsed', type: 'button', onclick: onToggle,
      title: 'Show the full record for this case'
    });

    var formType = (view.detail && view.detail.formType) ||
      (view.notice && view.notice.formNumber) || null;

    // Line 1 — which case, and how long it has been running. Day N is the one
    // figure that moves every day whether or not the case does.
    var filedMs = (view.detail && view.detail.submissionDate)
      ? parseUscisDate(view.detail.submissionDate) : null;
    var dayText = filedMs !== null
      ? 'Day ' + daysBetween(filedMs, new Date().getTime()) : '';

    row.appendChild(el('div', { 'class': 'uscistr-collapsed-head' }, [
      entry.changedSince
        ? el('span', { 'class': 'uscistr-collapsed-dot',
            title: 'Something changed since you last looked' })
        : null,
      formType ? el('span', { 'class': 'uscistr-chip uscistr-mono', text: String(formType) }) : null,
      el('span', { 'class': 'uscistr-collapsed-name uscistr-truncate',
        text: entry.label || plainFormName(formType) || displayNumber(entry.number) }),
      dayText ? el('span', { 'class': 'uscistr-collapsed-day', text: dayText }) : null
    ]));

    // Line 2 — USCIS's own status and when it was set, truncated to one line.
    // The full sentence is one click away; this is a scanning surface.
    var statusText = view.notice && view.notice.status ? view.notice.status
      : (view.state === 'stale' ? 'Showing the last copy we have' : 'No status published yet');
    var statusMs = view.notice && view.notice.actionCodeDate
      ? parseUscisDate(view.notice.actionCodeDate) : null;

    row.appendChild(el('div', { 'class': 'uscistr-collapsed-body' }, [
      el('span', { 'class': 'uscistr-collapsed-status uscistr-truncate', text: statusText }),
      statusMs !== null
        ? el('span', { 'class': 'uscistr-collapsed-age',
            text: relativeDate(new Date(statusMs).toISOString()) })
        : null
    ]));

    // Line 3 — only when something is actually being asked of this person.
    // Collapsing every case is only safe if a deadline can never end up hidden
    // behind a click, so this is the one line a row must never omit.
    var demand = collapsedDemand(view);
    if (demand) {
      row.appendChild(el('div', { 'class': 'uscistr-collapsed-demand' }, [
        el('span', { 'class': 'uscistr-collapsed-demand-dot' }),
        el('span', { text: demand })
      ]));
    }

    return row;
  }

  // The one thing that has to survive collapsing: anything with a date
  // attached, or anything USCIS is waiting on. Null when the case asks nothing.
  function collapsedDemand(view) {
    if (view.upcoming && view.upcoming.length) {
      var appt = view.upcoming[0];
      var when = appt.displayAt !== null ? formatDayLabel(appt.displayAt) : null;
      return (appt.label || 'Appointment') + (when ? ' · ' + when : '');
    }
    if (view.detail && view.detail.actionRequired === true) {
      return 'USCIS is waiting for something from you';
    }
    if (view.evidenceCount > 0) {
      return plural(view.evidenceCount, 'evidence request') + ' on file';
    }
    return null;
  }

  // USCIS's own form names run to eleven words. The short name is what a
  // person calls the thing they filed.
  var PLAIN_FORM_NAMES = {
    'I-485': 'Green card application',
    'I-485J': 'Job-offer confirmation',
    'I-765': 'Work permit',
    'I-131': 'Travel document',
    'I-130': 'Family petition',
    'I-140': 'Employment petition',
    'N-400': 'Naturalization',
    'I-751': 'Removing conditions',
    'I-129': 'Worker petition',
    'I-90': 'Green card renewal'
  };

  function plainFormName(formType) {
    if (!formType) return null;
    return PLAIN_FORM_NAMES[String(formType).toUpperCase()] || null;
  }

  function buildCaseCard(entry, ordered) {
    var classes = 'uscistr-card';
    var card = el('div', { 'class': classes });

    if (!entry.result) {
      card.appendChild(el('div', { 'class': 'uscistr-card-header' }, [
        el('div', { 'class': 'uscistr-card-title' }, [
          el('div', { 'class': 'uscistr-card-eyebrow' }, [
            el('span', { 'class': 'uscistr-card-label', text: entry.label || displayNumber(entry.number) })
          ]),
          el('div', { 'class': 'uscistr-card-number uscistr-mono', text: displayNumber(entry.number) })
        ]),
        el('div', { 'class': 'uscistr-card-actions' })
      ]));
      card.appendChild(el('div', { 'class': 'uscistr-muted uscistr-small', text:
        entry.loading ? 'Reading this case from my.uscis.gov. This takes a few seconds.' : 'Not checked yet.' }));
      if (entry.loading) card.appendChild(buildSkeleton());
      return card;
    }

    var view = buildCaseView(entry);

    // Collapsed by default unless this is the card the reader most likely came
    // for. A collapsed row still answers "has anything changed here?".
    if (ordered && !isCardExpanded(entry, ordered)) {
      card.className = classes + (entry.changedSince ? ' uscistr-is-changed' : '') + ' uscistr-is-collapsed';
      card.appendChild(buildCollapsedCard(entry, view, function () {
        setExpanded(entry.number, true);
        render();
      }));
      return card;
    }

    var errorNote = buildCaseErrorNote(entry);

    if (entry.changedSince) classes += ' uscistr-is-changed';
    if (view.detail && view.detail.actionRequired) classes += ' uscistr-is-attention';
    if (view.detail && view.detail.closed) classes += ' uscistr-is-closed';
    if (errorNote) classes += ' uscistr-is-error';
    card.className = classes;

    // A · identity and change state first. A returning reader should not have
    // to compare against memory to learn whether anything moved.
    card.appendChild(buildCardHeader(entry, view));

    var changeBand = buildChangeBand(entry);
    if (changeBand) card.appendChild(changeBand);

    // A failed check is reported above the case, never instead of it. When a
    // stored snapshot exists we keep drawing the card from it (marked stale),
    // because someone opening the panel after a session timeout came to see
    // their case — blanking it looks identical to the case disappearing.
    // Only when there is nothing cached does the note stand alone.
    if (errorNote) {
      card.appendChild(errorNote);
      if (!view.fromCache) {
        card.appendChild(buildRawJson(entry));
        return card;
      }
    }

    // B · a live obligation outranks everything else on the card.
    var upcomingBand = buildUpcomingBand(view);
    if (upcomingBand) card.appendChild(upcomingBand);

    var obligation = buildObligationBand(entry, view);
    if (obligation) card.appendChild(obligation);

    var attention = buildAttentionBanner(view);
    if (attention) card.appendChild(attention);

    // C/D · status headline and its age.
    card.appendChild(buildStatusBlock(entry, view));

    var backendNote = buildBackendNote(entry, view);
    if (backendNote) card.appendChild(backendNote);

    // F · elapsed, stage map, quiet meter.
    // Elapsed time and the stage map are derived from the filing date and the
    // codes we already stored, so they stay meaningful when drawn from cache.
    if (view.hasData || view.fromCache) card.appendChild(buildProgressModule(entry, view));

    // H · timeline.
    var timelineSection = el('div', { 'class': 'uscistr-section' }, [
      sectionTitle('Timeline', view.items.length ? view.items.length : null)
    ]);
    timelineSection.appendChild(buildTimeline(entry, view));
    card.appendChild(timelineSection);

    // I · the fields USCIS's own website never shows. Deliberately NOT wrapped
    // in a titled section: it is a four-row label/value table, and a caps
    // heading plus its rule cost more vertical space than the rows do. The
    // labels are the heading.
    var fields = buildFieldRows(entry, view);
    if (fields.childNodes.length) card.appendChild(fields);

    // J · documents. A zero-count section does not render at all.
    var docsSection = buildDocuments(entry, view);
    var docsNoteText = null;
    if (docsSection) {
      card.appendChild(el('div', { 'class': 'uscistr-section' }, [
        sectionTitle('Documents', view.docs.length), docsSection
      ]));
    } else if (view.hasData) {
      docsNoteText = documentsNoteText(entry, view);
    }

    var floorText = null;
    if (!view.hasData) {
      // Every endpoint answered, and every one of them was empty. That is not
      // the same as "there is nothing to find", and it does not get that copy.
      floorText = 'USCIS returned no case data at all on this check, so we cannot say what is on the record right now. That sometimes means the receipt number is filed in an older system this tool cannot read. Check my.uscis.gov directly.';
    } else if (view.items.length <= 3 && (!view.docs || !view.docs.length)) {
      // The sparse floor: this converts "the tool found nothing" into "there
      // is nothing to find", which are very different experiences.
      floorText = 'This is everything USCIS publishes for this case right now. USCIS publishes very little while a case is new. Anything they add, this panel will show and record — including backend activity their website does not show.';
    }

    // On a sparse case both of these fire, and two stacked dashed boxes read
    // as two warnings about a case where nothing is wrong. One box with two
    // paragraphs reads as a single considered statement. Both sentences are
    // kept verbatim: "USCIS lists none" and "there is nothing further to find"
    // are different claims and neither may be dropped for the other.
    var notes = noteBox([docsNoteText, floorText]);
    if (notes) card.appendChild(notes);

    // K · freshness, then the three labelled per-case actions.
    card.appendChild(el('div', { 'class': 'uscistr-muted uscistr-small', text:
      'Checked ' + (relativeDate(entry.result.fetchedAt) || 'just now') +
      (view.office ? ' · ' + String(view.office) : '') }));

    card.appendChild(el('div', { 'class': 'uscistr-card-footer' }, [
      el('button', {
        'class': 'uscistr-btn uscistr-btn-sm uscistr-btn-outline', type: 'button',
        text: entry.loading ? 'Refreshing…' : 'Refresh', disabled: entry.loading,
        onclick: function () { refreshCase(entry.number); }
      }),
      buildCopyButton(entry),
      el('button', {
        'class': 'uscistr-btn uscistr-btn-sm uscistr-btn-danger', type: 'button', text: 'Remove',
        onclick: function () {
          if (!window.confirm('Remove ' + displayNumber(entry.number) + ' from CaseLens?\n\n' +
            'Saved history for this case is deleted from this browser, and the case will stay ' +
            'hidden even though it is still listed on your USCIS account. Adding it again later ' +
            'starts its history over.')) return;
          var idx = state.cases.indexOf(entry);
          if (idx !== -1) state.cases.splice(idx, 1);
          // Remember the removal, or auto-discovery puts the case straight back
          // on the next page load and the button looks broken.
          setDismissed(entry.number, true);
          forgetCase(entry.number);
          persistCases();
          render();
        }
      })
    ]));

    card.appendChild(buildRawJson(entry));
    return card;
  }

  // Cards are otherwise drawn in the order receipt numbers happen to appear on
  // the account page, which put a finished case first and pushed every case
  // whose clock is still running below it. Order by what the reader needs:
  // something is required of you, then something changed, then still-open
  // cases, then concluded ones.
  function caseSortRank(entry) {
    var view = entry.result ? buildCaseView(entry) : null;
    var detail = view ? view.detail : null;

    var hasObligation = !!(view && (view.upcoming.length ||
      (detail && detail.actionRequired === true) || view.evidenceCount > 0));
    if (hasObligation) return 0;
    if (entry.changedSince) return 1;
    if (detail && detail.closed === true) return 3;
    return 2;
  }

  function casesInReadingOrder() {
    var decorated = [];
    for (var i = 0; i < state.cases.length; i++) {
      decorated.push({ entry: state.cases[i], rank: caseSortRank(state.cases[i]), pos: i });
    }
    decorated.sort(function (a, b) {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.pos - b.pos;   // stable: order never shuffles between renders
    });
    var out = [];
    for (var j = 0; j < decorated.length; j++) out.push(decorated[j].entry);
    return out;
  }

  // ---- panel assembly, refresh, render ---------------------------------

  function buildPanel() {
    var panel = el('div', {
      'class': 'uscistr-panel',
      role: 'complementary',
      'aria-label': 'CaseLens — USCIS case tracker'
    });
    positionPanel(panel);

    panel.appendChild(buildHeader());

    var body = el('div', { 'class': 'uscistr-body' });
    if (state.sessionExpired) body.appendChild(buildSessionBanner());
    body.appendChild(buildAddCaseForm());

    if (state.cases.length === 0) {
      body.appendChild(buildEmptyState());
    } else {
      var list = el('div', { 'class': 'uscistr-case-list' });
      var ordered = casesInReadingOrder();
      for (var i = 0; i < ordered.length; i++) list.appendChild(buildCaseCard(ordered[i], ordered));
      body.appendChild(list);
    }
    body.appendChild(buildStandingDisclaimer());
    panel.appendChild(body);

    panel.appendChild(buildFooter());
    if (uiState.settingsOpen) panel.appendChild(buildSettingsPopover());

    return panel;
  }

  // Fetch one case's data and update its entry in place. Safe to call even
  // while a refresh is already in flight for it (no-op in that case).
  function refreshCase(number) {
    var entry = null;
    for (var i = 0; i < state.cases.length; i++) {
      if (state.cases[i].number === number) { entry = state.cases[i]; break; }
    }
    if (!entry || entry.loading) return Promise.resolve();

    // Captured before the fetch so the card can say what changed and when we
    // last looked. applyFetchResult() overwrites both.
    var previousSnapshot = getSnapshot(number);
    var previousHistoryLength = getHistory(number).length;

    entry.loading = true;
    render();
    return fetchAllForCase(number).then(function (result) {
      entry.loading = false;
      applyFetchResult(entry, result);
      var history = getHistory(number);
      var added = history.length - previousHistoryLength;
      if (added > 0) {
        entry.newChanges = history.slice(0, added);
        entry.lastLookedAt = previousSnapshot ? previousSnapshot.at : null;
      }
      render();
    });
  }

  // Refresh every tracked case strictly one after another (never in
  // parallel) — the same politeness constraint fetchAllForCase() applies
  // within a single case, just extended across cases.
  function refreshAll() {
    var chain = Promise.resolve();
    for (var i = 0; i < state.cases.length; i++) {
      (function (entry) {
        chain = chain.then(function () {
          if (entry.loading) return Promise.resolve();
          return refreshCase(entry.number);
        });
      })(state.cases[i]);
    }
    return chain;
  }

  function restartRefreshTimer() {
    if (refreshTimerId !== null) clearInterval(refreshTimerId);
    refreshTimerId = setInterval(function () {
      if (document.visibilityState === 'visible') refreshAll();
    }, state.prefs.refreshMs);
  }

  // Rebuild the whole pill/panel from current state. Idempotent and cheap
  // enough to call after every mutation rather than hand-patching the DOM;
  // the only piece of UI state NOT derivable from `state`/`prefs` is the
  // add-case form text and the per-card disclosure flags, which live in
  // uiState/on the entry so they survive a rebuild triggered by, say, a
  // background refresh completing.
  function render() {
    if (!ROOT) return;

    // render() rebuilds the panel wholesale — that is deliberate and is what
    // makes the UI easy to reason about. The cost is that scroll position and
    // keyboard focus die with the old DOM, and the background refresh calls
    // this twice per case on a timer, so a reader mid-way down a card gets
    // thrown to the top while reading. Capture both, restore both.
    var scroller = ROOT.querySelector('.uscistr-body');
    var scrollTop = scroller ? scroller.scrollTop : 0;
    var focusKey = focusIdentityOf(document.activeElement);

    renderInto();

    var newScroller = ROOT.querySelector('.uscistr-body');
    if (newScroller && scrollTop) newScroller.scrollTop = scrollTop;
    if (focusKey) restoreFocus(focusKey);
  }

  // Identify the focused control well enough to find its replacement after the
  // rebuild. Buttons are identified by their accessible label, inputs by name.
  function focusIdentityOf(node) {
    if (!node || !ROOT || !ROOT.contains(node)) return null;
    var tag = (node.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') {
      return { sel: tag + '.' + (node.className || '').split(' ')[0], caret: node.selectionStart };
    }
    var label = node.getAttribute('title') || node.textContent || '';
    return label ? { tag: tag, label: label.trim().slice(0, 60) } : null;
  }

  function restoreFocus(key) {
    var candidates = ROOT.querySelectorAll(key.sel || key.tag || 'button');
    for (var i = 0; i < candidates.length; i++) {
      var node = candidates[i];
      var label = (node.getAttribute('title') || node.textContent || '').trim().slice(0, 60);
      if (key.label && label !== key.label) continue;
      try {
        node.focus();
        if (typeof key.caret === 'number' && node.setSelectionRange) {
          node.setSelectionRange(key.caret, key.caret);
        }
      } catch (e) { /* element may not be focusable after the rebuild */ }
      return;
    }
  }

  function renderInto() {
    if (!ROOT) return;
    ROOT.className = 'uscistr-root' + (state.prefs.dark ? ' uscistr-dark' : '');
    clearNode(ROOT);
    ROOT.appendChild(state.prefs.collapsed ? buildPill() : buildPanel());
  }

  // ==========================================================================
  // SECTION 7: Bootstrapping + auth gating
  // ==========================================================================
  // init(): checkAuthenticated() -> if not authed, render NOTHING and stop —
  //   no pill, no injected <style>, no DOM footprint at all. Otherwise
  //   auto-discovery is the primary flow: receipt numbers are read out of the
  //   account page (the case-list endpoint returns an empty array even for
  //   accounts with active cases), merged into state.cases, and refreshed.

  // Add any case found on the page that we aren't already tracking. Returns
  // the receipt numbers added, so callers can decide whether to fetch them.
  // Receipt numbers the user removed, as a lookup. Auto-discovery re-reads the
  // account page every load, so this is what makes Remove stick.
  function loadDismissed() {
    var stored = load(STORAGE_KEYS.dismissed, {});
    return (stored && typeof stored === 'object') ? stored : {};
  }

  // Drop every trace of a case the user removed. The confirm dialog promises
  // the saved history is deleted, so it has to actually go — including the
  // snapshot the change-detector would otherwise diff against later.
  function forgetCase(number) {
    var key = String(number).toUpperCase();

    var snapshots = load(STORAGE_KEYS.snapshots, {});
    if (snapshots[key] || snapshots[number]) {
      delete snapshots[key];
      delete snapshots[number];
      save(STORAGE_KEYS.snapshots, snapshots);
    }

    var history = load(STORAGE_KEYS.history, {});
    if (history[key] || history[number]) {
      delete history[key];
      delete history[number];
      save(STORAGE_KEYS.history, history);
    }
  }

  function setDismissed(number, isDismissed) {
    var dismissed = loadDismissed();
    var key = String(number).toUpperCase();
    if (isDismissed) dismissed[key] = new Date().toISOString();
    else delete dismissed[key];
    save(STORAGE_KEYS.dismissed, dismissed);
  }

  function mergeDiscoveredCases() {
    var discovered = discoveredCaseNumbers();
    var dismissed = loadDismissed();
    var addedNumbers = [];

    for (var i = 0; i < discovered.length; i++) {
      var d = discovered[i];
      // The user removed this one. Auto-discovery must not undo that.
      if (dismissed[d.number.toUpperCase()]) continue;
      var exists = false;
      for (var j = 0; j < state.cases.length; j++) {
        if (state.cases[j].number.toUpperCase() === d.number.toUpperCase()) {
          exists = true;
          break;
        }
      }
      if (exists) continue;

      state.cases.push({
        number: d.number,
        label: d.label || '',
        addedAt: new Date().toISOString(),
        result: null,
        loading: false,
        changedSince: false
      });
      addedNumbers.push(d.number);
    }

    if (addedNumbers.length) persistCases();
    return addedNumbers;
  }

  // my.uscis.gov is a single-page app: the case list may not be on screen when
  // we start, and navigating within the account swaps content without a page
  // load. Re-read the page on navigation and for a short while after startup so
  // cases are picked up wherever the user happens to land. Scans are cheap
  // (one text read) and stop once the page settles.
  function watchForNewCases(alreadyAdded) {
    var scansLeft = alreadyAdded.length ? 4 : 8;

    function scan() {
      if (!state.authenticated) return;
      var added = mergeDiscoveredCases();
      if (added.length) {
        render();
        for (var i = 0; i < added.length; i++) refreshCase(added[i]);
      }
    }

    var intervalId = setInterval(function () {
      scansLeft -= 1;
      if (scansLeft <= 0) clearInterval(intervalId);
      scan();
    }, 2000);

    window.addEventListener('popstate', scan);
    window.addEventListener('hashchange', scan);
  }

  function init() {
    checkAuthenticated().then(function (authResult) {
      // Not logged in to my.uscis.gov: render absolutely nothing (no pill,
      // no injected <style>, no DOM footprint) rather than show a broken UI.
      if (!authResult || !authResult.authenticated) return;

      state.authenticated = true;
      loadAll();

      var addedAtStartup = mergeDiscoveredCases();

      injectStyle();

      ROOT = el('div', { 'class': 'uscistr-root' });
      document.body.appendChild(ROOT);
      render();

      document.addEventListener('keydown', function (e) {
        // Match on physical key: on macOS Alt+U produces a dead-key diaeresis
        // ('¨') rather than 'u', so testing e.key made the advertised shortcut
        // silently do nothing there.
        if (!e.altKey || e.ctrlKey || e.metaKey) return;
        if (e.code !== 'KeyU' && e.key !== 'u' && e.key !== 'U') return;

        // Don't steal the keystroke from someone typing a nickname.
        var target = e.target;
        if (target) {
          var tag = (target.tagName || '').toUpperCase();
          if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return;
        }

        e.preventDefault();
        state.prefs.collapsed = !state.prefs.collapsed;
        persistPrefs();
        render();
      });

      // Escape closes the settings popover. Without this it covers the first
      // card until the user happens to find the same icon again.
      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape' && e.key !== 'Esc') return;
        if (!uiState.settingsOpen) return;
        uiState.settingsOpen = false;
        render();
      });

      // So does clicking anywhere outside it.
      document.addEventListener('mousedown', function (e) {
        if (!uiState.settingsOpen || !ROOT) return;
        // The popover's class is uscistr-popover. An earlier version of this
        // handler looked for "uscistr-settings", which matches nothing — so a
        // mousedown inside the popover closed it and re-rendered before the
        // click could land, making every setting unreachable by mouse. Use
        // closest() so a future rename fails loudly rather than silently.
        var target = e.target;
        if (target && target.closest) {
          if (target.closest('.uscistr-popover')) return;
          if (target.closest('[data-uscistr-settings-toggle]')) return;
        }
        uiState.settingsOpen = false;
        render();
      });

      if (state.cases.length > 0) refreshAll();

      restartRefreshTimer();
      watchForNewCases(addedAtStartup);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
