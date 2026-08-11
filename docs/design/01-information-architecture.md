# Information architecture & content design

> **Status: input document, partly superseded.** Written as a specialist
> deliverable before implementation. The binding decisions are in
> [SPEC.md](SPEC.md) and [REVIEW-TRIAGE.md](REVIEW-TRIAGE.md); where this file
> disagrees with those, they win. Kept for the reasoning, not as a build target.


Panel overlaying `my.uscis.gov`. Audience: people whose ability to work, travel, or
remain in the country depends on these records. They check at 2am. They check for
months with nothing changing. Many read English as a second language. Many are not
technical.

Everything specified here is buildable from `docs/API-SCHEMA.md`. Where the data
does not support a design (progress %, predictions, "cases like yours"), the
design says so out loud instead of faking it.

---

## 0. The three questions

Every pixel in this panel earns its place by answering one of exactly three
questions, in this priority order:

| # | The user's actual question | Answered by |
|---|---|---|
| Q1 | **"Has anything happened?"** | Change detection, `updatedAtTimestamp`, newest history/event date |
| Q2 | **"What does it mean?"** | `statusTitle`, `statusText`, notices, `actionRequired`, decoded codes |
| Q3 | **"How much longer?"** | `submissionDate` elapsed, date of last movement. **Never a prediction.** |

Q1 is 90% of visits and must be answerable without scrolling, clicking, or
reading a sentence. Q2 is the visit where something *did* happen. Q3 can never be
truly answered, so the design's job is to answer it *honestly and briefly* and
then get out of the way — an elaborate Q3 module is a machine for generating
false hope.

**Ordering rule:** within a card, the vertical order is Q1 → Q2 → Q3 → provenance.
The one exception is a live obligation (appointment, evidence request), which
outranks everything because it has a deadline attached.

---

## 1. Single case card

### 1.1 Layout

```
┌──────────────────────────────────────────────────────────────┐
│ ● I-765  Work permit                    [ NEW ]   ⌄          │  A  header
│   IOE0000000000 · "My EAD"                                   │
├──────────────────────────────────────────────────────────────┤
│ ⚑ Biometrics appointment — Thursday, July 9, 2026            │  B  obligation
│   Time on record 7:00 PM. Confirm against your notice.       │     (conditional)
├──────────────────────────────────────────────────────────────┤
│ Card Was Delivered To Me By The Post Office                  │  C  status headline
│ Set July 18, 2026 · 23 days ago                              │  D  status age
│                                                              │
│ USCIS's record was touched 22 days after that (July 31).     │  E  backend signal
│ Their site doesn't show this. It isn't a decision.  Explain →│     (conditional)
│                                                              │
│ Filed May 29, 2026 · day 96                                  │  F  elapsed
├──────────────────────────────────────────────────────────────┤
│ ▸ What USCIS says about this status                          │  G  disclosure
│ ▸ Timeline · 6 entries                                       │  H  disclosure
│ ▸ Case details                                               │  I  disclosure
│ ▸ Documents · 2                                              │  J  disclosure
├──────────────────────────────────────────────────────────────┤
│ Checked 4 minutes ago · Nebraska Service Center       Español│  K  footer
└──────────────────────────────────────────────────────────────┘
```

### 1.2 Element table

Weights are relative; `--fg` is primary text, `--fg-2` secondary, `--fg-3` tertiary.

| ID | Element | Source | Size / weight | Always visible? | Question |
|---|---|---|---|---|---|
| A1 | Change dot | local diff | 8px dot, accent | yes (or absent) | Q1 |
| A2 | Form type + plain-language name | `formType` + our map | 15px / 600 / `--fg` | yes | identity |
| A3 | Receipt number + nickname | `receiptNumber`, local | 12px / 400 / `--fg-3`, mono for the number | yes | identity |
| A4 | State chip | derived | 11px / 600, pill | only when non-quiet | Q1 |
| B | Obligation banner | `notices[].appointmentDateTime`, `actionRequired`, `evidenceRequests[]` | 14px / 600, tinted band | only when live | Q2 |
| C | Status headline | `statusTitle` | 18px / 600 / `--fg`, wraps to 3 lines max | yes | Q2 |
| D | Status age | `currentActionCodeDate` or newest `historicalCaseStatuses[].date` | 13px / 400 / `--fg-2` | yes | Q1/Q3 |
| E | Backend-activity line | `updatedAtTimestamp` vs D | 13px / 400 / `--fg-2`, left rule in accent | conditional (§4.3) | Q1 |
| F | Elapsed since filing | `submissionDate` | 13px / 400 / `--fg-3` | yes | Q3 |
| G | Official status paragraph | `statusText` | collapsed | one click | Q2 |
| H | Timeline | `historicalCaseStatuses[]` + `events[]` + local snapshots | collapsed | one click | Q1/Q2 |
| I | Case details | jurisdiction, attorney, applicant, premium, closed, channel | collapsed | one click | provenance |
| J | Documents | `documents[]` | collapsed | one click | Q2 |
| K | Freshness + office + language | local, `jurisdictionDescription`, `*Spanish` | 11px / 400 / `--fg-3` | yes | trust |

