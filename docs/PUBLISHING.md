# Publishing runbook

This is the handoff doc for whoever owns the `itsericqiu/uscis-caselens`
repo and its store listings. It covers: how releases happen, the one-time
account setup for each store, where secrets go, and the listing text to
paste in on first submission.

If you're looking for the code-level rules (privacy, honesty, security)
that every change has to follow, see [CONTRIBUTING.md](../CONTRIBUTING.md)
and [SECURITY.md](../SECURITY.md) instead — this file is only about getting
built artifacts out the door.

## The source of truth

`VERSION` in [`core/uscis-tracker-core.js`](../core/uscis-tracker-core.js)
is the *only* place a release version is set. `node scripts/build.js`
stamps that same value into the userscript's `@version` header and into
`version` in both `extensions/chrome/manifest.json` and
`extensions/firefox/manifest.json`. There is no second place to bump — if
you're editing a manifest's version field by hand, stop, that's the build
script's job.

## How a release happens

There are two paths to a tagged GitHub Release; store submission is always
a separate, manual third step.

### 1. Automatic, on every version bump merged to `main` (normal path)

1. Bump `VERSION` in `core/uscis-tracker-core.js`.
2. Run `node scripts/build.js` and commit the regenerated
   `userscript/caselens.user.js` and `extensions/*/content.js` /
   `manifest.json` files along with your change.
3. Open a PR, get it merged to `main`.

Once on `main`, `.github/workflows/ci.yml` runs its usual verification
(syntax, the build-audit gate, the privacy/PII gates, the headless smoke
test — see below), and if everything is green, a `release-on-bump` job:

- reads `VERSION` from the just-merged commit,
- checks whether tag `vX.Y.Z` already exists on the remote,
- if it doesn't, creates that tag and a GitHub Release at this commit, with
  `caselens-chrome.zip`, `caselens-firefox.zip`, and `caselens.user.js`
  attached. Release notes are the matching `## X.Y.Z` sections of
  `CHANGELOG.md`, verbatim — `scripts/release-notes.js` extracts every section
  bumped since the last published tag, so notes are never stranded when several
  bumps land together. A version with no CHANGELOG section falls back to
  GitHub's generated commit list, which is why every release needs its section
  written before the merge,
