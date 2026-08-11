# 03 — Timeline & Progress

Design spec for the centerpiece of the USCIS Case Tracker panel: how case
progress and event history are displayed.

**Scope:** the timeline module and the progress/stage module inside a 400px-wide
overlay panel. **Constraint:** every element below is derived from fields
verified in [`docs/API-SCHEMA.md`](../API-SCHEMA.md). Nothing here invents a
data source.

**Mockup:** [`mockup-timeline.html`](./mockup-timeline.html) renders every
variant in this document at 400px, light and dark.

---

## 0. The design position, in one paragraph

Users open this panel expecting nothing to have changed, and they are usually
right. A tracker that only answers "did it change?" therefore returns a null
result 95% of the time and feels dead. So the panel's job is reframed: it is not
a change detector, it is **a record of your case's tempo**. It answers "what
happened, who says so, and how does this quiet compare to my case's own past
quiet?" — all of which are answerable from data we actually have, and none of
which require a processing-time estimate we cannot get. Everything below follows
from that: provenance is visible because trust is the product; gaps are drawn
because gaps are the content; and there is no percentage anywhere, because we do
not know the denominator.

Design tokens reuse the panel's existing palette (from `core/uscis-tracker-core.js`):

| Token | Light | Dark | Use |
|---|---|---|---|
| `brand` | `#0b4778` | `#4a90c2` | Official USCIS provenance, filled nodes |
| `ink` | `#1a1a1a` | `#e8e8ea` | Primary label text |
| `muted` | `#6b7280` | `#9a9aa5` | Meta lines, inferred content, rail |
| `amber` | `#f5a623` | `#caa042` | Locally detected provenance only |
| `danger` | `#b3261e` | `#ff8a80` | Attention states (RFE/NOID/denial) |
| `rule` | `#e2e2e2` | `rgba(255,255,255,.10)` | Rail line, dividers |
| `surface` | `#ffffff` | `#2a2a33` | Panel |
| `sunken` | `#f7f7f8` | `#1e1e24` | Expanded row body, chips |

Amber is spent **only** on "this tool noticed it, USCIS did not say it." It is
already the panel's "changed" badge color, so the association carries.

---

## 1. Solutions to A–F

### A. Merging three sources of differing precision, trust and provenance

**Three-tier provenance model.** Every timeline entry is stamped with exactly
one `provenance` value, and that value drives node shape, node color, and the
wording of the meta line. The three tiers, in descending trust:

| Tier | `provenance` | Sources | Means |
|---|---|---|---|
| 1 — Stated | `official` | `historicalCaseStatuses[]`, `statusTitle`/`currentActionCode`, `notices[]` | USCIS published human-readable text about this |
| 2 — Logged | `coded` | `events[]` | USCIS logged a machine code; the words are ours or the community's |
| 3 — Observed | `local` | our snapshot diffs, `updatedAtTimestamp` movement | Nobody said anything; we noticed something |

Tier 2 subdivides by **how the words were obtained** — this is a second,
orthogonal axis and it needs its own encoding because "USCIS logged FTA0" is
tier-2 fact while "FTA0 means database checks received" may be a community
guess:

| `labelSource` | Origin | Treatment |
|---|---|---|
| `harvested` | We paired this code with official `statusTitle` text from *this account's own* history | Plain text. Trustworthy — it is official text, just re-used. |
| `hints` | Shipped community table (~40 codes, NIEM-derived) | Dotted underline + `?` glyph + code chip. Expanded row says "unofficial." |
| `none` | Code not in either | Label *is* the code, rendered mono. Row reads `Case event FTA0`. |

**How provenance is encoded visually.** Three channels, redundantly (never
color alone — the panel must work for colorblind users and in the greyed-out
"stale" state):

1. **Node shape on the rail.** Filled disc = stated. Hollow ring = logged.
   Hollow diamond = observed. Dashed ring = backend activity. Shape is the
   primary channel and is legible at 12px.
2. **Meta-line suffix.** Every row's meta line ends with a provenance phrase in
   plain English: `· USCIS`, `· USCIS event FTA0`, `· noticed by this tool`.
   No abbreviations, no icon-only legends the user must memorize.
3. **Color.** brand = stated/logged, muted = logged-untranslated and backend,
   amber = observed. Reinforcement only.

The existing implementation's `[USCIS]` / `[detected]` inline tags are
**replaced** by this system. Two reasons: bracket tags cost 60–70px of a 350px
text column on every row, and they conflate tier-1 and tier-2 (both would read
`[USCIS]` while having very different epistemic status).

**Date-only next to to-the-second.** Rule: **never render a time we did not
receive.** `historicalCaseStatuses[].date` is always `HH:mm:ss = 00:00:00`;
rendering "12:00 AM" would be a fabrication that also happens to look like a
suspicious middle-of-the-night action. So:

- `precision: 'day'` → meta reads `Jul 18, 2026` and nothing more.
- `precision: 'second'` → meta reads `Jul 9, 2026` in the collapsed row, and
  `Jul 9, 2026 · 5:58 PM` **only when** (a) the row is expanded, or (b) two or
  more entries share that calendar day, where the time is the only thing that
  disambiguates their order.

That is: time is shown when it carries information, hidden when it is noise, and
never invented. A day-precision row placed next to a second-precision row simply
carries a shorter meta line — the asymmetry is the honest signal, and it needs
no extra "approximate" icon.

**Sort key across precision levels.** Full algorithm in §3. The governing choice:
a `precision: 'day'` entry is assigned `sortAt = that date at 23:59:59.999` local.
In a newest-first list this places the official day-level headline **above** the
same day's timed machine events. That is the reading order we want — the human
sentence first, the machine codes that produced it beneath — and it also means a
day-precision entry never falsely claims to have happened *before* a timed event
we know occurred that morning.

The rail additionally draws **gap labels** on the connector between rows whenever
the gap exceeds 14 days (`— 22 days —`, muted, centered). This is the single
highest-value addition to the merged view: it converts a list of dates into a
visible rhythm, and it makes the current silence comparable to past silences.

```
┌ 376px content ─────────────────────────────────────────────┐
│ ●  We produced your new card                               │  ← stated, filled
│ │  Jul 18, 2026 · USCIS                                    │
│ │                                                          │
│ ○  Card production request sent            [LAA]           │  ← logged/harvested
│ │  Jul 17, 2026 · USCIS event                              │
│ ├── 22 days ─────────────────────────────────────────────  │  ← gap label
│ ○  Database checks received?               [FTA0]          │  ← logged/hints
│ ⋮  Jun 25, 2026 · USCIS event · unofficial meaning         │
│ ◇  Status changed to "Case Was Received"                   │  ← observed
│ │  Noticed Jun 3, 2026, 9:14 AM · by this tool             │
│ ■  Filed                                                   │  ← anchor cap
│    May 29, 2026 · I-485 received by USCIS · day 0          │
└────────────────────────────────────────────────────────────┘
```

