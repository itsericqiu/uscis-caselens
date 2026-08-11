# CaseLens — USCIS Case Tracker

A free, open-source panel that appears right on [my.uscis.gov](https://my.uscis.gov) when you're logged in. It finds the cases already listed on your account page and shows them in one place: status, a merged timeline of events, your office location, receipt info, how long it's been since you filed (with a percentage when USCIS actually publishes an estimate for your form), your documents, and a quiet highlight of what changed since you last checked — a personal change history USCIS itself doesn't give you. Everything is saved only in your own browser. There is no account, no server, and no company behind this collecting your data.

**See all your USCIS cases in one place. Everything stays in your browser.**

<p align="center">
  <img src="docs/screenshots/panel-light.png" alt="The CaseLens panel showing a case card: status headline, appointment on record, a note that USCIS updated the record after the status, the stage map, and a merged timeline." width="420">
</p>

<sub>Screenshots use invented sample cases, not anyone's real data. Dark mode: <a href="docs/screenshots/panel-dark.png">panel-dark.png</a>.</sub>

## Is it safe? Read this first

If you're trusting this tool with your immigration case, you should be able to check that trust yourself — not just take our word for it. Here's the short version:

- **It only talks to my.uscis.gov** — the site you're already logged into. It cannot send your data anywhere else. There is no other server it knows how to reach.
- **Your case numbers and history are saved only in your browser** (`localStorage`). No accounts, no servers, no analytics, no tracking. Nothing leaves your machine, ever.
- **It uses your existing USCIS login.** It never sees, asks for, or stores your password. It just reads what's already on the page you're logged into.
- **It only reads.** CaseLens issues read-only requests and nothing else. It cannot submit, change, withdraw, or respond to anything on your case, and it cannot upload documents or send messages on your behalf. If it ever appears to, that's a bug — please open an issue.
- **The entire tool is one readable file**, [`core/uscis-tracker-core.js`](core/uscis-tracker-core.js), plus a small file of event-code definitions. No minified blob, no hidden bundle — anyone can open it and read exactly what it does, top to bottom.
- **The browser extensions and userscript are byte-identical copies of that same source.** They're generated from it, not written separately, and you can verify that yourself with `node scripts/build.js --check`.

For the technical detail behind these claims — least privilege, how untrusted data is handled, how to verify it yourself — see [SECURITY.md](SECURITY.md).

### Verify it yourself (takes two minutes)

You don't have to trust this README — you can watch the tool's network traffic with your own eyes:

1. Open your browser's DevTools (`F12`, or right-click → Inspect) and click the **Network** tab.
2. Go to `my.uscis.gov`, log in, and use the tracker normally — let it load your cases.
3. Look at the request list. Every single request goes to `my.uscis.gov`. Nothing else. If you ever see a request to any other domain, something is wrong — please open an issue.

## What it can and can't tell you

Read this before you install anything — it sets expectations honestly, not as a sales pitch.

**What it can tell you**

- Every case on your account in one place, without clicking through each one individually.
- The current official status, in USCIS's own words, with its date.
- A merged timeline of USCIS's own status history, its internal event codes, and the changes this tool itself noticed between visits.
- Which office holds your case (`jurisdiction`) — this isn't shown anywhere on the website itself.
- **When USCIS last touched your case record, even when the public status text didn't change.** This is genuinely invisible on my.uscis.gov, and it's the single most useful thing here.
- Documents on file, scheduled appointments, and whether the record is closed.
- How long it's been since you filed, and how the current quiet stretch compares to the longest one this case has had before.

**What it can't tell you**

- **When you'll get a decision.** Nobody can. Nothing here estimates it, softens it, or guesses at it.
- **Whether the news is good or bad.** A record update is activity, not a verdict — this tool won't dress it up as one.
- **Why anything happened.** The data itself contains no reasons.
- **Anything about cases filed on paper.** This only works for cases tied to a `my.uscis.gov` online account (receipt numbers beginning `IOE`). Paper-filed receipts like `EAC`, `WAC`, `LIN`, `SRC`, and `MSC` live in an older system this tool can't reach.
- **Anything, while you're signed out.** The panel renders nothing at all when you're not signed in to my.uscis.gov.

**Limits of the underlying data**

These are undocumented USCIS endpoints, not a published API. USCIS didn't design them for outside use, doesn't support them, and could change or remove them at any time without warning — which would break this tool until it's updated. Some of them routinely come back empty: processing-time estimates usually do, and a secondary location endpoint returns nothing for most cases. That's normal, not an error — an empty response means USCIS didn't publish that data, not that something is broken or that there's nothing on file.

## Install

| | Recommended | Fewest permissions |
|---|---|---|
| **How** | A userscript manager | Load the extension unpacked |
| **Steps** | Install [Violentmonkey](https://violentmonkey.github.io/) (Chrome/Edge/Firefox) or **Userscripts** by quoid (Safari) → open [userscript/caselens.user.js](userscript/caselens.user.js) (Raw view) → confirm install | Enable developer mode → load the `extensions/chrome` or `extensions/firefox` folder from this repo |
| **Tradeoff** | Any userscript manager needs access to *every* site you visit — that's how it injects scripts | Zero permissions, only runs on my.uscis.gov — but manual: developer mode required, no auto-update |

Then log in at [my.uscis.gov](https://my.uscis.gov) — a **"CaseLens"** pill appears bottom-right; click it to open the panel.

Tampermonkey also works, but it's closed-source (since 2013) and collects opt-out anonymous usage stats — turn off "Anonymous statistics" in its settings if you use it.

Store listings (Firefox Add-ons, Chrome Web Store) are planned: one-click install, zero permissions, automatic updates.

## Using it

- **Auto-discovery:** as soon as you're logged in, the tracker reads the receipt numbers already printed on your account page and lists those cases automatically — no extra request to USCIS, and nothing to type in for cases that are already on your account.
- **Adding a case manually:** you can also add any case by its receipt number, including cases not tied to your account (for example, one filed on someone else's behalf that they've shared with you). This tool works with **IOE numbers** — the 13-character code starting with `IOE` found on your I-797C notice (the "Notice of Action" letter USCIS mailed or emailed you), for example `IOE0000000000`.
- **Nicknames:** give any case a short label of your own (e.g. "My EAD") so it's easier to tell apart from others.
- **Status, in USCIS's own words:** the status text you see is exactly what USCIS wrote — the tracker never rewrites it, summarizes it, or softens it, and it never characterizes your case as going well or badly. Interpreting that is not something a tool reading these records can do responsibly.
- **The amber "changed" badge:** appears on a case when something about it is different from the last time you checked — a status change, a new document, a new timeline entry. Click it to see what changed, and dismiss it once you've seen it.
- **The timeline** merges two kinds of entries: `[USCIS]` means USCIS itself reported the event; `[detected]` means this tool noticed a change between two checks that USCIS doesn't explicitly log as an event. When an event's code has no known meaning, it still appears in the timeline — with the raw code and a plain note that there's no published meaning for it, never hidden and never guessed at.
- **Time since filing, not a decision date.** USCIS publishes a processing-time estimate for very few cases — in practice, that endpoint most often comes back empty. So most of the time the tool shows what it actually knows: how many days it's been since you filed, and how the current quiet stretch compares to the longest one this case has had before. On the rare case where USCIS does publish an estimate for your form, the tool also shows what percentage of that range has elapsed. Either way, this tool never predicts when a decision will come; it isn't able to, and it wouldn't tell you if it could guess.
- **Export / Import:** back up all your tracked cases and history to a JSON file, and restore it later or on another device. Nothing about export/import touches a server — it's a plain file you download and keep yourself.
- **Redact mode:** blurs out your receipt numbers so it's safe to take a screenshot to share (e.g. asking for help in a forum) without exposing your case numbers.
- **Raw JSON, if you want it:** every response the tracker reads can be expanded right in the panel to show exactly what USCIS sent, unedited. If our reading of the data ever looks wrong, you don't have to take our word for it — you can see the original.
- **Change notifications:** optionally enable browser notifications so you're alerted when something changes, without needing to keep the tab open and watch it.
- **Spanish status text:** USCIS includes a Spanish translation of the status wording in its own data. When it's available, the tracker can show it alongside (or instead of) the English text.
- **Alt+U** toggles the panel open and closed at any time.

### The "your case record was updated" signal

The most useful thing this tool shows you is something the USCIS website itself never surfaces: every case record carries a "last updated" timestamp, separate from the status message you see. Sometimes that timestamp moves forward — meaning someone or something at USCIS touched your case file — while the status wording on the page stays exactly the same as before.

When that happens, the tracker quietly tells you so. Please read this carefully: **it only means the record was touched.** It is not a decision, it does not mean your case moved to a new stage, and it does not mean an answer is coming soon. There's nothing to do in response to it — no action for you to take. Think of it as replacing "did anything happen?" uncertainty with a plain fact, not as a reason for hope or worry either way.

### Event codes

Case records also contain short internal codes (like `FTA0` or `LDA`) attached to individual events. USCIS doesn't explain these on the public site, so the tracker labels them two ways, in order:

1. **From your own case, when possible.** USCIS's status history sometimes pairs a code with official wording elsewhere on your own cases — when that pairing is available, it's the best label there is, because it's USCIS's own words about your own case.
2. **From the official federal schema, otherwise.** Event codes are the enumeration of a NIEM (National Information Exchange Model) type, `scr:BenefitDocumentStatusCategoryCodeSimpleType` — an open government data standard covering 492 codes with descriptions. These are USCIS's *internal operations* language, not customer-facing status text, so they're labeled as a system description rather than shown as if USCIS wrote them to you directly.

Even with both sources, some codes have no match anywhere. **USCIS uses codes that aren't in the published schema** — we confirmed this directly: `SA`, which marked a real case approved, does not appear in the NIEM enumeration. When that happens the tracker shows the raw code and says plainly that it has no published meaning, rather than guessing. The raw code is always shown next to whatever label it does get, so you can check it yourself.

## What data is accessed

The tracker reads from these `my.uscis.gov` endpoints, read-only, using your existing logged-in session:

| Endpoint | What it's for |
|---|---|
| `/account/case-service/api/cases` | Confirms you're logged in — it always comes back with an empty list, so it's used purely as a "is my session still alive" check, not to find cases |
| `/account/case-service/api/cases/{receipt}` | Case detail: what you filed, when, and when USCIS last touched the record |
| `/account/case-service/api/case_status/{receipt}` | Current status wording, status history, and which office holds the case |
| `/account/case-service/api/cases/{receipt}/documents` | Documents on file |
| `/account/case-service/api/cases/{FORM}/processing_times/{receipt}` | USCIS's processing-time estimate, when it publishes one (usually returns nothing) |
| `/secure-messaging/api/case-service/receipt_info/{receipt}` | A second, best-effort source for office location (usually returns nothing) |

These are **undocumented endpoints** that the community found by watching what the official `my.uscis.gov` dashboard itself loads — this tool doesn't call anything the dashboard doesn't already call for you. It only ever reads from them; it never writes, submits, or modifies anything. We verified each one against a real, logged-in account rather than just trusting community write-ups; a few turned out to be wrong (for example, an `/history` endpoint some community docs mention doesn't actually exist — it returns a 404, so this tool never calls it). If you want the full technical detail — exact response shapes, which fields we actually read, what's unreliable — see [docs/API-SCHEMA.md](docs/API-SCHEMA.md).

## What this project will not add

These are permanent commitments about where your data goes, not descriptions of the current build — stated up front so any future version can be measured against them:

- Any server, account, or sync service
- Analytics, telemetry, or crash reporting of any kind
- Sending case data anywhere for "community statistics," however aggregated
- Predicted decision dates or confidence scores
- Advertising, upsells, or anything that makes money from immigration anxiety
- Anything that writes to or acts on a USCIS case

## FAQ

**Why does it only support IOE receipt numbers?**
Cases filed on paper (receipt numbers starting `EAC`, `WAC`, `LIN`, `SRC`, or `MSC`) live in an older USCIS system that these particular endpoints don't cover. `IOE` numbers are issued for cases tied to a `my.uscis.gov` online account, which is what this tool reads from.

**It says "session expired."**
Your login with USCIS timed out — this happens on the official site too. Log back into [my.uscis.gov](https://my.uscis.gov) in the same tab, then click **Refresh** in the tracker.

**Will this get me in trouble with USCIS?**
It reads the exact same data your account dashboard already loads, at a deliberately gentle pace: requests go out one at a time with a pause between them, never in parallel, and background refreshing only happens while the tab is actually visible. It isn't a scraper — it doesn't enumerate other people's cases, and it doesn't try to reach anything your account can't already reach. That said, these are unofficial endpoints that the community discovered, not a documented USCIS API, so USCIS could change or remove them at any time without notice. If that happens, the tool may stop working until it's updated — that's a risk of using it, not a rule you'd be breaking.

**Can it check my cases while my browser is closed?**
No. There is no server doing anything on your behalf — CaseLens only runs inside your own browser, so if your browser isn't running, nothing is happening. Today it checks only while a my.uscis.gov tab is open. Checking in the background while your browser is open (but the tab isn't) is a possible future addition, but it would need extra browser permissions, so it would ship as a separate, clearly-labelled version rather than being added quietly to this one.

**If I switch from the userscript to the extension (or back), do I lose my data?**
No. Both read and write the same browser storage, so your cases, nicknames, and history carry over either way.

## For developers / auditors

- **Repo layout:** [`core/uscis-tracker-core.js`](core/uscis-tracker-core.js) (plus the event-code data in [`core/uscis-codes.js`](core/uscis-codes.js)) is the single source of truth for the entire tool. Everything under `userscript/` and `extensions/` is generated by concatenating those two files — none of those should be hand-edited.
- **`node scripts/build.js`** regenerates the userscript and extension files from the core file.
- **`node scripts/build.js --check`** verifies that the generated files are still byte-identical to what the core file would produce — this is how you confirm the extensions haven't drifted from the auditable source.
- **`test/harness.html`** runs the UI against local fixtures with no network access at all, so you can review and exercise the interface without ever touching a real USCIS account.
- **[SECURITY.md](SECURITY.md)** covers the security posture and threat model in more detail — least privilege, untrusted-input handling, and how to verify the claims above yourself.
- **[CONTRIBUTING.md](CONTRIBUTING.md)** has the rules a change has to follow — the honesty, privacy, and security constraints, plus how to test before opening a pull request.
- **[docs/design/SPEC.md](docs/design/SPEC.md)** documents the design decisions that involved a judgment call, especially the ones where a nicer-looking option was rejected in favor of an honest one.
- **[docs/API-SCHEMA.md](docs/API-SCHEMA.md)** records the endpoint schemas as verified against a real account, including the ones community documentation gets wrong.

## Disclaimer

This is an unofficial, independent, open-source project. It is **not affiliated with, endorsed by, or connected to USCIS or the Department of Homeland Security** in any way. It is not legal advice, and nothing it shows should be treated as an official USCIS determination — always rely on your official notices and your USCIS account for anything that matters, and confirm important details with a qualified immigration attorney. Provided under the [MIT License](LICENSE). Use at your own risk.