- if it already exists (i.e. this merge didn't change `VERSION`), does
  nothing and exits successfully — a no-op, not a failure.

This is why the version-bump-required CI check exists: if a PR changes
`core/uscis-tracker-core.js` or `core/uscis-codes.js` without bumping
`VERSION`, CI fails the PR outright, because merging it as-is would produce
a silent no-op here — no new tag, no release, and existing installs (which
decide whether an update exists by comparing `VERSION`) would never see the
change.

**This automatic path never touches a store.** It only creates a GitHub
Release.

### 2. Manual tag push (fallback / re-run path)

You can still do it by hand — useful for re-cutting a release from a branch
other than `main`, or if you need to re-trigger a release for a tag that
already exists but whose release was deleted:

```sh
# after VERSION is bumped, built, committed, and merged/checked out:
git tag v1.2.0
git push origin v1.2.0
```

Pushing a `v*` tag triggers `.github/workflows/release.yml` directly, which
runs the same verification and produces the same tag/release, independent
of the automatic path above.

### 3. Publishing to the stores (always manual, always opt-in)

Neither path above submits anything to Firefox or Chrome. To do that:

1. Go to the **Actions** tab → **Release** workflow → **Run workflow**.
2. Set **Use workflow from** to the tag you want to publish (e.g. `v1.2.0`)
   — not a branch.
3. Set `publish_stores` to `true`.
4. Run it.

The `publish-firefox` and `publish-chrome` jobs each individually check
that their required secrets are configured (see below) and skip cleanly —
not fail — if they aren't. A GitHub Release is easy to delete or supersede;
a store submission enters a public review queue and isn't, which is why
this step requires a human to explicitly ask for it every time, on a
specific tag.

## CI artifacts vs. the GitHub Release

`.github/workflows/ci.yml` also builds `caselens-chrome.zip`,
`caselens-firefox.zip`, and `caselens.user.js` as a normal build artifact on
every ordinary push to `main` (job: `package`, artifact name
`caselens-extension-artifacts`) — even between releases, so there's always
something installable to hand to a store while setting things up for the
first time. **These expire after 90 days** (GitHub Actions' artifact
retention). The tagged **GitHub Release** is the durable, publicly linkable
copy — link to that, not to a CI run's artifacts page, in anything meant to
last.

## One-time setup

### Firefox — addons.mozilla.org (AMO)

1. Create (or use) a Firefox account, then sign in to the
   [AMO developer hub](https://addons.mozilla.org/developers/) and accept
   the Developer Agreement.
2. Under **Manage API Keys**
   (<https://addons.mozilla.org/developers/addon/api/key/>), generate a new
   JWT issuer/secret pair.
3. In the GitHub repo: **Settings → Secrets and variables → Actions → New
   repository secret**, and add:
   - `AMO_JWT_ISSUER` — the JWT issuer shown on that page
   - `AMO_JWT_SECRET` — the JWT secret shown on that page (shown once —
     save it before leaving the page)

The very first submission for a brand-new add-on generally has to be
created once by hand in the AMO developer hub (choosing the listing type,
initial category, etc.) before `web-ext sign --channel=listed` has an
existing listing to attach subsequent versions to. After that, the
`publish-firefox` job's `web-ext sign` call handles new-version uploads.

### Chrome — Chrome Web Store (CWS)

1. Create a [Chrome Web Store developer account](https://chrome.google.com/webstore/devconsole) if you don't have one — this has a one-time **$5 USD** registration fee.
2. In the [Google Cloud console](https://console.cloud.google.com/), create
   (or reuse) a project, enable the **Chrome Web Store API**, and create an
   **OAuth 2.0 Client ID** (type: Desktop app) under **APIs & Services →
   Credentials**. Note the client ID and client secret.
3. Generate a refresh token for that client authorized against the
   `https://www.googleapis.com/auth/chromewebstore` scope (the standard way
   is a one-time OAuth Playground or local-script flow — Google's
   [CWS API docs](https://developer.chrome.com/docs/webstore/using-api/)
   walk through this).
4. Upload the extension once by hand through the CWS developer dashboard to
   get an **extension ID**, if you don't have one yet.
5. In the GitHub repo: **Settings → Secrets and variables → Actions → New
   repository secret**, and add:
   - `CWS_CLIENT_ID`
   - `CWS_CLIENT_SECRET`
   - `CWS_REFRESH_TOKEN`
   - `CWS_EXTENSION_ID`

After that, the `publish-chrome` job uploads the zip and publishes it via
the CWS API on your explicit `publish_stores: true` dispatch.

## Before the first submission

Unresolved, and worth settling before either listing goes public:

- **my.uscis.gov's terms of use.** Whether they restrict automated access has
  not been verified — uscis.gov returns 403 to non-browser requests, so it
  needs checking by hand while signed in. This is not a store rule; it is a
  takedown-request vector, and it is the one open question that bears on
  whether to list at all.
- **Trader / non-trader**, on the Chrome account rather than the item. A free,
  non-monetised project is normally non-trader. Declaring trader publishes a
  physical address and phone number to EU users.

## Store listing metadata

Paste-ready text for the initial submission to either store. Both stores
require this to stay accurate: contradictions between the listing, the privacy
answers and observed behaviour are a removal ground, not a style problem.

### Name and summary

Both come from `manifest.json`, not from the dashboard, so changing either is a
`VERSION` bump and a rebuild. Do it before first submission — renaming a live
listing invites re-review.

- **Name:** `CaseLens — Unofficial USCIS Case Tracker` (40 chars; Chrome allows
  75, AMO 50)
- **Chrome summary** = manifest `description`, max 132:
  `Unofficial panel showing every case on your USCIS account in one place. Nothing leaves your browser.`
  (100 chars)
- **AMO summary**, max 250 — AMO shows a longer one, so do not reuse Chrome's:

  > An unofficial panel on my.uscis.gov that shows every case on your account
  > at once, laying out every field your account page's own data already
  > contains. Runs entirely in your browser: no server, no account, and nothing
  > is sent anywhere.

  Some AMO locales enforce name + summary ≤ 70 characters on the product-page
  form. Fallback short summary: `Every USCIS case, one panel.`

"Unofficial" is in the name on purpose. Descriptive use of an agency name is
normally fine on both stores, but the operative rule is the affiliation one —
do not represent that a product is authorised or produced by another
organisation — and one word in the title is the cheapest way to settle it.

### Categories

- **Chrome:** Productivity → Workflow & Planning.
- **AMO:** Alerts & Updates (primary), Other (secondary). AMO has **no**
  Productivity category for extensions; earlier drafts of this file said
  otherwise.

### Full description — Chrome

Chrome renders no markup. Plain text, and keep "USCIS" to about five
occurrences: unnatural repetition of a keyword is a listed suspension ground.

> CaseLens adds a panel to my.uscis.gov showing every case on the signed-in
> account in one place.
>
> Unofficial and independent. Not affiliated with, endorsed by, or connected to
> USCIS or the Department of Homeland Security. Nothing it shows is legal
> advice or an official determination. Mailed notices and the official website
> remain the authority on any case.
>
> HOW IT WORKS
>
> Your account page already loads your case data when you open it. CaseLens
> makes those same requests and lays out every field they return — including
> fields the page itself does not display — for all of your cases at once,
> rather than one case at a time.
>
> WHAT IT SHOWS
>
> • Every case at once, one line each: form, status in the agency's exact
>   wording, and the date of that status.
> • A merged timeline of status history and logged event codes, with the source
>   of each entry named.
> • Which office holds each case. The website does not display this.
> • When a record was last touched even though the status text did not change.
>   The website does not display this either.
> • Documents on file, scheduled appointments, and days elapsed since filing.
> • A badge naming what changed since the last visit.
> • Nicknames, JSON export and import, receipt-number masking, and dark mode.
> • Spanish status wording where it is supplied.
>
> PRIVACY
>
> • Runs entirely in your browser. No server, no account, no analytics, no
>   telemetry, no advertising.
> • Makes no request to any site other than my.uscis.gov, and loads no outside
>   code, fonts or images.
> • Cases, history and settings are stored in this browser and are never
>   transmitted anywhere.
> • Read-only. Nothing can be filed, answered, withdrawn, uploaded or changed.
> • Zero permissions: none declared, no host permissions, no background worker.
>   One content script, on https://my.uscis.gov/* only.
> • Settings > Erase everything removes all stored data.
>
> Works with receipt numbers beginning IOE. Signed out, the panel shows nothing.
>
> Source is three readable files, MIT licensed:
> https://github.com/itsericqiu/uscis-caselens

### Full description — AMO

AMO renders Markdown, so use the same copy with `###` headings, `*` bullets and
**bold** on the two differentiators. Do not paste the plain-text Chrome version.

### Single-purpose statement (Chrome requires this)

> Displaying, on the user's own my.uscis.gov account page, the case status,
> event timeline, office, and documents that the page's existing session
> already has access to. Nothing else.

### Permission justification (both stores)

With zero permissions declared, this section may render empty. Say it anyway —
a zero-permission extension making API calls is the first thing a reviewer will
question.

> No browser permissions of any kind are requested. The manifest declares no
> "permissions", no "host_permissions", no optional permissions and no
> background or service worker. A single content script matches
> https://my.uscis.gov/* and reads data from that page's own logged-in session
> using same-origin GET requests — the same requests the my.uscis.gov dashboard
> already makes for the signed-in user. Same-origin requests from a content
> script require no host permission. Without host permissions the extension
> cannot read a response from any other site, does not use storage or tabs
> permissions beyond what content scripts have by default, and cannot run or
> read anything outside the my.uscis.gov tab it is injected into.

### Remote code statement (both stores ask). Answer: No.

> No remote code. Every line of JavaScript is bundled into the package at build
> time from three auditable source files — `core/uscis-codes.js`,
> `core/uscis-style.js` and `core/uscis-tracker-core.js`, concatenated in that
> order. There is no minification, obfuscation, bundler or transpiler. Nothing
> is fetched or evaluated at runtime; the code contains no eval, no
> new Function and no innerHTML. Byte-identity of the shipped file to those
> sources is provable with `node scripts/build.js --check`.

## Privacy answers

The two stores define "collection" differently, so the honest answers differ.
Explain that in both sets of reviewer notes, so neither reviewer concludes the
other was misled.

### Chrome — "collects nothing" is the wrong answer

Chrome requires disclosure of data handling **even when data is processed or
stored only on the user's device**. CaseLens reads names, addresses, receipt
numbers and document identifiers, renders them, and caches them in
`localStorage`. That is collection under Google's definition, and under-declaring
is the violation.

Data-collection checkboxes:

| Category | Answer |
|---|---|
| Personally identifiable information | **Yes** — name, mailing address, receipt numbers, document ids |
| Website content | **Yes** — the account page is read to discover receipt numbers |
| Health information | No |
| Financial and payment information | No |
| Authentication information | No — the existing session cookie is never read or stored |
| Personal communications | No — `/secure-messaging/` returns office location, not messages |
| Location | No — office location is not the user's location |
| Web history | No |
| User activity | No |

All three certifications are truthfully checkable: nothing is sold, nothing is
used beyond the item's single purpose, nothing touches creditworthiness.

**Privacy policy URL** (required, since the item handles user data):
`https://github.com/itsericqiu/uscis-caselens/blob/main/docs/PRIVACY.md`

### Firefox — `"none"` is correct

Mozilla scopes `data_collection_permissions` to data handled **outside the local
browser**. Nothing leaves the device, so the manifest's existing
`"required": ["none"]` is accurate. Same behaviour, different definition.

## Notes for reviewers

Both stores accept private notes. For this extension they are close to
mandatory: a reviewer cannot obtain a my.uscis.gov account with a pending
immigration case, and an add-on a reviewer cannot exercise can be rejected.
Chrome's field is the **Test instructions** tab; AMO's is **Notes for
Reviewers**, per version.

Cover four things, in this order:

1. **How to test without an account.** The offline harness is the answer:

   ```
   git clone https://github.com/itsericqiu/uscis-caselens
   cd uscis-caselens && python3 -m http.server 8899
   open http://localhost:8899/test/harness.html
   ```

   `test/harness.html` loads `test/fixtures.js`, replaces `window.fetch`, and
   only then loads the same three source files that compose the shipped
   `content.js`. Nothing touches the network. Click the CaseLens pill or press
   Alt+U. The scenario strip drives `normal`, `changed`, `actionRequired`,
   `expired`, `notFound`, `malformed`, `loggedOut` and `emptyEnvelope`;
   switching takes effect on the next fetch, so click Refresh after. Scenarios
   that must be active before the first request go in the URL, e.g.
   `?scenario=loggedOut` — which must render nothing at all. The log at the
   bottom prints every URL requested, which is the fastest way to confirm the
   complete request surface.

2. **Why a zero-permission extension makes `fetch()` calls.** Same-origin
   requests from a content script running in a my.uscis.gov document need no
   host permission, and the browser attaches the existing cookie because the
   request comes from that document's own origin. No permission is bypassed:
   without host permissions, a cross-origin response cannot be read, and none is
   attempted. Every constructible URL comes from one `ENDPOINTS` map, and there
   are two fetch call sites.

3. **`/secure-messaging/` is not message access.**
   `/secure-messaging/api/case-service/receipt_info/{receipt}` returns
   office-location metadata for a receipt number. No correspondence is read,
   requested or rendered. It returns an empty body for most accounts. A reviewer
   grepping the source will hit this path and assume otherwise.

4. **What happens to the data**, plus the Chrome/Firefox disclosure difference
   above, and `node scripts/build.js --check` for byte-identity.

### Expected `web-ext lint` output

`npx web-ext lint --source-dir=extensions/firefox` reports **0 errors, 2
warnings**, both the same cause: `strict_min_version` is 109, which predates
`data_collection_permissions` (Firefox 140 desktop, 142 Android). Leave it.
The key is ignored on older versions and the extension needs nothing to run
there, so raising the floor would drop working installs to silence a notice.
AMO does not reject on warnings.

## AMO source-code submission

`scripts/build.js` generates one file from several, which is literally what
AMO's source-upload rule names — even though the output is unminified and
readable, which satisfies the rule's purpose. Arguing that costs a review round;
uploading a zip of a repo already published costs nothing. Upload it.

Include `core/`, `scripts/`, `test/`, both manifests, `LICENSE`, and a README at
the archive root stating: Node 18+, **no dependencies and no lockfile**, no
minifier or bundler; `node scripts/build.js` regenerates the outputs and
`node scripts/build.js --check` proves byte-identity with the submitted file;
`node scripts/package.js` reproduces the zip.

## Assets

| Asset | Chrome | AMO |
|---|---|---|
| Screenshots | 1280×800, 1–5, no padding | 1280×800, 1.6:1 |
| Store icon | 128×128 | upload 32×32 and 64×64 |
| Small promo tile | 440×280 | n/a |
| Marquee tile | 1400×560, optional | n/a |

Screenshots live in [`docs/store/`](store/), generated by
`node scripts/store-screenshots.js` against fixture data — invented case
numbers, never a real account. `docs/screenshots/` is the README set and is the
wrong shape for a listing.

The five shots are ordered as an argument rather than a gallery: the overview
carries most of the install decision, the two things the official site does not
show sit at 2 and 3, and the set ends on the privacy controls, because showing
"Erase everything" closes an argument the description can only assert. Chrome
has no per-screenshot caption field; any caption must be burned into the image.
AMO has one.

Regenerate before submitting if the layout has changed — check
`git log -1 -- docs/store` against the last release that touched `core/`. Store
images showing a layout the user will not meet are a rejection risk and a trust
problem. `store-screenshots.js` fails the run if any two images come out
identical, which it once did silently.

**The backdrop must stay recognisably a mock.** `test/backdrop.html` deliberately
omits the DHS seal, the agency wordmark and the "official website of the United
States government" banner. A listing image carrying federal insignia says the
opposite of the disaffiliation sentence printed beside it, and seal statutes
reach reproductions of the seal specifically. This was shipped wrong once.

## After the first store listing goes live

Replace the README's "store versions are planned" with the store link as the
normal install, and keep the userscript documented below it. Drop the Chrome
"Allow user scripts" note from the store path — it applies only to userscript
managers.

Keep the userscript path. It is the only option on Safari, it is the version
someone can read in full before it runs, and store review takes days, so a fix
for a broken endpoint reaches userscript users first.
