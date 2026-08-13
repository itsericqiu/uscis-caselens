# CaseLens privacy policy

Last updated: 11 August 2026. Applies to the CaseLens userscript and to the
Chrome and Firefox extensions built from the same source.

## What CaseLens does with data

CaseLens reads immigration case data from my.uscis.gov using the browser's
existing signed-in session, displays it in a panel on that page, and stores it
in that browser.

**Data handled:** personally identifiable information that USCIS returns about
the signed-in account — name, mailing address, receipt numbers, document
identifiers, case status text and event history — and page content from
my.uscis.gov, which is read to discover the receipt numbers already printed on
the account page.

**Where it is stored:** `localStorage` on the my.uscis.gov origin, on the
device, under keys prefixed `uscisTracker.`.

**Where it is sent:** nowhere. CaseLens has no server, no account system, no
analytics, no telemetry, no crash reporting and no advertising. It makes no
network request other than read-only `GET` requests to my.uscis.gov, the site
the user is already signed in to. Every URL it can construct is built from a
single `ENDPOINTS` map in the source.

**Who it is shared with:** no one. Nothing is sold, transferred or disclosed to
any third party. There is no third party.

## Data the user moves themselves

Two features write data out of the panel, and both require a deliberate action:

- **Export** downloads a JSON records file to the device: everything USCIS
  returned about the cases on the latest successful check — including names,
  addresses, and full receipt numbers, regardless of the "Hide receipt
  numbers" setting — plus the changes CaseLens observed between checks. It is
  a personal record, not a backup; nothing imports it.
- **Copy summary** places case text on the clipboard.

Where those files then go is outside CaseLens's control.

## Retention and deletion

Stored data persists until deleted. **Settings → Erase everything** removes all
of it from that browser.

Uninstalling the extension does not clear it, because the data belongs to the
my.uscis.gov origin rather than to the extension. To remove it after
uninstalling, clear site data for my.uscis.gov.

Anything stored is visible to anyone using the same browser profile. There is
no password on the panel.

## Permissions

The extensions declare no `permissions`, no `host_permissions` and no
background worker. They register one content script, matching
`https://my.uscis.gov/*`. The userscript runs with `@grant none`.

That single match pattern is host access, and the browser will say so at
install: the extension can read and change data on my.uscis.gov. That is
accurate — a panel drawn onto the page can do both, and reading the page is how
CaseLens finds the receipt numbers already printed on it. It requests nothing on
any other site.

## Verifying this

The source is three files, published under the MIT license at
<https://github.com/itsericqiu/uscis-caselens>. The shipped extension is a
build-time concatenation of those files, and `node scripts/build.js --check`
proves the published copies are byte-identical to the source. The requests
CaseLens makes are visible in any browser's network inspector.

## Contact

<https://github.com/itsericqiu/uscis-caselens/issues>
