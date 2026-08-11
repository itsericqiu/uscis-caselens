# CaseLens — binding design spec

Synthesis of the three specialist specs in this directory. Where they conflict,
the decision here wins. Read this first; the source specs supply the detail.

- `01-information-architecture.md` — hierarchy, microcopy, anxiety-aware content
- `02-visual-system.md` — tokens, components, stylesheet (§6), immunity layers
- `03-timeline-and-progress.md` — timeline merge, provenance, progress treatment

## The one rule that outranks everything

**Never show the user something we cannot derive from their own case data.**

This tool is read by people whose ability to work, travel, or stay in the
country depends on these cases. A confident-looking number that turns out to be
invented is worse than a blank space. When polish and honesty conflict, honesty
wins and we say plainly that we don't know.

---

## Conflict 1 — the progress bar. RESOLVED: timeline spec wins.

`02-visual-system.md` renders a percentage ("14 months elapsed · 62%") captioned
*"against the 22-month median reported by other filers."*

**Rejected.** We have no crowdsourced median. Acquiring one would mean sending
case data to a third-party service, which breaks the privacy contract that is
the whole basis of this tool. The percentage also implies measurable progress
toward a decision that nobody can predict.

**Could we get a legitimate estimate from somewhere else?** Investigated and
ruled out (tested live, August 2026):

