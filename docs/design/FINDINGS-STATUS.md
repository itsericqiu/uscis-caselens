# Findings status

Every review finding raised against CaseLens, with its verified state in the
code. This is an audit, not a review: each row was checked by reading the
implementing function, not by trusting `CHANGELOG.md`. Where the changelog and
the code disagree it is said so plainly.

Sources: `REVIEW-TRIAGE.md` · `SPEC.md` · GitHub issues #1–#5 · four
conversational reviews (information-architecture, fresh-eyes, architecture,
security) · a documentation review.

Line numbers move, so citations use function names.

**Baseline:** audited at v1.6.1.

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
| R-3 | Per-card "Why is there no estimate?" → one panel-level entry | Triage · IA | **PARTIAL** — button gone, replaced by a static label. The comment names `buildEstimateHelp`, which does not exist |
| R-4 | Remove the "newer than status" chip | Triage · IA | **DONE** (1.7.0) — chip removed with the row that carried it |
| R-5 | Remove the gap label adjacent to a backend row | Triage · IA | **DONE** |
| R-6 | Remove the quiet-streak bar, keep the sentence | Triage adjudication | **DONE** |
| R-7 | Collapse the add-case form behind "+ Add a case" | Triage · IA · #4 | **DONE** (1.7.0) — behind "+ Add a case by receipt number" |
| R-8 | Suppress per-card error boxes when the session banner fired | Triage · IA | **DONE** (1.7.0) — `buildCaseErrorNote` returns null when the session banner fired |
| X-1 | Swap the stage table to NIEM keyword derivation | Triage | **REJECTED** — keyword-matching operations prose is the forbidden move |
| X-2 | Loosen the quiet-meter gate | Triage | **REJECTED** |
| X-3 | Add a status board | Triage | **REJECTED** — the collapsed rows already are the board |
| SP-1 | Derive stages from NIEM keywords + override map | SPEC | **REJECTED** — superseded by X-1, but `SPEC.md` §Staging still reads as binding |
| SP-2 | Unknown form type → render no rail | SPEC | **DONE** |
| SP-3 | Percentage bar only when USCIS returns an estimate | SPEC | **DONE** |
| SP-4 | Replace source chips with node shape + meta suffix | SPEC | **DONE** |
| SP-5 | Colour encodes state only from a structured boolean | SPEC | **DONE** |
| SP-6 | Backend activity never fires a desktop notification | SPEC | **DONE** |
| SP-7 | Document URLs clickable only when same-origin | SPEC | **DONE** |
| SP-8 | Panel renders nothing when not signed in | SPEC | **DONE** |
| SP-9 | Unknown codes are first class | SPEC | **DONE** |
| SP-10 | Co-filed group strip | SPEC · #5 | **REJECTED** — `concurrentCases` is empty on every real case |
| FE-1 | The pill's numeric badge reads as an unread count | Fresh-eyes | **PARTIAL** — now a case count, but still an unlabelled numeral |
| FE-2 | Disclosure toggles have no accessible name | Fresh-eyes · #4 | **PARTIAL** — `title` added; `aria-controls` still missing |
| FE-3 | Panel position not re-clamped on window resize | Fresh-eyes · #4 | **DONE** (1.7.0) — `resize` listener, full-panel clamp, and a Reset control |
| FE-4 | Timeline "logged 9:58 PM" minute precision is noise | Fresh-eyes | **DONE** (1.7.0) — the logged-time suffix is gone |
| FE-5 | Truncated `.tif` filenames can't be matched to anything | Fresh-eyes | **DONE** |
| FE-6 | No first-run explanation | Fresh-eyes | **NOT DONE** |
| AR-1 | `String(x)` on possibly-object fields should use `flattenValue` | Architecture | **DONE** (1.7.0) — `normalize` uses `flattenValue` throughout |
| AR-2 | `changedSince` does not survive a page reload | Architecture | **DONE** (1.7.0) — `changedSince` and `lastLookedAt` are persisted |
| AR-3 | Documents render unbounded with no fold | Architecture | **DONE** (1.7.0) — collapsed to a count row |
| AR-4 | `ATTENTION_CODES` is an unsourced 9-code list driving a red banner | Architecture | **NOT DONE** |
| AR-5 | `ENDPOINTS.caseStatus` / `receiptNotice` are named for the wrong endpoints | Architecture | **NOT DONE** |
| AR-6 | Three names for the same value across normalize/summarize | Architecture | **NOT DONE** |
| AR-7 | `caseRenderState` defines six states, four never read | Architecture | **NOT DONE** |
| AR-8 | `buildAttentionBanner` mutates timeline items, undocumented ordering | Architecture | **NOT DONE** |
| AR-9 | Notice-array index alignment is an implicit contract | Architecture | **PARTIAL** — commented, not enforced |
| AR-10 | Two relative-time vocabularies on one card | Architecture | **NOT DONE** |
| AR-11 | `.uscistr-is-passed` and `.uscistr-timeline-footnote` have no CSS rules | Architecture | **DONE** (1.7.0) — both classes have rules; the footnote is micro/text-3 |
| AR-12 | Stale section-header comments describe functions that changed | Architecture | **NOT DONE** |
| AR-13 | Duplicated clipboard buttons | Architecture | **NOT DONE** |
| AR-14 | Three date formatters | Architecture | **NOT DONE** |
| AR-15 | Four "is payload usable" idioms | Architecture | **NOT DONE** |
| AR-16 | Three receipt-number regexes, which disagree | Architecture | **NOT DONE** |
| AR-17 | Dead code: `isEmptyPayload` | Architecture | **DONE** |
| AR-18 | Dead code: unreachable `provenance === 'document'` | Architecture | **DONE** (1.7.0) — `document: 3` removed from `PROV_RANK` |
| AR-19 | Dead code: five unread `FIELDS` entries | Architecture | **NOT DONE** |
| AR-20 | Dead code: unused CSS classes | Architecture | **PARTIAL** — down to seven |
| SE-1 | Desktop notification body uses the unredacted receipt number | Security | **DONE** (1.7.0) — `displayNumber` in the notification body |
| SE-2 | "Remove" leaves the receipt number behind | Security | **DONE** (1.7.0) — `forgetCase` clears the receipt number from learned wording |
| SE-3 | `privacy-gate.js` greps one file and is bypassable | Security | **DONE** (1.7.0) — scans all three shipped files |
| SE-4 | `package.js` zips whole directories | Security | **NOT DONE** |
| SE-5 | `release-on-bump` auto-publishes with no review gate | Security | **NOT DONE** |
| SE-6 | `npx` tools unpinned in the release workflow | Security | **DONE** (1.7.0) — pinned to exact versions |
| SE-7 | Unbounded growth in learned code text | Security | **PARTIAL** — `codeText` uncapped; `docNames` is not a live issue |
| SE-8 | Auto-discovery is uncapped and unconfirmed | Security | **NOT DONE** |
| SE-9 | `loadAll` doesn't validate what `mergeImport` does | Security | **PARTIAL** — `__proto__` closed; asymmetry stands |
| SE-10 | `redactRawJson`'s regex breaks on escaped quotes | Security | **NOT DONE** |
| SE-11 | `pii-gate.js` matches only `IOE` prefixes | Security | **DONE** (1.7.0) — matches every three-letter prefix |
| SE-12 | `exportBackup` omits learned code text and `dismissed` | Security | **DONE** (1.7.0) — `dismissed` and learned wording are exported |
| DC-1 | Design docs `01`/`02`/`03` still specify rejected designs | Docs | **PARTIAL** — banners added, nothing pruned |
| DC-2 | `02` §6's stale ~1,350-line stylesheet | Docs | **NOT DONE** |
| DC-3 | CHANGELOG 1.3.x is five entries arguing about one line | Docs | **NOT DONE** |
| DC-4 | Various README trims | Docs | **PARTIAL** |
| GH-1 | "Erase all CaseLens data" in Settings | #4 | **DONE** (1.7.0) — "Erase everything" in Settings, naming what is stored |
| GH-2 | Refresh resets scroll; entry animation replays every render | #4 | **PARTIAL** — scroll fixed, animation untouched |
| GH-3 | Pill `aria-label` is just "Open CaseLens" | #4 | **NOT DONE** |
| GH-4 | Backend callout leads with "Their website does not show this" | #4 | **DONE** |
| GH-5 | Stage abbreviations don't survive translation | #4 | **NOT DONE** |
| GH-6 | Authority sentence buried | #4 | **DONE** |
| GH-7 | Global Spanish setting instead of per-card toggle | #1 | **NOT DONE** |
| GH-8 | Localize CaseLens's own microcopy | #2 | **NOT DONE** — needs a human Spanish speaker |
| GH-9 | Background update checks | #3 | **REJECTED** |

