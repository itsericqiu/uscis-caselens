# Evidence-driven stages (1.17)

The design for replacing per-form stage sequences with stages that materialise
from evidence. Written after live verification against a real four-case account
(2026-08-12); the findings that motivated each decision are recorded inline,
because several of them contradict what the original design assumed.

## What live data showed

Findings from a real account — one I-485 with an attended biometrics
appointment, plus concurrent I-765, I-131 and I-485J:

1. **USCIS never reports biometrics through these endpoints.** No biometrics
   event code appears anywhere on an account whose owner verifiably attended
   one. The strings "biometric" and "fingerprint" appear in no API field. The
   only trace is a notice with `actionType: "Appointment Scheduled"` (generic —
   interviews arrive as the same record) and a document named
   "Appointment Scheduled.pdf".
2. **Real accounts are sparse.** Four cases produced four distinct event codes
   in total: `IAF`, `FTA0`, `SA`, `LDA`. The old model carried 31 stage-anchor
   codes; most will never be observed on most cases.
3. **The code universe is open.** `SA` — the code the old I-765 rail hung
   "Approved" on — is absent from the NIEM schema. USCIS uses internal codes
   discoverable only by encountering them.
4. **The form universe is open.** I-485J and I-131 arrive as concurrent
   companions with IOE receipts despite not being independently online-filable.
   No published list closes the set of forms this tool will meet.
5. **`documents[].type` is stronger evidence than codes for some milestones.**
   "I-765 C09 Standalone Approval" is USCIS naming an outcome in its own words;
   `SA` is an inference from an unpublished code. We already fetch documents and
   were reading only filenames.

Consequence: a form or code we have never seen is the *normal* case, not the
edge case. Correctness for the unknown is the primary requirement; every table
is an enrichment, never a precondition.

## The model

### Stages are typed, not positioned

A stage is one of a small set of *types*: Received, Appointment, Biometrics,
Evidence requested, Interview, Decision, Card/Document produced. A case's rail
is the set of types for which it has evidence (plus the spine and prefill below)
— not a walk along a per-form array.

There is no fixed sequence, so nothing can be "skipped", no cross-form mismatch
can occur, and an unexpected stage type on any form simply appears.

### The spine is definitional

Three stages need no evidence because they are true by definition:

- **Received** — every case was received. Always first.
- **Under review** — the default present position of every open case between
  receipt and decision. A statement of where the case sits, not a claim that
  review activity occurred.
- **Decision** — every case ends in one. Always last.

The worst-case rail — unknown form, no mappable codes — is
`Received → Under review → Decision`, which is always true.

### Middle stages materialise from evidence

Evidence sources, in order of authority:

1. **Structured fields** (`closed`, appointment `appointmentDateTime`) — USCIS
   stating a fact in a typed field.
2. **`documents[].type`** — USCIS's own wording ("I-765 C09 Standalone
   Approval"). Exact-match against a reviewed table; unrecognised types render
   verbatim and map to nothing.
3. **Event codes** via a code→stage-type table derived from NIEM descriptions,
   authored and checked in (never a runtime regex — an auditor must be able to
   read the mapping). Codes outside NIEM go in an explicit OBSERVED_CODES table
   with provenance comments, or map to nothing.

A code that maps to no stage type creates no stage. It stays in the timeline,
raw if necessary. Nothing is dropped; nothing is guessed.

### Ordering comes from the case

Evidenced middle stages sort by their own earliest timestamps. Received is
pinned first, Decision last. There is no canonical order to contradict, so
out-of-order reality (interview logged before biometrics, decision before an
appointment record) renders as it happened.

### Three stage states

| State | Meaning | Rendering intent |
|---|---|---|
| evidenced | USCIS logged it | filled |
| not reported | This form normally includes this step, and USCIS does not publish it through this data | distinct mark + wording; must NOT read as "not done" |
| ahead | The definitional stages not yet reached | hollow |

"Not reported" exists because of finding 1: prefilling Biometrics as a normal
hollow stage on an I-485 asserts to someone who attended that they did not.
That misreading is the bug that motivated this redesign.

### Prefill is published fact, sparingly applied

`FORM_EXPECTED_STEPS` lists steps a form *normally* includes, sourced only from
USCIS form instructions, one citation comment per entry. Initial table:
biometrics for I-485, I-765, I-131, N-400, I-90, I-751, I-821.

- Wording is always "normally includes" — age exemptions (under 14, over 79)
  and biometrics reuse are real, and we do not know the applicant's age.
- Interview prefill is deliberately excluded: waivers are common enough that
  "expected" would be a prediction. At most a footnote.
- A form absent from the table prefines nothing and loses nothing else.

### Identity and upgrade

