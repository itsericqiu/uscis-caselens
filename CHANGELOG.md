# Changelog

Notable changes per release. The section matching a tag becomes that release's
notes on GitHub, so keep entries written for someone deciding whether to update
— not for someone reading a commit log.

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
