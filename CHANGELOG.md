# Changelog

Notable changes per release. The section matching a tag becomes that release's
notes on GitHub, so keep entries written for someone deciding whether to update
— not for someone reading a commit log.

## 1.20.0

- A second way to get a record out of the panel: **Print…**, in the footer
  for every case and on an open case card for that one, opens the browser's
  own print dialog. Choosing it first offers **Full record** — names,
  addresses and full receipt numbers, as USCIS returned them — or **Masked
  copy** — receipt numbers masked, names hidden, and the document states on
  its own cover that it is not the complete record.
- That redaction choice is made per print, not tied to the stored "Hide
  receipt numbers" setting: a PDF gets shared far more than a JSON file
  does, so what a given copy shows is decided each time, not inherited from
  a setting made for something else.
- No PDF library is bundled. The document is handed to the browser's own
  print dialog, where "Save as PDF" writes the file — which is why it
  renders correctly in every script and alphabet, and why nothing is
  uploaded and no new permission is needed.
- Fixed: an endpoint that answered with no content was rendering as a field
  called "Empty" with the value "true" — an internal marker leaking into a
  view whose whole point is showing only what USCIS actually sent. Both the
  record view and the printed record now say "USCIS answered with no
  content for this one."

## 1.19.0

- Every field USCIS returned is now readable in the panel. Each open case gains
  "Everything USCIS sent", one section per endpoint with its HTTP result, and
  inside it the response as labelled rows — `submissionDate` reads as
  "Submission date" — in the order USCIS sent them. Nested objects and lists
  stay collapsed with their counts, so an empty list still reads as empty
  rather than disappearing.
- Nothing is filtered or reordered on the way through, so a field USCIS starts
  returning tomorrow appears tomorrow without an update here. The old raw-JSON
  block is still there, one level down, for anyone who wants the bytes.
- "Hide receipt numbers" now covers this view too: masked receipt numbers and
  hidden names, on the same rules the rest of the panel follows.

## 1.18.0

- Export is now a records file: everything USCIS returned about each case on
  the latest check, verbatim and grouped per case, plus the changes this panel
  observed between checks. Shaped for a person or their attorney to read, not
  for the tool to restore. Nothing new is persisted — the raw responses are
  captured at export time from memory.
- Import is removed. A new browser reads the account page fresh; the export's
  value is the record, not migration. Removing it also deleted the tool's
  largest untrusted-input surface — a hostile backup file was a named threat
  in SECURITY.md, and that threat is now retired rather than defended.
- The export filename is `caselens-record-<date>.json`, and the confirmation
  states plainly that the file carries names and addresses, not just receipt
  numbers.

## 1.17.0

- The stage map is rebuilt around evidence instead of per-form scripts. Stages
  now materialise from what this case's own record shows, in the record's own
  order; every form gets a map, including forms this tool has never seen.
- New "not reported" stage state. Verified against a live account: USCIS does
  not report biometrics through these endpoints even when an appointment took
  place, so a hollow Biometrics marker was reading as "not done" when the
  honest claim is "not visible here". Backed by each form's own instructions,
  cited in the source.
- Codes are classified once, in `core/uscis-codes.js`, next to the NIEM
  descriptions that justify each entry — including the interview lifecycle
  (scheduled, rescheduled, cancelled, failed to appear). Five codes observed
  live but absent from the schema are declared in an explicit list, and a test
  fails if a stage code is neither published nor declared.
- Documents USCIS generated now appear on the timeline in USCIS's own words —
  "I-765 C09 Standalone Approval" — dated, deduped against their notices.
- Collapsed rows gained a position line: latest evidenced step plus the office
  code.
- Cases refresh in parallel; a four-case load no longer takes four times as
  long as one.
- Deleted: the four per-form stage sequences, mismatch mode, the sticky stage
  index, and the appointment label matcher that never matched real notices
  (they all say "Appointment Scheduled" — verified live).
- Firefox minimum raised to 140 (142 on Android), the versions that introduced
  the data-collection manifest key; clears both AMO validation warnings and
  excludes no supported Firefox.
