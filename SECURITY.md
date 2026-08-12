# Security Policy

## Threat model

CaseLens handles sensitive immigration case data on behalf of people whose
ability to work, travel, or stay in the country may depend on it. The
adversaries that matter here are: (a) anything that could exfiltrate case
data off the user's machine, (b) hostile or malformed data coming back from
an undocumented, unversioned USCIS API, and (c) a malicious or corrupted
backup file someone imports. Everything below follows from taking those
three seriously.

## Least privilege

- The browser extensions (Chrome, Firefox) request **no permissions beyond
  running on `my.uscis.gov` itself**: no `permissions`, no `host_permissions`,
  no background worker in any manifest. They inject one content script on
  `my.uscis.gov` and nothing else.
- That content script's match pattern **is** host access, and both stores count
  it as such — Chrome's own definition is "any match pattern specified in the
  `permissions` and `content_scripts` fields". So the install prompt warns about
  reading and changing data on `my.uscis.gov`, and it is right to: a script
  running in that page can do both. What the manifest withholds is access to
  every *other* site, and the ability to run anywhere the user is not already
  looking. "Zero permissions" is true of the manifest keys and false of the
  install prompt, which is why it is not the phrasing used here.
- The userscript declares `@grant none`. It has no access to privileged
  userscript-manager APIs and can do nothing that ordinary page JavaScript
  running on `my.uscis.gov` couldn't already do.

## No dynamic code, no injected markup

- The code never uses `innerHTML`, `eval`, or `new Function`, and loads no
  remote code. Every element the UI builds is constructed as DOM text
  nodes, so data returned by the API cannot become markup or script.
- USCIS's own `statusText` field genuinely contains HTML anchor tags. That
  HTML is stripped and rendered as plain text — never assigned via
  `innerHTML`.

## Untrusted input handling

The USCIS endpoints CaseLens reads are undocumented and unversioned, so all
response data is treated as untrusted:

- Document links are only rendered as clickable when they resolve to the
  same origin, `my.uscis.gov`. Both a protocol-relative link (`//evil.com`)
  and a prefix-collision hostname (`my.uscis.gov.evil.com`) are rejected —
  resolved with the URL parser and compared by origin, so separator tricks (backslashes, embedded tabs) cannot escape it.
- Case numbers are URL-encoded before they are used to build any request, so no input can reshape a URL. Shape validation is advisory — the add-case form lets you override it.
- Imported backup files (export/import, JSON) are validated before their
  contents are written to storage.

## No secrets stored

CaseLens holds no tokens, passwords, or cookies of its own. It rides on the
`my.uscis.gov` session already in the browser and never asks for, sees, or
stores a password.

## How to verify this yourself

- **Network traffic:** open DevTools → Network while using the tool. Every
  request goes to `my.uscis.gov`, because those are the only requests the code
  makes — there are exactly two `fetch` call sites and both build their URL
  from the `ENDPOINTS` map.

  Be precise about what enforces that, because the honest answer is weaker than
  it first looks. Zero permissions stop an extension *reading* a cross-origin
  response; they do not stop it *sending* one, and sending is all exfiltration
  needs. The userscript ships `@grant none`, so it can reach whatever the page
  can. What actually holds the line is that the code contains no such call, and
  that you can check it — by reading it, by watching the Network tab, and by
  `scripts/privacy-gate.js`, whose limits are stated below.
- **Source integrity:** `node scripts/build.js --check` proves the shipped
  userscript (`userscript/caselens.user.js`) and both browser extensions'
  `content.js` are byte-identical to the audited source
  (`core/uscis-codes.js` + `core/uscis-style.js` + `core/uscis-tracker-core.js`,
  concatenated in that order). It exits non-zero if anything has drifted.
- **Surface area:** every URL the code can construct lives in one
  `ENDPOINTS` map; every response field it reads lives in one `FIELDS` map.
  Both are grep-able in a single file — there is no scattered request logic
  to audit separately.

## Reporting a vulnerability

For anything that isn't sensitive (a permissions question, a hardening
suggestion, general hygiene), please open a regular
[GitHub issue](https://github.com/itsericqiu/uscis-caselens/issues).

For anything sensitive — a way to exfiltrate case data, bypass the
same-origin checks, or otherwise put a user's data at risk — please use
GitHub's private security advisory feature on this repository
(`github.com/itsericqiu/uscis-caselens` → Security → Report a
vulnerability) rather than a public issue.

There is no bounty program. Good-faith reports are welcomed and will be
credited unless you'd prefer otherwise.

## What this does not defend against

Stating these plainly is more useful than implying the list is empty.

- **A compromised script on my.uscis.gov itself.** The userscript runs with
  `@grant none`, which means it shares a JavaScript realm with the page. A
  hostile script on that origin could read the case data CaseLens fetches, or
  stop the panel appearing at all. The browser extensions run in an isolated
  world, so the tool's own code and its responses are out of reach — a real
  reason to prefer them. It is not total: local storage is scoped to the origin
  rather than to the world, and the panel's rendered text is in the page, so a
  hostile script on my.uscis.gov could still read both.
- **Anyone with access to your browser profile.** Saved cases and history sit in
  that site's local storage with no password on them.
- **What `--check` proves.** It proves the shipped files are exactly what the
  build produces from the source in this repo. It does not prove the build
  script itself is honest — read `scripts/build.js`; it is short.
- **What the automated gates prove.** `scripts/privacy-gate.js` greps the three
  shipped files for URL literals outside an allow-list, and
  `scripts/pii-gate.js` greps tracked text files for receipt numbers. Both are
  regular expressions over text, so both catch mistakes and neither resists
  someone deliberate: a URL assembled by concatenation, a protocol-relative
  address, a `wss://` scheme, or a receipt number split across two lines all
  pass. `pii-gate` does not look inside images at all, which is where a
  live-session screenshot would leak. They are there to stop an accident
  shipping, and that is the only claim made for them. Reading the code is still
  the thing that proves the code.