---

### B. Progress without an estimate

`processing_times` returns 204 for every form tested. There is no honest
denominator, so there is no percentage. Instead the progress module is **three
stacked components**, each answering a different question the user actually has.
Full spec in §4.

**B1 — Stage rail (where am I).** A 5–6 segment named strip per form type,
derived from the documented code sequences. Segments are `done` / `current` /
`ahead`. `ahead` segments are drawn in outline, are explicitly labeled
"typical remaining stages," and carry **no dates and no widths proportional to
time** — every segment is the same width, so the strip cannot be misread as a
progress bar. The strip is a *map*, not a gauge.

**B2 — Elapsed framing (how long).** `Day 143` as the headline number, with
`Filed May 29, 2026` beneath. Honest, but by itself emotionally empty — which is
why it is never shown alone.

**B3 — Quiet-stretch meter (is this normal *for me*).** This is the component
that does the emotional work, and it uses only data we have: the gaps between
this case's own movements.

```
Quiet for 22 days
├████████████░░░░░░░░░░░░░░░░░░┤   longest so far: 41 days
```

Copy varies by comparison:
- `current < max` → "Quiet for 22 days. The longest quiet stretch on this case so far was 41 days."
- `current ≥ max` → "Quiet for 47 days — longer than any previous stretch on this case (41 days)." Neutral color. **Not** red, **not** framed as a problem; long gaps are normal and we are not qualified to say otherwise.
- fewer than 3 movements → suppress; show B2 alone plus the sparse-case copy from C.

This meter is honest (it makes no claim about USCIS), personal (it compares the
user only to themselves), and it *changes over time even when nothing happens* —
so the panel has something new to say on a visit where the answer is "no news."

**B4 — What typically comes next.** One muted line under the stage rail:
> Cases at this stage usually move to **Interview** next. USCIS has not said this
> will happen, and the order varies.

Sourced only from the shipped stage sequence, never from an ETA. It is the
answer to "what am I waiting for," which is a different question from "when."

---

### C. The zero / sparse case

A brand-new case has 1 event and 0 history entries. It must look **finished, not
broken.** Three moves:

1. **Synthesize the anchors we legitimately have.** We always know
   `submissionDate` → a `Filed` anchor row (day 0). We always know when the user
   added the case → a `Tracking started` anchor row. We always have the current
   status → the pinned `Now` block. So the minimum timeline is never fewer than
   3 rows plus the Now block, and every one of them is real data.
2. **Terminate the rail visibly.** The rail ends in a filled square cap at the
   `Filed` anchor. A hard terminus reads as "this is the beginning of the
   record," where a fading line reads as "content failed to load."
3. **Explain the sparsity in the panel, once.** A muted footnote under the rail:
   > USCIS publishes very little while a case is new. Most cases show nothing
   > between filing and the first biometrics notice. We check on every visit and
   > will log anything that moves — including backend activity the website
   > doesn't show.

   This converts "the timeline is empty" from a product failure into a stated
   property of USCIS.

```
┌────────────────────────────────────────────────────────────┐
│  NOW                                                       │
│  ◎ Case Was Received                                       │
│    Unchanged for 6 days · checked 2 min ago                │
│                                                            │
│  Day 6      ├──┼──────┼──────┼──────┤                      │
│  Filed      Recv  Bio   Review  Decision                   │
│  May 29      ▲                                             │
│                                                            │
│  ─── HISTORY ──────────────────────────────────────────    │
│  ○  Receipt letter emailed                  [IAF]          │
│  │  Jun 2, 2026 · USCIS event · unofficial meaning         │
│  ◇  Tracking started                                       │
│  │  Jun 2, 2026, 9:14 AM · by this tool                    │
│  ■  Filed                                                  │
│     May 29, 2026 · I-485 received by USCIS · day 0         │
│                                                            │
│  USCIS publishes very little while a case is new. We'll    │
│  log anything that moves, including backend activity.      │
└────────────────────────────────────────────────────────────┘
```

---

### D. Density vs scannability at 400px

**Budget.** Panel 400px, card padding 12px → **376px content**. Rail gutter 18px
+ 8px gap → **350px text column**. A collapsed row is two lines (~34px + 6px
gap). Eight collapsed rows = ~320px, which is already most of a 85vh panel that
also holds a header, the Now block, the stage rail, documents and a footer.

**Default view (the fold).** Now block + progress module + **the 4 most recent
timeline entries** + the `Filed` anchor (always pinned as the last row, so the
fold never hides the origin) + the fold control. Four is the number where the
timeline still reads as a list rather than a column of text, and it covers the
"what happened lately" question that brought the user here.

**Fold control** sits inline on the rail, so the rail is visually continuous:

```
│  ⋮
├─ Show 7 more · back to May 29 ───────────────────────────
│  ⋮
■  Filed
```

Expanded label becomes `Show fewer`. State is per-case and persists for the
session (not across reloads — the default view is the opinionated one).

**Row expansion.** Tapping a row toggles a disclosure body beneath it (sunken
background, 8px inset from the text column, does **not** shift the rail). The
body carries, in order: full official `statusText` (tags stripped — never
`innerHTML`), exact timestamp, code chip with plain-English provenance sentence,
and the `you first saw this on …` line where applicable. Multiple rows may be
open at once. The collapsed label clamps to 2 lines with ellipsis; official
`statusTitle` is short enough that this rarely fires, official `statusText`
never appears collapsed.

**Grouping runs.** Three or more consecutive backend-activity rows collapse into
one row: `USCIS touched your record 3 times · Jul 12 – Aug 2`, expandable into
the individual rows. Without this rule, a case that gets touched weekly buries
its real events.

**Filter chips**, right-aligned above the history rule, 22px tall:
`All` (default) · `USCIS only`. `USCIS only` hides `local` provenance entirely —
this is the "show me what the government actually said" escape hatch, which the
skeptical user will want and which makes the provenance model demonstrably real
rather than decorative.

---

### E. Making "nothing changed" informative

The state 95% of visits land in. Four elements, in priority order:

