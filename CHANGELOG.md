# Changelog

Notable changes per release. The section matching a tag becomes that release's
notes on GitHub, so keep entries written for someone deciding whether to update
— not for someone reading a commit log.

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
