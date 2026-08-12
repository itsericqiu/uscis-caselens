# Findings status

Every review finding raised against CaseLens, with its verified state in the
code. This is an audit, not a review: each row was checked by reading the
implementing function, not by trusting `CHANGELOG.md`. Where the changelog and
the code disagree it is said so plainly.

Sources: `REVIEW-TRIAGE.md` · `SPEC.md` · GitHub issues #1–#5 · four
conversational reviews (information-architecture, fresh-eyes, architecture,
security) · a documentation review.

Line numbers move, so citations use function names.

**Baseline:** audited at v1.6.1; statuses updated through v1.14.0.

## The table

| ID | Finding | Source | Status |
|---|---|---|---|
| H-A | A failed fetch blanks every card while claiming history is safe | Triage HARMFUL A | **DONE** — `buildCaseView`/`applyCachedSnapshot` render `state: 'stale'` cards from the stored snapshot |
| H-B | Failure states reuse empty-state copy, so the tool asserts falsehoods | Triage HARMFUL B | **DONE** — `documentsNoteText` gated on `view.hasData`; `buildTimeline` branches on `sourcesUnread` |
| H-C | Stage rail marks stages "done" with no evidence | Triage HARMFUL C | **DONE** — `stageInfo` collects `evidenced{}`; `buildStageRail` emits a hollow-ring third state |
| H-D | Stage map predicts the next stage | Triage HARMFUL D | **DONE** — sentence removed; `buildProgressModule` carries a comment saying why |
| H-E | Learned code text bleeds between cases | Triage HARMFUL E | **DONE** — text is keyed by code *and* form type, map versioned to `v: 2` |
| H-F | Two different day counts for the same date on one card | Triage HARMFUL F | **DONE** — `daysBetween` is the only day-difference function |
| H-G | Change detection undercounts | Triage HARMFUL G | **DONE** — `diffSnapshots` counts documents as a multiset |
| H-H | "No change for 30 days" next to "record touched 8 days ago" | Triage HARMFUL H | **DONE** — `noChangeLine` switches the subject to "No visible status change" |
| C-1 | Closed cases keep running the waiting machinery | Triage CONFUSING | **DONE** — `buildProgressModule` returns early when `detail.closed` |
| C-2 | Collapse the raw-JSON block to one summary row | Triage · IA · #4 | **DONE** (1.7.0) — one `Raw data from USCIS · N responses` row per card |
| C-3 | Status headline lost primacy to the form name | Triage CONFUSING | **DONE** — `.uscistr-status-text` is 17px/600 serif |
| C-4 | Change band and appointment band share the same tint | Triage · IA | **DONE** — teal vs indigo wash. They still share a border colour |
| C-5 | Cut the field grid to its non-duplicate rows | Triage · IA · #4 | **DONE** (1.7.0) — the three duplicate date rows are gone |
| C-6 | "9:00 AM local" asserts a timezone we cannot verify | Triage CONFUSING | **DONE** — superseded by v1.3.2–1.3.4 |
| C-7 | Next-step line names stages a form may skip | Triage CONFUSING | **OBSOLETE** — moot once H-D removed the prediction |
| C-8 | Sparse cards explain absence twice | Triage CONFUSING | **DONE** — `noteBox` merges both into one box |
| C-9 | Machine artifact: "its status was last set 0 days ago" | Triage · IA | **DONE** — `Set today` / `Set yesterday` special cases |
| C-10 | "1 change since Aug 11" when today is Aug 11 | Triage · IA · #4 | **DONE** (1.7.0) — `sameLocalDay` check, falls back to "since you last looked" |
| R-1 | Per-row "No published meaning" → one timeline footnote | Triage Removals | **DONE** — but see AR-11; the footnote class has no CSS rule |
| R-2 | Per-row "Copy code details" → inside the expanded row | Triage Removals | **DONE** |
| R-3 | Per-card "Why is there no estimate?" → one panel-level entry | Triage · IA | **DONE** (1.8.0) — the comment naming a function that never existed is gone |
| R-4 | Remove the "newer than status" chip | Triage · IA | **DONE** (1.7.0) — chip removed with the row that carried it |
| R-5 | Remove the gap label adjacent to a backend row | Triage · IA | **DONE** |
| R-6 | Remove the quiet-streak bar, keep the sentence | Triage adjudication | **DONE** |
| R-7 | Collapse the add-case form behind "+ Add a case" | Triage · IA · #4 | **DONE** (1.7.0) — behind "+ Add a case by receipt number" |
| R-8 | Suppress per-card error boxes when the session banner fired | Triage · IA | **DONE** (1.7.0) — `buildCaseErrorNote` returns null when the session banner fired |
| X-1 | Swap the stage table to NIEM keyword derivation | Triage | **REJECTED** — keyword-matching operations prose is the forbidden move |
| X-2 | Loosen the quiet-meter gate | Triage | **REJECTED** |
| X-3 | Add a status board | Triage | **REJECTED** — the collapsed rows already are the board |
| SP-1 | Derive stages from NIEM keywords + override map | SPEC | **DONE** (1.10.0) — `SPEC.md` §Staging now marks the reversal in place |
| SP-2 | Unknown form type → render no rail | SPEC | **DONE** |
| SP-3 | Percentage bar only when USCIS returns an estimate | SPEC | **DONE** |
| SP-4 | Replace source chips with node shape + meta suffix | SPEC | **DONE** |
| SP-5 | Colour encodes state only from a structured boolean | SPEC | **DONE** |
| SP-6 | Backend activity never fires a desktop notification | SPEC | **DONE** |
| SP-7 | Document URLs clickable only when same-origin | SPEC | **DONE** |
| SP-8 | Panel renders nothing when not signed in | SPEC | **DONE** |
| SP-9 | Unknown codes are first class | SPEC | **DONE** |
| SP-10 | Co-filed group strip | SPEC · #5 | **REJECTED** — `concurrentCases` is empty on every real case |
| FE-1 | The pill's numeric badge reads as an unread count | Fresh-eyes | **DONE** (1.10.0) — numeral aria-hidden; accessible name states case count and changes |
| FE-2 | Disclosure toggles have no accessible name | Fresh-eyes · #4 | **DONE** (1.10.0) — `linkDisclosure()` wires `aria-controls` on every disclosure |
| FE-3 | Panel position not re-clamped on window resize | Fresh-eyes · #4 | **DONE** (1.7.0) — `resize` listener, full-panel clamp, and a Reset control |
| FE-4 | Timeline "logged 9:58 PM" minute precision is noise | Fresh-eyes | **DONE** (1.7.0) — the logged-time suffix is gone |
| FE-5 | Truncated `.tif` filenames can't be matched to anything | Fresh-eyes | **DONE** |
| FE-6 | No first-run explanation | Fresh-eyes | **DONE** (1.10.0) — `buildFirstRunNote()`, shown once and dismissed for good |
| AR-1 | `String(x)` on possibly-object fields should use `flattenValue` | Architecture | **DONE** (1.7.0) — `normalize` uses `flattenValue` throughout |
| AR-2 | `changedSince` does not survive a page reload | Architecture | **DONE** (1.7.0) — `changedSince` and `lastLookedAt` are persisted |
| AR-3 | Documents render unbounded with no fold | Architecture | **DONE** (1.7.0) — collapsed to a count row |
| AR-4 | `ATTENTION_CODES` is an unsourced 9-code list driving a red banner | Architecture | **DONE** (1.8.1) — `ACTION_CODES` categorised and cited; denials and holds excluded |
| AR-5 | `ENDPOINTS.caseStatus` / `receiptNotice` are named for the wrong endpoints | Architecture | **DONE** (1.8.0) — `caseDetail` / `caseStatus` |
| AR-6 | Three names for the same value across normalize/summarize | Architecture | **DONE** (1.8.0) — `statusAt` and `backendAt` across layers, with a read migration |
| AR-7 | `caseRenderState` defines six states, four never read | Architecture | **DONE** (1.8.0) — `caseContentSource`, returning only what decides anything |
| AR-8 | `buildAttentionBanner` mutates timeline items, undocumented ordering | Architecture | **DONE** (1.8.1) — the ordering dependency is documented at the function |
| AR-9 | Notice-array index alignment is an implicit contract | Architecture | **DONE** (1.14.1) — `letterId` is carried on the event; the parallel index is gone |
| AR-10 | Two relative-time vocabularies on one card | Architecture | **DONE** (1.8.0) — one date implementation, three shapes |
| AR-11 | `.uscistr-is-passed` and `.uscistr-timeline-footnote` have no CSS rules | Architecture | **DONE** (1.7.0) — both classes have rules; the footnote is micro/text-3 |
| AR-12 | Stale section-header comments describe functions that changed | Architecture | **DONE** (1.8.0) — skeleton comments corrected |
| AR-13 | Duplicated clipboard buttons | Architecture | **DONE** (1.8.0) — one `copyButton()` |
| AR-14 | Three date formatters | Architecture | **DONE** (1.8.0) — `formatDateAs(value, shape)` |
| AR-15 | Four "is payload usable" idioms | Architecture | **DONE** (1.8.0) — `payloadUsable()` replaces eight inline copies |
| AR-16 | Three receipt-number regexes, which disagree | Architecture | **DONE** (1.8.0) — one shape, plus a documented narrowing for discovery |
| AR-17 | Dead code: `isEmptyPayload` | Architecture | **DONE** |
| AR-18 | Dead code: unreachable `provenance === 'document'` | Architecture | **DONE** (1.7.0) — `document: 3` removed from `PROV_RANK` |
| AR-19 | Dead code: five unread `FIELDS` entries | Architecture | **DONE** (1.8.0) — five unread entries deleted |
| AR-20 | Dead code: unused CSS classes | Architecture | **DONE** (1.8.0) — seven dead rules deleted whole, verified by css-check |
| SE-1 | Desktop notification body uses the unredacted receipt number | Security | **DONE** (1.7.0) — `displayNumber` in the notification body |
| SE-2 | "Remove" leaves the receipt number behind | Security | **DONE** (1.7.0) — `forgetCase` clears the receipt number from learned wording |
| SE-3 | `privacy-gate.js` greps one file and is bypassable | Security | **DONE** (1.7.0) — scans all three shipped files |
| SE-4 | `package.js` zips whole directories | Security | **DONE** (1.10.0) — explicit file list; refuses to build with anything extra present |
| SE-5 | `release-on-bump` auto-publishes with no review gate | Security | **ACCEPTED RISK** — auto-tag-on-merge is the chosen release model, and the job runs only after `verify`, `version-bump-check` and `package` all pass. Revisit if the project takes outside contributors |
| SE-6 | `npx` tools unpinned in the release workflow | Security | **DONE** (1.7.0) — pinned to exact versions |
| SE-7 | Unbounded growth in learned code text | Security | **DONE** (1.10.0) — capped at 400, dropped oldest-first |
| SE-8 | Auto-discovery is uncapped and unconfirmed | Security | **DONE** (1.7.1) — `MAX_TRACKED_CASES = 25` ceiling on automatic discovery; manual adds uncapped |
| SE-9 | `loadAll` doesn't validate what `mergeImport` does | Security | **DONE** (1.10.0) — `loadAll` validates exactly as `mergeImport` does |
| SE-10 | `redactRawJson`'s regex breaks on escaped quotes | Security | **DONE** (1.8.0) — explicit field list, and a value pattern that consumes escapes |
| SE-11 | `pii-gate.js` matches only `IOE` prefixes | Security | **DONE** (1.7.0) — matches every three-letter prefix |
| SE-12 | `exportBackup` omits learned code text and `dismissed` | Security | **DONE** (1.7.0) — `dismissed` and learned wording are exported |
| DC-1 | Design docs `01`/`02`/`03` still specify rejected designs | Docs | **DONE** (1.10.0) — rejected sections in `02` carry inline REJECTED markers |
| DC-2 | `02` §6's stale ~1,350-line stylesheet | Docs | **DONE** (1.10.0) — the stale 1,350-line stylesheet copy is replaced by a pointer |
| DC-3 | CHANGELOG 1.3.x is five entries arguing about one line | Docs | **DONE** (1.10.0) — a "where 1.3.x landed" summary heads the sequence |
| DC-4 | Various README trims | Docs | **CLOSED** — never written down as specific edits; README rewritten ~45% shorter in 1.2.0 and corrected again in 1.11.x |
| GH-1 | "Erase all CaseLens data" in Settings | #4 | **DONE** (1.7.0) — "Erase everything" in Settings, naming what is stored |
| GH-2 | Refresh resets scroll; entry animation replays every render | #4 | **DONE** (1.9.0) — entry animation only on mount; both split-pane scrollers restored |
| GH-3 | Pill `aria-label` is just "Open CaseLens" | #4 | **DONE** (1.10.0) — accessible name names the count and the changes |
| GH-4 | Backend callout leads with "Their website does not show this" | #4 | **DONE** |
| GH-5 | Stage abbreviations don't survive translation | #4 | **DONE** (1.10.0) — full stage names; the duplicate `label` field is gone |
| GH-6 | Authority sentence buried | #4 | **DONE** |
| GH-7 | Global Spanish setting instead of per-card toggle | #1 | **NOT DONE** |
| GH-8 | Localize CaseLens's own microcopy | #2 | **NOT DONE** — needs a human Spanish speaker |
| GH-9 | Background update checks | #3 | **REJECTED** |

