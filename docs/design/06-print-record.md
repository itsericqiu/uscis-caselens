# The printable record (1.20)

A second way a record leaves the panel: a document the browser prints, and a
person hands to someone.

## Why

The JSON export added in 1.18 is the right file for an archive and the wrong
one for a person. Nobody hands their attorney a JSON blob, and nobody reads one
across a desk. The panel already holds everything needed to answer "what does
the agency have on file, and when was that true" — it just holds it in a 400px
column behind a dozen disclosures.

Same data, laid out to be read on paper.

## No PDF library, and none was possible

The build has no dependencies, `privacy-gate.js` fails on any URL that is not
my.uscis.gov, and both stores were told "remote code: no". So a bundled or
fetched PDF library was never on the table.

Hand-rolling a PDF writer was. It was rejected on one specific ground: the
base-14 fonts a dependency-free writer can use without embedding are Latin-1
only. An applicant whose name falls outside that range would find it silently
mangled in their own immigration record. Embedding a font to fix that means
shipping font bytes and a CID mapping — several hundred lines of xref tables
and byte offsets, in a project whose entire claim is that three readable files
can be audited by anyone.

Routing through the browser's own print engine costs one CSS block and gets
correct text for every script, real pagination, and selectable output for free.
The tradeoff is that the user completes the save in the browser's print dialog.
For a document containing someone's immigration record, that is a feature.

## What this is not

Not an official document, and the design works to keep anyone from mistaking it
for one. This artifact leaves the browser, outlives the session, and travels to
employers, attorneys and clerks who never saw the panel. That makes
anti-impersonation a functional requirement rather than a styling preference:

- No seal, eagle, flag, or DHS/USCIS mark. No federal blue. No OMB furniture,
  signature line, "OFFICIAL" watermark, or form-number styling.
- Greyscale only. Coloured letterhead reads as institutional at a glance, and
  most people print greyscale anyway.
- The word **Unofficial** opens the document and closes every case block.
- The cover carries the same standing disclaimer the panel shows on screen —
  from one constant, `STANDING_DISCLAIMER`, so the two cannot drift.

This project already shipped DHS insignia by accident once, in store
screenshots. That is the error class this section exists to prevent, and the
stakes are higher here because the output is a file someone keeps.

## Mechanism: `@media print`, not an iframe

The document is built into `<div class="uscistr-print">`, mounted on
`document.body` as its own root — carrying the `uscistr-root` class itself,
beside the panel's root rather than inside it, since 1.21. (See "After the
first real print (1.21)," below: the panel's own root rebuilds from scratch
on its own schedule, and nesting the record inside it left a window where a
rebuild could remove the record mid-print.) Hidden on screen, a print
stylesheet hides the host page, neutralises the root's overlay positioning,
reveals the container, and `window.print()` does the rest.

The obvious alternative — build into an off-screen iframe and print that — was
rejected because it buys only CSS isolation, which `.uscistr-root` already
provides via `all: initial` plus a universal descendant reset. It would cost a
second style-injection path, cross-document node adoption (`el()` closes over
the module-global `document`), an unknown against my.uscis.gov's frame policy,
and a capability the extension does not otherwise use. Printing as designed
adds **no new browser capability**: no iframe, no Blob, no popup, no request.

Two properties make it safe:

1. `.uscistr-print { display: none; }` is a **normal** rule, flipped to `block`
   only inside `@media print`. A teardown that never runs still leaves nothing
   visible on screen.
2. Every host-page rule is gated on `body.uscistr-printing`. Outside an active
   print the print block matches nothing on the host page, so the stylesheet
   stays inert — the same claim SECURITY.md makes about the rest of the sheet.

`withPrintMode` is the only function that touches the host document, so if this
ever has to become an iframe, exactly one function changes.

### Verified against the real site

my.uscis.gov ships its own `@media print` rules. They were read before this was
designed, and two of them matter:

```css
a[href]::after { content: " (" attr(href) ")"; }
.hide-print, .uscis-header, …, img, #feedback { display: none !important; }
```

Nothing there is a `body > *` rule and nothing competes with the host-hiding
selector, so the mechanism works. But the first rule means **an anchor in this
document would have raw URLs injected into it by a stylesheet this project does
not control.** So the document contains no anchors — filenames and the repo URL
are printed as text — and the print block additionally neutralises
`a[href]::after` and `img` inside `.uscistr-print` as insurance. A unit test and
the end-to-end check both assert the anchor count is zero; that assertion is a
defense, not hygiene.

## Redaction is chosen per print

The JSON export is deliberately always-unredacted: a masked archive is not an
archive. A printed document is different, because it is shared far more often
than a JSON file is. So the choice is made at print time — **Full record** or
**Masked copy** — and neither follows the stored "Hide receipt numbers"
setting.

