# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Three roles, all in the same locality (the app is scoped by "Sector 1" through "Sector 5"):

- **Residents** report local infrastructure problems, spend a fixed budget of voting credits to
  prioritise one, and later vote on whether the repair actually happened.
- **Contractors** see the jobs funded to their wallet, post work updates, and mark work complete.
- **The government / admin wallet** opens voting rounds, picks the winning problem per locality,
  funds the escrow, and settles it once residents have voted.

The surface's evaluating audience is recruiters and hackathon judges opening the deployed link
cold: they need to understand the mechanism and see that it is real, working software within
about thirty seconds.

## Product Purpose

Public works spending is hard to audit from the outside. Residents rarely know which problems
were prioritised, who was paid, or whether the work happened. Proof Of Fix puts exactly the three
decisions that matter on a public chain: which problem gets funded, when money moves, and whether
the job was finished. Everything descriptive stays in Postgres because on-chain storage is
expensive and pointless.

## Positioning

The escrow is the argument. Half the budget is released to the contractor immediately; the rest is
locked in a Treasury contract and can only move after residents cast a completion vote. Approval
pays the contractor, rejection returns the money to the treasury. No competitor claim about
"transparency" substitutes for money that provably cannot move without a public vote.

## Operating Context

The full lifecycle, which the interface has to make legible:

1. Resident reports a problem (title, description, estimated cost, optional photo), status Draft.
2. Admin opens voting for a locality.
3. Residents spend credits quadratically; N votes on one problem costs N squared credits.
4. Admin closes voting; highest on-chain vote total in that locality wins and moves to Under Progress.
5. Admin assigns a contractor wallet and funds the escrow; 50% is released immediately.
6. Contractor posts updates and marks work complete, opening a 3-day completion vote.
7. Residents vote solved / not solved. A quorum and a majority are both required.
8. Admin settles: approved releases the remainder to the contractor, rejected returns it.

Every state change is a MetaMask transaction on Sepolia and takes real seconds to confirm, so
pending, confirming, and confirmed are first-class interface states, not edge cases.

## Capabilities and Constraints

- Vanilla HTML, CSS and ES modules with no build step; deployed as static files on Vercel.
- Ethers v5 from a CDN; Sepolia testnet; MetaMask required for any write.
- Credits reset only when the admin starts a new round, so spending them is a real decision.
- One wallet is linked to one account; the app refuses to transact from a different wallet.
- Residents need testnet ETH for gas, which is the largest real adoption barrier.
- Terminology to preserve: locality, credits, escrow, advance, completion voting, quorum, round.
- The image classifier writes to a separate table and is not yet wired into the app.

## Brand Commitments

Name is "Proof Of Fix".

Standing visual preference, chosen by the user over a concept-led direction: no thematic or
conceptual world. The surface should read as a simple, good-looking, professional and mature
product with smooth animation, not as an homage to any artifact, era or competitor. Future work
inherits this preference and should not reopen it with a concept round.

## Evidence on Hand

- Working Solidity contracts with 23 passing Foundry tests.
- Sample civic photographs under `classifier/dataset_mock/`, organised by sector, covering
  potholes, waterlogging, garbage, fallen trees and traffic.
- A demo video at https://vimeo.com/1158035342
- No real users, no real spending figures, no partnerships or endorsements. Demo content is to be
  authored and labelled as demo data; none of it may be presented as a real municipal record.

## Product Principles

1. The escrow is the story. Show money that cannot move rather than claiming transparency.
2. Make the cost of a vote visible before it is spent; quadratic pricing is the mechanism.
3. Every on-chain action is slow and irreversible, so the interface must always say what is
   about to happen, what is happening, and what happened, with a link to the transaction.
4. Never imply the AI verifies completion. Residents verify completion.
5. Demo content is labelled demo content.

## Accessibility & Inclusion

Keyboard reachable throughout, visible focus, and status messages announced rather than only
coloured. Amounts appear in rupees for residents and in ETH wherever a wallet is involved, never
one silently standing in for the other.