- New property fuzzer (`scripts/fuzz.js`, fast-check as a dev-only dependency;
  the build still uses nothing). Checks semantics, not just crashes: a stage
  claims "evidenced" if and only if the record contains evidence; redaction
  holds against hostile payloads; diffs report exactly the field that changed;
  the full render path never throws. Runs in CI with a fixed seed.
- Two bugs the fuzzer caught before anyone else could: a malformed
  `closed: "false"` (a string) rendered a case as finished, and a timeline
  with a duplicated filed anchor silently dropped one of them.

## 1.16.0

- Renamed to "CaseLens — Unofficial USCIS Case Tracker". Nothing in the old name
  signalled independence, and the store rule that matters is the affiliation one.
- New icon: a lens, replacing a white "U" — which was the agency's initial, not
  this tool's.
- Store screenshots no longer reproduce the DHS seal, the agency wordmark or the
  "official website of the United States government" banner. A listing image
  carrying federal insignia contradicts the disclaimer printed beside it.
- Store screenshots 02 and 03 had been byte-identical: the script scrolled a
  container that never overflowed and never opened a case. It now opens one, and
  fails the run if any two images match.
- New `docs/PRIVACY.md`. Chrome requires a privacy policy URL for any extension
  that handles user data, including data that never leaves the device.
- README reorganised around what a reader decides in order: whether it works for
  their case, whether it can affect their case, then install. The interaction
  tour is gone — 13 bullets describing things a click reveals.
- `docs/PUBLISHING.md` rewritten with per-store listing text, the Chrome privacy
  answers, reviewer notes, and AMO source-submission instructions. Its AMO
  category guidance was wrong; AMO has no Productivity category for extensions.

## 1.15.1

- No behaviour change. Three long functions split along seams that were already
  there: the timeline's five sources, the three kinds of case card, and the four
  independent merges an imported backup performs. Longest function 209 → 144
  lines; median unchanged at 12.

## 1.15.0

- Copy rewritten throughout to drop the first person. The panel reports facts
  about a case; "we could not read this" invented a narrator, "this could not be
  read" is the same fact without one.
- README cut by a quarter: the can/can't lists became prose, and padding removed.
- `copy-check` fails the build on first-person user-facing text.
- 106 unit tests, up from 76, covering the helpers the rest is built on.

## 1.14.2

- Keyboard focus stays on a button after clicking it. Every expandable control
  changes its own label when opened ("Explain" becomes "Show less"), and focus
  was being matched by label — so it was lost on the controls people use most.
- On first run the panel no longer states it is unofficial three times in one
  view.
- The receipt-number check in CI catches numbers split across a line or string
  break.
- The smoke test drives a failing check the way it actually happens — a working
  session that then breaks — and asserts the panel shows a failure rather than
  reporting "nothing new".

## 1.14.1

- An appointment sent as a date with no time no longer prints "12:00 AM" as if
  it were the appointment time. It says USCIS gave no time and to check your
  notice.
- The letter number shown with an appointment is read from that notice rather
  than matched by position, which could have attached the wrong one.
- A case's own USCIS wording is no longer demoted to "from another case" over a
  difference in letter case.
- Wording fixes in the first-run note and a screen-reader label.

## 1.14.0

- Timeline: a merged row no longer sorts onto a different day from the one it
  displays, and "you first saw this on …" attaches to the nearest matching
  event rather than the oldest one with the same wording.
- Change counts are correct once your history reaches its cap.
- "24 hours ago" no longer appears for anything under a day.
- Type sizes: seven scale steps, two of them identical and two half a pixel
  apart, became five distinct ones, and 19 rules that set sizes directly now
  use them. `css-check` fails the build on a hardcoded font size.
- Screenshots regenerated; they were five releases out of date. Added a
  first-run shot, and the others no longer show the first-run note.

## 1.13.0

- Header counts ("1 needing you", "2 with something new") now stand out instead
  of being the lightest grey in the panel.
