# Design

Proof of Fix uses a restrained civic product interface built around white editorial space, deep green action surfaces, warm stone panels, and precise information hierarchy. The interface should feel calm and operational. It explains the state of public work without presenting every piece of information as a card.

## Colour

- `#ffffff` is the default canvas.
- `#212121` is the primary text colour.
- `#003c33` is the main action colour and the dark lifecycle surface.
- `#eeece7` is the warm secondary surface for grouped information.
- `#e5e7eb` and `#d9d9dd` are the standard rules and borders.
- Green, amber, violet, and red are reserved for lifecycle and result states.

Dark mode is supported as an alternative. Light mode is the default. Dark mode uses green-black neutrals (`#0c0f0e` canvas, `#111514` surfaces) with a sage accent `#7fd1a8` and a `#12382d` lifecycle surface, so it reads as the same product rather than a separate cyan theme. The theme is set by an inline script in each page's `<head>` before CSS paints.

## Type

Archivo is used for product and interface text. JetBrains Mono is reserved for values that come from the chain, including addresses, hashes, issue fingerprints, and ETH amounts. Rupee amounts and ordinary database values remain in the interface typeface.

Hierarchy comes from size, spacing, and surface contrast rather than heavy weights. Large display type is reserved for landing pages. Operational pages use compact headings and readable 14px to 16px body text.

## Layout

Use open space and horizontal rules before adding another container. Major summaries may use a 12px to 16px radius. Small controls may use pills. Avoid nested cards, decorative shadows, and broad warning boxes.

The issue page has three layers:

1. The report and its current lifecycle state.
2. The single action relevant to that state.
3. Supporting funding, voting, and chain evidence.

On mobile, the supporting column follows the action and all controls remain at least 44px high.

## Interaction

- MetaMask prompts appear only beside an action that requires signing.
- Reading reports and public chain history never requires MetaMask.
- Pending actions say what the wallet is waiting for.
- Confirmed transactions become a compact receipt with a Sepolia Etherscan link.
- Voting credits remain visible near the resident identity and inside the active voting context.
- Controls that do not apply to the current lifecycle stage are not rendered.
- Focus, disabled, loading, empty, error, and success states must remain visually distinct.

## Product language

Use direct labels that explain what a value refers to. Say `Sepolia issue fingerprint`, `Voting credits`, `Estimated repair cost`, and `Completion vote` instead of generic technical labels. Do not use promotional claims, emojis, em dashes, or unexplained blockchain terminology.
