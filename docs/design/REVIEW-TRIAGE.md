# Review triage — running-implementation round

Two independent reviews of the live product (timeline/progress SME, information-
architecture SME) plus a fresh-eyes pass. This file records what we're doing
about each finding and, where reviewers disagreed, which way it went and why.

Findings are ordered by how badly they could mislead someone about their own
immigration case.

---

## Adjudicated conflict: the quiet-streak module

**The disagreement.** The timeline reviewer says keep it — it contextualises a
wait against the case's own history rather than a stranger's, and it's the one
thing that changes between visits when the case doesn't. The IA reviewer says
delete it — it is a progress bar toward the user's personal worst wait, and its
failure mode is guaranteed: every still-waiting case eventually exceeds its own
record, at which point the module's only message is "you are now waiting longer
than you ever have."

**Decision: keep the fact, delete the gauge, and handle the overflow case.**

Both are right about different parts. "Quiet for 30 days · longest so far: 60"
is a true, useful, purely-local statement. The **filling bar** is what makes it
harmful — a bar implies progress toward a goal, and here the goal is your own
worst wait. So:

- Remove the bar. Keep the sentence.
- When the current quiet stretch **exceeds** the previous longest, drop the
  comparator entirely rather than announcing a record. Say only how long it has
  been quiet. Never phrase it as a record, a milestone, or a new maximum.
