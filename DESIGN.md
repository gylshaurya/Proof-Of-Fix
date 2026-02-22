# Design

Recorded from the built interface, not from intention. `frontend/css/ui.css` is the source of
truth; this file explains it.

## World

Deep charcoal ground, a single cyan accent, soft radial glows and hairline-bordered raised
surfaces. Chosen by the user as the standing canon exit from a concept-led direction, calibrated
against safe.global as the pinned reference. No thematic or conceptual layer — this reads as a
modern product, and future work should not reopen that with a concept round.

The one idea the surface owns: **money that provably cannot move** is demonstrated in the first
viewport (a real escrow split with a locked half and a live vote), never claimed in a headline.

## Colour

Semantic colour is not decoration here — it *is* the problem lifecycle, and the same six values
carry status from the landing page through every dashboard.

| Token | Dark | Light | Meaning |
| --- | --- | --- | --- |
| `--accent` | `#22d3ee` | `#0891b2` | Primary action, and status 1 (Voting) |
| `--warn` | `#fbbf24` | `#a16207` | Status 2 (Under progress), deadlines |
| `--info` | `#a78bfa` | `#6d43d4` | Status 3 (Completion voting) |
| `--ok` | `#34d399` | `#067a55` | Status 4 (Completed), released funds |
| `--bad` | `#f87171` | `#c0392f` | Status 5 (Failed), rejections |
| `--text-muted` | `#828890` | `#7c8794` | Secondary text — AA-verified on every ground |

Strategy is **restrained**: neutrals plus one accent. Dark is the default because the reference
is dark; light is a designed peer, not an afterthought, and both are verified.

Grounds step `--bg` → `--surface` → `--surface-raised` → `--surface-hover`. Borders are always
`--line`, escalating to `--line-strong` on hover or for emphasis.

## Type

Archivo for everything, JetBrains Mono for anything on-chain (addresses, hashes, ETH amounts,
contract names). Mono is a signal that a value came from the chain rather than the database.

Scale, deliberately snapped to distinct steps: 12 · 13 · 14 · 15 · 17 · 20 · 24, then fluid
`clamp()` for display sizes. Headings run 700–800 weight at `-0.03em` to `-0.042em` tracking;
body sits at 15px/1.6.

## Motion

`--fast` 140ms for state, `--mid` 260ms for surfaces, `--slow` 520ms for entrances, all on
`cubic-bezier(0.22, 1, 0.36, 1)`.

- `.rise` with `.rise-1…6` staggers the first viewport on load.
- `.reveal` + IntersectionObserver brings sections in on scroll, capped at a 280ms stagger.
- Bars and tallies animate `transform: scaleX()`, never `width` — no layout thrash.
- Everything collapses under `prefers-reduced-motion: reduce`.

## Components

`ui.css` carries the system: `.btn` (+ `-ghost`, `-quiet`, `-danger`, `-lg`, `-sm`, `-block`),
`.card`, `.badge` + `.status-0…5`, `.chip`, `.field`, `.label`, `.notice`, `.toast`, `.sheet`,
`.skeleton`, `.empty`, `.tx-list`, `.glow`.

`app.css` composes them into the app shell: `.app-bar`, `.page`, `.metrics`/`.metric`,
`.identity`, `.issue-card`, `.detail` two-column with a sticky aside, `.panel`, `.stat-rows`.

`landing.css` and `auth.css` are surface-specific and own nothing reusable.

## Rules that are easy to break

- Buttons need `text-decoration: none` — they are often `<a>`.
- Anything on-chain is mono; anything in rupees is not.
- Amounts show in rupees for residents and ETH wherever a wallet is involved. Never substitute
  one for the other silently.
- Demo content carries a visible "not a real municipal record" label.
- A pending transaction must show all three states: about to happen, happening, happened + tx link.

## Known detector findings, accepted

`radial-spotlight-glow`, `gpt-thin-border-wide-shadow` and `dark-glow` are the pinned reference
aesthetic and are kept deliberately. `repeating-stripes-gradient` is the hatching on locked
escrow funds — semantic, not decorative. `flat-type-hierarchy` and `cramped-padding` are
heuristics tuned for marketing pages; the app UI legitimately needs adjacent 13/14/15 steps, and
horizontal padding comes from `.shell` rather than the section.
