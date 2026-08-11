# 02 · Visual system — "Quiet Instrument"

> **Status: input document, partly superseded.** Written as a specialist
> deliverable before implementation. The binding decisions are in
> [SPEC.md](SPEC.md) and [REVIEW-TRIAGE.md](REVIEW-TRIAGE.md); where this file
> disagrees with those, they win. Kept for the reasoning, not as a build target.


The complete visual specification for the floating case-status panel injected onto
`my.uscis.gov`. Live rendering: **[`mockup-visual-system.html`](./mockup-visual-system.html)**
(standalone, no network, light + dark side by side, working toggles).

Constraints this system is designed inside: one injected `<style>` block, vanilla CSS,
system fonts, inline SVG only, ~400px × 85vh, draggable, collapses to a pill, dark mode via
a `.uscistr-dark` class, immune to hostile host CSS, never breaks the page underneath.

---

## 1 · Design rationale

### The feeling

**A quiet instrument someone left on your desk.** Immigration cases are measured in
years; the panel's job is to make a long, opaque wait *legible* — never to add anxiety.
That produces three commitments:

1. **Calm before density.** The panel is information-dense, but nothing shouts. There is
   exactly one saturated colour on screen at rest (the accent, on one primary button), and
   status colour appears only in small chips. No coloured header bar, no full-bleed alerts.
2. **Precision as trustworthiness.** Tabular numerals, monospace identifiers, hairline
   rules, a 2px-accurate baseline rhythm. The panel earns trust by looking like it was
   measured, because the data it shows is unofficial and scraped — the craft is the
   credibility.
3. **Honest about uncertainty.** USCIS returns empty bodies, 404s and bare event codes.
   The system has first-class visual treatments for *"we don't know"*: dashed notes, an
   `UNOFFICIAL` tag on every guessed event label, HTTP status chips on every raw block, an
   indeterminate progress fill. A tool that admits its gaps reads as more trustworthy than
   one that papers over them.

### Three references, and what each contributes

| Reference | What we take | Why it fits |
|---|---|---|
| **Linear** | Structural restraint: hairline separators instead of cards-in-cards, a tight 6-role type scale, cool neutrals with a single indigo accent, uppercase micro-labels. | Linear proves a dense list can stay calm if hierarchy is carried by *weight and spacing*, not by boxes and colour. Our card is a stack of blocks separated by one hairline — no nested panels. |
| **Stripe Dashboard** | Data legibility: monospace + tabular numerals for identifiers, semantic status chips with a strict colour vocabulary, raw-payload disclosure for the technical user. | Stripe's rule that *accent ≠ status* is the single most load-bearing idea here. Indigo means "interaction / new"; green-amber-red-blue mean "state of your case". They never swap. |
| **Raycast** | Surface craft: a floating rounded rectangle with a real elevation stack, a translucent blurred header that content scrolls under, a launcher that feels like an app rather than a widget. | Raycast is the proof that an overlay can feel like a first-class application. The blurred sticky header + layered shadow + 14px radius is what stops this reading as a browser-extension bubble. |

*(Arc's soft chrome informs the radius and the launcher pill's hover lift, but the three
above are the load-bearing ones.)*

### What we are deliberately not

