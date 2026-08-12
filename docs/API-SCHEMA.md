# CaseLens verified USCIS endpoint schemas

Captured live from a logged-in my.uscis.gov session (August 2026) against four
real cases (I-485, I-485J, I-765, I-131). Receipt numbers below are placeholders.

Every response is wrapped in a `{"data": ...}` envelope. Unwrap `.data` first.

---

## 1. `GET /account/case-service/api/cases` — case list

**Returns `{"data": []}` — an empty array even for an account with four active
cases.** Not usable for auto-discovery. It is still a good *authentication
probe*: 200 + JSON content-type means the session is live.

Auto-discovery instead reads receipt numbers from the account page DOM
(`/account/applicant` server-renders them as `Receipt # IOE#########`), which
costs zero extra requests.

## 2. `GET /account/case-service/api/cases/{num}` — case detail

```json
{"data": {
  "receiptNumber": "IOE0000000000",
  "submissionDate": "2026-05-29",
  "submissionTimestamp": "2026-05-29T00:00:00.000Z",
  "formType": "I-485",
  "formName": "Application to Register Permanent Residence or Adjust Status",
  "updatedAt": "2026-07-31",
  "updatedAtTimestamp": "2026-07-31T13:07:45.006Z",
  "closed": false,
  "actionRequired": false,
  "cmsFailure": false,
  "ackedByAdjudicatorAndCms": true,
  "applicantName": "LAST, FIRST",
  "representativeName": "LAST, FIRST",
  "nonElisPaperFiled": false,
  "noticeMailingPrefIndicator": true,
  "docMailingPrefIndicator": false,
  "elisChannelType": "Lockbox",
  "isPremiumProcessed": false,
  "areAllGroupStatusesComplete": false,
  "areAllGroupMembersAuthorizedForTravel": true,
  "elisBeneficiaryAddendum": {},
  "concurrentCases": [], "documents": [], "evidenceRequests": [],
  "addendums": [],
  "notices": [{
    "receiptNumber": "IOE0000000000",
    "letterId": "440000000",
    "generationDate": "2026-06-19T23:43:31.809Z",
    "appointmentDateTime": "2026-07-09T19:00:00.000Z",
    "actionType": "Appointment Scheduled"
  }],
  "events": [{
    "receiptNumber": "IOE0000000000",
    "eventId": "<uuid>",
    "eventCode": "FTA0",
    "createdAt": "2026-07-09",
    "createdAtTimestamp": "2026-07-09T21:59:03.805Z",
    "updatedAt": "2026-07-09",
    "updatedAtTimestamp": "2026-07-09T21:59:03.805Z",
    "eventDateTime": "2026-07-09",
    "eventTimestamp": "2026-07-09T21:58:24.159Z"
  }]
}}
```

Key points:
- `formType` here is what the processing-times URL needs.
- `events[]` carries **codes only, no text** — render via `eventCode` +
  `eventDateTime`. Observed counts ranged 1–8 per case, often more granular
  than the visible Case History tab.
- `updatedAtTimestamp` can be **much newer than the visible status date**
  (observed: status dated Jul 9, record updated Jul 31). This is the
  "backend touched your case" signal the website never shows.

## 3. `GET /account/case-service/api/case_status/{num}` — status + history + office

The richest endpoint. This is the real status source, not #2.

```json
{"data": {
  "receiptNumber": "IOE0000000000",
  "formType": "I-765",
  "currentActionCode": "FTA0",
  "currentActionCodeDate": "2026-07-09T21:58:24.000Z",
  "statusTitle": "USCIS Is currently Processing the Case",
  "statusText": "As of July 9, 2026, ... <a href=\"...\">www.uscis.gov/addresschange</a> ...",
  "statusTitleSpanish": "...", "statusTextSpanish": "...",
  "jurisdiction": "NSC",
  "jurisdictionDescription": "NEBRASKA SERVICE CENTER",
  "message": "Query was successful for payload {'receipt_number': 'IOE0000000000'}",
  "isPremiumProcessed": false,
  "isPremiumRefunded": false,
  "historicalCaseStatuses": [{
    "date": "07-18-2026 00:00:00",
    "actionCode": "LDA",
    "statusTitle": "This project produced your new card ...",
    "statusTitleSpanish": "..."
  }]
}}
```

Key points:
- **`statusText` contains raw HTML anchors.** Never assign it with `innerHTML`.
  Strip tags and render as text.