Stage identity is its type. One stage per type per case. State is the strongest
evidence seen: prefilled *not reported* upgrades to *evidenced* if a matching
code or document ever appears. Prefill plus evidence is one stage, never two.

### Appointments

An appointment notice materialises an **Appointment** stage carrying its date.
The type of appointment is NOT inferred — biometrics and interview notices
arrive as identical generic records, and "almost certainly biometrics" is still
a guess. The stage says an appointment happened/is scheduled on a date; the
Biometrics stage, where prefilled, separately says that step is not reported.

A future appointment holds the case's present position at Under review (the
appointment is ahead); a past one is evidenced history. No clamp against a
sequence index — there is no index.

## What this deletes

The old machinery existed to defend a fixed sequence against reality:

- `STAGE_SEQUENCES` (four per-form arrays, five unpublished anchor codes)
- mismatch mode, `foreign` codes, `stageNameElsewhere` (cross-form coupling:
  adding a form changed other forms' behaviour)
- the monotonic `maxStage` stickiness (an index that could slide backwards;
  evidence cannot)
- `earliestPendingAppointmentStage`'s label matching (`biometric`/`fingerprint`
  against labels that always read "Appointment Scheduled" — dead code in
  practice, verified against live data)

No sequence, no defences.

## What this must not change

- Honesty rules in CONTRIBUTING.md apply unchanged: no predictions, no
  good/bad framing, unknown rendered as unknown.
- The timeline remains the complete record; the rail is an interpretation and
  keeps saying so ("How this map is read").
- Segments stay equal-width — geometry still carries no time information.
- Unknown forms and unknown codes must produce a correct, sparse rail — never
  an error state and never a guess.

## Decisions folded in during implementation

- **"Evidenced" means activity, not completion.** NIEM codes cover the whole
  interview lifecycle — scheduled (FJ), rescheduled (FM), cancelled
  (FKB/IXAA/IXAB), failed to appear (FL) — and all of it maps to the
  interview step. A filled marker therefore claims only "USCIS logged
  activity at this step"; the timeline row says which activity. The rail
  never colours by outcome.
- **The biometrics prefill wording follows USCIS's own conditionality.** All
  seven instruction PDFs phrase it as "if we determine that a biometric
  services appointment is necessary" — so the marker's claim is "this form
  can involve this step", never "required".
- **Cases fetch concurrently.** The serial chain made four cases take four
  times as long as one; the account page itself fires in parallel and the
  request count is identical. Per-case endpoint stagger kept.
- **The collapsed row gained a position line**: the stage map's latest
  past-dated evidenced step (or the present position) plus USCIS's
  jurisdiction code. Future-dated evidence is excluded there — the amber
  demand line already owns what is coming.
- **USCIS-generated documents are timeline rows** (`sourceType: "USCIS
  Generated"`, verified live), labelled with USCIS's own `type` wording
  verbatim. Type `"Other"` is skipped as a bucket, not wording. Exactly one
  document type is stage evidence for now: `Appointment Scheduled` →
  appointment. The appointment document and its notice are one letter seen
  through two endpoints; the dedupe keeps the notice row, which carries the
  appointment date.
- **NIEM has no oath/ceremony codes**, so naturalization ceremonies cannot
  be evidenced from codes. If they surface at all it will be via status text
  or document types on a real N-400, neither of which has been observed yet.
- **Crowded rails drop not-reported markers before collapsing history.** The
  5-segment cap first drops dashed markers (their caveat lives in the
  disclosure), then collapses the earliest stages into a "Filed" cap. Found
  in the harness: the unconditional front-collapse swallowed "Evidence
  requested" — a demand — while keeping a marker that says nothing happened.
- **The model is property-fuzzed** (`scripts/fuzz.js`, fast-check, dev-only
  dependency). The semantic core is checked mechanically: a stage claims
  "evidenced" if and only if the record contains matching evidence, unmapped
  codes are reported rather than dropped, redaction holds against hostile
  payloads, and the full render path never throws. First runs caught two real
  bugs: `closed` compared truthily instead of `=== true` (a malformed string
  "false" rendered a case finished), and a duplicated filed anchor being
  silently dropped from the timeline.

## Rejected alternatives

- **Per-form sequences for more forms** — no published source exists for stage
  order; every added form would be inference from anecdote, wrong at retail for
  people whose cases don't match.
- **Runtime keyword classification of NIEM descriptions** — behaviour would
  depend on wording nobody reviewed; unanswerable "why is my case categorised
  this way".
- **Inferring appointment type from context** ("first appointment on an I-485
  is biometrics") — almost always right is the standard this project rejects.
- **A second, derived rail beside the verified one** — two visual languages for
  one concept; and the verified rails' own anchors turned out to include
  unpublished codes, so "verified" was overstated.
