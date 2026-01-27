# Proof Of Fix

[Demo Video](https://vimeo.com/1158035342?fl=pl&fe=sh)

## Decentralized Civic Accountability Through Blockchain Governance

Proof Of Fix is a decentralized application that enables communities to identify, prioritize, fund, and verify local infrastructure problems using blockchain.

The platform combines:

- Public goods governance
- Quadratic voting
- Escrow based contractor payments
- Citizen verification
- Transparent on chain fund tracking

The goal is to create a transparent and community driven civic accountability system.

---

# Problem Statement

Public infrastructure systems often suffer from:

- Lack of transparency
- Corruption in contractor payments
- No citizen participation
- No verification of completed work
- Misuse of public funds

Citizens usually cannot verify:
- Which problems are prioritized
- Where funds are going
- Whether contractors actually completed the work

---

# Solution Overview

Proof Of Fix creates a decentralized workflow:

1. Citizens report problems
2. Citizens vote on issues
3. Highest priority problem is selected
4. Funds are locked in escrow
5. Contractor receives advance payment
6. Citizens verify completion
7. Remaining funds are released only after approval

Blockchain acts as:
- A governance layer
- A public audit system
- A decentralized escrow system

---

# Core Blockchain Concepts Used

## 1. Quadratic Voting

Citizens vote using limited credits.

Voting cost increases quadratically:

```text
cost = votes²
```

Example:

| Votes | Cost |
|---|---|
| 1 | 1 |
| 2 | 4 |
| 3 | 9 |
| 5 | 25 |

This prevents vote monopolization and spam voting.

---

## 2. Escrow Smart Contracts

Funds are locked inside a Treasury contract.

Workflow:
- 50% advance released initially
- Remaining funds locked
- Final release happens only if citizens approve completion

This removes blind trust from the system.

---

## 3. On Chain Governance

All critical actions are stored on blockchain:

- Votes
- Problem phase transitions
- Completion approvals
- Escrow releases
- Contractor payments

This makes the system transparent and verifiable.

---

# System Architecture

```text
+----------------------+
|      Frontend        |
| Vanilla + Ethers.js  |
+----------+-----------+
           |
           v
+----------------------+
|    MetaMask Wallet   |
+----------+-----------+
           |
           v
+----------------------+
|     Voting.sol       |
| Governance Contract  |
+----------+-----------+
           |
           v
+----------------------+
|    Treasury.sol      |
| Escrow + Payments    |
+----------+-----------+
           |
           v
+----------------------+
|    Sepolia Network   |
+----------------------+

           ^
           |
+----------------------+
|      Supabase        |
| Auth + Database      |
+----------------------+
```

---

# Workflow

```text
Citizen Reports Problem
            |
            v
Citizens Vote Using Credits
            |
            v
Highest Voted Problem Selected
            |
            v
Treasury Creates Escrow
            |
            v
Advance Payment Released
            |
            v
Contractor Completes Work
            |
            v
Completion Voting Starts
            |
      +-----+-----+
      |           |
      v           v
 Approved      Rejected
      |           |
      v           v
Final Payment   Funds Retained
Released
```

---

# Smart Contracts

## Voting.sol

Responsible for:
- Quadratic voting
- Problem lifecycle management
- Completion voting
- Vote tracking
- Community verification

### Problem Lifecycle

```solidity
enum Phase {
    InitialVoting,
    UnderProgress,
    CompletionVoting,
    Completed,
    Failed
}
```

### Quadratic Voting Logic

```solidity
uint256 cost = (newTotal * newTotal) - (currentVotes * currentVotes);
```

### Double Voting Prevention

```solidity
require(userVotes[msg.sender][id] == 0, "already voted");
```

---

## Treasury.sol

Responsible for:
- Escrow management
- Advance contractor payments
- Final payment release
- Retaining funds if work fails

### Escrow Structure

```solidity
struct Escrow {
    address contractor;
    uint256 total;
    uint256 released;
    bool exists;
}
```

### Advance Release

```solidity
uint256 advance = msg.value / 2;
```

### Final Settlement

Treasury checks the result from Voting.sol before releasing funds.

---

# Frontend to Blockchain Connection

The frontend uses Ethers.js for blockchain interaction.

## Read Operations

```js
const totalVotes = await voting.getTotalVotes(problemId);
```

Used for:
- Reading votes
- Reading phases
- Reading escrow data

These operations do not cost gas.

---

## Write Operations

```js
const tx = await voting.vote(problemId, votes);
await tx.wait();
```

Used for:
- Casting votes
- Starting completion voting
- Creating escrows
- Finalizing payments

These require MetaMask signatures.

---

# Transaction Transparency

Every important blockchain transaction generates a transaction hash.

Users can verify transactions directly on Etherscan:

```js
https://sepolia.etherscan.io/tx/${tx.hash}
```

Displayed transactions include:
- Voting transactions
- Escrow creation
- Advance payment release
- Final contractor payment

---

# Database Design

## Supabase Stores

| Table | Purpose |
|---|---|
| profiles | User roles, locality, wallets |
| problems | Problem metadata |

## Blockchain Stores

- Votes
- Escrow states
- Completion approvals
- Fund releases
- Problem phases

This hybrid architecture reduces gas costs while keeping critical actions transparent.

---

# Key Design Decisions

## Why Quadratic Voting?

- Prevents vote monopolies
- Encourages fair participation
- Captures strength of preference

---

## Why Separate Voting and Treasury Contracts?

Separation improves:
- Security
- Maintainability
- Auditability

Voting handles governance.

Treasury handles funds.

---

## Why Hybrid Storage?

Descriptions and images are stored off chain because blockchain storage is expensive.

Only trust critical actions are stored on chain.

---

# Security Features

## Access Control

```solidity
modifier onlyGov()
```

Restricts escrow actions to government/admin wallet.

---

## Completion Vote Protection

```solidity
require(!completionVoted[id][msg.sender], "voted");
```

Prevents duplicate completion votes.

---

## State Validation

```solidity
require(p.phase == Phase.UnderProgress, "bad");
```

Prevents invalid phase transitions.

---

# Tech Stack

## Frontend
- HTML
- CSS
- JavaScript
- Ethers.js

## Backend
- Supabase
- PostgreSQL
- Authentication

## Blockchain
- Solidity
- Sepolia Testnet
- MetaMask

---

# Future Improvements

- DAO governance
- Multi contractor bidding
- Reputation system
- IPFS storage
- Multi signature treasury
- Automated fraud detection

---

# Conclusion

Proof Of Fix demonstrates how blockchain can be used for real world civic accountability through:

- Community governance
- Transparent public funding
- Escrow based contractor payments
- Citizen verification
- On chain transparency

The system combines governance and decentralized finance to create a fair and transparent public infrastructure workflow.