- `jurisdiction` / `jurisdictionDescription` is the **real office location**
  (endpoint #4 returns null). Observed: NBC = National Benefits Center,
  NSC = Nebraska Service Center.
- `historicalCaseStatuses[]` is a **full status timeline with dates and text**
  — the best timeline source available. Dates use `MM-DD-YYYY HH:mm:ss`, which
  `new Date()` does NOT parse reliably; parse manually.
- Observed counts: 0–4 entries. Some cases have none.

## 4. `GET /secure-messaging/api/case-service/receipt_info/{num}` — location

**Returns `{"data": null}`.** Dead for these accounts. Keep as a best-effort
extra; use `jurisdiction` from #3 as the real location.

## 5. `GET /account/case-service/api/cases/{FORM}/processing_times/{num}`

**Returns HTTP 204 No Content for every form tested** (I-485, I-485J, I-765,
I-131). No body at all. The progress bar cannot rely on this; treat 204 as
"unavailable" and fall back to elapsed-time-since-filing.

## 6. `GET /account/case-service/api/cases/{num}/documents`

```json
{"data": [{
  "fileName": "IOE0000000000-0000000000000-part1.tif",
  "contentId": "<43-char opaque base64url id>",
  "type": "Other",
  "createDate": "2026-06-04T02:09:53.542+0000",
  "sourceType": "Applicant Provided"
}]}
```

Note: `.tif` files, no direct `url` field — only an opaque `contentId`. Name
field is `fileName`, date field is `createDate`.

## 7. `GET /account/case-service/api/cases/{num}/history`

**Returns HTTP 404.** This endpoint does not exist, despite community
documentation claiming it does. Removed from the tool.

---

## Event / action codes

Raw `events[].eventCode` values carry no text. Two translation layers:

1. **Self-harvested (preferred)**: `historicalCaseStatuses[]` and
   `currentActionCode` pair codes with official `statusTitle` text. Harvest
   these pairs at runtime into a local dictionary and use them to label bare
   event codes. Observed live: `SA` → "…has been approved", `LDA` → "We
   produced your new card…", `FTA0` → "…currently processing…".
2. **NIEM schema (fallback)** — the official federal definitions. USCIS event
   codes are the enumeration of NIEM type
   `scr:BenefitDocumentStatusCategoryCodeSimpleType`, an open government data
   standard. **492 codes**, verified by counting the published enumeration
   directly (not an estimate). Shipped in `core/uscis-codes.js`.

   These are USCIS's *internal operations* descriptions, not customer-facing
   status language, so they are labelled as such and the raw code is always
   shown alongside.

   Confirmed against live data: `IAF` = receipt letter emailed, `FTA0` =
   database checks received, `LDA` = card produced, `DA` = approved/notice
   ordered.

   **Known gap:** USCIS also uses codes that are *not* in the published schema.
   `SA` — which marked a real case approved — is absent, as is `RCV0`, a code
   cited in a widely-repeated community "typical progression". Treat any
   third-party code list with corresponding caution, and expect unknown codes.

| Code | Community meaning |
|---|---|
| H001 | Case created |
| IAF | Receipt letter emailed |
| IAA | Receipt notice sent |
| FSA0 | Database checks requested |
| FTA0 | Database checks received |
| FT0 | Officer processing begun |
| FNA | Fingerprint appointment notice ordered |
| IMAF | Fingerprint appointment notice sent |
| FNB | Fingerprints taken |
| FNG | Fingerprint processing complete — match found |
| FNH | Fingerprint processing complete — no match found |
| MA70 | Biometrics received from ASC |
| H008 | Biometrics reused |
| FH | Placed in interview queue |
| FHB | Ready for interview scheduling |
| FJ | Interview scheduled |
| IM | Interview notice sent |
| HG | Interview conducted |
| FKA | Interview descheduled |
| FM | Interview rescheduled |
| DA | Approved |
| DB | Approved & certified |
| IEA | Approval notice sent |
| IEE | Approval letter emailed |
| IEC | Welcome notice sent |
| LAA | Card request sent to print server |
| LBA | Card order received at production facility |
| LDA | Card produced |
| LEA | Card mailed |
| LFA | Card returned as undeliverable |
| FBA | RFE notice ordered |
| IK | RFE sent |
| II | Notice of intent to deny |
| EA | Denial notice ordered |
| IFA | Denial notice sent |
| BC | Relocated to field office for interview |
| BA | Relocated for processing |
| FS | Adjudication hold placed |
| FR | Adjudication hold lifted |
| KH | Litigation hold placed |

Codes observed live but NOT in community lists: `SA` (paired with "approved"
status text). Proof the self-harvesting layer is necessary.

## Community-source accuracy scorecard

| Claim | Verdict |
|---|---|
| `/api/cases/{num}` returns case status | Correct (wrapped in `data`) |
| `/api/case_status/{num}` returns receipt notice | Understated — it's the richest endpoint |
| `/api/cases/{num}/documents` lists documents | Correct |
| `/api/cases/{FORM}/processing_times/{num}` | Exists but 204 empty in practice |
| `/secure-messaging/.../receipt_info/{num}` gives location | Returns null; use `jurisdiction` |
| `/api/cases/{num}/history` gives a timeline | **False — 404** |
| bare `/api/cases` lists your cases | **False — empty array** |