### 1.3 Why the status headline is *not* the top line

`statusTitle` is what USCIS's own website leads with, and it is the wrong lead for
this product. A returning user has read `"USCIS Is currently Processing the Case"`
eleven hundred times. Leading with it makes every visit look identical and forces
the user to *compare against memory* to answer Q1 — which is exactly the cognitive
work that keeps them refreshing at 2am.

So the top line carries **identity + change state** (A), and the status headline
sits second (C) with the highest *type* weight on the card. Identity is small but
first; status is second but biggest. The eye lands on the headline; the scan for
"is this the case that moved" happens in the row above it.

### 1.4 The obligation band (B)

Outranks everything when present. Triggers, in priority order:

1. `notices[]` entry with `appointmentDateTime` in the future
2. `actionRequired === true`
3. `evidenceRequests[]` non-empty
4. `notices[]` entry with `appointmentDateTime` in the past, within 7 days (so a
   just-missed or just-attended appointment is still visible)

Copy, in order:

```
Appointment on record: Thursday, July 9, 2026
Time on record: 7:00 PM. Confirm the time and address on the
notice USCIS sent you — that notice is the authority, not this panel.
```

```
This case is marked "action required" by USCIS.
Sign in to my.uscis.gov and open the case to see what they're asking for.
This panel can see the flag but not the request itself.
```

```
1 request for evidence is attached to this record.
Open the case on my.uscis.gov for the document and the deadline.
```

**Time-of-day caveat is mandatory.** `appointmentDateTime` arrives as
`2026-07-09T19:00:00.000Z`. We cannot verify whether USCIS stamped a local office
time as UTC. Display the **date** with confidence, the **time** with the caveat
above, and never convert to the viewer's timezone silently. Getting someone to a
biometrics appointment an hour late is the single worst thing this panel could do.

### 1.5 Status age (D) — how the date is chosen

```
newest of:
  currentActionCodeDate
  historicalCaseStatuses[0].date  (parsed manually — MM-DD-YYYY HH:mm:ss)
fallback: updatedAt        → label becomes "Record dated ..." not "Set ..."
fallback: none available   → omit line D entirely, do not print "unknown date"
```

Format: `Set July 18, 2026 · 23 days ago`

- Month always spelled out. `07/18/2026` is genuinely ambiguous to a large share
  of this audience; day counts are not.
- "23 days ago" comes second because it's the emotionally loaded number and the
  absolute date is the verifiable one.
- Under 48 hours: `Set yesterday, August 9, 2026`. Same day: `Set today`.

### 1.6 Progressive disclosure — what's behind each ▸

**G · "What USCIS says about this status"** — the full `statusText` paragraph.
Collapsed because it's 80–150 words of official prose that does not change between
visits; expanded it would push everything else below the fold and bury Q1. When
the status is *new since last check*, this section auto-expands once, then
remembers that it's been read.

Rendering rules for `statusText`:
- Never `innerHTML`. Strip tags, keep the anchor's visible text inline.
- Collect `href`s; render them as real links **only** if the hostname ends in
  `uscis.gov` or `dhs.gov`. Anything else renders as plain text. USCIS's own copy
  is the source, but the panel should not become a link-injection surface.
- Preserve the leading `As of July 9, 2026, ...` — it's USCIS's own dating and it
  corroborates line D.

**H · "Timeline"** — merged, newest first. Three entry kinds, visually distinct:

| Kind | Source | Label | Text |
|---|---|---|---|
| Official status | `historicalCaseStatuses[]` | `From USCIS` | `statusTitle` verbatim |
| Coded event | `events[]` | `From USCIS · code FTA0` | decoded per §3.5 |
| Detected | local snapshot diff | `Noticed by this panel` | e.g. `Record last-updated date moved to July 31` |