1. **The Now block always renders a duration, not just a status.**
   `Unchanged for 22 days` is information; `Case Is Being Actively Reviewed` alone
   is the same sentence the user already memorized.
2. **Backend activity is the headline feature.** When
   `updatedAtTimestamp > currentActionCodeDate` by more than 24h, the Now block
   carries a distinct line:
   > USCIS touched your record on Jul 31 — 22 days after your visible status.
   > The public status did not change.

   This is real, verified, and invisible on my.uscis.gov. It is the single best
   answer to "I checked and nothing happened." **Wording discipline:** it is
   never called progress, never called good news, and the expanded body says
   plainly "this often precedes visible movement, but not always."
3. **The quiet-stretch meter (B3)** gives the visit a number that moved since
   last time even when the case did not.
4. **A check record.** We already store snapshots; a one-line micro-strip of the
   last 30 days shows a tick per day we checked, filled where a check found
   something. It makes the user's own vigilance visible and is quietly
   reassuring: *the tool is watching, here's the proof.*

```
┌────────────────────────────────────────────────────────────┐
│  NOW                                                       │
│  ◎ USCIS Is Currently Processing The Case                  │
│    Unchanged for 22 days · checked just now                │
│                                                            │
│    ⟳ USCIS touched your record Jul 31, 22 days after your  │
│      visible status. The public status did not change. ⌄   │
│                                                            │
│  Quiet for 22 days                                         │
│  ├████████████░░░░░░░░░░░░░░┤ longest so far: 41 days      │
│                                                            │
│  Checks  ·│··│·│··││···│··│·│·│··│··│·││··  last 30 days   │
└────────────────────────────────────────────────────────────┘
```

**Anti-goal:** no "still waiting…" empty-state illustration, no encouraging
copy, no "hang in there." Users filing immigration cases are adults under
stress; sympathy from software reads as condescension. Data and precision read
as respect.

---

### F. Multi-case relationships

**Recommendation: do not merge concurrent cases into one timeline by default.**

Reasoning. Concurrent I-485 / I-765 / I-131 filings genuinely share some
real-world events — one biometrics appointment serves all three — but they are
adjudicated on independent tracks with independent codes and wildly different
timelines (the I-765 typically approves months before the I-485). A single
merged chronology would (a) interleave 3× the rows into the same 350px column,
(b) make the user do the work of attributing every row to a form, and (c) most
damagingly, imply causal relationships between adjacent rows that belong to
different cases. The panel's whole credibility rests on not implying things.

**What to ship instead — three layers:**

**F1 — A group header for co-filed cases.** Cases are grouped when
`submissionDate` is within ±3 days **and** `applicantName` matches. The group
header sits above the member cards and carries a **multi-track strip**: one row
per form, each showing that form's stage rail, all aligned to a **shared
elapsed-days axis**. This is the one view where a combined display genuinely
adds meaning — you can see the I-765 pull ahead of the I-485 at a glance.

```
┌ Filed together · May 29, 2026 · day 143 ───────────────────┐
│  I-765   ●━━━●━━━●━━━●━━━◉                         approved │
│  I-131   ●━━━●━━━●━━━◉···                        in review  │
│  I-485   ●━━━●━━━◉···········                    in review  │
│          Recv  Bio  Review  Intvw  Decision                 │
└─────────────────────────────────────────────────────────────┘
```

**F2 — Shared-event cross-links.** When the same `eventCode` appears on the same
calendar day across two cases in a group, the timeline row on each case gets a
muted suffix: `· also on your I-765, I-131`. Cheap, accurate, and it answers the
real question ("does this biometrics cover everything?") without asserting that
it does.

**F3 — An opt-in combined view, for export.** A `Combined timeline` toggle in
the group header renders all member entries in one chronology with a form chip
(`I-485`) leading every row. This is off by default and exists because the
lawyer-facing use case (copy everything, paste into an email) is real and the
existing `summaryText()` export path should be able to produce it.

---

## 2. Timeline item spec

### 2.0 Shared anatomy

```
 ┌18px┐┌8┐┌────────────── 350px text column ──────────────┐
 │    ││ ││                                               │
 │ ◉  ││ ││ Label text, clamps at 2 lines        [CODE]   │  15px line, ink
 │ │  ││ ││ Meta · date · provenance                      │  11.5px, muted
 │ │  ││ ││ ┌─ disclosure body, only when expanded ─────┐ │
 │ │  ││ ││ │ sunken bg, 8px pad, 4px radius            │ │
 │ │  ││ ││ └───────────────────────────────────────────┘ │
 └────┘└─┘└───────────────────────────────────────────────┘
```

- Node glyph is a 12×12 inline SVG, vertically centered on the label's first
  line (`margin-top: 3px` against a 15px/1.35 label).
- The rail line is a 1px `rule`-colored vertical run at x=9 inside the gutter,
  drawn as a CSS border on the gutter element so it never breaks across rows.
- Code chip: 10.5px mono, `sunken` background, 1px `rule` border, 3px radius,
  2px/5px padding, right-aligned on the label's last line via `float: right`
  fallback to a flex row with `flex-shrink: 0`.
- Whole row is a `<button>`-semantics element (role=button, tabindex=0,
  aria-expanded) when it has a disclosure body; a plain `<div>` when it does not.
- Tap target: full row width, min-height 34px.

### 2.1 Glyph set (inline SVG, `viewBox="0 0 12 12"`, `currentColor`)

