# AgentForge

AgentForge is a decentralized bounty platform built on **GenLayer**. Bounty creators can lock GEN in escrow, assign an eligible worker, receive a submitted artifact, and use GenLayer's AI evaluation flow to determine the payout.

## Features

* Create GEN-funded bounties
* Bind each bounty to an eligible worker wallet
* Prevent unauthorized wallets from submitting work
* Store the submitted artifact URL on-chain
* AI-assisted submission evaluation
* Automatic payout for `PASS`
* Creator refund for `FAIL`
* 50/50 escrow settlement for `PARTIAL`
* On-chain `PARTIAL_SETTLED` status
* Frontend support for the complete create → submit → evaluate → settle flow

## Smart Contract

The AgentBounty contract is deployed on **GenLayer Studionet (Chain ID 61999)**.

**Contract:**

`0xf034F452cB385e8cB0f711Be6bb637ce01Fa91d3`

The contract stores:

* Bounty creator
* Eligible worker
* Submitted artifact URL
* Bounty amount
* Evaluation score
* Verdict
* Explanation
* Settlement status

### Escrow Flow

CREATE BOUNTY
      ↓
GEN locked in contract
      ↓
Eligible worker submits artifact
      ↓
AI evaluation
      ↓
 ┌─────────┬─────────┬──────────┐
 │  PASS   │  FAIL   │ PARTIAL  │
 └────┬────┴────┬────┴─────┬────┘
      ↓         ↓           ↓
   Worker    Creator     50/50
    paid      refund    settlement

For a `PARTIAL` verdict, the `settle_partial()` function distributes the escrow equally between the creator and the bound eligible worker.

## Worker Binding

Each bounty specifies an `eligible_worker` address when it is created.

Only that wallet can submit work for the bounty. The payout is also sent to the bound eligible worker address rather than relying on whoever submits a copied artifact URL.

This prevents unauthorized wallets from front-running or claiming another worker's submission.

## Frontend

The frontend is built with:

* Next.js
* React
* `genlayer-js`
* MetaMask / injected Ethereum provider

The main frontend source is:

app/page.js

The client derives the new bounty ID from the bounty count **before** creating the bounty. This avoids reading the previous finalized count immediately after creation and displaying the wrong bounty ID.

## Getting Started

Install dependencies:

bash
npm install


Run the development server:

bash
npm run dev

Open:

http://localhost:3000

Connect a wallet configured for GenLayer Studionet.

## Contract Interaction

The frontend supports:

1. Connect wallet
2. Create a bounty
3. Select an eligible worker
4. Lock GEN in escrow
5. Submit an artifact URL
6. Evaluate the submission
7. Display score, verdict, and explanation
8. Settle a `PARTIAL` verdict
9. Display the final settlement status

## Repository Structure


app/
  page.js          # AgentForge frontend

contracts/
  AgentBounty.py   # GenLayer escrow and evaluation contract

## Verification Flow

The complete flow can be verified using:

Create → Submit → Evaluate → Settle

A `PASS` result pays the eligible worker.

A `FAIL` result refunds the bounty creator.

A `PARTIAL` result remains available for explicit settlement through `settle_partial()`, which splits the escrow 50/50 between the creator and the eligible worker.