Deduplication: an `events[]` entry within 48 hours of an official status entry
carrying the same code collapses into the official entry (the official text wins,
the code is shown as a small suffix). Otherwise both show — the events array is
more granular than the visible history and that granularity is a feature.

**I · "Case details"** — the fields USCIS's website never shows, which is much of
this product's reason to exist. Order: office (`jurisdictionDescription`, with the
raw `jurisdiction` code in parentheses), filed date, form full name (`formName`),
applicant name, attorney (`representativeName`), premium processing, filing
channel (`elisChannelType`), case closed flag, concurrent cases (linked to their
cards).

**J · "Documents"** — see §5.4. Header always carries the count; a zero-count
section does not render at all.

### 1.7 One click vs always visible — the rule

> Always visible = anything that can change between two 2am visits, plus the one
> number that quantifies waiting (day count).
> One click away = anything stable, long, official, or explanatory.

That single rule generates the whole layout: status headline changes (visible),
status paragraph doesn't (collapsed); the timeline's *length* changes (count in
the collapsed header, visible), its contents don't (collapsed); office and
attorney never change (collapsed).

### 1.8 Language

`statusTitleSpanish` / `statusTextSpanish` are present in the API and are **USCIS's
own translations**, not machine output. The footer carries an `Español` toggle
that swaps C, G, and every official timeline entry to the Spanish strings when
present. Label it once, on first use:

```
Español — the Spanish text USCIS wrote for this status. Not a translation
by this panel. If Spanish text is missing for an entry, the English stays.
```

Panel chrome (our own labels) ships English and Spanish strings. Never mix a
machine translation in with official text; if we can't translate a piece of our
chrome, leave it in English rather than guess.

---

## 2. Multi-case view

### 2.1 Density by case count

| Cases | Layout |
|---|---|
| 1 | Single card, fully expanded card body (sections G–J still collapsed). No summary rail, no group headers — a "1 of 1 cases" summary is insulting. |
| 2–3 | Stacked cards. The card with the most recent change is expanded; the rest collapse to A + C + D (three lines each). No summary rail. |
| 4+ | **Status board** (§2.3) at the top, then grouped cards, all collapsed to A + C + D. |

Collapsed card = header row + status headline + status age. It is never collapsed
past the point where Q1 is answerable.

### 2.2 Grouping: concurrent filings

Two cases group together when **either**:
- one appears in the other's `concurrentCases[]`, **or**
- `submissionDate` is identical **and** the form types are a known concurrent
  combination (I-485 with any of I-765 / I-131 / I-485J; I-130 with I-485).

Same-day filing alone is suggestive but not sufficient — two unrelated cases filed
the same day should not be presented as linked, because users read a group header
as a claim that the cases are legally tied.

Group header:

```
Filed together May 29, 2026 · 3 cases · day 96
```

The group carries **the day count**, because concurrently filed cases share a clock
and a user who sees "day 96" three times is being told the same fact three times.
Inside the group, individual cards drop line F unless their own `submissionDate`
differs from the group's.

An I-485J is rendered as a *child* of its I-485 when both are present — indented,
with a connector, and the label `Related to your I-485`. We do not assert a
processing relationship, only a filing one.

Ungrouped cases sort below groups, newest filing first.

### 2.3 The status board — answering "anything new anywhere?" in 2 seconds

Fixed at the top of the panel. One line, then one row per case.

```
4 cases · 1 with something new · checked 4 minutes ago      [ Refresh ]

●  I-765   Work permit          Card was delivered            new
○  I-485   Green card           USCIS is processing           23d
○  I-131   Travel document      USCIS is processing           23d
○  I-485J  Job portability      Received                      61d
```

Summary row contents, left to right — exactly four fields, no more:

1. **Change dot** — filled accent = something new since last dismissal; hollow
   ring = quiet. Not a colour-coded severity; see §4.1.
2. **Form type** (mono, fixed width) — the string users actually say out loud.
3. **Plain-language name** then **truncated `statusTitle`**, one line, ellipsised.
4. **Right-aligned age token** — `new`, or days since last status change (`23d`).

The two-second answer comes from column 1 alone: a vertical run of hollow rings
reads instantly as "nothing". The header line states it in words for anyone who
doesn't parse the dots. If nothing is new, the header line reads:

```
4 cases · nothing new since August 8 · checked 4 minutes ago
```

Clicking a row scrolls to and expands that card. The board never scrolls
independently; at 5 cases it is 6 lines tall, which is the whole point.

### 2.4 What the board must not do

- No aggregate progress ("your case bundle is 60% complete") — invented.
- No cross-case comparison ("your I-765 is ahead of your I-485") — meaningless.
- No sorting by "most likely to move next" — pure fabrication.
- No badge count in a browser action that includes backend-activity-only changes;
  a red "1" for a `updatedAtTimestamp` bump trains panic. See §4.3.

---

## 3. Anxiety-aware content design — actual strings

### 3.1 Empty states

**No cases discovered, session valid**

```
No cases found on your account yet.
If you know a receipt number, add it below — it's the 13-character
code starting with IOE on your I-797C notice from USCIS.
```

**Never** "0 cases" or "You have no cases." A person logged into USCIS who is told
they have no cases will read it as their case being gone.

**First run, before first fetch**

```
Reading your cases from my.uscis.gov. This takes a few seconds.
```

**Case has no history at all** (`historicalCaseStatuses` empty, `events` ≤ 1)

```
USCIS hasn't published any history for this case yet — only its
current status. That's common for recently filed cases. This panel
will record anything that changes from now on.
```

**Timeline section with only detected entries**

```
Nothing here came from USCIS yet. These entries are changes this
panel noticed between checks.
```

### 3.2 The no-change state — the most important copy in the product

This string is read hundreds of times by the same person. It must be *true*,
*calm*, and *not a consolation prize*. Rules: no exclamation, no "still", no
"unfortunately", no "hang in there", no emoji, no cheerleading, no countdown
framing, and never a number rendered in a warning colour.

Buckets by days since last *material* change:

| Days | String |
|---|---|
| 0 | `Changed today.` |
| 1–6 | `No change since Tuesday, August 4 — 6 days.` |
| 7–29 | `No change for 23 days. Last change July 18, 2026.` |
| 30–89 | `No change for 47 days. Quiet stretches of weeks or months are ordinary in these records.` |
| 90–364 | `No change for 143 days. Long quiet periods are ordinary here. Nothing in this record is asking anything of you.` |
| 365+ | `No change for 1 year, 22 days. This panel is still checking, and will still record the day it changes.` |

Notes on the choices:

- **"No change for 47 days"**, not "Nothing has happened in 47 days." Nothing
  *visible* changed; things may well have happened. The former is a statement
  about the record — which is all we can see — and it's the more honest one.
- **"ordinary"**, not "normal" and not "don't worry". "Ordinary" is a descriptive
  claim about how these records generally behave, which is defensible. "Don't
  worry" is an instruction about feelings, which we have no standing to give.
- The last-changed date is always present so the sentence is *checkable*.
- **"Nothing in this record is asking anything of you"** is gated on
  `actionRequired === false` and no open evidence request and no future
  appointment. It is a data statement, not reassurance, and must never appear
  when those fields say otherwise.
- The 365+ string deliberately drops the "ordinary" reassurance. At a year, telling
  someone this is ordinary reads as dismissal. What's left is the commitment: we're
  still watching.

**Never write:** `Still waiting.` · `No news is good news.` · `Sit tight!` ·
`Your case appears stuck.` · `47 days without movement 😔` · `Unusually long wait.`

### 3.3 Errors and session expiry

**Session expired** (auth probe fails / 401 / HTML login page returned)

```
Your USCIS sign-in has timed out.
This happens on the USCIS site too, after a period of inactivity.
Your saved cases and history are safe in this browser.

Sign in again at my.uscis.gov, then choose Refresh.
```

Three jobs, in order: name the cause, say it isn't the user's fault or a data
loss, give one action. The reassurance about saved data is line 3 because
"expired" reads as "erased" to an anxious reader.

**Network / fetch failure**

```
Couldn't reach USCIS just now. This is a connection problem between
your browser and their servers — it says nothing about your case.
Showing what was saved on August 10 at 2:14 AM.        [ Try again ]
```

The middle sentence is non-negotiable. Any error shown next to an immigration case
is read as being *about the case* unless explicitly disclaimed.

**A single case fails while others succeed**

```
Couldn't load this case just now. The others loaded fine.
Showing the version saved July 31.                     [ Try again ]
```

**USCIS returned something we don't recognise**