- Keep the existing gate (no meter when there's no prior gap to compare). The
  timeline reviewer checked loosening it and correctly concluded that "quiet for
  58 days, previous gap 2 days" is worse than saying nothing.

---

## HARMFUL — must fix before publish

**A. Error states delete all case content while claiming they didn't.** Both
reviewers, independently. On `expired`, `notFound`, `malformed` and
`emptyEnvelope`, every card collapses to a chip and a receipt number — panel
height 5275px → 1890px — while "Your saved cases and history are safe in this
browser" renders five times beside four visibly empty cards. The panel prints
"Last successful check: …", proving it *has* the snapshot and chose not to
render it. A 2am session timeout is indistinguishable from "my cases are gone."
→ On any failed fetch, render the last good snapshot with a staleness marker.
Never blank a card that has a cached result.

**B. Failure states reuse empty-state copy, so the tool asserts falsehoods.**
Under `malformed`, a card reads "USCIS hasn't published a status for this case
yet" for a case that displayed "Case Was Approved" sixty seconds earlier; an
approved 199-day-old case gets "That's common for recently filed cases." A user
will read that as their approval being reversed.
→ Gate every empty-state string on `fetch succeeded AND payload genuinely
empty`. A parse failure or auth failure must never reach empty-state copy.

**C. The stage rail marks stages "done" with no evidence.** The renderer fills
every segment below the max index; nothing records which stages actually had a
code. Live: `Bio` shows filled while the same card shows an *upcoming*
biometrics appointment 300px above. Under `changed`, an approved I-485 with no
interview code shows `Intvw` complete — many I-485s are approved on interview
waiver, so this is a false claim about the user's own case.
→ Collect evidenced stage indices; give passed-but-unevidenced segments a third
state (solid connector, hollow node) distinct from done.

**D. The stage map predicts.** "Cases at this stage usually move to Interview
next" is invented population data — we have none. It also self-refutes: moving
`normal`→`changed` silently rewrote the stage vocabulary and superseded the
prediction with no interview having occurred.
→ Delete the sentence. Keep the map and its honest explainer ("our own reading
of the codes… segments are equal width on purpose: none of them measures time").
This is squarely forbidden by SPEC.md and slipped in anyway.

**E. Harvested code text bleeds between cases.** The harvest map is
account-global and last-write-wins, and `describeCode()` takes no case context.
An I-485 shows its `IAF` event labelled with wording USCIS wrote for a different
case (an I-485J). Worse for a change-detection product: the label can change
between visits with no case change.
→ Key the harvest by code + form type, and demote a harvested label below the
NIEM description unless it came from *this* case.

**F. Two different day counts for the same date on one card.** "Set July 12,
2026 · 30 days ago" in the headline; "Status updated · July 12, 2026 · 29 days
ago" in the field grid. One floors a millisecond delta, the other counts
calendar days. Also produces an off-by-one in `Day N` across a DST boundary.
→ One helper, local-midnight to local-midnight, used everywhere. Calendar days
is correct — this is a tool for people counting days on a calendar.

**G. Change detection undercounts.** The `changed` fixture advances three things
(status, a new document, a new event; documents 6→7) and the band reports "1
change", naming only the status. A new document on file is material and is being
silently dropped.
→ Count and name every detected change.

**H. Self-contradiction within four lines.** "No change for 30 days" sits
directly above "the record was touched … 8 days ago". Both true under the
material/backend split, but adjacent they read as the tool contradicting itself.
→ When a backend touch exists, the quiet line becomes "No *visible status*
change for 30 days."

---

## CONFUSING — fix in the same pass

- **Closed cases keep running the waiting machinery.** The approved, closed
  I-765 shows a quiet counter and "88% through the range USCIS published". A
  percentage-complete on a finished case is incoherent. → Suppress the bar, the
  quiet counter, and the "you are here" marker when `closed === true`; render
  the final rail node as a terminus.
- **Collapse the raw-JSON block** to a single `▸ Raw data from USCIS · 5
  responses` row. Decisive argument: on `notFound` it renders **twenty red HTTP
  404 badges** beside an immigration case. "404 / not found" is the worst
  possible token to leak by default. Surface a count only when not all
  responses succeeded. The audit story is carried by DevTools and the single
  readable source file, not by this block.
- **The status headline lost primacy.** The two-line official form name
  outweighs the status. On the day a case is *approved*, the largest text on the
  card is a static title the user has read a thousand times. → Demote the form
  name; take `statusTitle` to ~17–18px/600.
- **Change band and appointment band share the same tint** and sit adjacent. The
  one element with a deadline must not look like the novelty accent.
- **Cut the field grid to its non-duplicate rows** (Service center,
  Representative). `Filed`, `Status updated` and `Record touched` are already
  stated above the fold — and those duplicates are exactly where finding F
  becomes visible. This also settles the grid-position question: it doesn't
  matter once the grid is small.
- **"9:00 AM local"** asserts a timezone we cannot verify → "9:00 AM as
  recorded". (Not converting was the right call; the label was wrong.)
- **The next-step line names stages a form may skip** (I-131 "usually move to
  Biometrics next" — advance parole often rides on the I-485's biometrics).
  Moot once D removes the prediction sentence.
- **Sparse cards explain absence twice** — the documents-empty paragraph and the
  sparse-floor paragraph run back to back. Cut the former.
- **Machine artifacts in trust-building prose**: "its status was last set 0 days
  ago"; "1 change since Aug 11" when today is Aug 11.

## Removals (consolidated)

Per-row "No published meaning for this code." sentence and per-row "Copy code
details" button → one timeline footnote, Copy inside the expanded row ·
"Why is there no estimate?" on every estimate-less card → one panel-level help
entry · the "newer than status" chip (third statement of a fact already given
twice) · the gap label immediately adjacent to a backend row · the quiet-streak
**bar** (keep the sentence) · the stage-map prediction sentence · duplicate
field-grid rows · always-open raw block · always-open add-case form (collapse
behind "+ Add a case") · duplicate per-card error boxes when the global banner
already fired.

## Explicitly NOT doing

- **Do not swap the stage table to NIEM keyword derivation.** SPEC.md specified
  it; the timeline reviewer argued against it after seeing real data and is
  right: keyword-matching operations prose is the "infer meaning from text" move
  the product forbids elsewhere; the rail is monotonic and sticky, so one bad
  match (`DENIAL NOTICE ORDERED`, `CARD RETURNED AS UNDELIVERABLE`) mis-stages a
  case irreversibly for the session; and the two codes that actually mattered in
  live data — `SA`, `RCV0` — are absent from NIEM anyway, so the swap doesn't
  help where the real gap is. SPEC.md is superseded on this point.
- **Do not loosen the quiet-meter gate** (see adjudication above).
- **Do not add a status board or per-case collapse** for the 4-case scroll
  problem yet. Real, but it's new surface area; revisit after these land.
