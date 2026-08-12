# CaseLens — USCIS Case Tracker

A panel on [my.uscis.gov](https://my.uscis.gov) showing every case on your account in one place: status, a merged timeline, which office holds it, your documents, and what changed since you last looked. Free, open source, stored only in your browser.

**Unofficial and independent.** Not affiliated with, endorsed by, or connected to USCIS or the Department of Homeland Security. Not legal advice. Your mailed notices and my.uscis.gov are the authority on your case.

<p align="center">
  <img src="docs/screenshots/panel-light.png" alt="The CaseLens panel: four cases as one-line rows, each showing the form, a plain-language name, USCIS's own status and how old it is. The first row carries an amber line reading 'Appointment Scheduled · Aug 21 · in 10 days'." width="420">
</p>

<sub>Sample cases, not real data. <a href="docs/screenshots/panel-dark.png">Dark mode</a> · <a href="docs/screenshots/panel-first-run.png">first run</a>.</sub>

## Is it safe?

- **Talks only to my.uscis.gov**, the site you are already signed into.
- **Cases and history stay in your browser** (`localStorage`). No accounts, no analytics, no tracking.
- **Uses your existing login.** Never sees, asks for, or stores a password.
- **Reads only.** It cannot submit, change, withdraw, respond to anything, or upload documents.
- **Three readable files.** [`core/uscis-tracker-core.js`](core/uscis-tracker-core.js) is the tool, [`core/uscis-style.js`](core/uscis-style.js) its stylesheet, [`core/uscis-codes.js`](core/uscis-codes.js) a list of event-code definitions. No bundle, no dependencies.
- **The userscript and extensions are those three files concatenated.** `node scripts/build.js --check` proves it.

Permissions, untrusted-input handling and threat model: [SECURITY.md](SECURITY.md).

## What it shows

The current status in USCIS's own words with its date, every case at once, the office holding each one, documents on file, scheduled appointments, and days elapsed since filing.

Two things the website does not show: **which office holds the case**, and **when USCIS last touched the record even though the status text did not change** — reported only when the gap exceeds about three days, below which it is noise.

It does not estimate when a decision will come, characterise news as good or bad, or explain why anything happened. The data contains no reasons, and a record update is activity, not a verdict.

Only receipt numbers beginning `IOE` work. Other prefixes (`EAC`, `WAC`, `LIN`, `SRC`, `MSC`, `YSC`) were filed on paper and live in an older USCIS system these endpoints do not reach. Signed out, the panel renders nothing at all.

## What data is accessed

Read-only, using your existing session:

| Endpoint | Purpose |
|---|---|
| `/account/case-service/api/cases` | Session check. Returns an empty list, so it is not used to find cases |
| `/account/case-service/api/cases/{receipt}` | What was filed, when, and when USCIS last touched the record |
| `/account/case-service/api/case_status/{receipt}` | Status wording, status history, office |
| `/account/case-service/api/cases/{receipt}/documents` | Documents on file |
| `/account/case-service/api/cases/{FORM}/processing_times/{receipt}` | Processing estimate, when USCIS publishes one |
| `/secure-messaging/api/case-service/receipt_info/{receipt}` | Second source for office location; usually empty |

The same endpoints the official dashboard loads. Each was verified against a real account rather than taken from community write-ups; response shapes and the fields actually read are in [docs/API-SCHEMA.md](docs/API-SCHEMA.md).

These are undocumented endpoints. USCIS did not design them for outside use and could change or remove them without warning, which would break the tool until it is updated. Several often return nothing, and processing-time estimates almost always do. Empty means USCIS published nothing there, not that something is broken.

## Install

CaseLens installs as a **userscript**. Store versions (Firefox Add-ons, Chrome Web Store) are planned.

1. **Install a userscript manager** — a browser add-on that runs small scripts on sites you choose. [Violentmonkey](https://violentmonkey.github.io/) on Chrome, Edge or Firefox, or [Userscripts](https://github.com/quoid/userscripts) on Safari. Both are open source. (Tampermonkey also works; turn off "Anonymous statistics" in its settings.)
2. **Open the [install file](https://github.com/itsericqiu/uscis-caselens/releases/latest/download/caselens.user.js).** Your manager will intercept it and show the whole script with an **Install** button. That link always points at the newest tested release, and your copy updates itself from it.
3. **Sign in at [my.uscis.gov](https://my.uscis.gov).** A **CaseLens** pill appears bottom-right. Click it, or press **Alt+U**.

### If nothing appears

Recent Chrome versions require user scripts to be allowed explicitly. Go to `chrome://extensions`, open your userscript manager's details, and switch on **Allow user scripts**. Until then the script never runs — no error, no pill.

A userscript manager can see every site you visit; that is how it adds scripts to pages. You are trusting it as well as this tool. Store versions will not need one.

**Userscript or extension?** The extensions run in an isolated world, so a compromised script on my.uscis.gov cannot read what CaseLens fetches — a userscript shares a page with that site's own scripts and can be read by them. The userscript is one file you can read before it runs, and gets fixes sooner, since store review takes time.

## Using it

- **Every case is one line, and nothing opens by itself.** The row carries the form, USCIS's status and its date, how long the case has run, and any deadline. Click to open the full record. On a wide enough window, opening a case widens the panel and keeps the other cases in a column beside it; click the row again to go back.
- **Cases appear automatically**, read from the receipt numbers already printed on your account page.
- **Add a case manually** by receipt number — 13 characters, printed on your I-797C notice. These endpoints answer for the signed-in account, so a case on someone else's account will most likely come back empty.
- **Nicknames** label a case, e.g. "My EAD".
- **Status is USCIS's exact wording**, never rewritten, summarised, or characterised as going well or badly.
- **The changed badge** appears when something differs from your last visit and names what changed. "Mark seen" clears it; the entry stays in the timeline.
- **The timeline** marks where each entry came from — USCIS's status history, an event code USCIS logged, or a change detected between checks. Nothing is dropped, including codes with no known meaning.
- **Days elapsed, not a prediction.** USCIS publishes an estimate for very few cases; where it does, the panel shows how much of that range has passed.
- **Export / Import** as a JSON file you keep. The file is plain text and holds full receipt numbers even with "Hide receipt numbers" on, since a masked backup could not restore anything.
- **Hide receipt numbers** (Settings) masks every receipt number on screen and blanks names, addresses, contact details and document ids in raw responses, filenames and notifications.
- **Raw responses** expand to show exactly what USCIS sent.
- **Notifications** are optional, and only fire while the my.uscis.gov tab is open and in front of you. Record-touched updates deliberately do not notify.
- **Spanish** status wording, where USCIS supplies it.
- **Removing a case deletes its history** — the one record USCIS does not publish. Export first if you may want it.
- **Alt+U** toggles the panel.

### The "record was updated" signal

Every case record carries a last-updated timestamp separate from the status message. It sometimes moves while the status wording stays identical, meaning something at USCIS touched the file. The website does not show this.

It means only that the record was touched: not a decision, not a new stage, not a sign an answer is close, and it asks nothing of you.

### Event codes

Records contain short codes like `FTA0` or `LDA`. Where your case history supplies USCIS's own wording for a code, that is used. Otherwise the label comes from the federal NIEM schema, an open government standard covering 492 codes — internal operations language, marked as such rather than presented as something USCIS wrote to you.

Some codes match neither, because USCIS uses codes absent from the published schema. Those are shown as the raw code with no published meaning rather than a guess. The raw code is always visible alongside any label.

## What this project will not add

Never, in any version: a server, account, or sync service; analytics, telemetry, or crash reporting; sending case data anywhere for aggregate statistics; predicted decision dates or confidence scores; advertising or paid features; anything that writes to or acts on a case.

## FAQ

**It says my session expired.**
Your USCIS login timed out, as it does on the official site. Sign in again, then choose Refresh.

**Will this get me in trouble with USCIS?**
No. It reads the same data your dashboard already loads, one request at a time, only while the tab is open. It cannot reach anything your account cannot, and never touches anyone else's case. The real risk is that USCIS changes these unofficial endpoints and the tool stops working until it is updated.

**Can it check while my browser is closed?**
No. Nothing runs outside the browser, and checks happen only while the my.uscis.gov tab is open and in front of you. Background checking needs extra permissions, so it would ship as a separate, clearly labelled version.

**How do I delete everything?**
**Settings → Erase everything.** It removes saved cases, stored statuses, the record of what changed, settings and removals — from this browser only. Nothing at USCIS is touched. After uninstalling, clear site data for my.uscis.gov instead; uninstalling alone leaves the storage in place.

**Someone else uses this computer.**
Anything saved is visible to anyone using the same browser profile. There is no password on the panel.

## For developers

- [`core/uscis-tracker-core.js`](core/uscis-tracker-core.js), [`core/uscis-style.js`](core/uscis-style.js) and [`core/uscis-codes.js`](core/uscis-codes.js) are the only sources. Everything in `userscript/` and `extensions/` is generated by concatenating them — do not hand-edit those.
- `node scripts/build.js` regenerates them; `--check` proves the shipped copies are byte-identical to source.
- `node test/unit.js` covers the pure functions; `test/harness.html` runs the whole UI against fixtures with no network.
- To run an extension build directly, enable developer mode in `chrome://extensions` (or `about:debugging` in Firefox) and load `extensions/chrome` or `extensions/firefox`.
- [SECURITY.md](SECURITY.md) · [CONTRIBUTING.md](CONTRIBUTING.md) · [docs/design/SPEC.md](docs/design/SPEC.md) · [docs/API-SCHEMA.md](docs/API-SCHEMA.md)

## Disclaimer

Confirm anything that matters with an immigration attorney. [MIT License](LICENSE). Use at your own risk.
