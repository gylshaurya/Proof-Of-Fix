# Proof Of Fix

Civic infrastructure repair, funded and verified on chain.

[Demo video](https://vimeo.com/1158035342?fl=pl&fe=sh)

Residents report local problems, vote on which one matters most, and the winning issue gets
funded through an escrow contract. The contractor is paid half up front. The rest is locked
until the people who live there vote that the work was actually done.

---

## Why

Public works spending is hard to audit from the outside. You rarely know which problems were
prioritised, who got paid, or whether the work happened. Proof Of Fix puts the three decisions
that matter most on a public chain:

- which problem gets funded (quadratic vote)
- when money moves (escrow contract)
- whether the job was finished (completion vote)

Everything else stays in Postgres, because putting descriptions and photos on chain is expensive
and pointless.

---

## How it works

```
resident reports a problem
        |
        v
government opens voting for the locality
        |
        v
residents spend credits, quadratically
        |
        v
highest voted problem wins, moves to Under Progress
        |
        v
treasury escrows the budget, contractor gets 50%
        |
        v
contractor marks the work done
        |
        v
residents vote: is it fixed?
        |
   +----+----+
   |         |
approved   rejected
   |         |
   v         v
remaining  remaining
paid to    returned to
contractor treasury
```

### Quadratic voting

Every resident gets 100 credits per round. Votes on a single problem cost the square of the
total, so the marginal vote keeps getting more expensive.

| Votes on one problem | Credits spent |
| --- | --- |
| 1 | 1 |
| 2 | 4 |
| 3 | 9 |
| 5 | 25 |
| 10 | 100 |

You can spread votes across several problems or concentrate them on one, but you cannot do both.
Credits refill only when the government starts a new round, so spending everything is a real
decision.

### Escrow

`Treasury.createEscrow` takes the full budget and immediately forwards half to the contractor.
The remainder stays locked until `finalize` reads the outcome from `Voting`:

- **Completed** — remaining balance goes to the contractor
- **Failed** — remaining balance goes back to the government wallet

`finalize` can only run once per problem and refuses to run while voting is still open.

---

## Contracts

Both contracts are in `contracts/`, built and tested with Foundry.

**Voting.sol** holds the problem lifecycle, credit accounting and both votes.

```solidity
enum Phase { InitialVoting, UnderProgress, CompletionVoting, Completed, Failed }
```

- phase transitions are `onlyOwner`, except `startCompletionVoting`, which the assigned
  contractor may also call
- completion voting has a 3 day window and a configurable quorum
- a contractor cannot vote on their own work
- credits are scoped to a round, so spending to zero does not top you back up
- every state change emits an event, so the whole history is queryable

**Treasury.sol** holds the money.

- payouts use `call` rather than `transfer`, so contract wallets and multisigs work
- `lockedBalance` tracks escrowed funds separately from anything else sent to the contract
- `sweep` can only withdraw the unlocked remainder
- reentrancy guard on every function that moves value

```bash
forge test
```

```
23 tests passed
```

### Deploying

Your private key is never written to disk in plaintext. Import it once into Foundry's encrypted
keystore, then deploy by name:

```bash
cast wallet import deployer --interactive     # paste key once, set a password
cast wallet list                              # confirm it is there

cp .env.example .env                          # RPC url and etherscan key only
forge script script/Deploy.s.sol \
  --rpc-url sepolia --broadcast --verify \
  --account deployer --sender <your-address>

node script/sync-frontend.js
```

The keystore lives in `~/.foundry/keystores`, encrypted with scrypt + aes-128-ctr, and forge
prompts for the password at deploy time. `GOVERNMENT_ADDRESS` in `.env` is optional and defaults
to the deploying address. If you use a hardware wallet, swap `--account` for `--ledger`.

`sync-frontend.js` reads the broadcast output, writes the new addresses and deploy block into
`frontend/js/config.js`, and regenerates both ABIs from `out/`. Nothing to copy by hand.

---

## Database

Supabase handles auth and everything that does not need to be on chain. `supabase/schema.sql`
is the whole setup — run it in the SQL editor of a fresh project.

| Table | What it holds |
| --- | --- |
| `profiles` | name, locality, linked wallet, role flags |
| `problems` | title, description, photo, cost, status, contractor, tx hashes |

Row level security is on for both tables:

- a profile row is created by a trigger on signup, so `isAdmin` can never be set by the client
- role flags can only be changed by an admin
- residents can insert problems only in Draft, only for themselves
- contractors can edit the remark on their own jobs and move a job to Completion Voting
- everything else is admin only, enforced by a trigger rather than trusting the client

Photos go to the `problem-images` storage bucket, one folder per user.

---

## Wallet linking

A Supabase account and a wallet are linked one to one. `profiles.wallet` is unique, so the same
address cannot be attached to two accounts, and the app checks that the connected wallet matches
the linked one before it will send a transaction.

This is the honest limit of the current design: it stops one person casually voting from five
browser profiles, but it is not identity. A determined attacker with five email addresses and
five wallets still gets five votes. Real sybil resistance needs an off-chain check that this
project does not have.

---

## Running it

```bash
# contracts
forge install
forge test

# frontend, any static server works
python3 -m http.server 8000
open http://localhost:8000/frontend/html/index.html
```

You need MetaMask on Sepolia and some test ETH. The app checks the network and offers to switch
if you are on the wrong one.

Deployed on Vercel as a static site. `vercel.json` maps `/` to the landing page and adds short
paths for `/login`, `/signup`, `/app`, `/admin` and `/contractor`.

```bash
npx vercel --prod
```

The classifier is a separate batch job:

```bash
cd classifier
pip install -r requirements.txt
python classifier.py
```

---

## Layout

```
contracts/        Voting.sol, Treasury.sol
test/             Foundry tests
script/           deploy script
supabase/         schema, RLS policies, triggers
frontend/
  html/           one page per role
  css/            ui.css is shared, one file per page
  js/
    lib/          dom, ui, session, wallet, format helpers
    pages/        one module per page
    abis/         generated from forge output
classifier/       YOLO based issue detection, writes to Supabase
```

---

## Stack

Vanilla JS with ES modules, no build step. Ethers v5. Solidity 0.8.19 on Sepolia. Supabase for
auth, Postgres and storage. Foundry for contracts. OpenCV and YOLOv8 for the classifier.

---

## Known gaps

- The classifier writes to `civic_issues`, but the app reads `problems`. The two halves are not
  wired together yet, and the classifier stores local file paths rather than uploaded URLs.
- Detection accuracy is unmeasured. The dataset filenames encode the true category, so scoring
  it is the obvious next step.
- Voting costs the resident gas. Meta-transactions would remove the biggest adoption blocker.
- The government role is a single EOA. It should be a multisig.

---

## Next

- score the classifier against the labelled filenames and fix what the numbers show
- connect the classifier output into `problems` with real image uploads
- before/after photo comparison to support the completion vote
- contractor stake, slashed when work is rejected
- contractor bidding and a reputation score