## The count

90 findings, de-duplicated across six reviews, two design docs and five issues.

| Status | At audit (1.6.1) | Now (1.10.0) |
|---|---|---|
| DONE | 30 | 81 |
| PARTIAL | 11 | 0 |
| NOT DONE | 42 | 2 |
| REJECTED | 6 | 5 |
| ACCEPTED RISK | 0 | 1 |
| OBSOLETE | 1 | 1 |

**Outstanding: 53 at audit, 2 now — both Spanish localisation.**

Also closed, and not counted above because they postdate the audit: all four
items the audit itself turned up, and the three regressions collapse-all
introduced (found by the interaction review) — the panel-level failure banner,
obligation facts surviving a failed check, and the list no longer re-sorting on
a dropped request.

### What is left, and why

- **GH-7 / GH-8 — Spanish.** The status wording USCIS publishes can already be
  shown in Spanish, because USCIS writes it. Translating CaseLens's *own*
  microcopy is a different job: it needs a string-table refactor and a human
  Spanish speaker, and machine-translating a panel that people rely on for
  immigration deadlines is not an acceptable shortcut. Open by design.
Nothing else is outstanding. The five later reviews (security, correctness,
architecture, documentation, live UX) were worked through 1.11.1–1.14.1 and are
recorded in `CHANGELOG.md` rather than re-tabulated here.
Where the DONEs cluster matters more than the total. All eight HARMFUL items
are genuinely fixed, and so are eight of the ten binding SPEC decisions (the
other two are recorded rejections).

