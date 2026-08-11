# Contributing to CaseLens

Thanks for considering it. This document covers the rules a change has to
follow. Some of them are stricter than you might expect for a small tool, for
one reason: people read this panel to find out whether they can work, travel, or
stay in the country. A confident sentence that turns out to be wrong does real
damage, and it doesn't announce itself as a bug.

The user-facing promises live in [README.md](README.md); the security posture is
in [SECURITY.md](SECURITY.md); the full design reasoning, including options we
rejected and why, is in [docs/design/SPEC.md](docs/design/SPEC.md). This file is
the short version for anyone touching the code.

## The rule behind the rules

**Never display anything that isn't derivable from this user's own case data.**

Everything below follows from that. When a change would make the panel look
better by being less certain than the data supports, the panel loses.

## Honesty rules (these are not stylistic)

- **No predicted decision dates, ever** — not softened, not labelled
  "estimated", not in a tooltip.
- **No invented or borrowed statistics.** No "cases like yours take N months".
  We have no such dataset, and acquiring one would mean transmitting case data
  to a third party.
- **A percentage only when USCIS itself publishes an estimate** for that case.
  That endpoint usually returns 204 with no body; that is normal. Otherwise show
  elapsed time, which we actually know.
- **Never characterize a case as good or bad.** Do not derive
  approved/denied/positive/negative styling by pattern-matching status text or
  event codes. Emphasis may come only from structured boolean fields USCIS
  provides (`actionRequired`, `closed`). Concretely: a status headline is body
  text — it is never coloured green or red.
- **Never infer a code's meaning from its shape**, prefix, digits, or
  resemblance to a known code. `SA` and `SAB` may be unrelated.
- **Distinguish "we don't know" from "there is nothing."** An absent processing
  estimate means USCIS publishes none. An empty documents array does not mean
  the applicant has no documents. Never collapse the two.
- **Never drop data from the timeline.** An event we can't label still renders,
  with its raw code. Omitting it is a lie about the record.
- **Store only what was observed.** Fallback values exist to build a request;
  they must never be written into a snapshot as though USCIS reported them.

## Privacy rules

- **`my.uscis.gov` is the only origin this code may contact.** Every URL is
  constructed in the single `ENDPOINTS` map — do not build one anywhere else.
- No analytics, telemetry, error reporting, or third-party requests. No remote
  fonts, images, stylesheets, or scripts. Everything ships inline.
- Nothing is transmitted off the machine, including "anonymous" or aggregated
  data. Clipboard and file download are the only ways data leaves the panel, and
  both are user-initiated.
- The browser extensions must keep **zero permissions** — no `permissions`, no
  `host_permissions`, no background worker. A change that needs a permission
  needs a discussion first.
- The userscript keeps `@grant none`. It must never require a userscript-manager
  API.

## Security rules

- **No `innerHTML`, `insertAdjacentHTML`, `eval`, `new Function`, or
  `document.write`.** Build DOM with the `el()` helper. USCIS status text
  genuinely contains HTML — strip it, never render it.
- **Treat every API response as untrusted.** Fields may be missing, renamed,
  the wrong type, or hostile.
- Links are only clickable when they resolve to `my.uscis.gov`; anything else
  renders as plain text. Watch for protocol-relative (`//host`) and
  prefix-collision (`my.uscis.gov.example.com`) forms.
- Case numbers are validated and URL-encoded before use in a request.
- Imported backup files are untrusted input and are validated before storage.

## Code style

Plain ES5-flavoured JavaScript, zero dependencies, no build step required to
read it:

- `var`, `function` declarations. No arrow functions, `const`/`let`, template
  literals, `async`/`await`, spread, or destructuring.
- Every response field read goes through the `FIELDS` map. Don't scatter field
  names through the code — the whole point is that an auditor can see the data
  model in one place.
- CSS classes are prefixed `uscistr-`. Don't change `localStorage` key names;
  renaming one silently orphans existing users' saved cases.
- Comments explain constraints and non-obvious decisions, not what the next line
  does.

## Before you open a pull request

```sh
node --check core/uscis-tracker-core.js
node --check core/uscis-codes.js
node scripts/build.js          # regenerate userscript + extension copies
node scripts/build.js --check  # must exit 0
```

Fixtures can't catch everything. The harness has no timezone, no real
Chrome policy, and no live account — a filing date rendered a day early and a
Chrome setting that stops the script running were both found only by installing
it for real. Test against a real account before shipping anything that changes
how data is read or displayed.

Then open `test/harness.html` (serve the repo root, e.g.
`python3 -m http.server`) and exercise **every** scenario in the control strip:
`normal`, `changed`, `expired`, `notFound`, `malformed`, `emptyEnvelope`, and
`?scenario=loggedOut`. The last one must render **nothing at all** — no panel,
no launcher, no injected `<style>`. Check the console is clean in each.

**If you changed `core/uscis-tracker-core.js` or `core/uscis-codes.js`,
bump `VERSION` and re-run `node scripts/build.js`** — otherwise installed
copies will never update. Userscript managers and the browser extensions
both decide whether an update exists by comparing `VERSION` (stamped into
the userscript's `@version` and every `manifest.json` by the build script);
shipping a code change without bumping it means every existing install
silently never receives it. CI enforces this automatically — a PR that
touches either file without changing `VERSION` fails a dedicated check —
but it's a judgment call CI can't make for you (patch vs. minor is on you),
so do it as part of the change itself, not in response to a failing check.

Commit the regenerated `userscript/` and `extensions/*/content.js` files. They
are checked in on purpose so people can install without running Node, and
`--check` is what proves they still match the source.

**Never commit real case data.** No real receipt numbers, applicant or
representative names, document `contentId`s, notice `letterId`s, or tracking
numbers — not in code, tests, fixtures, docs, or screenshots. Use `IOE0000000000`
style placeholders. If you captured live responses while debugging, grep for
those values before committing.

## Working with AI agents in this repo

Much of this codebase was written by AI agents under review. If you do the same,
the rules above apply unchanged, plus:

- Give the agent this file and `docs/design/SPEC.md`. Both exist largely because
  a plausible-looking suggestion needed to be refused with a reason.
- Review honesty rules by hand. In practice the failure mode isn't broken code —
  it's a well-built feature quietly displaying something we cannot actually
  know, such as a progress percentage derived from a source that doesn't exist.
- Verify claims about the API against `docs/API-SCHEMA.md`, which was captured
  from a live account. Community documentation about these endpoints is
  frequently wrong: one widely-repeated list describes an endpoint that returns
  404, and another cites an event code absent from the federal schema.