Three outcomes (full, masked, cancel) is why this is a small panel rather than
a `window.confirm`. A two-outcome primitive would force Cancel to stand in for
one of the real choices, which is exactly how a shared PDF ends up unmasked.

Mechanically, the four redaction readers were split into a policy taking an
explicit boolean plus a thin wrapper that reads the preference:

    redactValueWith(key, value, on)   <- redactFieldValue(key, value)
    redactJsonWith(text, on)          <- redactRawJson(text)
    numberFor(n, on)                  <- displayNumber(n)
    fileNameFor(name, on)             <- displayFileName(name)

Temporarily overriding `state.prefs.redact` around the render would have been
*safe* — the build is synchronous and `window.print()` blocks — but it would
make the builders impure, and every test would have to poke globals before
asserting anything. That is the exact shape that once let a privacy test pass
vacuously. Explicit beats clever here.

**A masked copy says so on its cover.** A masked document mistaken for a
complete one is the worst thing this feature can produce, so the cover states
which one it is rather than leaving it to be inferred.

## Shape

The builders are pure: entries in, detached DOM out, no state read and no live
document touched. That purity is what makes the whole document fuzzable for the
property that matters most — a masked copy must not render a sensitive value at
any depth.

1. **Cover** — title, the unofficial banner, the standing disclaimer, what
   generated it, when, what it covers, and whether it is full or masked.
2. **Per case** — identity and an explicit "As of <date>", because a printed
   page carries no hint that it has gone stale; the status in USCIS's wording;
   key facts; the step map with "not reported" spelled out in words; the full
   timeline; documents; and the changes this panel recorded.
3. **Appendix** — every field of every response, expanded.
4. **Footer** — unofficial line, version, "End of record".

Two decisions inside that shape are worth stating.

**Every timeline row carries its provenance in words** — "reported by USCIS" or
"observed by CaseLens between checks". On screen that distinction is carried by
a glyph, and a glyph does not survive a photocopier. A printed timeline handed
to an attorney that blurs agency facts into this panel's inferences would be a
liability.

**Nothing is collapsed.** Every disclosure the panel folds — the timeline
beyond four rows, nested record groups, the raw JSON — renders open. Paper has
no click. The print field walker is therefore a separate eager implementation
rather than a reuse of `buildRecordValue`, which emits a button and fills only
when clicked. It shares `humanizeFieldKey`, `objectKeys` and `RECORD_MAX_DEPTH`
so the two views label and order fields identically. A fuzz property asserts
`expandAll(node) === 0`: there is nothing left to open.

**No raw JSON text.** The appendix prints the fields, not the bytes. Braces and
quotes are unreadable on paper and would roughly double the page count; the
"Show as JSON" disclosure keeps the exact bytes available on screen.

**The cover carries an overview.** One row per case — form, receipt number,
status in USCIS's own wording, as-of date — ahead of the per-case sections.
The panel's own collapsed list, restated on the one page of the document most
likely to be read first.

**Uniform lists print as tables.** Events, notices and status history are
arrays of flat, like-shaped objects — USCIS repeats the receipt number on
every event and sends six timestamp fields per event, so nine stacked
label/value rows per item was mostly the same values again. Printed as a
table instead, one row per item and one column per field, in the order the
items supplied them, the same values take roughly a fifth of the paper. A
list that is nested, or wider than ten columns, still falls back to stacked
rows. This is presentation, the same as "Nothing is collapsed" above: a
table manages length, and imposes nothing on the data.

## One correctness fix that came with it

Printing the appendix always-expanded exposed something the record view had
been hiding behind a collapsed section: an endpoint that returned no content
rendered a field called **"Empty"** with the value **"true"**. That is
`__empty`, this panel's own marker written by the fetch layer — not something
USCIS sent. In a view whose whole claim is that it shows the agency's data
unreshaped, inventing a field is precisely the lie the project refuses
everywhere else. `responseKeys()` now filters `__`-prefixed internal markers,
and both views say "USCIS answered with no content for this one" instead. The
status chip beside the section already stated that fact honestly.

## Risks

- **Host print CSS.** Verified against the live site, but USCIS can change it.
  The failure is visible and total rather than subtle — the host page would
  appear behind the record — and the fallback is the iframe, isolated to
  `withPrintMode`.
- **Page numbers.** Chrome does not implement `@page` margin boxes, so a
  `counter(page)` footer is silently ignored. The browser's own print footer
  supplies page numbers and the user controls it in the dialog. Not worth
  faking.
- **Long timelines.** `break-inside: avoid` is applied to rows and sub-blocks,
  never to a whole case block — a case whose timeline exceeds a page would
  otherwise push the browser into emitting blank pages.