| Name | Path | Reads as |
|---|---|---|
| `disc` | `<circle cx=6 cy=6 r=4 fill=currentColor/>` | stated by USCIS |
| `disc-ring` | `disc` + `<circle cx=6 cy=6 r=5.25 fill=none stroke=currentColor stroke-width=1 opacity=.35/>` | stated **and** corroborated by a matching code event |
| `ring` | `<circle cx=6 cy=6 r=3.75 fill=none stroke=currentColor stroke-width=1.6/>` | logged as a code |
| `ring-dashed` | `ring` + `stroke-dasharray="2.2 2"` | backend activity |
| `diamond` | `<rect x=2.4 y=2.4 width=7.2 height=7.2 rx=1 fill=none stroke=currentColor stroke-width=1.6 transform="rotate(45 6 6)"/>` | observed by this tool |
| `pulse` | `<circle cx=6 cy=6 r=3 fill=currentColor/><circle cx=6 cy=6 r=5.4 fill=none stroke=currentColor stroke-width=1 opacity=.4/>` | Now / current status |
| `calendar` | `<rect x=1.5 y=2.5 width=9 height=8 rx=1.5 fill=none stroke=currentColor stroke-width=1.4/><path d="M1.5 5h9" stroke=currentColor stroke-width=1.4/><path d="M4 1.5v2M8 1.5v2" stroke=currentColor stroke-width=1.4 stroke-linecap=round/>` | appointment |
| `page` | `<path d="M2.5 1.5h4.2L9.5 4.3v6.2a.7.7 0 0 1-.7.7H2.5a.7.7 0 0 1-.7-.7V2.2a.7.7 0 0 1 .7-.7z" fill=none stroke=currentColor stroke-width=1.3/><path d="M6.6 1.6v2.8h2.8" fill=none stroke=currentColor stroke-width=1.3/>` | document added |
| `cap` | `<rect x=2.5 y=2.5 width=7 height=7 rx=1.2 fill=currentColor/>` | rail terminus / Filed anchor |
| `alert` | `<path d="M6 1.6 11 10.4H1z" fill=none stroke=currentColor stroke-width=1.4 stroke-linejoin=round/><path d="M6 5v2.6" stroke=currentColor stroke-width=1.4 stroke-linecap=round/><circle cx=6 cy=9.1 r=.75 fill=currentColor/>` | RFE / NOID / denial |
| `unofficial` | `<circle cx=6 cy=6 r=4.6 fill=none stroke=currentColor stroke-width=1 stroke-dasharray="1.6 1.6"/><path d="M4.7 4.7a1.35 1.35 0 1 1 1.5 2v.8" fill=none stroke=currentColor stroke-width=1.2 stroke-linecap=round/><circle cx=6.2 cy=9 r=.7 fill=currentColor/>` | inline marker after an unofficial label (9px, baseline-aligned) |

### 2.2 Variants

Notation: `{}` are substitutions. Dates render as `MMM D, YYYY` (drop `, YYYY`
when the year equals the current year). Times render as `h:mm A` in the user's
local zone.

---

**V1 — Official, with text** (`historicalCaseStatuses[]`, `statusTitle`)

| | |
|---|---|
| Glyph | `disc`, or `disc-ring` if deduped against a matching `events[]` entry |
| Color | `brand` |
| Label | `{statusTitle}` — HTML stripped, trailing period trimmed, weight 500, `ink` |
| Code chip | `{actionCode}` when present |
| Meta | `{Jul 18, 2026} · USCIS` |
| Meta (corroborated) | `{Jul 18, 2026} · USCIS · logged {5:58 PM}` |
| Expanded | `{statusText}` with tags stripped, 12px, `muted`; then `Action code {actionCode} · reported by USCIS on {date}.` |

The most trustworthy row in the system, and it looks it: solid node, full-weight
label, shortest meta line. Everything else is visually quieter than this.

---

**V2 — Coded, translated from your own case** (`events[]` + harvested dictionary)

| | |
|---|---|
| Glyph | `ring` |
| Color | `brand` |
| Label | `{harvestedTitle}` weight 400, `ink` |
| Code chip | `{eventCode}` |
| Meta | `{Jul 9} · USCIS event` (+ ` · {5:58 PM}` on same-day collision) |
| Expanded | `USCIS logged code {eventCode} at {5:58 PM on Jul 9} and recorded it at {5:59 PM}. The wording above is USCIS's own — we matched this code to the status text USCIS published for it on {date} on this case.` |

Note the `eventTimestamp` vs `createdAtTimestamp` ~40s delta is surfaced only
here, in the expanded body, as "happened at / recorded at." It is a nice proof
of fidelity for the curious and noise for everyone else.

---

**V3 — Coded, translated from community hints** (`events[]` + shipped table)

| | |
|---|---|
| Glyph | `ring` |
| Color | `brand` at 85% opacity |
| Label | `{hintText}` weight 400, `ink`, `text-decoration: underline dotted; text-underline-offset: 3px`, followed by the 9px `unofficial` glyph |
| Code chip | `{eventCode}` |
| Meta | `{Jun 25} · USCIS event · unofficial meaning` |
| Expanded | `USCIS sent only the code {eventCode}. "{hintText}" is a community-researched guess at what that code means — not USCIS wording, and it can be wrong. Logged {5:58 PM on Jun 25}.` |

The dotted underline is doing real work: it is the standard web affordance for
"this word has a caveat attached," it survives greyscale, and it costs zero
horizontal space in a 350px column.

---

**V4 — Coded, untranslated** (`events[]`, code in neither dictionary)

| | |
|---|---|
| Glyph | `ring` |
| Color | `muted` |
| Label | `Case event {eventCode}` — code portion in mono, weight 500; the rest weight 400, `muted` |
| Code chip | none (the code is the label — no point printing it twice) |
| Meta | `{Jul 9} · USCIS event · meaning unknown` |
| Expanded | `USCIS logged this code on your case and publishes no text for it. We don't know what it means, and we'd rather say so than guess.` |

This variant will be common. Making it *calm* rather than alarming — muted, no
warning icon, an expanded body that owns the ignorance — is the whole design.
An unknown code is not a problem with the case; it is a gap in public
documentation, and the row should say exactly that.

---

**V5 — Locally detected** (our snapshot diff: status / office / document)

| | |
|---|---|
| Glyph | `diamond` |
| Color | `amber` |
| Label (status) | `Status changed to "{to}"` |
| Label (office) | `Office changed to {jurisdictionDescription}` |
| Label (doc) | `New document in your account` + filename as a second, `muted`, mono, 11px line |
| Code chip | none |
| Meta | `Noticed {Aug 2, 9:14 AM} · by this tool` |
| Expanded (status) | `Was: "{from}". USCIS doesn't publish when this changed — {Aug 2, 9:14 AM} is when this tool first saw it, so the real change happened at some point since the previous check on {Jul 31, 8:02 AM}.` |

The word **"Noticed"** leads the meta line, not the date. That single word is the
entire provenance disclosure for tier 3, and putting it first means a user
scanning the meta column sees it before they see anything they might mistake for
an official timestamp.

**Suppression rule:** if an official (V1) entry exists whose `statusTitle`
equals the local entry's `to` value and whose date precedes our detection time,
the local row is **not rendered**. Instead the official row gains a third meta
line: `You first saw this on {Aug 2}.` This preserves the personally meaningful
"when did I learn this" without printing the same event twice with two different
dates — the single most confusing failure mode of a naive merge.

---

**V6 — Backend activity** (`updatedAtTimestamp` moved, status did not)