- Raw-data rows are named for what they return, not URL paths containing `{n}`.
- Escape from Settings returns focus to the Settings button, not to the page.
- Fixed three doc comments spliced into the wrong functions, and two comments
  making contradictory claims about how appointment times are sent. Only one
  was right; the wrong one is how a fixed bug gets reintroduced.

## 1.12.1

- Imported backups: contents are validated, not just the case numbers. A
  hostile file could previously add entries that looked like the panel's own.
- Signing out without reloading now closes the panel instead of leaving your
  cases on screen.
- Removing a case also deletes the panel's internal emergency copies of it.
- "Hide receipt numbers" also blanks attorney names, A-numbers, dates and
  countries of birth, and remaining address fields.
- The receipt-number check in CI now matches lowercase too.
- GitHub Actions pinned to exact commits; store credentials scoped to the steps
  that use them.
- SECURITY.md states what the automated checks do not catch.

## 1.12.0

- "USCIS publishes no processing-time estimate" is no longer printed when USCIS
  published one this panel cannot read.
- A gap label spanning the timeline fold no longer claims a quiet stretch that
  did not happen.
- Reworded copy that reassured by denial ("it is not a warning", "says nothing
  about the case itself" three times on one screen).
- Internal: assembling a case for display now runs once per redraw rather than
  twice; six render paths no longer re-derive facts for themselves; deleted a
  second date parser that sorted USCIS dates wrongly; one way to construct a
  tracked case instead of four.

## 1.11.1

- A check that read nothing no longer reports "nothing new, checked just now".
  It gets the same failure banner as a timeout.
- A failed endpoint no longer invents changes on the next check. One failed
  documents request used to make every document look new — with a notification
  and permanent history entries — when nothing had changed.
- Closed cases no longer show the final stage ("Card produced") as done without
  evidence. Denied and withdrawn cases were reading as if a card was produced.
- Codes with no published meaning no longer move the stage map while the
  timeline says they don't. One of them marks a case Approved.
- Fixed the guard that stops the stage map running ahead of a booked
  appointment. It broke in 1.10.0 when stage names were written out in full.
- A failed documents request no longer says "USCIS lists no documents".
- Old evidence requests no longer raise a standing alert.
- "Hide receipt numbers" covers the change summary, timeline and notifications.
- Header says how many cases need something from you.
- Dragging no longer breaks the wide layout; a background refresh during a drag
  no longer strands the panel in the corner.
- Case rows and disclosures show a focus outline.
- Settings scrolls, so "Erase everything" isn't cut off.
- Documents and raw responses stay open across a background refresh.
- Impossible dates are rejected instead of rolled over; several UTC-midnight
  formats USCIS sends no longer land a day early west of Greenwich.
- Change markers survive a restart.
- Added `test/unit.js` (62 tests, in CI). It found four of the above.
- The build now fails, rather than continuing, if a manifest declares a
  permission.

## 1.11.0

**The panel is quicker to draw, especially with several cases**

Every redraw was re-reading and re-parsing browser storage once per case per
event code — 47 reads on a four-case account. It now reads once per redraw and
reuses the result, which is about five times faster. Any write clears it
immediately, so nothing can be drawn from a stale copy.

**Internal**

Which sections you had open on a card was being kept on the case record itself
— the same object written to storage. It stayed out of storage by luck; it is
now held separately. Section headers in the source were corrected where they no
longer described the code beneath them, which matters in a file whose point is
that a stranger can audit it.

## 1.10.0

- A short note on first run says what CaseLens is, that it is not USCIS, where
  your case numbers came from, and that nothing leaves the browser. Shown once.
- Export asks first and says the file holds your full receipt numbers as plain
  text, even with "Hide receipt numbers" on — a masked backup can't restore.
- Import says how many cases it added, and that existing data was kept. A JSON
  file that isn't a backup now says so instead of appearing to succeed.
- Import restores your removals, so a backup no longer un-removes cases.
- The launcher says "Open CaseLens, tracking 4 cases, 2 changed since you last
  looked" instead of an unexplained number.
- Expandable sections say what they expand.
- Stage names written out ("Received", "Biometrics") rather than "Recv", "Bio".
- The Spanish button says what it does: it swaps USCIS's status wording, and
  the rest of the panel stays English.
- The store of learned status wording is capped.
- Loading validates receipt numbers the same way importing does.
- Packaging lists the five files an extension ships and refuses to build if
  anything else is present.

## 1.9.0

- Opening a case now widens the panel and keeps your other cases in a column
  beside it, so reading one no longer hides the rest. Click its row again to go
  back. One case is open at a time.
- On a window too narrow for two columns, the panel stays its normal width and
  opens the case in place.
- The entry animation plays when the panel appears, not on every redraw.
- Scroll position is kept for both columns.

## 1.8.1

- The "USCIS may need something from you" alert no longer fires on denials or
  internal holds. Of the nine codes that raised it, two were denial notices and
  three were internal state that asks nothing of anyone. Only codes whose
  published description says USCIS asked for something raise it now, each with
  that description recorded next to it.
- The alert is amber rather than red: it names something to do, not a verdict.
- Rule written down in `docs/design/SPEC.md`.

## 1.8.0

- "Hide receipt numbers" covers many more fields in the raw data, and no longer
  stops masking at the first escaped quote in a value.
- Internal: the two main endpoint constants were named for each other's
  endpoints; one date value had two names and one timestamp had three; three
  date formatters became one; eight copies of the same payload check became
  one; two clipboard buttons became one; three receipt-number patterns became
  one; the card's state machine returned six values of which four were never
  read. Deleted five unread field declarations and seven unused CSS rules.
- The smoke test now checks that USCIS's status text reaches the row. It had
  only checked that cards render, which is how this pass briefly shipped a test
  harness serving the wrong payload — every card drew fine and every row read
  "No status published yet".

## 1.7.1

**Two remaining ways the panel could go quiet on its own**

- Automatic discovery now stops at 25 cases. Every tracked case costs six
  requests to USCIS on every refresh, and discovery re-reads the page on each
  in-app navigation — so a page listing far more receipt numbers than anyone
  actually has would have turned into hundreds of requests on a timer. Nobody
  has more cases than this, and anything beyond it can still be added by hand.
- A form type that arrives as an object rather than a string no longer deletes
  the whole stage rail. It failed the lookup and rendered nothing, which looks
  exactly like the legitimate "we don't have a map for this form" case.

## 1.7.0

**A failed check is no longer invisible**

Collapsing every case in 1.6.0 had a consequence we missed: every failure
message lived *inside* an expanded card, so a check that failed for all of your
cases produced a panel that looked completely healthy. Rows drew from the last
saved copy, the header said the last check succeeded, and the one message that
mattered — "your USCIS sign-in has timed out, sign in again and choose
Refresh" — was unreachable. That message is now a banner above the case list,
along with a separate one for read failures that aren't sign-in related.

Two more consequences of the same shape. A collapsed row's deadline line was
built from the live response, so a single dropped request silently deleted a
scheduled appointment from the row — the one line collapsing everything depends
on being unmissable. Deadlines, evidence requests and whether a case is closed
are now saved with each check and drawn from that copy, dated. And because
"is this case closed" was also lost on a failed check, the list re-sorted
itself on a dropped request; it no longer does.

**Less on screen, and the important things louder**

- The five API responses at the bottom of each card collapse to one row. On a
  failed check that had been five red `HTTP 404` badges per case.
- Documents collapse to a count, with anything new named on the summary row.
- The add-a-case form is behind a link. Cases are found automatically, so a
  returning reader was meeting two empty text boxes before their own case.
- Three rows restating dates already given above the fold are gone, along with
  the "newer than status" chip that was the third statement of one fact.
- A finished case shows `Closed` instead of a day counter still climbing.
- Rows drawn from a saved copy now say so.

**Privacy and data**

- "Hide receipt numbers" now covers document filenames, which USCIS names after
  the receipt number — so the number was printed in full while the setting that
  exists for screen sharing was on. It also covers desktop notifications, which
  persist outside the browser entirely.
- Settings has **Erase everything**, which deletes every trace from this
  browser and names exactly what that is. A tool whose promise is that your data
  stays with you should be able to hand it back.
- Removing a case now also clears the receipt number from the status wording
  learned from it. The confirmation promised deletion; a copy was surviving.
- Backups now include your removals, so restoring one no longer silently
  un-removes every case you removed.
- If the browser refuses to save, the panel says so. It had been detecting a
  change, failing to record it, and never mentioning it — a change tracker that
  had silently stopped tracking changes.

**Fixes**

- A change marker survives a page reload. It was being dropped, so closing the
  tab before marking a change seen lost it permanently.
- A receipt number that isn't `IOE` is no longer rejected by a rule the error
  message itself contradicted. It's accepted, with an accurate note that these
  endpoints only cover cases filed through a USCIS online account.
- The panel can no longer be dragged off-screen, is re-clamped when the window
  resizes, and Settings has a Reset for a panel stranded by an older version.
- The add-case error can be dismissed, and clears when you edit the field.
- Opening a case now lasts for the visit rather than forever. A case opened once
  stayed open for months; worse, a case collapsed once stayed a one-line row on
  the day it was approved.
- The Settings icon is a cog. It was a circle with eight rays — the universal
  light/dark glyph — so people opened it looking for a theme toggle.
- An appointment's letter is labelled instead of appearing as a bare 9-digit
  number in parentheses, which read as a leaked internal id.
- Within a group, cases sort by most recent activity rather than by the order
  they happen to appear on the account page.
- Fields that arrive as objects rather than strings can no longer be recorded as
  a status change and pushed as a notification.

**Build and release**

- The privacy gate now scans all three shipped files. It had only ever read the
  userscript, so the audit claim it defends was unchecked on both extensions.
- The PII gate matches every receipt prefix USCIS issues, not just `IOE`.
- Release tooling is pinned to exact versions rather than caret ranges.

## 1.6.1

**A stylesheet bug was making the tool's own disclaimers louder than USCIS's words**

Four blocks of CSS had lost their selector lines, which left the declarations
orphaned. A declaration with no selector makes the browser treat the *next*
rule as part of its broken prelude and discard it — so four working rules were
silently dropped, including the one that makes small print small.

The visible effect: every caveat this panel writes about itself rendered at the
same size and a darker colour than the actual status USCIS published for the
case. Explanations looked more important than the thing being explained, which
is a large part of why the panel read as a wall of text.

Caused by an earlier sweep that removed unused CSS classes line by line,
deleting selectors while leaving their bodies. `scripts/css-check.js` now fails
the build on any orphaned declaration or unbalanced brace, and runs in CI.

## 1.6.0

**Every case collapses; you choose which to open**

With more than one case the panel now opens as a list of one-line rows rather
than opening a case for you. Deciding which case someone came to see is a guess,
and getting it wrong pushed the other three below the fold. A single case still
opens, because there is nothing to choose between.

Each row carries enough to choose from without opening anything: the form, a
plain-language name, how many days the case has been running, USCIS's own status
and when it was set. Anything with a deadline — an appointment, an action USCIS
is waiting on, an open evidence request — gets its own line on the row, because
collapsing everything is only safe if a deadline can never be hidden behind a
click.

Four cases now fit in roughly one screen instead of six.

## 1.5.2

**Firefox add-on submission now passes Mozilla's validator**

AMO requires every add-on to declare what user data it collects. The manifest
had no such declaration, so uploads were rejected. It now declares `none`,
which is literally accurate. Mozilla's own linter reports zero errors and zero
warnings.

## 1.5.1

**Fixes the panel disappearing shortly after it loads**

If any of your cases had documents on file, the panel would appear and then
vanish. Three helper functions were called by the documents section and defined
nowhere — a crash that fired the moment a card with documents rendered. Anyone
with documents on a case, which is most people, had a panel that did not work.

It escaped every check because `node --check` only parses the file, and calling
a function that does not exist is valid syntax; it throws only when that line
runs. The smoke test asserted that a launcher pill appears, and the pill appears
before any card renders.

Two permanent guards were added rather than just the three definitions:

- `scripts/undefined-check.js` fails the build if the bundle calls a function it
  never defines. Verified by deleting one and confirming the refusal.
- The smoke test now opens the panel and asserts that case cards render, so the
  code path where cards are built is actually executed in CI.

**Also**

- Scroll position and keyboard focus survive a re-render. Previously every
  disclosure click and every background refresh threw you back to the top.
- A refused write to browser storage no longer causes the same change to be
  re-detected and re-notified on every refresh. (This entry also claimed the
  panel says so when a write is refused. It did not; that landed in 1.7.0.)
- The stylesheet moved to `core/uscis-style.js`. The file people install is
  still one file; the core is 1,378 lines shorter, so the parts an auditor
  needs are easier to find.

## 1.5.0

**Security: a hostile document link could have pointed off-site**

The check that decided whether a document link was safe to click was
hand-rolled, and could be fooled by a backslash or an embedded tab — a URL like
`/\\evil.com/x` looked relative but resolved to another site. A malicious or
compromised response could have rendered a link labelled like your own USCIS
notice that led somewhere else, inside a panel sitting on a government page.
Links are now resolved with the browser's URL parser and compared by origin.

**The settings could not be opened with a mouse**

Dark mode, notifications, hide-receipt-numbers and the refresh interval were
all unreachable: clicking anything in the settings popover closed it before the
click landed. Keyboard use was unaffected, which is why it was not spotted
sooner.

**Zero permissions is now enforced, not just claimed**

The build only checked the version field in each extension manifest, so a
manifest could have gained `<all_urls>`, a background worker or a second script
and still reported OK. `build.js --check` now fails if any manifest requests
anything.

**Other fixes**

- A document named `constructor` or `toString` was silently never reported as
  new, because filename maps inherited from `Object.prototype`.
- "Hide receipt numbers" masked the raw responses but still showed the
  representative's name on the card.
- `SECURITY.md` claimed three things the code did not do. Corrected, and a
  "What this does not defend against" section added — including that the
  userscript shares a page with my.uscis.gov's own scripts, which the
  extensions do not.

## 1.4.1

**Irreplaceable stored data is no longer dropped on a shape mismatch**

`load()` falls back to a default when a stored value doesn't match the expected
shape. That's harmless for settings or snapshots, both of which regenerate —
but the change history is this panel's own record of what moved and when, and
USCIS does not publish it. A future shape change would have deleted it
silently. History and the tracked case list are now copied aside before any
fallback is used.

## 1.4.0

**Cases collapse to a row, one opens**

Four cases used to produce about six screens of scrolling, with no single card
fitting the panel — so the question this exists to answer, *has anything
moved*, took a scroll to reach. Every case is now a one-line row: a dot if
something changed, the form, a plain-language name, its status and how old that
status is. One card opens.

Measured on the sample account: **4,976px of scrolling down to 1,273px** — from
6.3 screens to one.

Which card opens is decided in order: a case with a deadline (an appointment,
an evidence request, or `actionRequired`), then one that changed since your
last visit, then the most recent open case. A closed case is never the default.
Open or collapse any card yourself and that choice sticks; several can be open
at once, because someone comparing two concurrently-filed cases needs both.

Forms are named the way people refer to them — "Work permit", "Green card
application" — rather than by USCIS's eleven-word official titles.

Deliberately not built: a separate status board (the collapsed rows already are
one, without rendering every case's identity a second time) and a case
switcher (tabs would make "anything new anywhere?" take four clicks instead of
one glance).

*(Superseded: 1.6.0 stopped opening a card by rule — with more than one case,
everything stays collapsed. 1.9.0 made it one open case at a time, beside the
list rather than inside it.)*

> **Where 1.3.0–1.3.4 landed.** Five releases in a row argued with each other
> about one line: how to print an appointment time. Reading them in order is
> confusing, so here is the conclusion. USCIS sends appointments as correctly
> converted UTC instants — a 3:00 PM Eastern appointment arrives as `19:00Z` —
> so showing it in the viewer's own clock is the same moment, not a different
> one. 1.3.0 printed raw UTC and 1.3.1 removed the time entirely; both were
> overcorrections for a problem the data does not have. **The settled behaviour
> is 1.3.4's:** the local time, its zone named so a mismatch is visible, and the
> notice named as the authority. (The exact wording changed once more in 1.7.0,
> which labelled the letter number instead of leaving it bare in parentheses.)

## 1.3.4

**Appointments say which source wins**

The appointment line now reads: `3:00 PM EDT · shown in your device's time
zone, which may not be the office's. If this differs from your notice, follow
the notice (440000001).`

Naming the zone makes a mismatch visible; naming the notice says what to do
about it. That advisory had been in the band's tooltip only, which is no use on
a touchscreen and easy to miss anywhere. A time is the one value in this panel
where acting on the wrong number means missing an appointment.

## 1.3.3

**Appointment times name their time zone**

The appointment now reads `3:00 PM EDT · your device's time zone, which may not
be the office's`.

USCIS sends the appointment as a real UTC instant, so showing it in the local
zone is the same moment, not a different one. Naming the zone is what makes
that unambiguous: if the label says PDT and the office is Eastern, the mismatch
is visible rather than silently misleading. The previous wording said "in this
computer's time zone" without saying which zone that was.

## 1.3.2

**Appointment times are back, correctly labelled**

Confirmed against a real notice: USCIS sends appointments as properly-converted
UTC instants — a 3:00 PM Eastern appointment arrives as `19:00Z`. Converting to
the viewer's clock is therefore right for anyone whose computer is set to the
office's timezone, which is the normal case, and a US appointment (8am–4pm
local) never crosses a date boundary when converted.

1.3.0 printed raw UTC and 1.3.1 removed the time entirely; both were
overcorrections for a problem the data does not have. The time is shown again,
labelled "in this computer's time zone", with the notice named as the
authority.

**A standing note that USCIS is authoritative**

This panel reshapes what USCIS sends — most of all with dates, which arrive in
more than one shape. If USCIS changes those shapes, our handling becomes the
thing that is wrong. So:

- The persistent footer now reads `Unofficial · your USCIS notices are
  authoritative`, replacing the privacy line, which was already stated at
  length in the README and is still in the footer tooltip. The authority
  statement previously sat at the bottom of a long scroll, where a first-time
  reader would never reach it.
- Every interpreted date row carries a note that the value was read from USCIS
  data by this panel, and that the notice and my.uscis.gov are correct if they
  disagree.

## 1.3.1

**Appointment times are no longer shown at all**

1.3.0 printed the appointment time exactly as USCIS recorded it, in UTC. That
was worse than the bug it replaced: a 3:00 PM Eastern appointment displayed as
7:00 PM.

USCIS sends the appointment as a genuine instant but never says which timezone
the office is in. Converting it is right only if your computer's clock matches
the office's zone; printing the raw UTC is wrong for everyone. There is no
correct answer available, so the time is gone — the date is shown, and the
panel points at the notice, which is authoritative.

This also removed the bespoke date formatter added in 1.3.0. There is now one
date rule in the codebase: values that are calendar dates (`2026-05-29`, or the
same day as UTC midnight) are read as dates; everything else is an instant.

## 1.3.0

**The header could give a false all-clear**

When every check failed, the panel still read `4 cases · nothing new · checked
just now`. The timestamp was stamped when a check was *attempted*, not when it
succeeded, and "nothing new" was reported for cases we had simply learned
nothing about. Someone glancing at that line and closing the panel would
believe their cases had been checked and hadn't moved.

It now distinguishes the two: `4 cases · couldn't check 4 · last successful
check 2 days ago`. "Nothing new" is only ever said about a check that returned
something.

**Appointment dates could be a day early**

Appointment times arrive as a bare UTC instant with no office timezone.
Converting them to the viewer's clock moved any appointment stamped before
about 07:00 UTC back a full calendar day — shown in bold, while only the *time*
carried a caveat. The date and time are now read from what USCIS recorded and
printed verbatim, converting nothing, labelled "as recorded by USCIS · time
zone not stated". The previous wording claimed both "as recorded" and "shown in
this computer's time zone" in the same sentence; only one could be true.

**The stage map could place you past a stage that hasn't happened**

A future appointment now caps the map. Previously the "you are here" marker
could sit beyond Biometrics on a case whose biometrics appointment was still
ahead — visible on the same card.

**Cases are ordered by what needs reading**

They were drawn in whatever order receipt numbers appear on the account page,
which put a finished case first and pushed still-pending ones below it. Order
is now: something is required of you, then something changed, then open cases,
then closed ones.

## 1.2.1

**Filing dates were a day early west of Greenwich**

USCIS sends calendar dates as UTC midnight (`2026-05-29T00:00:00.000Z`).
Rendering that in the viewer's timezone moved it back a day in every US zone —
a case filed May 29 displayed as "filed May 28", and every day count was off by
one. Date-only values are now built as local dates so the calendar day
survives. Caught on first install against a real account, where the panel
disagreed with the USCIS page directly behind it.

**Install**

- Added a troubleshooting note: recent Chrome requires "Allow user scripts" to
  be switched on for the userscript manager, in `chrome://extensions`. Until
  it is, the script silently never runs.

## 1.2.0

**Install and updates**

- The userscript now declares `@downloadURL` and `@updateURL` pointing at the
  latest tagged release, so an installed copy only ever moves between versions
  that passed CI — never to whatever is mid-work on the default branch.
- Added `@homepageURL` and `@supportURL`.
- Canonical install link is now the release asset rather than the raw file on
  `main`.

**Documentation**

- Rewrote the README about 45% shorter without dropping information, and cut
  language that announced the project's own honesty rather than demonstrating
  it.
- Fixed two inaccurate claims: the timeline no longer uses `[USCIS]` /
  `[detected]` chips (it marks provenance per entry), and notifications do not
  work with the tab closed — nothing runs when the tab is closed.

## 1.1.0

First public release.

**A failed check no longer erases your case**

Previously, an expired session or a failed request blanked every card down to a
receipt number while still claiming your history was safe. That is
indistinguishable from your cases having disappeared. Cards now render from the
last stored snapshot, marked stale and dated, with the failure reported above
them instead of in place of them.

Empty-state wording is also gated on a check actually succeeding, so a case that
showed a status a minute ago can never report that USCIS has published nothing
for it.

**The stage map no longer claims things it can't see**

- Stages with no supporting event code are drawn as passed-but-unconfirmed
  rather than complete. It previously showed biometrics as done on a case whose
  biometrics appointment was still upcoming, and marked an interview complete on
  an approved I-485 that never had one.
- Removed a sentence predicting the next stage. It was based on population data
  this tool does not have.

**Event codes**

- Codes resolve from USCIS's own wording where your case history supplies it,
  then the federal NIEM schema (492 codes), then the raw code with an explicit
  statement that no published meaning exists.
- Harvested wording no longer leaks between cases.
- If the code dictionary fails to load, the panel says nothing about meaning
  rather than reporting that a code has none.

**Correctness and privacy**

- One calendar-day helper everywhere. The same date previously rendered as both
  "30 days ago" and "29 days ago" on one card.
- Removing a case now sticks, and deletes its stored history as the confirmation
  promises. Auto-discovery previously re-added it on the next page load.
- Redact mode masks receipt numbers and names inside the raw responses too, not
  only in the card heading.
- Appointment times are labelled as recorded in this computer's time zone rather
  than "local", which implied local to the office. USCIS sends no office
  timezone.
- Closed cases no longer show a percentage bar or a "you are here" marker.

**Fixes**

- `Alt+U` works on macOS, and no longer fires while typing in a field.
- The settings popover closes on `Escape` or an outside click.
- Add-case validation no longer claims all receipt numbers start with `IOE`.