## The count

90 findings, de-duplicated across six reviews, two design docs and five issues.

| Status | At audit (1.6.1) | After 1.7.0 |
|---|---|---|
| DONE | 30 | 50 |
| PARTIAL | 11 | 8 |
| NOT DONE | 42 | 25 |
| REJECTED | 6 | 6 |
| OBSOLETE | 1 | 1 |

**Outstanding: 53 at audit, 33 after 1.7.0.**

1.7.0 also closed all four items found during the audit itself, and the three
regressions that collapse-all introduced (found by the interaction review, not
listed above because they postdate the audit): the panel-level failure banner,
obligation facts surviving a failed check, and the list no longer re-sorting on
a dropped request.

Where the DONEs cluster matters more than the total. All eight HARMFUL items
are genuinely fixed, and so are eight of the ten binding SPEC decisions (the
other two are recorded rejections). Nothing that could mislead someone about
the facts of their own case is outstanding.

The remainder is lopsided. The security review is almost entirely unactioned
(10 NOT DONE + 2 PARTIAL of 12), and so is the architecture review (16 + 3 of
20). Both landed late and were never worked.

### Where the changelog overstates the code

- **1.5.1, "A refused write to browser storage now says so."** It does not.
  `save()` sets a module-level `storageFailed` and nothing reads that variable.
  The second half of the same bullet (no re-notifying) *is* implemented.
