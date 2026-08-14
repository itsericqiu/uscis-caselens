# The record view (1.19)

Turning the raw-JSON disclosure into a readable list of every field USCIS
returned, without editorialising any of it.

## Why

The panel interprets: a status headline, a timeline, a stage map. Underneath
that sits everything USCIS actually sent, and today it is five collapsible
blobs of pretty-printed JSON. That is honest and complete, and it is a wall
for the person this tool is for. Braces, quotes and commas are syntax they did
not ask to learn, in the one place that answers "what does USCIS actually know
about my case?"

The fix is presentational, and deliberately small: the same data, the same
order, minus the punctuation.

## What this is not

A devtools panel. No request headers, no session tokens, no cURL, no replay,
no box for calling arbitrary endpoints. Those answer "what did the wire look
like" for a developer; this answers "what does the agency have on file" for an
applicant. The distinction is also a safety property — the transport is where
the credentials are, and this view never touches it.

## The rule: show, do not editorialise

Every rejected embellishment was rejected for the same reason. This view's
whole job is to be the unreshaped copy, so anything that reorders, renames or
reformats undermines the only thing it offers.

- **No curated field order.** Response order is what USCIS sent. Reordering
  imposes our judgement about what matters, and the card above already does
  that job.
- **No friendly-label dictionary.** Keys are humanised mechanically
  (`submissionTimestamp` → "Submission timestamp"). A hand-maintained map
  quietly renames USCIS's fields and is a permanent maintenance cost for
  little gain. Add a label only if a key proves genuinely opaque.
- **No value reformatting.** `2026-07-09T21:59:03.805Z` renders as sent.
  Reshaping dates in the view that exists to show data unreshaped would be
  self-defeating — and date reshaping is precisely what the standing
  disclaimer warns about.

Collapsing is the exception, and it is a different category: it imposes
nothing on the data, it manages length. The existing view already collapses
per endpoint; removing that would be a regression in navigability, not a
simplification.

## Shape

Five sections, one per endpoint, collapsed by default with their status chip —
unchanged from today. What changes is the expanded content:

- Scalars render as `Humanised key` → `value`.
- Objects nest, shown by indentation.
- Arrays collapse behind a row carrying their count: `Events (8)`.
- **Show as JSON** sits inside each section, one level deeper, for anyone who
  wants the exact bytes. Nothing is lost; the technical view is demoted, not
  removed.

The count on a collapsed array does double duty: `Events (0)` (they sent an
empty array) reads differently from no Events row at all (they did not send
the field). The distinction between "nothing" and "not provided" survives at a
glance, which is the same rule the rest of the panel follows.

A field present with a `null` value renders explicitly as empty — USCIS sent
the field. A field they did not send gets no row. Collapsing those two would
be the same lie the panel refuses everywhere else.

New fields need no code. The walker enumerates whatever arrives, so a field
USCIS adds next year appears on its own — less prettily labelled, but present.
Nothing anywhere lists the fields this view can show, which is the point: it
cannot silently fall behind the API.

## Consolidation: one redaction policy

`redactRawJson` is a regex over the serialised JSON string. It masks receipt
numbers anywhere, and matches `"applicantName": "…"` for the 30 names in
`REDACT_JSON_FIELDS`.

**A field walker cannot reuse it.** The name rule depends on seeing
`"key": "value"` as text; handed a bare value it matches nothing and silently
does nothing — a leak that looks correct on screen.

So the policy is extracted first, before any rendering work:

    redactFieldValue(key, value)   // the single policy
    redactRawJson(text)            // rebuilt on it, or held to it by test

Both renderers consult the same list. Adding a field to `REDACT_JSON_FIELDS`
protects both automatically. Two independent redactors would drift, and the
drift would be invisible until someone screen-shared.

A second, smaller consolidation: `caseResponses(entry)` returns the five
labelled payloads, used by **both** `buildExportPayload` and this view — so
what a person reads on screen and what they save to a file are provably the
same set, rather than two hand-maintained lists that can diverge.

## Build order

1. Extract `redactFieldValue`; prove by test that both paths hide identically.
   No behaviour change.
2. Add `caseResponses(entry)`; point the export at it.
3. Write the walker (recursive, humanised keys, response order, arrays with
   counts, depth cap, text nodes only).
4. Rewire `buildRawJsonBody` to render the walker, JSON behind a per-section
   toggle; relabel to "Everything USCIS sent".
5. Tests: humanise units, redaction agreement, and extend the property fuzzer —
   the walker renders *arbitrary* API shapes rather than known fields, so it is
   exactly the surface fuzzing is for.
6. Docs: README line; `PRIVACY.md` should need no change, since the policy is
   identical by construction — confirm rather than assume.

## Risks

- **Deep nesting** → deep DOM. Capped, with the cap stated in the UI rather
  than silently truncating.
- **Large payloads** on expand. Already mitigated: sections render lazily on
  first open, and that stays.
- **Cycles** are impossible — these objects come from `JSON.parse` — but the
  fuzzer should prove the walker cannot throw regardless.
- **Values are never markup.** Same rule as everywhere: text nodes only.
  USCIS's `statusText` genuinely contains HTML anchors.