- **USCIS's own published processing times** (`egov.uscis.gov/processing-times/
  api/processingtime/{form}/{office}`) would be official and citable, and we
  already hold both inputs — `formType` and the `jurisdiction` code. But it is
  a different origin and **CORS blocks it from page context**; all three
  endpoints tested returned `TypeError: Failed to fetch`. Reaching it would
  require either extension `host_permissions` (destroying the zero-permission
  audit story and making the extension behave differently from the userscript)
  or `GM_xmlhttpRequest` (breaking `@grant none`). Both sacrifice a core pillar
  for an office-wide average that says nothing about a specific case.
- **Community trackers** (Trackitt, Lawfully, VisaJourney and similar) are
  self-selected samples with no published methodology, and using them means
  either transmitting case data to a third party or shipping a stale scraped
  table. Rejected on both accuracy and privacy grounds.

Conclusion: no external estimate is worth the architectural cost. Everything we
show about timing is derived from the user's own case.

**Ship instead**, per `03-timeline-and-progress.md`:
- `Day 143` elapsed framing as the numeric anchor, with the filing date
- The **equal-width stage rail** — geometry deliberately carries no time
  information so it cannot be misread as a gauge
- The **quiet-stretch meter**: current silence compared to this case's own
  longest previous gap ("Quiet for 22 days · longest so far: 41"). Honest,
  personal, derived entirely from the user's own history, and it changes
  between visits even when the case does not.
- A percentage bar appears **only** when USCIS itself returns a processing-time
  estimate (rare — the endpoint usually 204s). Never synthesized.

## Conflict 2 — semantic colour. RESOLVED: split by data provenance.

`01` argues for no semantic colour (an approval isn't green, a denial isn't
red) because classifying `statusTitle` text is guesswork — recall that the live
code `SA` appeared in no community list. `02` assigns four semantic hues to case
state.

**Decision — colour may encode state only when a structured field says so,
never when we inferred it from prose:**
- Allowed: `actionRequired === true` (boolean from the API) → attention
  treatment. `closed === true` (boolean) → settled/neutral treatment.
- Allowed: "changed since you last looked" → the indigo/new accent. This is our
  own observation about our own record, not a claim about the case.
- **Forbidden**: deriving approved/denied/good/bad by pattern-matching
  `statusTitle` or `statusText`, and colouring anything on that basis.
- Consequence: a status headline is never green or red. It is body text.

### What may raise the attention banner (added 1.8.1)

The banner is the only alarm this panel raises, so it is the one place a guess
is least acceptable. A code may raise it only when the NIEM description we
already ship in `core/uscis-codes.js` plainly supports the sentence the banner
prints. The category and its citation live together in `ACTION_CODES`.

- **Allowed**: codes whose schema text says USCIS asked this person for
  something (`FBA`, `IK`, `II`), and `LFA` — a card returned undeliverable,
  which is actionable but is not USCIS waiting on a response, so it gets its
  own wording.
- **Forbidden**: denials and internal holds. `EA` and `IFA` are *denial*
  notices; an earlier flat list raised "USCIS may need something from you" on
  both, which is a serious mis-label to put in front of someone whose case was
  just denied. `FKA` (deschedule), `FS` (adjudication hold) and `KH`
  (litigation hold) ask nothing of anyone.
- **Consequence**: an outcome is never announced by us. USCIS's own status
  wording carries it, and the timeline still shows the coded event with its
  schema description and its provenance.
- The banner is amber, never red — it names something to do, not a verdict.

## Conflict 3 — provenance tags. RESOLVED: timeline spec wins.

Replace the current `[USCIS]` / `[detected]` inline chips (they cost ~65px per
row and conflate two different kinds of USCIS data) with `03`'s three-tier
system: node shape + a plain-English meta-line suffix (`· USCIS`,
`· USCIS event FTA0`, `· noticed by this tool`), colour last.

---

## Adopted wholesale

**From `02-visual-system.md`:** the "Quiet Instrument" direction; the full token
system (colour light+dark, type scale, spacing, radii, shadows, motion); every
component spec; the host-CSS immunity layers; the uncertainty treatments
(dashed note boxes, HTTP status chips on raw blocks, `UNOFFICIAL` tag on guessed
labels with the raw code never hidden). Honour §5.1's two hard-won findings: do
not let the reset collapse SVG geometry, and paint icons via CSS class not
presentation attributes.

> ~~the stylesheet in §6 including its compatibility aliases~~ — **superseded
> (DC-2, 1.10.0).** `02` §6 no longer contains a stylesheet. The shipped one is
> [`core/uscis-style.js`](../../core/uscis-style.js) and is the only copy.

**From `01-information-architecture.md`:** the card ordering (identity+change
state first, status headline second — a returning reader should not have to
compare against memory to learn whether anything moved); the disclosure rule
(always visible = anything that can change between two visits, plus the day
count); the Spanish toggle using USCIS's own `statusTitleSpanish` /
`statusTextSpanish`; every microcopy string, especially the no-change buckets;
the "floor" guaranteeing a sparse case reads as *nothing to find* rather than
*broken*; never rendering an empty USCIS array as "you have none".

**From `03-timeline-and-progress.md`:** the merge/sort/dedupe algorithm
(day-precision entries sort to end-of-day so the official headline leads its
day group; 36h dedupe window gated on code equality; local status-change rows
absorbed into the matching official row as "You first saw this on …" rather
than printed twice); never rendering a time we did not receive; the per-form
stage sequences with a fully-hollow rail when nothing maps; and the rejection
list (no predicted dates, no "cases like yours take N months", no fabricated
timestamps, no gamification, no pulsing Now node).

> ~~the co-filed group strip~~ — **REJECTED (SP-10).** `concurrentCases` is
> empty on every live case observed, and grouping by filing date instead would
> assert a legal relationship between two cases that the data does not state.

## Event codes: three tiers of knowledge, and how we admit ignorance

Codes come from NIEM (`scr:BenefitDocumentStatusCategoryCodeSimpleType`), an
open federal data standard enumerating 492 values with descriptions. Verified
against live data: `IAF`, `FTA0`, `LDA`, `DA` all match exactly.

Resolve a code in this order, and **always show the raw code regardless**:

1. **Harvested** — USCIS's own customer-facing wording, learned from this
   user's own `historicalCaseStatuses`. Best tier: it is what USCIS actually
   tells this person. Label: none needed.
2. **NIEM schema** — the official federal definition, sentence-cased for
   display. These are *internal operations* phrases ("APPROVED/NOTICE
   ORDERED"), not customer-facing status. Label: "system description".
3. **Unknown** — no entry in either. Do not guess. Do not hide.

**Unknown codes are a first-class state, not an error.** Two live findings prove
they will happen: `SA` (which marked a real case approved) and `RCV0` (cited in
a widely-repeated community "typical progression") are both absent from the
NIEM enumeration. USCIS uses codes outside the published standard.

Requirements for tier 3:
- Render the row normally with the code as its label. Never blank, never
  "Unknown event", never a spinner, never omitted from the timeline — an
  omitted event is a lie about the record.
- Secondary line, plain language: "No published meaning for this code."
- Never advance the stage rail on an unknown code, and never let one *block*
  the rail either — it simply does not vote.
- Never infer meaning from a code's shape (prefix, digits, similarity to a
  known code). `SA` vs `SAB` may be unrelated.
- Offer "Copy code details" so the user can ask a forum or their lawyer. Copy
  to clipboard only; nothing is ever transmitted.

Apply the same discipline wherever data is missing rather than unknown: an
absent estimate says USCIS publishes none, an empty document list says nothing
about whether documents exist. Say which of the two it is — "we don't know" and
"there is nothing" are different claims and must never be collapsed.

## Staging: how a code becomes a stage, and what happens when it can't

> **The derivation rule below was REVERSED** — see `REVIEW-TRIAGE.md`, "Explicitly
> not doing", X-1. Stages come from a curated per-form code list
> (`STAGE_SEQUENCES`), not from keyword-matching the NIEM text. Three reasons:
> keyword-matching operations prose is exactly the inference this spec forbids
> everywhere else; the rail is sticky, so one bad match mis-stages a case
> irreversibly; and the two codes that actually mattered on live cases (`SA`,
> `RCV0`) are absent from NIEM entirely, so the "covers every code" claim was
> false for the cases we had. **Everything below this line about deriving stages
> from description text is superseded.** The degradation cases and the hard
> limits further down still bind.

Stage membership is derived from the **NIEM description text**, not from a
hand-written code list. With 492 official descriptions available, keyword rules
over that text cover every code deterministically and auditably, instead of the
~40 someone happened to blog about. Rules are ordered, first match wins, and
the whole table lives in one place so it can be reviewed at a glance:

| Stage | Matched on the official description |
|---|---|
| intake | RECEIPT, RECEIVED, LOCKBOX, FEE (when no other stage matches) |
| checks | DATABASE CHECKS, NAME CHECK, FBI, AGENCY CHECKS |
| biometrics | FINGERPRINT, BIOMETRIC, FD-258, ASC |
| interview | INTERVIEW, ADIT |
| decision | APPROVED, DENIAL, DENIED, REVOCATION, RESCIND, TERMINATED, WITHDRAWAL |
| production | CARD, CERTIFICATE, DOCUMENT PRODUCED, PERMIT, PAROLE DOCUMENT |

Ambiguity is real and must be resolved explicitly — `IAE` ("FINGERPRINT FEE
RECEIPT NOTICE SENT") contains both *fingerprint* and *receipt*. Maintain a
small curated override map for these, applied before the keyword rules, and
comment each entry with why.

**A code that matches no rule gets no stage.** It does not vote and does not
block. It still appears in the timeline with its raw code.

### The five degradation cases — all must be handled

1. **Partial mapping** — rail shows the furthest *confirmed* stage. Unknown
   codes neither advance nor block it.
2. **Nothing maps** — render the rail fully hollow, state plainly that we
   can't place this case, and name the codes we couldn't resolve. Never guess a
   position.
3. **Unknown form type** — we ship sequences for I-485, I-765, I-131, I-485J.
   For any other form, **render no rail at all** and fall back to `Day N`, the
   quiet-stretch meter, and the timeline. A wrong journey is worse than none.
   Never show a generic rail implying stages a form may not have.
4. **Code maps to a stage absent from this form's sequence** (e.g. an interview
   code on an I-765) — trust the data over our model: show the event normally
   in the timeline and drop the rail for that case rather than forcing the code
   into a shape it doesn't fit. Our sequence being incomplete is the likelier
   explanation, and the rail is the disposable part.
5. **`closed === true`** — the structured boolean wins over any inferred stage.
   Present the case as concluded regardless of where the codes landed.

### Hard limits on what the rail may say

- Never state or imply how many stages remain, how long a stage takes, or when
  the next one will happen.
- Equal-width segments always; segment geometry must never encode time.
- Never derive approved/denied styling from these keyword rules. A decision-
  stage match may show the official event text, but attention and settled
  treatments come only from the `actionRequired` and `closed` booleans
  (see Conflict 2).
- The rail is labelled as an unofficial interpretation, because it is one.

## Standing behavioural rules already in the core — do not regress

- Backend activity (`updatedAtTimestamp` newer than the status date) is stated
  as fact, never called progress or good news, and **never fires a desktop
  notification** on its own.
- Untranslated event codes render as the raw code rather than a guess.
- Document URLs are only clickable when same-origin `my.uscis.gov`.
- The panel renders **nothing at all** when the user is not signed in.