## History

Everything in this section describes the state at the **1.6.1 audit**, and is
kept because how a backlog got worked is worth recording. Where a paragraph
below describes an open problem, check the table above — **the table is
authoritative** and is re-verified against the code at each pass.

At that baseline the remainder was lopsided: the security review was almost
entirely unactioned (10 NOT DONE + 2 PARTIAL of 12), and the architecture review
nearly so (16 + 3 of 20). Both landed late in a long session and had never been
worked. They were worked in 1.8.0–1.10.0 and are now closed.

Three changelog entries overstated what the code did, and all three have since
been made true or corrected in place:

- **1.5.1, "A refused write to browser storage now says so."** It did not —
  `save()` set a module-level flag nothing read. Implemented in 1.7.0
  (`state.storageBlocked`, surfaced by `buildStorageBanner()`), and the 1.5.1
  entry now carries its own correction.
- **1.1.0, "Removing a case … deletes its stored history as the confirmation
  promises."** It left the receipt number in the learned-wording map. Fixed in
  1.7.0 (SE-2).
- **`REVIEW-TRIAGE.md`'s consolidated removals list was 50% unimplemented**
  (C-2, C-5, R-4, R-7, R-8). All five landed in 1.7.0.

The four items the audit itself turned up — the unstyled timeline footnote, the
silent storage failure, a non-string `formType` deleting the stage rail, and two
receipt-number regexes that disagreed — were closed in 1.7.0–1.8.0.
