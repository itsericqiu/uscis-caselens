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
  attached and release notes generated from the commits since the last tag,
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

## Store listing metadata

Paste-ready text for the initial submission to either store.

- **Name:** `CaseLens — USCIS Case Tracker`
- **Summary** (Chrome Web Store, must be under 132 characters):
  `See all your USCIS cases in one place. Everything stays in your browser.`
  (75 characters)
- **Category:** Productivity (closest fit on both stores at time of
  writing — pick whichever the current taxonomy maps that to; there is no
  dedicated "immigration" or single obviously-correct category on either
  store).
- **Screenshots:** pull from [`docs/screenshots/`](screenshots/) — these
  are generated from `scripts/screenshots.js` against local fixture data
  (invented case numbers), never a real account, so they're safe to
  publish as-is.

### Full description

> CaseLens shows every case on your USCIS account in one place — status, a
> merged timeline of events, your office location, receipt info, how long
> it's been since you filed, your documents, and a quiet highlight of
> what's changed since you last checked. It reads the same data your
> official my.uscis.gov account page already loads, and nothing else.
>
> Everything stays in your own browser. There is no account, no server, and
> no company behind this collecting your data — CaseLens has no way to send
> your case information anywhere, because it declares no permissions
> beyond running on my.uscis.gov itself.
>
> The entire tool is one readable source file, published in the same repo
> this extension is built from, so you don't have to take our word for any
> of that — you can read exactly what it does, or watch its network traffic
> yourself and see that every request goes to my.uscis.gov and nowhere
> else.
>
> CaseLens is unofficial and independent. It is not affiliated with,
> endorsed by, or connected to USCIS or the Department of Homeland
> Security, and nothing it shows is legal advice or an official USCIS
> determination.

### Permission justification (required by both stores)

CaseLens declares **zero permissions** — no `permissions`, no
`host_permissions`, no background worker — and a single content script
matching `https://my.uscis.gov/*`. Justification text for the store review
form:

> CaseLens requests no browser permissions of any kind. It injects a single
> content script that runs only on https://my.uscis.gov/*, where it reads
> data from that page's own logged-in session using ordinary fetch() calls
> — the same requests the my.uscis.gov dashboard itself already makes for
> the signed-in user. It does not request host permissions for any other
> site, does not use a background/service worker, does not use storage or
> tabs permissions beyond what content scripts get by default, and cannot
> run or read anything outside the my.uscis.gov tab it's injected into.

### Single-purpose statement (Chrome Web Store requires this)

> CaseLens's single purpose is to display, in one place on the user's own
> my.uscis.gov account page, the case status, event timeline, and documents
> that page's own session already has access to — nothing else.

### Remote code statement (both stores ask)

> No remote code. Every line of JavaScript in this extension is bundled
> into the package at build time from a single auditable source file
> (`core/uscis-tracker-core.js`); nothing is fetched or evaluated at
> runtime, and the extension makes no requests other than the read-only
> my.uscis.gov API calls described above.

## After the first store listing goes live

Flip the README's install recommendation. Today the userscript leads only
because unpacked extensions need developer mode — not because it is the better
option. Once the store listing exists, the extension is:

- one click, versus install a manager → enable Chrome's "Allow user scripts" →
  install the script
- **zero permissions**, versus a userscript manager that needs access to every
  site the person visits
- auto-updating through the store, with no third party in the trust chain

Lead with the store links. **Keep the userscript as a clearly-labelled second
path** — not buried — for four reasons that survive publication:

1. **Safari.** There is no Safari extension, so the Userscripts app plus the
   userscript is the only path there.
2. **Reading before installing.** The userscript is one file someone can read
   before it runs. `build --check` proves the packaged extension is identical,
   but "read it yourself" is the assurance this project is built on.
3. **Update speed.** GitHub releases are immediate; store review takes days. If
   USCIS changes an endpoint, the userscript carries the fix first.
4. People who already run a manager and want their scripts in one place.

Also update the "Store listings are planned" line, and drop the Chrome
"Allow user scripts" troubleshooting note from the extension path — it applies
only to userscript managers.