| | |
|---|---|
| Glyph | `ring-dashed` |
| Color | `muted` |
| Label | `USCIS touched your record` weight 400, `muted` |
| Code chip | none |
| Meta | `{Jul 31} · record updated, status unchanged` |
| Expanded | `USCIS's internal copy of your case was modified on {Jul 31, 1:07 PM} — {22} days after your visible status last changed. The public status did not change. This sometimes comes before visible movement, and sometimes means nothing we can see. We show it because my.uscis.gov doesn't.` |
| Grouped (3+ consecutive) | `USCIS touched your record {3} times` / `{Jul 12} – {Aug 2} · status unchanged throughout` |

Dashed = "something happened here but we can't see what." Consistent with the
`unofficial` glyph's dashed ring; dashes mean uncertainty throughout the system.

---

**V7 — Appointment** (`notices[]` with `appointmentDateTime`)

| | |
|---|---|
| Glyph | `calendar` |
| Color | `brand` (past) / `brand` on a 1px `brand`-tinted outlined row (future) |
| Label | `{actionType}: {Jul 9, 3:00 PM}` e.g. `Appointment Scheduled: Jul 9, 3:00 PM` |
| Code chip | none |
| Meta | `Notice generated {Jun 19} · USCIS notice {letterId}` |
| Expanded | `USCIS generated notice {letterId} on {Jun 19, 7:43 PM} for an appointment on {Jul 9, 3:00 PM}. Check the notice in your USCIS account for the address and what to bring.` |

**Future appointments are pinned above the Now block**, in an `UPCOMING`
section with an outlined row, and are *excluded* from the history rail until
their date passes. A scheduled appointment is the only forward-looking thing we
can honestly show, and it deserves the top of the panel.

```
┌────────────────────────────────────────────────────────────┐
│  UPCOMING                                                  │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ 🗓 Appointment Scheduled                    in 12 days │   │
│ │    Jul 9, 2026 · 3:00 PM · notice 440000000          │   │
│ └──────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────┘
```

Sort position for the appointment row once past: `appointmentDateTime`, not
`generationDate` — the event is the appointment.

---

**V8 — Document added** (`documents[]`, first seen)

| | |
|---|---|
| Glyph | `page` |
| Color | `brand` if `createDate` is available (USCIS-dated), `amber` if we only know when we noticed it |
| Label | `New document available` |
| Sub-line | `{fileName}` mono 11px `muted`, middle-truncated to fit 350px |
| Meta (dated) | `{Jun 4} · USCIS · {sourceType}` |
| Meta (undated) | `Noticed {Jun 4, 9:14 AM} · by this tool` |
| Expanded | `{fileName} · type {type} · {sourceType} · added {Jun 4, 2:09 AM}. Open it from your USCIS account — this tool doesn't download your files.` |

No download link. The API gives only an opaque `contentId` with no URL, and
inventing a download affordance that leads nowhere is worse than omitting it.

---

**V9 — Filed anchor** (`submissionDate`) — always the last row, never folded

| | |
|---|---|
| Glyph | `cap` |
| Color | `muted` |
| Label | `Filed` weight 500, `ink` |
| Meta | `{May 29, 2026} · {formType} received by USCIS · day 0` |
| Expanded | none (nothing more to say) |

---

**V10 — Tracking-started anchor** (local, from case add time) — rendered only
when the case has fewer than 3 other entries

| | |
|---|---|
| Glyph | `diamond` |
| Color | `muted` |
| Label | `Tracking started` |
| Meta | `{Jun 2, 9:14 AM} · by this tool` |

---

**V11 — Attention** (`FBA`, `IK`, `II`, `EA`, `IFA`, `LFA`, `FKA`, `FS`, `KH`)

| | |
|---|---|
| Glyph | `alert` |
| Color | `danger` |
| Label | translated label as V2/V3/V4 rules dictate, weight 600 |
| Meta | as its underlying variant, plus ` · needs attention` |
| Extra | also raises a banner above the stage rail (see §4.5) |

Attention is a **modifier layered on top of** V1–V4, not a separate source. The
provenance rules still apply — an RFE known only from a community-guessed code
still gets the dotted underline. Urgency never upgrades trust.

---

## 3. Sort / merge algorithm