- **1.1.0, "Removing a case now sticks, and deletes its stored history as the
  confirmation promises."** `forgetCase` deletes `snapshots` and `history` but
  leaves the number in learned code text and in any `.unreadable` rescue copy.
- **`REVIEW-TRIAGE.md`'s consolidated removals list is 50% unimplemented**
  (C-2, C-5, R-4, R-7, R-8 outstanding; R-3 half-done). Issue #4 independently
  re-discovered three of them.

## Found during the audit, not previously raised

1. **The one-footnote consolidation renders larger than the rows it
   annotates.** R-1 replaced a per-row sentence with a single
   `uscistr-timeline-footnote` — but that class has no CSS rule, so the
   footnote comes out as full-size body text. On a sparse card the loudest text
   in the timeline is the disclaimer about not knowing what the codes mean:
   the exact outcome R-1 existed to prevent.

2. **When storage is refused, the panel stops recording history and says
   nothing.** `applyFetchResult` correctly returns early if `setSnapshot`
   fails — but that early return also skips `appendHistory`, `changedSince`
   and `maybeNotify`. In private browsing or at quota, a real status change is
   detected, discarded and never mentioned. The comment two lines above says
   "silently failing to record history is the one failure this tool must not
   hide."

3. **A non-string `formType` silently deletes the stage rail.** `stageInfo`
   does `String(...)`, misses the lookup, and returns `mode: 'none'` —
   indistinguishable from the legitimate unknown-form path.

4. **`isValidReceiptNumber` and `CASE_NUMBER_RE` disagree, and the stricter one
   guards the user-facing path.** The add-case form validates `IOE` only while
   import accepts any three letters. The form's error message correctly says
   "three letters and ten digits", so a user with an `EAC` receipt is told the
   right rule, shown an error anyway, and has to click "Add anyway".