- **Not the host page.** USCIS is `#0b4778` navy, Source Sans Pro, blocky 4px-radius
  buttons, full-width blue bars. We are indigo `#4F46E5` (hue ≈ 245 vs. the site's ≈ 206),
  system-UI, 14px radius, no coloured chrome at all. Adjacent on screen, they read as two
  different products — which is exactly the point: nothing here should be mistaken for an
  official government statement.
- **Not a "hacky overlay."** No neon, no drop shadows on text, no emoji icons, no
  `position: fixed` box with a coloured title bar. The header is the same colour as the
  panel, separated by one hairline.
- **Not garish.** The accent appears at full saturation in roughly four places per screen:
  the mark, the primary button, the current timeline dot, the "changed" affordance.

---

## 2 · Token system

All tokens are CSS custom properties declared on `.uscistr-root`, prefixed `--ust-`.
Dark mode re-declares the colour tokens under `.uscistr-root.uscistr-dark`; **nothing else
in the sheet is theme-aware**, which is what keeps dark mode from drifting.

### 2.1 Colour — light

Contrast measured against the surface each token is specified to sit on. All text tokens
meet WCAG 2.2 AA (4.5:1); all UI-boundary tokens meet 1.4.11 (3:1).

| Token | Hex | Role | On | Ratio |
|---|---|---|---|---|
| `--ust-bg-panel` | `#FFFFFF` | Panel body, popover, outline buttons | — | — |
| `--ust-bg-raised` | `rgba(255,255,255,.84)` | Header/footer over blur | — | — |
| `--ust-bg-sunken` | `#F6F7F9` | Add-case strip, dashed notes | — | — |
| `--ust-bg-inset` | `#F0F2F5` | Raw JSON, chips, empty-state icon well | — | — |
| `--ust-bg-hover` | `rgba(16,19,24,.045)` | Ghost/icon hover | — | — |
| `--ust-bg-active` | `rgba(16,19,24,.085)` | Ghost/icon press | — | — |
| `--ust-tint-accent` | `rgba(79,70,229,.045)` | "Changed since last look" card wash | — | — |
| `--ust-text-1` | `#101318` | Headings, status titles, field values | panel | **18.61** AAA |
| `--ust-text-2` | `#3F4756` | Body prose, button labels | panel | **9.35** AAA |
| `--ust-text-3` | `#5F6776` | Meta, labels, dates, muted | inset | **5.08** AA |
| `--ust-border-1` | `#E8EAEE` | Hairline separators (decorative) | — | — |
| `--ust-border-2` | `#D8DCE3` | Panel edge, outline button, dashed note | — | — |
| `--ust-border-field` | `#868E9F` | Input / switch boundary | panel | **3.29** AA-UI |
| `--ust-accent` `--ust-accent-solid` | `#4F46E5` | Links, primary fill, current dot | panel | **6.29** AA |
| `--ust-accent-solid-hover` | `#4338CA` | Primary hover | panel | 7.90 AAA |
| `--ust-accent-solid-active` | `#3730A3` | Primary press | panel | 9.79 AAA |
| `--ust-accent-on` | `#FFFFFF` | Label on primary | accent | **6.29** AA |
| `--ust-accent-soft` | `#EEEDFD` | Change notice, "New" chip, toggled icon btn | — | — |
| `--ust-accent-soft-text` | `#3B33C4` | Text on accent-soft | accent-soft | **7.40** AAA |
| `--ust-accent-soft-border` | `#D7D4FB` | Border of accent-soft surfaces | — | — |
| `--ust-success` | `#067647` | Approved rail, complete progress fill | panel | 5.69 AA |
| `--ust-success-soft` / `-text` / `-border` | `#E6F6EE` / `#05603A` / `#B3E2CB` | Approved chip | soft | **6.85** AA |
| `--ust-warn` | `#B54708` | Action-required rail | panel | 5.43 AA |
| `--ust-warn-soft` / `-text` / `-border` | `#FDF3E4` / `#93370D` / `#F0D9AE` | Session-expired banner, warning chip | soft | **6.84** AA |
| `--ust-danger` | `#B42318` | Error rail, confirm-destructive fill | panel | 6.57 AA |
| `--ust-danger-soft` / `-text` / `-border` | `#FEEDEB` / `#912018` / `#F6CCC6` | Denied chip, danger button rest | soft | **7.64** AAA |
| `--ust-info` | `#175CD3` | — | panel | 5.99 AA |
| `--ust-info-soft` / `-text` / `-border` | `#EAF1FE` / `#0B4A9E` / `#C3D8F8` | Processing chip, info banner | soft | **7.44** AAA |
| `--ust-track` | `#E7E9EF` | Progress track | — | — |
| `--ust-focus` | `#4F46E5` | Focus ring | panel | 6.29 |
| `--ust-focus-halo` | `rgba(79,70,229,.30)` | 4px outer glow | — | — |
| `--ust-scroll-thumb` / `-hover` | `#C9CED8` / `#AEB5C2` | Custom scrollbar | — | — |

### 2.2 Colour — dark

Dark is **re-picked, not inverted**. Three rules: surfaces stay warm-neutral (never pure
black, never blue-black); borders get *lighter* rather than darker; every semantic hue is
desaturated and lifted so nothing glows on an OLED panel at 2am.

| Token | Hex | On | Ratio |
|---|---|---|---|
| `--ust-bg-panel` | `#191A1F` | — | — |
| `--ust-bg-raised-solid` | `#1D1E24` | — | — |
| `--ust-bg-sunken` | `#131418` | — | — |
| `--ust-bg-inset` | `#212329` | — | — |
| `--ust-bg-hover` / `-active` | `rgba(255,255,255,.055)` / `.10` | — | — |
| `--ust-tint-accent` | `rgba(139,136,247,.075)` | — | — |
| `--ust-text-1` | `#EBECF0` | panel | **14.72** AAA |
| `--ust-text-2` | `#ADB2BF` | panel | **8.19** AAA |
| `--ust-text-3` | `#8B92A1` | inset | **5.03** AA |
| `--ust-border-1` / `-2` | `#2A2D35` / `#3A3E49` | — | — |
| `--ust-border-field` | `#666D7D` | panel | **3.35** AA-UI |
| `--ust-accent` | `#A5A2FA` | panel | **7.57** AAA |
| `--ust-accent-solid` / `-hover` / `-active` | `#5D5AE8` / `#6E6BF0` / `#4F4CD9` | — | — |
| `--ust-accent-on` | `#FFFFFF` | accent-solid | **5.13** AA |
| `--ust-accent-soft` / `-text` / `-border` | `#24243A` / `#B7B4FC` / `#37356B` | soft | **7.96** AAA |
| `--ust-success` / `-soft` / `-text` / `-border` | `#5FD3A0` / `#14241E` / `#7FE3B5` / `#21493A` | soft | **10.39** AAA |
| `--ust-warn` / `-soft` / `-text` / `-border` | `#F5B860` / `#26200F` / `#FAC97E` / `#4A3A18` | soft | **10.59** AAA |
| `--ust-danger` / `-soft` / `-text` / `-border` | `#FF9A90` / `#271817` / `#FFA79E` / `#4E2A27` | soft | **9.17** AAA |
| `--ust-info` / `-soft` / `-text` / `-border` | `#8FBBF7` / `#141F2E` / `#9CC4F8` / `#23405E` | soft | **9.22** AAA |
| `--ust-track` | `#2A2D35` | — | — |
| `--ust-focus` / `-halo` | `#8B88F7` / `rgba(139,136,247,.34)` | panel | 5.76 |

Two structural deltas beyond colour:

- **`--ust-sh-inner: inset 0 1px 0 rgba(255,255,255,.055)`** is added to raised surfaces
  (pill, popover) in dark only. Shadows do almost no work on a dark background; a 1px top
  highlight is what actually creates the sense of a lifted plane.
- **Shadows gain a `0 0 0 1px rgba(0,0,0,.55)` contact ring** so the panel separates from a
  dark host page that happens to be a similar value.

### 2.3 Type

System stack only:

```
--ust-font: -apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI",
            system-ui, Roboto, "Helvetica Neue", Arial, sans-serif;
--ust-mono: ui-monospace, SFMono-Regular, "SF Mono", "Cascadia Mono", "Segoe UI Mono",
            Menlo, Consolas, "Liberation Mono", monospace;
```

Six roles plus one micro size. Everything numeric carries `font-variant-numeric: tabular-nums`
so date columns align without a table.

| Role | Class | Size | Weight | Line-height | Tracking | Used for |
|---|---|---|---|---|---|---|
| Panel title | `.uscistr-title` | 13px | 600 | 1.25 | −0.008em | "Case Tracker" |
| Card heading | `.uscistr-card-label` | 13.5px | 600 | 1.35 | −0.008em | Form name, clamped to 2 lines |
| Status title | `.uscistr-status-text` | 13px | 600 | 1.40 | −0.006em | `statusTitle` from the API |
| Body prose | `.uscistr-status-desc` | 12.5px | 400 | 1.55 | 0 | `statusText`, clamped to 3 lines |
| Meta | `.uscistr-field-value` | 11.5px | 400 | 1.45 | 0 | Dates, service center, relative times |
| Section label | `.uscistr-section-title` | 10.5px | 600 | 1.20 | 0.075em, caps | TIMELINE / DOCUMENTS / RAW RESPONSE |
| Mono identifier | `.uscistr-receipt`, `.uscistr-code` | 12px / 9.5px | 500 / 600 | 1.40 | 0.035em / 0.04em | Receipt numbers, event codes |
| Micro | `.uscistr-chip` | 10.5px | 600 | 1.35 | 0.005em | All chips and badges |

Rationale for the compression: at 400px wide with six data blocks per card, a 14px base
would force either scrolling per card or truncation. 12.5px body with 1.55 line-height is
the smallest size that still reads comfortably as *prose* on a 400px measure
(≈ 52 characters per line), and the 1px steps between roles are enough to establish
hierarchy when weight is doing most of the work.

### 2.4 Space

`2 · 4 · 6 · 8 · 10 · 12 · 16 · 20 · 24 · 32` (`--ust-s1` … `--ust-s10`).

| Where | Value |
|---|---|
| Card padding | 12 |
| Gap between blocks inside a card | 10 |
| Gap inside a block (e.g. status title → prose) | 6 |
| Field-grid row gap / column gap | 6 / 12 |
| Header horizontal padding | 12 left, 6 right (icon buttons carry their own) |
| Banner inset from panel edge | 12 horizontal, 10 top |
| Empty state | 32 vertical, 20 horizontal |

### 2.5 Radius

| Token | Value | Applied to |
|---|---|---|
| `--ust-r-xs` | 4px | Event-code chip, focus ring on inline text buttons |
| `--ust-r-sm` | 6px | Chips, receipt button, mark, raw summary row |
| `--ust-r-md` | 8px | Buttons, inputs, icon buttons, doc rows, change notice |
| `--ust-r-lg` | 10px | Banner, popover, raw JSON block |
| `--ust-r-xl` | 14px | The panel |
| `--ust-r-full` | 999px | Pill, badges, progress track, timeline dots |

Nothing sits between these. The rule of thumb: *the radius grows with the size of the thing
it wraps*, so the 14px panel reads as the parent of the 10px banner inside it.

### 2.6 Elevation

| Token | Light | Dark | Used by |
|---|---|---|---|
| `--ust-sh-1` | `0 1px 2px rgba(16,24,40,.06), 0 1px 1px rgba(16,24,40,.04)` | `0 1px 2px rgba(0,0,0,.45)` | Outline button, primary button at rest |
| `--ust-sh-2` | `0 2px 4px -1px …/.07, 0 4px 10px -2px …/.08` | `0 2px 6px rgba(0,0,0,.5)` | Launcher pill, primary button hover |
| `--ust-sh-3` | `0 1px 2px …/.06, 0 8px 16px -6px …/.12, 0 24px 48px -16px …/.20` | contact ring + `0 12px 28px -8px`, `0 32px 64px -24px` | **The panel.** The only level-3 surface on screen. |
| `--ust-sh-pop` | `0 2px 6px …/.08, 0 14px 30px -10px …/.22` | ring + `0 14px 30px -10px rgba(0,0,0,.7)` | Settings popover |

Three-layer shadows (contact + ambient + spread) rather than a single blur — this is most
of what separates "floating application" from "div with a box-shadow".

### 2.7 Motion

| Token | Duration | Easing | Used for |
|---|---|---|---|
| `--ust-d1` | 90ms | `--ust-ease` `cubic-bezier(.2,0,0,1)` | Hover / press feedback on every control |
| `--ust-d2` | 150ms | `--ust-ease` | Chevron rotation, switch knob, chip swap |
| `--ust-d3` | 220ms | `--ust-ease-out` `cubic-bezier(.05,.7,.1,1)` | Popover open, section expand |
| `--ust-d4` | 320ms | `--ust-ease-out` | Panel enter, progress-fill width |

Additional easings: `--ust-ease-in` `cubic-bezier(.3,0,.8,.15)` for exits,
`--ust-ease-spring` `cubic-bezier(.34,1.4,.64,1)` used **only** on the switch knob.

Named animations: `ust-panel-in` (fade + 8px rise + 0.985 scale), `ust-pop-in`,
`ust-spin` (refresh busy state), `ust-ping` (launcher unseen-change ring, 2.4s loop),
`ust-shimmer` (skeleton), `ust-drift` (indeterminate progress stripes).

Nothing animates for longer than 320ms, nothing bounces except a 19px switch knob, and no
motion loops except two ambient indicators — both of which stop under reduced-motion.

---

## 3 · Component specs

Every rule is written as `.uscistr-root .uscistr-thing` (specificity 0,2,0). State classes
use the `uscistr-is-*` convention. Focus is always `:focus-visible`, never `:focus`.

### 3.1 Launcher pill — `.uscistr-pill`

- **Anatomy** — `[mark 18] [label] [count chip]? [unseen dot]?`, `position: fixed`,
  bottom-right 20/20.
- **Sizing** — height 36, padding `0 10 0 8`, gap 6, radius full, 1px `--ust-border-2`,
  `--ust-sh-2`. Label 13px/560.
- **Count chip** `.uscistr-pill-count` — min-width 18, mono 10.5px, `--ust-bg-inset`.
- **Unseen dot** `.uscistr-pill-dot` — 7px accent circle with an `ust-ping` ring (2.4s).
- **States** — hover: `translateY(-1px)`, border → `--ust-border-field`, shadow → level 3.
  Active: `translateY(0) scale(.985)`, shadow → level 1. Focus-visible: 2px ring + halo.
  Disabled: n/a (the pill is always actionable).
- **Dark** — same geometry; the 1px top highlight (`--ust-sh-inner`) is what keeps it from
  looking flat. The mark's indigo gradient is unchanged in both themes and acts as the one
  fixed brand anchor.

### 3.2 Panel chrome — `.uscistr-panel`, `.uscistr-header`, `.uscistr-body`, `.uscistr-footer`

- **Panel** — 400px, `max-width: calc(100vw - 24px)`, `max-height: 85vh`, radius 14,
  1px `--ust-border-2`, `--ust-sh-3`, `overflow: hidden`, flex column. Enter animation
  `ust-panel-in`. `.uscistr-is-dragging` adds an accent contact ring and `user-select: none`.
- **Header** — 46px, `display: grid` `auto 1fr auto`, sticky, `backdrop-filter: blur(14px)
  saturate(180%)` over `--ust-bg-raised`, separated by `inset 0 -1px 0 --ust-border-1`
  (a box-shadow, not a border, so it never shifts layout). `cursor: grab` → `grabbing`.
  Left: 22px mark + title + subtitle (`3 cases · synced 2 min ago`, 10.5px tabular).
  Right: four 28px icon buttons — add, refresh, settings, collapse.
- **Body** — `flex: 1 1 auto; min-height: 0; overflow-y: auto;` with
  **`overscroll-behavior: contain`** so scrolling the panel never chains into the host page.
  Custom scrollbar: 11px track, thumb with a 3px transparent border and
  `background-clip: padding-box` so it reads as a 5px pill.
- **Footer** — 34px, mirrors the header's blur and hairline. Left: lock glyph + "Local only"
  + version. Right: next-check countdown. All 10.5px `--ust-text-3`.
- **Dark deltas** — raised surfaces switch to `#1D1E24` at 84% with the same blur; the
  hairline lightens rather than darkens.
- **Critical constraint** — never apply `transform`, `filter`, `backdrop-filter`, `contain`
  or `will-change` to `.uscistr-root`: any of them makes it a containing block for its
  `position: fixed` children and the panel will jump on drag.

### 3.3 Case card — `.uscistr-card`

- **Anatomy**, top to bottom: header row (form chip + status chip / form name / receipt /
  per-card icon actions) → change notice → status block → field grid → elapsed indicator →
  Timeline section → Documents section → Raw response section → action row.
- **Sizing** — 12px padding, 10px gap between blocks, one hairline bottom
  (`inset 0 -1px 0`, suppressed on `:last-child`). A populated card runs 340–520px tall.
- **Status rail** — a `::before` 2px bar, inset 12px top and bottom, radius `0 999 999 0`.
  Transparent by default; only three states light it up:
  `.uscistr-is-changed` → accent (plus a `--ust-tint-accent` wash across the card),
  `.uscistr-is-attention` → warn, `.uscistr-is-error` → danger.
  `.uscistr-is-closed` merely demotes the heading to `--ust-text-2`.
- **Receipt** `.uscistr-receipt` is a *button*, not a span: mono 12px `+0.035em`, a copy
  glyph that fades in at 12px on hover, inset background on hover. Redacted form
  (`IOE00•••••000`) widens tracking to `0.08em` so the bullets don't clot.
- **States** — hover on the card is a no-op by design (actions are always visible, which
  matters for touch and for screen readers); hover lives on the individual controls.
- **Dark** — the accent wash drops to 7.5% alpha because a light-on-dark tint reads
  stronger; the timeline dot's panel-coloured halo is removed on tinted cards where it
  would otherwise punch a hole in the wash.

### 3.4 Status block — `.uscistr-status-block`

- Title 13px/600 with `text-wrap: balance` (stops a two-word orphan line).
- Prose 12.5px/1.55 `--ust-text-2`, `.uscistr-is-clamped` = 3-line `-webkit-line-clamp`.
- `.uscistr-more` — an inline accent text button ("Show full text"), 11.5px/560, underline
  on hover with `text-underline-offset: 2px`, `--ust-r-xs` focus ring.
- **`statusText` from USCIS contains raw HTML anchors.** It is always inserted with
  `textContent` after tag-stripping; this component deliberately provides no link styling
  inside the prose, so there is no visual affordance tempting an `innerHTML` shortcut.
- When `statusText` is null the block renders a `.uscistr-note` instead — never an empty gap.

### 3.5 Change indicator — `.uscistr-change`

- Grid `auto 1fr auto`: arrow glyph, "**2 changes** since you last looked on Aug 3",
  "Mark seen" ghost button.
- 8px radius, `--ust-accent-soft` fill, `--ust-accent-soft-border`, 11.5px/500 text in
  `--ust-accent-soft-text` (7.40:1). Paired with the accent card rail and wash so the change
  is discoverable from three redundant cues — colour, position, and the word "changes".
- Dark: soft surface becomes `#24243A`, text `#B7B4FC` (7.96:1).

### 3.6 Field grid — `.uscistr-fields`

> **REJECTED in part (v1.7.0).** The grid no longer carries `Filed`, `Status
> updated` or `Record touched`: all three restated dates already stated above
> the fold, and the **"newer than status"** chip described below was the third
> statement of one fact, after the band and its explanation. The backend signal
> is surfaced by `buildBackendNote()` instead. What remains here is Service
> centre and Representative — the rows that are not duplicates.

- `grid-template-columns: max-content minmax(0,1fr)`, `align-items: baseline`, row gap 6,
  column gap 12. Labels 11.5px `--ust-text-3`; values 11.5px `--ust-text-1` tabular.
- Each value can carry a `.uscistr-rel` relative time (`14 months ago`) in `--ust-text-3`
  and an optional chip. The **"newer than status"** accent chip on *Record touched* is how
  the panel surfaces `updatedAtTimestamp > statusDate` — the signal the website never shows.
- Missing values render an em dash with `title="Not returned by USCIS"` and
  `.uscistr-is-empty` (drops to `--ust-text-3`), never `null` or a blank cell.

### 3.7 Elapsed / progress — `.uscistr-progress`

> **REJECTED.** See [SPEC.md](SPEC.md) Conflict 1. The three-variant bar below
> was not built: an elapsed-time fill is a progress bar with no denominator, and
> a person waiting on a decision reads any bar as measuring progress toward one.
> A percentage renders only when USCIS itself published a range for the case,
> and the "Complete" green variant is forbidden by the semantic-colour rule.
> Kept for the reasoning about the 204.

Because `processing_times` returns **204 for every form**, this is an *elapsed* indicator
first and an estimate second. Three variants:

| Variant | Fill | Copy |
|---|---|---|
| Unknown (default) | `.uscistr-is-unknown` — diagonal accent stripes, `ust-drift` 1.6s | "14 months elapsed · no official estimate" + a label naming the 204 |
| Estimated | plain accent fill | "4 months elapsed of an estimated 11" |
| Complete | `.uscistr-is-success` — green, 100% | "Decided · 5 months, 10 days" |

- Head row: bold value + muted qualifier on the left, mono percentage on the right.
- Track 6px, radius full, `--ust-track`. Fill transitions `width` over `--ust-d4`.
- Label 10.5px `--ust-text-3` — always states *where the number came from*.
- The striped fill degrades gracefully: it is built with `color-mix()`, and if that is
  unsupported the whole declaration is dropped and the plain accent fill shows through.

### 3.8 Timeline — `.uscistr-timeline`

- **Anatomy** — a 1px rail (`::before`, inset 10px top/bottom) with 7px dots per row, and a
  `58px | 1fr` grid of date and body.
- Dots carry a 3px halo in the panel colour so the rail appears to pass *behind* them.
  `.uscistr-is-current` → accent fill + a second 5px `--ust-accent-soft` ring.
  `.uscistr-is-good` → success fill (approvals, card produced/mailed).
- Date: mono 10.5px tabular `--ust-text-3`, `white-space: nowrap`.
- Body: text 11.5px `--ust-text-1` (560 weight on the current row), then a meta row holding
  the `.uscistr-code` chip (mono 9.5px, always shown) and a "Latest" chip on the current row.
- **Code-only events** — when `historicalCaseStatuses` gave no text, the row renders the
  community-dictionary guess as `.uscistr-timeline-guess` (10.5px `--ust-text-3`) with an
  automatic `UNOFFICIAL` tag appended via `::after`. The raw code is *never* hidden behind
  a guess. This is a correctness feature expressed as a type treatment.
- Empty: a `.uscistr-note` inside the section, not a collapsed section.

### 3.9 Documents — `.uscistr-doc-row`

`16 | 1fr | auto` grid — file glyph, mono 11px filename with ellipsis truncation, 10.5px
date. Rows extend 8px past the card padding with a negative margin so the 8px hover
background reads as a full-width row. Hover only; no focus state (rows are not interactive
until a download affordance exists — `contentId` is opaque and there is no URL).

### 3.10 Collapsible / raw JSON — `.uscistr-raw-wrap`

- **Summary** — a 26px full-bleed button, grid `12 | 1fr | auto`: chevron (rotates 90° over
  `--ust-d2`), mono endpoint path, HTTP status chip (`200` success / `204` neutral /
  `404` danger). Hover fills `--ust-bg-hover` and lifts the text to `--ust-text-1`.
  Uses `aria-expanded`, and the chevron rotation is bound to that attribute in CSS, so the
  visual and the accessible state cannot drift apart.
- **Body** — `<pre>` 10.5px mono, `--ust-bg-inset`, radius 8, `max-height: 200px`,
  `overflow: auto` with `overscroll-behavior: contain`, and `user-select: text` (the one
  place selection is explicitly enabled — this block exists to be copied).

### 3.11 Buttons

| Variant | Rest | Hover | Active | Disabled |
|---|---|---|---|---|
| `.uscistr-btn-primary` | accent fill, white, `sh-1`, 600 | `--ust-accent-solid-hover`, `sh-2` | `-active`, no shadow, `translateY(.5px)` | opacity .42, `pointer-events: none` |
| `.uscistr-btn-outline` | panel fill, `--ust-border-2`, `sh-1` | `--ust-bg-sunken`, border → field | `--ust-bg-inset`, no shadow | same |
| `.uscistr-btn-ghost` | transparent, `--ust-text-2` | `--ust-bg-hover`, `--ust-text-1` | `--ust-bg-active` | same |
| `.uscistr-btn-danger` | transparent, `--ust-danger-text` | danger-soft fill + border | **solid danger, white text** | same |
| `.uscistr-btn-danger-solid` | solid danger | — | — | — |
| `.uscistr-icon-btn` | 28×28, `--ust-text-3` | `--ust-bg-hover`, `--ust-text-1` | `--ust-bg-active` | opacity .4 |

- Base geometry: 28px tall, `0 10` padding, 6px gap, radius 8, 12px/560, 14px icons.
  `.uscistr-btn-sm` → 24px / `0 8` / 11.5px / radius 6 / 12px icons.
- Danger escalates on press rather than at rest — a destructive control should look calm
  until you commit to it.
- `.uscistr-icon-btn.uscistr-is-on` = toggled (settings open), accent-soft fill.
  `.uscistr-is-busy` spins the glyph via `ust-spin`.
- Dark deltas: `--ust-accent-on` stays white (5.13:1 on `#5D5AE8`); the *danger solid*
  variant flips to near-black text on the lifted salmon, since white on `#FF9A90` is 2.1:1.

### 3.12 Inputs — `.uscistr-input`, `.uscistr-select`, `.uscistr-switch`

- Input/select: 30px tall, radius 8, `1px --ust-border-field` (3.29:1 — required by
  WCAG 1.4.11, and the reason the border is not the same grey as a separator). Hover darkens
  the border to `--ust-text-3`; focus-visible sets the border to accent **and** draws the
  standard ring at `outline-offset: 1px`. `.uscistr-is-invalid` → danger border, paired with
  `.uscistr-field-error` text (never colour alone).
- `.uscistr-mono` on the receipt input adds uppercase + `0.04em` so `IOE0000000000` is
  scannable while typing.
- Select arrow is drawn with two `linear-gradient` triangles in `currentColor` — no image,
  no external asset, and it inherits the theme automatically.
- Switch: 32×19 track, 13px knob, knob transition on `--ust-ease-spring`. Rendered as
  `<button role="switch" aria-checked>`; CSS keys entirely off `[aria-checked="true"]`.
- `.uscistr-add-form` is a `1.15fr 1fr auto` grid on a `--ust-bg-sunken` strip with a
  hairline bottom, so it reads as a tray attached to the header rather than a card.

### 3.13 Chips — `.uscistr-chip`

20px tall, radius 6, 10.5px/600, optional 6px `currentColor` dot. Variants: `-success`,
`-warn`, `-danger`, `-info`, `-neutral`, `-accent`, `-quiet` (transparent + border).
Two specialised siblings:

- `.uscistr-chip-form` — mono 11px, the form type (`I-485`). The one place a code is the
  headline.
- `.uscistr-code` — 16px tall, mono 9.5px, `--ust-text-3`. Deliberately *quieter* than a
  status chip so a wall of event codes doesn't compete with the prose.
- `.uscistr-badge` — 16px pill, accent fill, mono 9.5px, for counts.

### 3.14 Banner — `.uscistr-banner`

- Grid `auto 1fr auto`: icon, title + text, actions. Inset 12px from the panel edge with a
  10px radius so it reads as an object *in* the panel rather than a bar across it.
- Default variant is warning (session expired). `-danger` and `-info` modifiers swap the
  three semantic tokens. The action button inherits `currentColor` for its border and label
  so a single button style works inside all three variants.
- Copy discipline: title states the fact, body states the remedy and the reassurance
  ("Sign in again on this tab and the panel resumes where it left off. Nothing was lost.").
- Dark: hover on the inline button switches from a black wash to a white wash.

### 3.15 Settings popover — `.uscistr-popover`

- `position: absolute` inside the panel (top 42, right 10), 262px, radius 10,
  `--ust-sh-pop`, `transform-origin: top right`, `ust-pop-in` 220ms.
- Rows: `1fr auto` grid, 8px padding, 8px radius, `--ust-bg-hover` on hover; label 12.5px
  `--ust-text-1` with an optional 10.5px `--ust-text-3` description beneath. Separators are
  1px `--ust-border-1` inset 8px.
- Contains: dark appearance, redact receipt numbers, notifications, auto-refresh select,
  export. `role="dialog"` + `aria-label`, opened from an `.uscistr-is-on` icon button.

### 3.16 Empty state — `.uscistr-empty`

Centred column: 40px `--ust-bg-inset` circle with an 18px glyph, 13px/600 title,
12.5px `--ust-text-3` body capped at `30ch`, a primary CTA and a small ghost alternative.
32/20 padding. Copy names the concrete number the panel already knows
("Import 3 cases") rather than a generic "Get started".

### 3.17 Note / micro-empty — `.uscistr-note`

A 1px **dashed** `--ust-border-2` box on `--ust-bg-sunken`, radius 8, 11.5px `--ust-text-3`.
Dashed is the system's single visual synonym for *"there is nothing here, and that is
expected"* — used for absent status prose, absent timelines, and absent estimates. It is
never used for errors, which get `.uscistr-error` or a danger banner.

### 3.18 Footer — `.uscistr-footer`

34px, blurred raised surface, hairline top. Left group carries a lock glyph + "Local only"
+ version — a permanent, unobtrusive restatement of the privacy contract, which is the
single most important thing a user needs to believe about a tool that reads their
immigration case. Right group carries the next-refresh countdown.

---

## 4 · Accessibility

**Focus.** One ring everywhere: `outline: 2px solid --ust-focus; outline-offset: 2px` plus a
`0 0 0 4px --ust-focus-halo` glow. Applied on `:focus-visible` only, so pointer users never
see it and keyboard users always do. `:focus` is explicitly zeroed to prevent doubled rings.
The halo means the ring survives on both `--ust-bg-panel` and `--ust-bg-inset`. Every
interactive element is a real `<button>`, `<input>` or `<select>` — including the receipt
number and the collapsible summaries — so focus order and activation are free.

**Contrast.** Every text token meets AA against every surface it is specified to sit on
(tables in §2.1–2.2; lowest value in the system is 4.93:1). Form-control and switch borders
meet the 3:1 non-text requirement (1.4.11) — this is why `--ust-border-field` is a distinctly
darker grey than `--ust-border-2`. Status is never encoded by colour alone: every status chip
pairs a hue with a word, the timeline pairs dot colour with a code chip, and invalid inputs
pair a red border with `.uscistr-field-error` text.

**Hit targets.** Icon buttons are 28×28 with the visual glyph at 15px. That is under the
44px AAA target and is a deliberate, bounded trade for a 400px dense panel; it satisfies
WCAG 2.2 **2.5.8 Target Size (Minimum, AA)** at 24×24 with clear spacing. Every icon-only
action is duplicated as a labelled button in the card action row (Refresh / Copy summary /
Remove), so no function is reachable *only* through a small target. Small buttons are 24px,
never less.

**Reduced motion.** `@media (prefers-reduced-motion: reduce)` forces
`animation-duration: 1ms`, `animation-iteration-count: 1` and `transition-duration: 1ms`
across the whole subtree with `!important`, and additionally removes the pill's hover lift
and the button press translate. The two looping indicators (launcher ping, indeterminate
progress stripes) stop; the information they carry is also present as text and as a count
chip, so nothing is lost.

**Screen readers.**

- Panel is `role="complementary"` with `aria-label="USCIS case tracker"` — it is
  supplementary to the page, and is announced as such rather than as a dialog that traps.
- Every icon button carries both `title` and `aria-label`; every inline SVG is
  `aria-hidden="true"` `focusable="false"`.
- Collapsibles use `aria-expanded`; the chevron rotation is driven **from** that attribute
  in CSS, so state and presentation cannot desynchronise.
- The switch is `role="switch"` with `aria-checked`, styled from the same attribute.
- The banner is `role="status"` (polite) — a session expiring should not interrupt.
- `.uscistr-sr` is available for visually-hidden text (e.g. expanding `NBC` to
  "National Benefits Center", or announcing "unofficial, community-sourced label" next to a
  guessed event code).
- The `UNOFFICIAL` tag on guessed timeline labels is generated by `::after` content. Generated
  content is read by current screen readers, but the accessible name should not depend on it —
  attach the qualification to the row's `title`/`aria-label` as well.

**Forced colours.** `@media (forced-colors: active)` restores 1px `CanvasText` borders on the
panel, pill, cards and chips (which would otherwise vanish once backgrounds are stripped) and
switches focus rings to `Highlight`.

**Density.** Nothing in the sheet uses a fixed `px` height for a text container, so a user
raising their browser's minimum font size grows the panel rather than clipping it. The panel's
`max-height: 85vh` plus internal scroll means it can never exceed the viewport.

---

## 5 · Integration notes

### 5.1 Cascade contract (host-CSS immunity)

Four layers, in sheet order:

1. **`.uscistr-root { all: initial }`** severs every inherited property at the boundary in one
   declaration. `all` does *not* affect custom properties, so the token block in the same rule
   survives; `direction` is exempt from `all`, so it is reset explicitly.
2. **A universal descendant reset** neutralises ~40 properties a host stylesheet commonly hands
   down. It is deliberately *not* `!important` so component rules can win normally.
3. **Every component rule uses ≥ 2 classes** (0,2,0), which outranks the reset and effectively
   any host selector short of `!important`.
4. Two carve-outs the reset must respect, both learned the hard way:
   - **Sizing is reset in a separate rule that excludes SVG subtrees**
     (`*:not(svg):not(svg *)`). In SVG 2, `width`/`height` are geometry properties, so a blanket
     `width: auto` resolves to `0` and silently collapses every `<rect>`.
   - **Icon paint must be declared in CSS, not as `fill=`/`stroke=` attributes.** Presentation
     attributes lose to any author rule, so the `svg *` host-defence would blank the icons out.
     Icons carry `.uscistr-ico`; the product mark sets its gradient fill via inline `style`
     (inline beats the reset).

The one unguarded hole is a host `!important` rule on a bare tag (`p { color: red !important }`).
The correct fix is **Shadow DOM**: this sheet is written to work unchanged inside one — no
`:root` selectors, no reliance on page inheritance, all tokens on `.uscistr-root`. If the
injector ever calls `attachShadow({ mode: 'open' })` and puts the `<style>` plus the panel
inside, layers 1–3 become redundant belt-and-braces and the panel becomes genuinely
unreachable from the host. Until then, a build flag that mechanically appends `!important`
to every declaration is the fallback of last resort.

The mockup ships an **"Inject hostile host CSS"** toggle that applies an aggressive host
stylesheet (Comic Sans, uppercase, dotted borders, floats, lime shadows, 3× line-height) so
the immunity can be verified rather than asserted.

### 5.2 Never break the page

- `.uscistr-root` is a zero-size `position: fixed` anchor with **`pointer-events: none`**;
  only the pill and panel re-enable pointer events. Clicks pass through everywhere else.
- `z-index: 2147483647` plus `isolation: isolate`.
- `overscroll-behavior: contain` on the panel body and the raw JSON blocks, so a scroll
  gesture inside the panel never chains into the host document.
- No global selectors, no styles on `body`/`html`, no `@font-face`, no external requests.

### 5.3 Class contract

The sheet is a superset of the class names already used by the core file, so it can be
dropped in with additive markup changes only. New classes introduced here:

`uscistr-ico` · `uscistr-brand` · `uscistr-titles` · `uscistr-subtitle` · `uscistr-body` ·
`uscistr-mark` · `uscistr-pill-count` · `uscistr-pill-dot` · `uscistr-pill-mark` ·
`uscistr-btn-primary` · `uscistr-btn-outline` · `uscistr-btn-ghost` · `uscistr-btn-danger-solid` ·
`uscistr-chip` (+ `-success` `-warn` `-danger` `-info` `-neutral` `-accent` `-quiet` `-form`) ·
`uscistr-code` · `uscistr-receipt` · `uscistr-card-eyebrow` · `uscistr-change` ·
`uscistr-status-row` · `uscistr-more` · `uscistr-rel` · `uscistr-note` · `uscistr-section` ·
`uscistr-timeline-body` · `uscistr-timeline-meta` · `uscistr-timeline-guess` ·
`uscistr-doc-name` · `uscistr-doc-date` · `uscistr-raw-summary` · `uscistr-raw-path` ·
`uscistr-empty-icon` · `uscistr-empty-title` · `uscistr-empty-text` · `uscistr-popover-label` ·
`uscistr-popover-desc` · `uscistr-popover-sep` · `uscistr-banner-body` · `uscistr-banner-title` ·
`uscistr-banner-text` · `uscistr-banner-actions` · `uscistr-switch` · `uscistr-select` ·
`uscistr-field` · `uscistr-field-hint` · `uscistr-field-error` · `uscistr-footer-left/right/sep` ·
`uscistr-sr` · `uscistr-skeleton` · `uscistr-truncate` · `uscistr-link`

State classes: `uscistr-is-changed` `-closed` `-attention` `-error` `-current` `-good`
`-clamped` `-empty` `-redacted` `-invalid` `-on` `-busy` `-dragging` `-success` `-unknown`.

Retained from the existing core with the same meaning: `uscistr-root` `uscistr-dark`
`uscistr-panel` `uscistr-header` `uscistr-title` `uscistr-header-actions` `uscistr-icon-btn`
`uscistr-banner` `uscistr-add-form` `uscistr-input` `uscistr-mono` `uscistr-btn`
`uscistr-btn-small`→`uscistr-btn-sm` `uscistr-btn-danger` `uscistr-empty` `uscistr-case-list`
`uscistr-card` `uscistr-card-header` `uscistr-card-title` `uscistr-card-label`
`uscistr-card-actions` `uscistr-card-footer` `uscistr-muted` `uscistr-small` `uscistr-error`
`uscistr-status-block` `uscistr-status-text` `uscistr-status-desc` `uscistr-progress`
`uscistr-progress-track` `uscistr-progress-fill` `uscistr-progress-label`
`uscistr-section-title` `uscistr-timeline` `uscistr-timeline-row` `uscistr-timeline-date`
`uscistr-timeline-text` `uscistr-documents` `uscistr-doc-row` `uscistr-fields`
`uscistr-field-label` `uscistr-field-value` `uscistr-raw` `uscistr-raw-wrap` `uscistr-popover`
`uscistr-popover-row` `uscistr-footer` `uscistr-version` `uscistr-hidden-file` `uscistr-pill`
`uscistr-pill-label` `uscistr-badge`.

Superseded but **kept as working aliases** in §18 of the sheet, so the CSS is drop-in against
the core file as it stands today and the markup can migrate incrementally:
`uscistr-btn-small` (→ `uscistr-btn-sm`), `uscistr-card-number` (→ `uscistr-receipt`),
`uscistr-tag` / `-uscis` / `-detected` (→ `uscistr-chip-*` and `uscistr-code`),
`uscistr-checkbox-row` (→ `uscistr-popover-row` + `uscistr-switch`), `uscistr-badge-btn`,
`uscistr-version`. Delete that block once the markup is fully migrated.

---
## 6 · The stylesheet

**Superseded.** This section used to carry a complete copy of the stylesheet,
described as byte-identical to the mockup. It stopped being the shipped
stylesheet in v1.5.1, when the styles were extracted to their own file, and
around 1,350 lines of it were left here describing rules that had since been
changed, retuned or deleted.

The stylesheet that actually ships is **[`core/uscis-style.js`](../../core/uscis-style.js)**,
and it is the only copy. `node scripts/build.js --check` proves the file in the
extensions and the userscript is built from it; `node scripts/css-check.js`
guards it against orphaned declarations.

The token system in §2 above is still accurate and still the reference for
colour, type, space and motion. The component notes in §3 describe intent
rather than current CSS — read them for why a component looks the way it does,
not for what its rules are.