```
CONSTANTS
  PROV_RANK = { official: 0, notice: 1, coded: 2, document: 3, local: 4, anchor: 5 }
  DEDUPE_WINDOW_MS = 36 * 3600 * 1000      // codes matched across sources
  GAP_LABEL_MIN_DAYS = 14
  BACKEND_MIN_LAG_MS  = 24 * 3600 * 1000

// ---------------------------------------------------------------- 1. PARSE
// historicalCaseStatuses dates are "MM-DD-YYYY HH:mm:ss" and new Date() will
// not parse them reliably. Parse by hand, treat as LOCAL midnight.
function parseHistoricalDate(s):
  m = /^(\d{2})-(\d{2})-(\d{4})/.exec(s)
  if not m: return null
  return new Date(int(m[3]), int(m[1]) - 1, int(m[2]))    // local midnight

function endOfLocalDay(d):
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)

// --------------------------------------------------------------- 2. COLLECT
// Every entry is normalized to the same shape. sortAt is ALWAYS a number;
// displayAt + precision is what the renderer is allowed to print.
//
//   { id, provenance, labelSource, kind, sortAt, displayAt, precision,
//     code, label, body, sources[], corroborated, attention }

items = []

// 2a. official history --------------------------------------------------
for (i, h) in caseStatus.historicalCaseStatuses:
  d = parseHistoricalDate(h.date); if not d: continue
  items.push({ id: 'hist:' + i, provenance: 'official', kind: 'status',
               sortAt: endOfLocalDay(d).getTime(),   // day-precision sorts last-in-day
               displayAt: d, precision: 'day',
               code: h.actionCode || null,
               label: stripTags(h.statusTitle), body: null,
               sources: ['historicalCaseStatuses[' + i + ']'] })

// 2b. current status, if not already represented in history -------------
if caseStatus.currentActionCode and caseStatus.currentActionCodeDate:
  t = Date.parse(caseStatus.currentActionCodeDate)
  if not items.some(x => x.code == caseStatus.currentActionCode
                      && sameLocalDay(x.displayAt, new Date(t))):
    items.push({ id: 'current', provenance: 'official', kind: 'status',
                 sortAt: t, displayAt: new Date(t), precision: 'second',
                 code: caseStatus.currentActionCode,
                 label: stripTags(caseStatus.statusTitle),
                 body: stripTags(caseStatus.statusText),
                 sources: ['currentActionCode'] })

// 2c. coded events -------------------------------------------------------
for e in caseDetail.events:
  t = Date.parse(e.eventTimestamp || e.createdAtTimestamp)
  if isNaN(t): continue
  translated = harvested[e.eventCode] ?? hints[e.eventCode] ?? null
  items.push({ id: 'evt:' + e.eventId, provenance: 'coded',
               labelSource: harvested[e.eventCode] ? 'harvested'
                          : hints[e.eventCode]     ? 'hints' : 'none',
               kind: 'event',
               sortAt: t, displayAt: new Date(t), precision: 'second',
               code: e.eventCode,
               label: translated ?? ('Case event ' + e.eventCode),
               recordedAt: Date.parse(e.createdAtTimestamp),
               sources: ['events:' + e.eventId] })

// 2d. notices ------------------------------------------------------------
for n in caseDetail.notices:
  when = n.appointmentDateTime ?? n.generationDate
  items.push({ id: 'notice:' + n.letterId, provenance: 'notice',
               kind: n.appointmentDateTime ? 'appointment' : 'notice',
               sortAt: Date.parse(when), displayAt: new Date(when),
               precision: 'second', code: null,
               label: n.actionType, letterId: n.letterId,
               generatedAt: Date.parse(n.generationDate),
               sources: ['notices:' + n.letterId] })

// 2e. documents ----------------------------------------------------------
for d in documents:
  t = Date.parse(d.createDate)
  items.push({ id: 'doc:' + d.contentId, provenance: 'document', kind: 'document',
               sortAt: t, displayAt: new Date(t), precision: 'second',
               label: 'New document available', fileName: d.fileName,
               sources: ['documents:' + d.contentId] })

// 2f. locally detected changes ------------------------------------------
for (i, c) in localHistory:              // {at, kind, from, to}
  t = Date.parse(c.at)
  items.push({ id: 'local:' + i, provenance: 'local', kind: c.kind,
               sortAt: t, displayAt: new Date(t), precision: 'second',
               label: localLabel(c), from: c.from, to: c.to,
               sources: ['local'] })

// 2g. backend activity ---------------------------------------------------
// Synthesized, not stored: the record moved while the public status did not.
u = Date.parse(caseDetail.updatedAtTimestamp)
s = Date.parse(caseStatus.currentActionCodeDate)
if u - s > BACKEND_MIN_LAG_MS:
  items.push({ id: 'backend:' + u, provenance: 'local', kind: 'backend',
               sortAt: u, displayAt: new Date(u), precision: 'second',
               label: 'USCIS touched your record', lagDays: daysBetween(s, u),
               sources: ['updatedAtTimestamp'] })

// 2h. filed anchor -------------------------------------------------------
f = parseISODateOnly(caseDetail.submissionDate)      // "2026-05-29" -> local midnight
items.push({ id: 'filed', provenance: 'anchor', kind: 'filed',
             sortAt: f.getTime(),      // start of day: the anchor sorts BELOW
             displayAt: f, precision: 'day', label: 'Filed',
             sources: ['submissionDate'] })

// ---------------------------------------------------------------- 3. DEDUPE
// Pass 1: official (day-precision) x coded (second-precision), same code.
// The official row wins on text; the coded row donates its exact timestamp.
for o in items where provenance == 'official' and o.code:
  cands = items.filter(c => c.provenance == 'coded'
                         && c.code == o.code
                         && abs(c.sortAt - o.sortAt) <= DEDUPE_WINDOW_MS)
  if cands.nonEmpty:
    best = cands.minBy(c => abs(c.sortAt - o.sortAt))
    o.corroborated = true
    o.loggedAt     = best.displayAt          // shown as "· logged 5:58 PM"
    o.sortAt       = best.sortAt             // adopt the precise key
    o.precision    = 'day'                   // but KEEP day display precision:
                                             // we still only know the DATE from USCIS text
    o.sources     += best.sources
    remove(best)
    // Harvest: this pairing is exactly how the local code dictionary grows.
    harvested[o.code] ||= o.label

// Pass 2: local status-change rows absorbed by an official row saying the same.
for l in items where provenance == 'local' and kind == 'status':
  match = items.find(o => o.provenance == 'official'
                       && normalizeText(o.label) == normalizeText(l.to)
                       && o.sortAt <= l.sortAt)
  if match:
    match.firstSeenLocally = l.displayAt     // renders as "You first saw this on …"
    remove(l)

// Pass 3: local document rows absorbed by a dated documents[] row.
for l in items where provenance == 'local' and kind == 'document':
  if items.some(d => d.provenance == 'document' && d.fileName == l.to):
    remove(l)

// Pass 4: identical coded events (same code, same second) — API duplicates.
dedupeBy(items, i => i.provenance + '|' + i.code + '|' + floor(i.sortAt / 1000))

// ------------------------------------------------------------------ 4. SORT
// Newest first. Ties are broken by TRUST, then by stability.
items.sort((a, b) =>
     (b.sortAt - a.sortAt)                                   // 1. time desc
  || (PROV_RANK[a.provenance] - PROV_RANK[b.provenance])     // 2. official first
  || (precisionRank(a) - precisionRank(b))                   // 3. day before second
  || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)                // 4. stable, deterministic
)
// precisionRank: 'day' -> 0, 'second' -> 1. Within one calendar day the
// day-precision headline leads and its machine events follow beneath it.
// NOTE: the 'filed' anchor uses start-of-day so it always sinks to the bottom
// even when other entries share May 29; it is then force-moved to last index.

moveToLast(items, i => i.kind == 'filed')

// ------------------------------------------------------------- 5. DECORATE
// Gap labels: drawn on the connector between adjacent rendered rows.
for k in 0 .. items.length - 2:
  gap = daysBetween(items[k+1].displayAt, items[k].displayAt)
  items[k].gapBelow = (gap >= GAP_LABEL_MIN_DAYS) ? gap : null

// Backend runs: collapse 3+ consecutive backend rows into one grouped row.
collapseRuns(items, i => i.kind == 'backend', minRun = 3)

// Future appointments leave the rail and go to the UPCOMING section.
upcoming = extract(items, i => i.kind == 'appointment' && i.sortAt > now)
```

**Why these tie-breaks.** Time is the user's mental model, so it leads. When
time genuinely ties, trust decides — putting the official sentence above the
codes that generated it means the list reads top-down as "what happened, then
how the machine recorded it." Precision breaks the remaining ties in the same
direction. The final id comparison exists so the list never re-orders between
renders, which matters because a timeline that shuffles on refresh destroys
exactly the confidence this panel is trying to build.