```
USCIS's response for this case didn't look like it usually does.
That usually means they changed something on their end, not that
anything changed about your case. Check my.uscis.gov directly.
```

**Stale data banner** (last successful fetch > 24h old)

```
Last successful check: August 8, 2026. Newer information may exist
on my.uscis.gov.
```

### 3.4 The estimate disclaimer

We do not have processing-time data — endpoint #5 returns 204 for every form
tested. So there is **no progress bar**. What appears instead, under line F when
the user expands "How much longer?":

```
No estimate available

USCIS's system returns no processing-time estimate for this form
through the account it's read from. This panel could draw a progress
bar anyway, but it would be a guess dressed up as information, so it
doesn't.

What's real: this case was filed 96 days ago, and its status was
last set 23 days ago.

For published processing times, see the USCIS processing times page.
Those are historical averages for a form and office — not a
prediction about your case.
```

If a future capture ever yields a real range, the bar may be built — and the
disclaimer becomes: `Based on USCIS's published range for I-765 at Nebraska
Service Center. A range describes past cases, not yours.` Under no circumstance
does the panel display a single-number ETA, a "you should hear back by" date, or a
percentage derived from anything other than a USCIS-published range.

### 3.5 The unofficial-code disclaimer

Event codes have two decoders. The UI must make the difference obvious *at the
point of reading*, not in a footnote.