- **`window.print()` does not block everywhere.** It blocks on desktop Chrome
  and Firefox; on Safari, iOS especially, it returns immediately and the print
  UI is presented afterwards. Teardown originally ran in a `finally` right
  after it returned, which was correct on the browsers it was tested on and
  wrong on Safari: the document and body class were gone before anything
  rendered, so Safari printed my.uscis.gov with the panel on top of it —
  reported from a phone and fixed in 1.20.2. Teardown is now driven by
  whichever end-of-print signal arrives first (`afterprint`, a `print`
  media-query change, or a bounded timeout) and never by the call returning.
  `print-check.js` simulates a non-blocking `print()` that fires nothing and
  asserts the record is still mounted after it returns.
- **What the automated check cannot cover.** Teardown is asynchronous, so
  the document is gone before a CDP `printToPDF` round-trip could capture it,
  and blocking inside a stubbed `print()` blocks the renderer that call needs.
  The computed-style assertions — host hidden, root static, container visible,
  zero anchors, redaction honoured — are the automatable part and the part that
  regresses. **Reading the actual PDF stays a manual, once-per-release check.**

## After the first real print (1.21)

A real 4-case record — the first printed outside test fixtures — ran to 27
pages on an iPhone: 1 cover, 10 pages of readable record, 16 of appendix, and
four pages nearly blank. Each near-blank page traced to a different cause.

1. **Blank pages.** One was a single orphaned line: the per-case closing
   "Unofficial document. Not issued by USCIS." pushed onto its own sheet
   because nothing tied it to what precedes it. It now carries
   `break-before: avoid`. The others came from wrapping an entire appendix
   endpoint in one `break-inside: avoid` block — correct for keeping a small
   endpoint together, wrong for a large one, which the browser then dragged
   whole onto a fresh page, stranding whatever was left of the previous one.
   Appendix endpoints now use a wrapper that is allowed to break, and the
   document sets `orphans: 3; widows: 3` so a break still cannot leave one
   or two lines stranded on either side.
2. **Tables for uniform lists.** Events, notices and status history are
   arrays of flat, like-shaped objects. USCIS repeats the receipt number on
   every event and sends six timestamp fields per event, so nine stacked
   label/value rows per item was mostly repetition. Printed as a table
   instead — one row per item, one column per field, in the order the items
   supplied them — the same values take roughly a fifth of the paper. A list
   that is nested, or wider than ten columns, still falls back to stacked
   rows: the table is a presentation choice, not a data transform, and it
   yields whenever a table would misrepresent the shape more than it helps.
3. **Opt-out at print time.** The appendix is most of the page count and
   least often what a given copy is for. The Full/Masked popover gains a
   switch, **Include everything USCIS sent**, on by default; the cover's new
   **Contents** row states whether the appendix is present in that copy or
   was left out, so a page count alone never has to answer that question.
4. **Cover overview.** The cover was mostly disclaimer and metadata — 70%
   empty on a 4-case record. It now carries one row per case: form, receipt
   number, status in USCIS's own wording, as-of date. The panel's own
   collapsed list, restated on the one page most likely to be read first.
5. **The record is now its own root.** It used to build inside the panel's
   existing `.uscistr-root`. The panel's `render()` rebuilds that root from
   scratch, and does so on its own schedule — a refresh tick every 15
   minutes by default, independent of whether a print is in progress. 1.20.2
   let teardown linger until whichever end-of-print signal arrived first,
   up to a bounded timeout of 60 seconds on Safari. A refresh landing inside
   that window rebuilt the root the record was living in out from under it,
   while the body class that hides the host page stayed set: the host page
   hidden, the record gone, nothing put back in its place. The record now
   mounts on `document.body` beside the panel's root, carrying the
   `uscistr-root` class itself, so rebuilding one root cannot remove the
   other. This is a correctness fix, not a change to the mechanism in
   "Mechanism," above — the print stylesheet, the host-hiding rule, and the
   body-class gate are unchanged.
6. **Popover closes on choice.** Choosing Full or Masked used to leave the
   popover open through the print call. On a phone, returning from the
   print sheet landed back on that popover instead of the panel, since
   nothing had closed it. It now closes before `window.print()` is called.
7. **Two things iOS decides for you.** Safari on iOS names the saved PDF
   after the tab's `document.title` at the moment the print sheet opens; a
   title changed after that point, mid-flight, is ignored there (desktop
   Chrome and Firefox pick up the later title instead). And iOS prints its
   own footer with the page URL and real page numbers — the footer this
   project could not itself produce, since Chrome does not implement `@page`
   margin boxes (see "Page numbers," under Risks, above). The unofficial
   banner already counters a printed URL; the page numbers are simply
   useful, and free.