**Why the dedupe window is 36h, not 24h.** `historicalCaseStatuses` dates are
naive local midnights; `events[].eventTimestamp` are UTC instants. A 7 PM
Eastern event lands on the *next* UTC day. A 36h window absorbs that skew
without being loose enough to merge two genuinely different days' events —
and the window only ever applies when the **codes are equal**, which is the
real safety.

---

## 4. Progress / stage display

### 4.1 Anatomy at 400px

```
┌ 376px ─────────────────────────────────────────────────────┐
│  Day 143                                    filed May 29   │  28px, weight 600
│                                                            │
│  ●━━━━━━●━━━━━━◉┈┈┈┈┈┈○┈┈┈┈┈┈○                             │  stage rail
│  Recv   Bio    Review  Intvw  Decision                     │  9.5px caps
│                ▲ you are here                              │
│                                                            │
│  Cases at this stage usually move to Interview next.       │  11.5px muted
│  USCIS has not said this will happen, and order varies.    │
│                                                            │
│  Quiet for 22 days                            longest: 41  │
│  ├█████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░┤       │
└────────────────────────────────────────────────────────────┘
```

- **Segments are equal width.** 5 segments across 376px = 75px each. This is the
  key anti-deception rule: an equal-width strip cannot be read as "63% done"
  because its geometry carries no time information at all.
- **Done segments**: filled `brand` node + solid 2px `brand` connector.
- **Current segment**: `pulse` node in `brand`, label weight 600, `▲ you are here`
  beneath.
- **Ahead segments**: hollow `ring` in `rule` color + 2px dotted connector,
  labels `muted`. Dotted = not promised. Same visual language as the `unofficial`
  glyph.
- The strip carries `role="img"` with an `aria-label` reading
  `Stage 3 of 5: Under review. Stages ahead are typical, not scheduled.`

### 4.2 Shipped stage sequences

Five stage sets. Each stage owns a set of codes; a case's stage is the highest
stage any of its observed codes maps to (see 4.3).

**I-485** — Application to Register Permanent Residence
| # | Stage | Label | Codes |
|---|---|---|---|
| 1 | Received | `Recv` | `RCV0` `H001` `IAF` `IAA` |
| 2 | Biometrics | `Bio` | `FNA` `IMAF` `FNB` `MA70` `H008` `FNG` `FNH` |
| 3 | Under review | `Review` | `FSA0` `FTA0` `FT0` |
| 4 | Interview | `Intvw` | `FH` `FHB` `FJ` `IM` `HG` `FM` |
| 5 | Decision | `Decision` | `DA` `DB` `SA` `APR0` `IEA` `IEC` `IEE` |
| 6 | Card produced | `Card` | `LAA` `LBA` `LDA` `LEA` |

Six stages is one too many for 376px, so I-485 renders stage 6 only once stage 5
is reached; before that the strip shows stages 1–5 and the final label reads
`Decision`. After approval it re-renders as `Review · Intvw · Decision · Card`
with stages 1–2 collapsed into a single `Filed` cap. Never more than 5 segments
on screen.

**I-765** — Employment Authorization
| # | Stage | Label | Codes |
|---|---|---|---|
| 1 | Received | `Recv` | `RCV0` `H001` `IAF` `IAA` |
| 2 | Biometrics | `Bio` | `FNA` `IMAF` `FNB` `MA70` `H008` `FNG` `FNH` |
| 3 | Under review | `Review` | `FSA0` `FTA0` `FT0` |
| 4 | Approved | `Approved` | `DA` `DB` `SA` `IEA` `IEE` |
| 5 | Card produced | `Card` | `LAA` `LBA` `LDA` `LEA` |

**I-131** — Travel Document — identical to I-765 with stage 5 relabeled
`Document` (`LDA` = "we produced your document" for travel docs).

**I-485J** — Supplement J, Confirmation of Bona Fide Job Offer
| # | Stage | Label | Codes |
|---|---|---|---|
| 1 | Received | `Recv` | `RCV0` `H001` `IAF` `IAA` |
| 2 | Under review | `Review` | `FSA0` `FTA0` `FT0` |
| 3 | Reviewed | `Done` | `DA` `DB` `SA` |

Three stages, and the module carries an extra muted line:
> Supplement J often shows no visible movement at all until the underlying I-485
> is decided.

That sentence prevents a legitimate all-quiet I-485J from reading as a stuck case.

**Unknown form** — any `formType` not in the table renders no stage rail at all.
The elapsed line and quiet meter still render. We do not guess a sequence for a
form we haven't verified.

### 4.3 Deriving the current stage

```
stageOf(case):
  codes = [currentActionCode] + events[].eventCode + historicalCaseStatuses[].actionCode
  seq   = SEQUENCES[formType]
  if not seq: return { mode: 'none' }

  mapped = codes.map(c => seq.indexOfStageContaining(c)).filter(i => i >= 0)
  if mapped.isEmpty:
     return { mode: 'indeterminate', floor: 1 }      // Received, from submissionDate

  idx = max(mapped)                                   // MONOTONIC: never regress
  idx = max(idx, persistedMaxStage)                   // sticky across refreshes
  persistedMaxStage = idx

  att = codes.filter(c => ATTENTION_CODES.has(c))
  return { mode: 'known', index: idx, attention: att, unmapped: codes.filter(unmapped) }
```

**Monotonic and sticky.** A stage index never decreases, even if USCIS's current
code moves backward (which happens — e.g. an interview is descheduled and the
case returns to `FTA0`). A progress display that visibly regresses is
devastating to read and usually wrong; regressions surface in the *timeline*,
where they belong, with the actual event that caused them.

**Codes that don't map.** Two cases:

1. **Some codes map, some don't.** The unmapped codes simply do not vote. They
   still appear in the timeline as V4 rows. No note needed — the stage is
   supported by the codes that did map.
2. **No codes map at all** (`mode: 'indeterminate'`). The rail renders with
   **every segment hollow**, the "you are here" marker absent, and a replacement
   line:
   > We can't place this case on a stage map — USCIS has only sent codes we
   > don't recognize (`XY12`, `ZZ0`). The timeline below still shows everything
   > USCIS logged.

   Explicitly showing the offending codes matters: it invites the user to search
   them, and it makes the tool's ignorance legible rather than mysterious. The
   elapsed line and quiet meter still render, so the module is never empty.