**Self-harvested (from this account's own `historicalCaseStatuses`):** render the
official text plainly, code as a small mono suffix. No disclaimer needed — the
text came from USCIS about this very case.

```
July 18, 2026    We produced your new card...              From USCIS · LDA
```

**Shipped community hints:** render in `--fg-2` italic, with an inline marker.

```
June 3, 2026     Receipt letter emailed  (?)               Code IAF
```

The `(?)` marker opens:

```
What this code means — unofficial

USCIS records this step as code IAF and publishes no text for it.
"Receipt letter emailed" is what the immigration community has
worked out these codes to mean. It is not from USCIS, it may be
wrong, and it is not legal advice.

What is certain: USCIS logged an event coded IAF on June 3, 2026.
```

The final line is the pattern for all uncertain content: state the unfalsifiable
fact after the interpretation, so the user always has something solid to hold.

**Unknown code:**

```
March 2, 2026    Code FQ9 — no meaning known             From USCIS
                 USCIS logged a step here but publishes no text for
                 this code, and it isn't in our list.
```

Never hide an unknown code. A user who sees six events but only five explanations
is being shown less than the truth; "we don't know" is information.

### 3.6 Standing disclaimer

Panel footer, always present, small, not dismissible:

```
Unofficial tool. Not USCIS, not legal advice. my.uscis.gov is the
authority on your case.
```

---

## 4. Change treatment

### 4.1 No semantic colour. One accent.

**Approvals do not render green. Denials do not render red.** Reasons:

1. We cannot classify reliably. `statusTitle` is free prose across hundreds of
   variants; `SA` appeared live paired with "approved" and is in no community
   list. A misclassified denial is unforgivable, and a misclassified approval is
   worse.
2. Colour arrives before language. A red card at 2am delivers a verdict before the
   user has read a word, and the tool would be *guessing* that verdict.
3. Reading a denial is a moment that deserves the person's full attention on the
   actual words. Decoration competes with that.

So: exactly one accent (amber) meaning **"different from last time you looked."**
It is a *novelty* signal, not a *valence* signal. Approval and denial and a new
document all get the same amber dot; the words carry the meaning.

The only exception: the obligation band (§1.4) uses a distinct tint, because a
deadline is categorically different from information. It is still not red.

### 4.2 What counts as a change

**Material — sets the change dot and the `NEW` chip:**

| Field | Timeline entry text |
|---|---|
| `statusTitle` / `currentActionCode` differs | `Status changed to "…"` |
| new `historicalCaseStatuses[]` entry | official text, `From USCIS` |
| new `events[]` entry | decoded per §3.5 |
| new `notices[]` entry | `New notice on file: Appointment Scheduled` |
| new `documents[]` entry | `New document on file` |
| `actionRequired` false→true | `USCIS marked this case as needing action from you` |
| `closed` false→true | `USCIS marked this case closed` |
| `evidenceRequests[]` grew | `A request for evidence was added to this record` |
| `jurisdiction` changed | `Office on record changed: Nebraska Service Center → …` |
| `isPremiumProcessed` changed | `Premium processing flag changed` |

**Quiet — separate, lower-weight marker (§4.3):**
`updatedAtTimestamp` advanced with no material change.

**Ignored entirely — never surfaced, never stored as a change:**
`message` (contains the echoed query string), `ackedByAdjudicatorAndCms`,
`cmsFailure` toggling without other change, `areAllGroupStatusesComplete`,
timestamp reformatting, whitespace/HTML-entity differences inside `statusText`,
and any field whose value flips back within one check cycle.

That last rule matters: a flapping boolean that produces a notification every four
hours will destroy this user's sleep and their trust. Require a change to persist
across two consecutive fetches before it can raise a notification (it may appear
in the panel immediately, labelled as detected).

### 4.3 Backend activity — `updatedAtTimestamp` moved, status didn't

This is the panel's headline capability and its biggest ethical risk. The user is
being handed a signal USCIS's own website hides, about a system nobody has
documented. Overclaim it and we manufacture hope; bury it and we've wasted the
one thing we uniquely know.

**Threshold:** show only when `updatedAtTimestamp` is **≥ 3 days newer** than the
status date (line D). Below that it's plausibly the same action being written
twice, and a shrug rendered as a signal is noise.

**Inline card copy (E), two lines:**

```
USCIS's record for this case was touched 22 days after the status
was set — on July 31, 2026. Their website doesn't show this.  Explain →
```

**Expanded explanation:**

```
What "the record was touched" means

Every case in USCIS's system carries a "last updated" date. For this
case that date is July 31, 2026 — 22 days after the status you see
above was written on July 9.

So something in their system wrote to this case's record after the
status was set. We can see that it happened. We cannot see what it
was, and USCIS doesn't publish it anywhere.

It could be routine maintenance, an internal note, a batch job, or a
step that has no public status. It is not a decision, it is not an
approval, and it does not mean an answer is coming soon. If USCIS
had decided something, the status above would say so.

Why show it at all: it is a real fact about your case that USCIS's
own website leaves out, and this panel's job is to show you
everything the record contains.
```

**Timeline entry (detected kind):**

```
July 31, 2026   Record's last-updated date moved to July 31.
                No visible status change.        Noticed by this panel
```

**It must never imply:** that a decision is near, that the case is "moving" or
"progressing", that anyone looked at the case, that this predicts approval, that
it is more or less than any other case's backend activity, or that the user should
do anything. There is no call to action, because there is no action.

**Notification policy:** backend-only activity gets a panel marker but **no browser
notification and no badge count**, unless the user explicitly opts in under a
setting labelled:

```
Also notify me about behind-the-scenes record updates
These are frequent, carry no explanation, and don't mean a decision.
Off by default.
```

Waking someone at 2am for a timestamp we cannot explain is a harm, not a feature.

### 4.4 Announcing a material change

The panel opens; a case changed. Card header:

```
● I-765  Work permit                                   [ NEW ]  ⌄
```

Card body gains a band directly above the status headline:

```
Changed since you last looked — August 8, 2026
The status is now "Card Was Delivered To Me By The Post Office"
(it was "We mailed your new card").               Show what changed →
```

Rules:
- Always name **both** the old and the new value. A change with no "from" is a
  jump-scare.
- Always date the comparison ("since you last looked — August 8") so the user
  knows the window.
- Never characterise the change ("Good news!", "Unfortunately", "Big update").
  Present the strings; the person knows what they mean better than we do.
- Dismissal is explicit and per-case (`Got it`), never automatic on scroll. The
  user decides when they've absorbed it. Dismissing clears the dot but the entry
  stays in the timeline forever.
- Motion: a 150ms fade on the band. No pulsing, no bouncing, no sliding, no sound.
  Nothing in this panel should ever animate on a loop — a throbbing badge on an
  immigration case is a small cruelty.

### 4.5 Notification text

```
USCIS Tracker
I-765 (IOE0000000000): status changed to "Card Was Delivered To Me
By The Post Office"
```

Verbatim `statusTitle`, no adjectives, no emoji, no "!". Receipt number included
because a user with four cases needs to know which. If redact mode is on, the
nickname or form type replaces it.

---

## 5. Absent data

Roughly half these fields are empty for any given case. A sparse case must look
*sparse*, never *broken* — a user seeing empty boxes will conclude the tool is
failing on their case specifically, which is its own small panic.

### 5.1 The hide/unknown rule

> **Hide** a field the user didn't know existed.
> **Show as explicitly unknown** a field the user came here looking for.
> **Never** render a value-less placeholder (`—`, `N/A`, `null`, empty box).

Field-by-field:

| Field | If absent |
|---|---|
| `representativeName` | **Hide.** No attorney is a normal state, not missing data. |
| `jurisdiction` | **Show unknown:** `Office: not listed in this record` — people actively hunt for this. |
| `notices[]` empty | **Hide** the section entirely. |
| `documents[]` empty | **Hide** the section entirely. |
| `evidenceRequests[]` empty | **Hide.** Absence is the good state; announcing "0 RFEs" invites the thought. |
| `historicalCaseStatuses[]` empty | **Show unknown**, with the §3.1 empty-history copy. This is what people came for. |
| `events[]` empty | Fold into the same timeline empty state; don't have two. |
| processing time (204) | **Show unknown**, §3.4. Its absence is itself informative. |
| `statusText` missing | **Hide** section G; do not show an empty disclosure arrow. |
| `appointmentDateTime` null on a notice | Show the notice with `generationDate` and `actionType` only; don't show an empty time. |
| `applicantName` missing | **Hide.** |
| `submissionDate` missing | **Show unknown:** `Filing date not in this record` — the day count is a headline number and its absence needs explaining. |
| `statusTitle` missing | See §5.3. |
| `isPremiumProcessed` false | **Hide** (only surface when true). |
| `closed` false | **Hide** (only surface when true). |
| `concurrentCases[]` empty | **Hide.** Empty is the norm even for genuinely concurrent filings. |

Corollary: an empty array from USCIS is **not** an authoritative claim that nothing
exists. `concurrentCases: []` appeared on a case that was in fact filed
concurrently. So absence is always rendered as *"not listed in this record"*,
never as *"you have none"*.

### 5.2 Section headers carry counts

Every collapsed section header shows its count: `Documents · 2`, `Timeline · 6`.
A section with zero doesn't render. This means the collapsed card is honest about
how much is behind each arrow, and a sparse case simply has fewer arrows — which
reads as *this case has less in it*, not *this tool is broken*.

### 5.3 The floor — what always renders

Even for the sparsest possible case (status only, no history, no events, no
notices, no documents, 204 processing time), these four always render, so no card
is ever a hollow shell:

1. **Identity** — `formType` (always present) plus the plain-language name.
2. **A headline** — `statusTitle`, or if missing, this exact fallback:
   `USCIS hasn't published a status for this case yet.`
3. **Day count** — from `submissionDate`, or if missing, from the earliest
   timestamp available in the record, labelled `First seen in this record …`.
4. **Freshness** — `Checked 4 minutes ago`, always, from local state.

Plus a closing line unique to the sparse case:

```
This is everything USCIS publishes for this case right now.
Anything they add, this panel will show and record.
```

That sentence does the load-bearing work: it converts "the tool found nothing"
into "there is nothing to find", which are very different experiences.

### 5.4 Documents without titles

`documents[]` gives `.tif` filenames, an opaque `contentId`, `sourceType`, and
`createDate` — no title and no download URL. Do not invent titles, and do not
render a download button that can't work.

```
Document on file · June 4, 2026
Provided by you
IOE0000000000-0000000000000-part1.tif

USCIS lists this file on your case. This panel can see that it
exists but cannot open it. Download it from my.uscis.gov.
```

Display label derives strictly from `sourceType`: `Applicant Provided` → `Provided
by you`; anything else → the raw `sourceType` value verbatim. The filename renders
in mono at tertiary weight, because it's the only identifier that lets a user
match it against what they see on the USCIS site.

---

## 6. Copy tone guide

### R1 — Describe the record, never the case

The panel can see a database row. It cannot see an immigration case. Every
sentence should survive the question "is this true of the *record*?"

> ✗ `Your case hasn't moved in 47 days.`
> ✓ `No change in this record for 47 days.`

> ✗ `Nothing has happened since July 9.`
> ✓ `USCIS hasn't published anything new since July 9.`

### R2 — Never predict, never rank, never advise

No ETAs, no "usually approved within", no "cases like yours", no "you should".

> ✗ `Most I-765s are approved within 90 days — you're at day 96.`
> ✓ `Filed 96 days ago. USCIS provides no estimate for this case.`

> ✗ `You may want to submit an inquiry.`
> ✓ `USCIS publishes what to do about delays on their case inquiry page.` (link only, no recommendation)

### R3 — Interpretation is labelled; facts are unlabelled

Anything we inferred says so and is visually secondary. Anything USCIS wrote is
verbatim and primary. The two never share a typographic treatment.

> ✗ `Fingerprints taken` *(shown identically to official text)*
> ✓ `Code FNB — community-sourced meaning: "fingerprints taken" (?). USCIS logged an event coded FNB on June 3, 2026.`

### R4 — Neutral events get neutral language

Most of what this panel reports is bookkeeping. Reserve emphasis for the small set
of things that carry a deadline.

> ✗ `⚠️ Alert: your case record was modified!`
> ✓ `USCIS's record for this case was touched on July 31.`

> ✗ `Important update!` *(for a new .tif on file)*
> ✓ `New document on file · June 4, 2026`

### R5 — No cheerleading, no condolence

The panel does not have feelings about the user's case and should not perform any.
This cuts both ways: no "Great news!" on an approval (we might be wrong about what
the words mean), and no "We're sorry" on a denial (it's patronising, and the person
needs the text, not our sympathy).

> ✗ `🎉 Congratulations — your case was approved!`
> ✓ `Status changed to "Case Was Approved". Read USCIS's full text →`

> ✗ `We're so sorry — unfortunately your case was denied.`
> ✓ `Status changed to "Case Was Denied". Read USCIS's full text →`

### R6 — Say what we can't see, and why

Every gap gets a one-line reason. An unexplained blank is where anxiety grows.

> ✗ *(empty documents section with a spinner that never resolves)*
> ✓ `USCIS lists no documents on this case. If you see documents on my.uscis.gov that aren't here, they're stored somewhere this panel can't read.`

> ✗ `Processing time: N/A`
> ✓ `USCIS returns no processing-time estimate for this form here.`

### R7 — Write for translation and for reading aloud

Short sentences. One idea each. No idioms, no phrasal verbs where a plain verb
exists, no US-centric metaphors, no sarcasm, no contractions in critical strings.
Dates always spell the month. Numbers always have units.

> ✗ `Hang tight — things are still in the pipeline on their end.`
> ✓ `USCIS has not published a new status. The last one is dated July 9, 2026.`

> ✗ `Heads up, your biometrics is coming up on 7/9.`
> ✓ `Appointment on record: Thursday, July 9, 2026.`

### R8 — Point to the authority, every time it matters

The panel is a mirror, and it says so wherever a real decision could hang on what
it shows. Never phrase this as blame-shifting ("we're not responsible"), phrase it
as sourcing.

> ✗ `This tool is not liable for inaccurate information.`
> ✓ `my.uscis.gov is the authority on your case. If this panel and that site disagree, believe the site.`

### R9 — Never make the user's waiting a number in a warning colour

Day counts, "no change for N days", and elapsed times render in tertiary grey at
normal weight, always. They are never large, never bold, never coloured, never
placed next to a warning glyph. The number is a fact the user asked for, not a
judgment on their situation.

> ✗ `⏳ **143 days** with no update` *(amber, 24px)*
> ✓ `No change for 143 days. Last change March 20, 2026.` *(13px, grey)*

---

## 7. Build checklist

Derived directly from the above; each line is testable against
`test/harness.html` fixtures.

- [ ] `statusText` rendered via text nodes only; anchors stripped; non-`uscis.gov`/`dhs.gov` hrefs never linkified
- [ ] `historicalCaseStatuses[].date` parsed manually (`MM-DD-YYYY HH:mm:ss`), never via `new Date()`
- [ ] Backend-activity line gated at ≥3 days delta; carries no CTA; no notification by default
- [ ] No colour encodes approval or denial anywhere
- [ ] Zero-count sections do not render; sections that render show their count
- [ ] Sparse-case floor (§5.3) verified against a fixture with only `statusTitle`
- [ ] Appointment date shown without timezone conversion; time carries the confirm-your-notice caveat
- [ ] Every community-decoded code shows the raw code and the unofficial marker
- [ ] No progress bar while processing-times returns 204
- [ ] Change bands always name the previous value
- [ ] All dates render a spelled-out month
- [ ] Spanish toggle swaps only USCIS-authored strings
- [ ] Nothing animates on a loop
- [ ] A change must persist across two fetches before it can raise a notification
