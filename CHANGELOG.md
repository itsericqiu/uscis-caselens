# Changelog

Notable changes per release. The section matching a tag becomes that release's
notes on GitHub, so keep entries written for someone deciding whether to update
— not for someone reading a commit log.

## 1.10.0

**It now tells you what it is, the first time you see it**

Cases are found automatically, so the first thing a new user met was a box that
had appeared on a government website already knowing their receipt numbers,
with no explanation. There is now a short note, shown once and dismissed for
good, saying what CaseLens is, that it is not USCIS, that it read the numbers
already on the page, and that nothing leaves the browser.

**Export and import say what they are doing**

- Export asks first, and says the file will hold your full receipt numbers and
  recorded history as plain unencrypted text — before the download, not after.
  It stays unmasked even with "Hide receipt numbers" on, because a masked
  backup cannot restore anything.
- Import reports what it did: how many cases were added, and that where a case
  existed in both, what was already here was kept. A valid JSON file that is
  not a backup now says so instead of appearing to succeed.
- Import also restores your removals, so a backup no longer silently
  un-removes every case you removed.

**Reachable without a mouse or a screen**

- The launcher says "Open CaseLens, tracking 4 cases, 2 cases changed since you
  last looked" instead of just "Open CaseLens" with an unexplained number.
- Every expandable section now says what it expands, so "Explain" and "Show
  full text" are no longer verbs with no object.
- Stage names are written out — "Received", "Biometrics", "Interview" — rather
  than "Recv", "Bio", "Intvw". The abbreviations saved four characters each and
  could not be translated or read aloud.
- The Spanish button says what it actually does: it swaps USCIS's own status
  wording, and the rest of the panel stays in English. Calling it "Español"
  promised a Spanish interface it does not provide.

**Under the hood**

- The store of status wording learned from your cases is capped. Nothing ever
  removed an entry, and a full quota blocks the snapshot writes this tool
  depends on.
- Loading now validates receipt numbers the same way importing does. The
  stricter check on import was decorative while the other path accepted
  anything.
- Packaging lists the five files an extension contains instead of zipping
  whatever is in the directory, and refuses to build if anything else is
  present.

## 1.9.0

**Opening a case no longer hides the others**

The panel is 400px wide, and an open case runs to about a thousand pixels — so
opening one buried the list of all of them, which is the thing collapsing every
case existed to give you. Reading one case meant losing the overview.

Opening a case now widens the panel to 720px and puts your cases in a column
down the left, with the open one beside them. Both sides scroll independently,
so reading a long record never scrolls the list away, and switching to another
case is one click instead of a scroll back and a scroll down. Closing returns
the panel to its normal width.

Only one case is open at a time now. Several could be open before, which sounded
like it let you compare them and did not — the second one always started a
screen and a half below the first.

On a window too narrow for two columns, the panel stays at its normal width and
opens the case in place, in the full list. Deciding that in code rather than in
a stylesheet is deliberate: hiding the column on a small screen would leave you
with an open case, no list, and no way back to it.

**Fixes**

- The entry animation plays when the panel appears, not every time it is
  rebuilt. A background refresh had been visibly restarting it under you.
- Scroll position is kept for both columns, not just one.

## 1.8.1

**The alarm no longer fires on a denial**

A red banner reading "USCIS may need something from you" was raised by any of
nine event codes. That list had no citation, and read against the federal
schema this tool already ships, most of it did not support that sentence:

- `EA` and `IFA` are **denial** notices. Telling someone whose case was just
  denied that USCIS may need something from them is not a small mis-label.
- `FKA` (deschedule), `FS` (adjudication hold) and `KH` (litigation hold) are
  internal state that asks nothing of anyone.

Now only codes whose schema wording plainly says USCIS asked this person for
something raise it — an evidence request, an additional-evidence request, or a
notice of intent to deny — and each carries the schema text that justifies it,
right next to the code. A card returned as undeliverable gets its own separate
wording, because it needs attention but nobody is waiting on a reply.

The banner is amber rather than red: it names something to do, not a verdict.
Outcomes are still carried by USCIS's own status wording, and every coded event
remains visible in the timeline with its description and its source. The rule
is written down in `docs/design/SPEC.md` so it does not drift back.

## 1.8.0

**Hiding receipt numbers now hides a lot more**

The raw-data view masked exactly two field names, matched by a pattern that
stopped at the first escaped quote inside a value — so a name containing an
apostrophe-escaped quote had everything after it left in the clear, along with
the keys that followed. The list is now explicit and much wider: names,
addresses, email, phone, and document and letter ids. It is written as a list
rather than buried in a regular expression, so an auditor can read what
redaction actually covers.

**Internal: the same thing is now called the same thing everywhere**

No behaviour change, but the parts of this codebase most likely to be edited
next were the ones most likely to mislead:

- The two main endpoint constants were named for each other's endpoints:
  `caseStatus` pointed at case detail and `receiptNotice` pointed at the status
  endpoint, while the UI printed the correct paths beside the wrong names.
  They are now `caseDetail` and `caseStatus`.
- One date value had two names across two layers, and one timestamp had three.
- Three date formatters became one implementation with three shapes. The
  year-stripping one had been string-replacing the year out of another
  formatter's output, which would have silently stopped working the moment that
  format changed.
- Eight copies of `x && !x.__error && !x.__empty` became `payloadUsable(x)`.
- Two clipboard buttons with a flash timer, guard, promise pair and try/catch
  each became one.
- Three receipt-number patterns became one shape plus one deliberate,
  documented narrowing for automatic discovery.
- The card's state machine returned six values, of which four were computed
  every render and compared nowhere.
- Five declared response fields nothing read, seven styled classes nothing
  emits, and a comment pointing at a function that was never written, all gone.

**Build**

The smoke test now asserts that USCIS's own status text reaches the row. It had
been checking that cards render, which is why this pass briefly shipped a
harness that served the case-detail payload to the status endpoint: every card
drew perfectly and every row read "No status published yet". Verified the new
check fails on that exact bug before restoring the fix.

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