### 4.4 Quiet-stretch computation

```
movements = items.filter(i => i.provenance in ['official','coded','notice']
                           && i.kind != 'backend')
                 .map(i => i.displayAt).sort(asc)

if movements.length < 3:  render elapsed line only, no meter
gaps        = pairwiseDiffsInDays(movements)
maxPriorGap = max(gaps)
currentGap  = daysBetween(last(movements), now)
fillPct     = 100 * currentGap / max(maxPriorGap, currentGap)
```

Backend activity is deliberately excluded from `movements` — it would reset the
quiet counter without the user having learned anything, which is the opposite of
the meter's purpose. It gets its own line in the Now block instead.

The meter's track is `rule`; the fill is `muted`, **not** `brand` and **not**
`amber`. It is a measurement, not a status, and it should not compete with the
stage rail for attention.

### 4.5 Attention banner

When `ATTENTION_CODES` fire, a banner sits **above** the stage rail — full-bleed
within the card, `danger`-tinted 8% background, 1px `danger` left border, 12px:

```
┌────────────────────────────────────────────────────────────┐
│▌⚠ USCIS may need something from you                        │
│▌  A Request for Evidence was logged on Jul 12 (code IK).   │
│▌  Check your USCIS account and any mail for the notice.    │
└────────────────────────────────────────────────────────────┘
```

Copy rules: **never** state what the user must do or by when (we don't know
the deadline and getting it wrong is harmful), **always** point back to the
official account, and if the code's meaning came from the hints table, say so:
`based on an unofficial reading of code IK`.

---

## 5. Empty / sparse / loading / error states

**S1 — First load, no cached data.** Rail skeleton: 3 ghost rows, each a 12px
grey circle and two grey bars (60% and 35% width), 1.4s ease-in-out opacity
pulse 0.4↔0.7, `prefers-reduced-motion` → static 0.55. Header reads
`Reading your case…`. Never a spinner alone — the skeleton pre-announces the
shape of what's coming, so the layout doesn't jump.

**S2 — Loaded, sparse** (< 3 real entries). §1C: Now block + stage rail +
synthesized anchors + the "USCIS publishes very little" footnote. This is a
**designed state, not an empty state** — no illustration, no "nothing here yet."

**S3 — Loaded, genuinely nothing** (no `submissionDate`, no events, no history —
should be impossible, must not crash). Rail hidden entirely; single muted block:
> USCIS returned no timeline data for this case. That usually means the receipt
> number is filed in an older system this tool can't read. The status above is
> still current.

**S4 — Fetch failed, cached data exists.** **Never blank the timeline.** Render
the last-known timeline at full opacity with a staleness strip above it:
```
┌────────────────────────────────────────────────────────────┐
│ ⚠ Couldn't reach USCIS at 3:04 PM. Showing what was saved  │
│   on Aug 8, 9:14 AM.                          [Try again]  │
└────────────────────────────────────────────────────────────┘
```
Greying out real history to signal staleness is a mistake — it makes the user
doubt data that is perfectly good, just not fresh.

**S5 — Session expired.** Same shape as S4, with the action changed:
> Your USCIS login timed out. Log back in on my.uscis.gov, then Refresh.
> `[Open my.uscis.gov]`

**S6 — Partial failure.** `case_status` succeeded, `events` failed (or vice
versa). Render everything that arrived, and add one muted footnote under the
rail naming exactly what's missing:
> Coded events couldn't be loaded this check — the timeline may be missing
> entries between Jul 9 and now.

Naming the *gap window* rather than just the failure lets the user calibrate how
much to trust the list.

**S7 — Closed case** (`closed: true`). Rail terminates at the top with a `cap`
glyph instead of the `pulse` Now node; stage rail renders fully complete with no
`ahead` segments; quiet meter is suppressed entirely (waiting is over — the
meter would be macabre). Header line: `This case is closed.`

---

## 6. Deliberately rejected

- **A percentage progress bar.** `processing_times` is 204 for every form
  tested. Any percentage would be manufactured from an elapsed-time guess, and
  a bar at 87% on a case that has eight more months to run is a small cruelty.
  The equal-width stage strip exists specifically so no one can read a fraction
  off it.
- **Predicted decision dates / countdowns.** We have no basis, and users would
  plan around them — leases, job offers, travel. The cost of being wrong is
  borne entirely by the user.
- **"Cases like yours typically take N months."** We have a sample size of one
  account and no cohort data. Reciting national medians we cannot verify against
  this case's service center is dressing a guess as analysis.
- **Queue position or percentile.** Not in any endpoint. Would be pure fiction.
- **Fabricated timestamps for day-precision entries.** Rendering `12:00 AM` for
  `historicalCaseStatuses` would be inventing information *and* implying
  suspicious overnight activity. Precision is displayed as received.
- **Treating community code meanings as fact.** ~40 of ~492 codes, unofficial,
  and we already found one live code (`SA`) absent from every community list.
  Hints are always dotted-underlined, always paired with the raw code, and
  always captioned as guesses.
- **Guessing at untranslated codes** ("this probably means…"). `Case event FTA0`
  plus "we don't know what this means" is a better row than a confident wrong one.
- **Sorting by our detection time.** Local timestamps are precise and therefore
  seductive as a sort key, but they measure when the *user opened a browser tab*,
  not when USCIS acted. Precise ≠ accurate.
- **Merging concurrent cases into one default timeline.** Independent
  adjudication tracks; adjacency in a merged list would imply causation. Replaced
  by the aligned multi-track group strip (§1F) and an opt-in combined view.
- **Framing backend activity as good news.** `updatedAtTimestamp` moving is
  real and worth showing, but "your case is moving!" is a claim we cannot
  support, and the crash after a false hope is worse than never raising it.
- **Red/amber "delayed" warnings on long waits.** We don't know what normal is
  for this office and form. The quiet meter compares the case only to itself.
- **Gamification** — streaks, confetti on approval, encouraging copy, progress
  celebrations. Wrong register for a process that decides where people get to
  live.
- **Relative-only dates** ("3 weeks ago"). Users copy these into emails to
  attorneys. Absolute dates lead; relative time is a supplement.
- **Icon fonts / external icon libraries.** The panel injects into a third-party
  page under CSP; every glyph in §2.1 is inline SVG with `currentColor`.
- **An animated "live" pulse on the Now node.** Tested against the actual use
  case: a permanently pulsing dot on a case that hasn't moved in six weeks
  reads as mockery. The Now glyph is a static double-ring.
```
