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

Neon Postgres holds everything that does not need to be on chain, and Clerk handles auth. There
is still no backend: the browser talks to Postgres directly over HTTP, and **Neon RLS** enforces
authorisation inside the database using the Clerk JWT.

`neon/schema.sql` is the whole setup — run it against a fresh Neon project with the
**`neondb_owner`** connection string. It creates the `authenticated` and `anonymous` roles itself
if the Neon console has not already made them, so the order of setup steps does not matter.

| Table | What it holds |
| --- | --- |
| `profiles` | name, sector, linked wallet, role flags |
| `problems` | title, description, photo, cost, status, contractor, tx hashes |

How the authorisation actually works:

1. Clerk issues a JWT for the signed-in user.
2. The Neon serverless driver sends that JWT with every query.
3. `pg_session_jwt` verifies it against Clerk's JWKS and exposes `auth.user_id()` in SQL.
4. RLS policies and guard triggers decide what that user may read and write.

### Why the keys sit in `config.js` and not `.env`

This is a static site. There is no server, so there is no `.env` at runtime — anything the browser
needs, the browser can display. (A build step does not change this; it only inlines the value into
the bundle, where anyone can still read it.) So the question is never *where to hide a value*, it
is *whether the value is safe to be public*.

Two values ship to the browser, and both are designed for it:

- **`CLERK_PUBLISHABLE_KEY`** (`pk_...`) identifies your Clerk instance and grants nothing. Clerk
  puts it in a `<script>` tag on every site that uses them. The **secret** key (`sk_...`) is a
  different value and never touches the frontend.
- **`DATABASE_URL`** uses Neon's **passwordless `authenticated` role** — there is no credential in
  the string. Without a valid Clerk JWT, `auth.user_id()` is null and every RLS policy denies the
  query. It is an address, not a key.

The values that *are* secret stay in `.env` and never reach the browser: `DATABASE_OWNER_URL`
(full privileges), `BLOB_READ_WRITE_TOKEN`, `ETHERSCAN_API_KEY`, and the deploy key, which lives
in the Foundry keystore rather than a file at all.

The honest trade-off: because the endpoint is public, anyone can send queries at it — RLS is the
only thing stopping them. That is the same model Supabase uses, and it means the policies in
`neon/schema.sql` are load-bearing. If you would rather not expose the endpoint at all, move the
queries behind Vercel functions in `api/` so only the server holds the connection string; you lose
the no-backend property but gain a second layer.

- profiles are created on first sign-in with `is_admin` forced to false
- role flags can only be changed by an admin, enforced by a trigger
- residents can insert problems only in Draft, only for themselves
- contractors can edit the remark on their own jobs and move a job to Completion Voting
- everything else is admin only

Photos go to Vercel Blob through `api/upload.js`, which verifies the Clerk JWT and refuses any
upload path that does not belong to the caller.

### Why not Supabase

The free tier allows two active projects and pauses a project after 7 days of inactivity, which
needs a manual restore from the dashboard — fatal for a portfolio project someone opens months
later. Neon allows 100 projects and only suspends compute, which resumes automatically on the
next query.

### Demo data

```bash
npm install
DATABASE_OWNER_URL=... npm run seed
```

14 issues across the five sectors at various lifecycle stages. Every row is flagged `is_demo` and
renders with a Demo badge, so nothing here can be mistaken for a real municipal record.

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

# database
psql $DATABASE_OWNER_URL -f neon/schema.sql
npm install && npm run seed

# frontend, any static server works
python3 -m http.server 8000
open http://localhost:8000/frontend/html/index.html
```

Fill in `CLERK_PUBLISHABLE_KEY` and `DATABASE_URL` (the `authenticated` role string) in
`frontend/js/config.js`, and point your Clerk instance at Neon RLS as its JWT provider.

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
neon/             schema, RLS policies, triggers
api/              Vercel function for authenticated photo uploads
scripts/          demo data seeder
frontend/
  html/           one page per role
  css/            ui.css is the design system, then landing / app / auth
  js/
    lib/          auth, db, session, wallet, dom, ui, theme, format
    pages/        one module per page
    abis/         generated from forge output
classifier/       YOLO based issue detection, writes to Supabase
```

---

## Stack

Vanilla JS with ES modules, no build step. Ethers v5. Solidity 0.8.19 on Sepolia. Neon Postgres with
RLS, Clerk for auth, Vercel Blob for photos. Foundry for contracts. OpenCV and YOLOv8 for the
classifier.

---

## Known gaps

- The classifier still writes to Supabase and to a `civic_issues` table, while the app now reads
  `problems` on Neon. The two halves are not wired together, and the classifier stores local file
  paths rather than uploaded URLs.
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
