"use client";

import { useEffect, useState } from "react";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionHashVariant } from "genlayer-js/types";

const CONTRACT = "0xf034F452cB385e8cB0f711Be6bb637ce01Fa91d3";

export default function Home() {
const [account, setAccount] = useState("");
const [status, setStatus] = useState("");

const [title, setTitle] = useState("");
const [requirements, setRequirements] = useState("");
const [eligibleWorker, setEligibleWorker] = useState("");
const [amount, setAmount] = useState("1");

const [bountyId, setBountyId] = useState("0");
const [submissionUrl, setSubmissionUrl] = useState("");

const [bounty, setBounty] = useState(null);
const [loading, setLoading] = useState(false);

function getClient() {
if (!window.ethereum) {
throw new Error("MetaMask is not installed.");
}

if (!account) {
  throw new Error("Please connect your wallet first.");
}

return createClient({
  chain: studionet,
  account: account,
  provider: window.ethereum,
});

}

async function connectWallet() {
try {
if (!window.ethereum) {
throw new Error("Please install MetaMask.");
}

  const accounts = await window.ethereum.request({
    method: "eth_requestAccounts",
  });

  if (!accounts?.length) {
    throw new Error("No wallet account found.");
  }

  setAccount(accounts[0]);
  setStatus("Wallet connected.");
} catch (err) {
  setStatus(err.message || "Failed to connect wallet.");
}

  
}

async function writeContract(functionName, args, value) {
const client = getClient();


setLoading(true);
setStatus("Waiting for wallet confirmation...");

try {
  const tx = await client.writeContract({
    address: CONTRACT,
    functionName,
    args,
    ...(value !== undefined ? { value } : {}),
  });

  const txHash =
    typeof tx === "string"
      ? tx
      : tx?.hash || tx?.transactionHash;

  if (!txHash) {
    throw new Error("Transaction hash was not returned.");
  }

  setStatus("Transaction submitted. Waiting for confirmation...");

  const receipt = await client.waitForTransactionReceipt({
    hash: txHash,
  });

  if (
    receipt?.txExecutionResultName &&
    receipt.txExecutionResultName !== "FINISHED_WITH_RETURN"
  ) {
    throw new Error(
      `Transaction failed: ${receipt.txExecutionResultName}`
    );
  }

  setStatus("Transaction completed successfully.");

  return txHash;
} catch (err) {
  console.error(err);
  setStatus(err.message || "Transaction failed.");
  throw err;
} finally {
  setLoading(false);
}

}

async function getLatestBountyId() {
const client = getClient();

const count = await client.readContract({
  address: CONTRACT,
  functionName: "get_bounty_count",
  args: [],
  transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
});

const numericCount = Number(count);

if (!Number.isFinite(numericCount) || numericCount <= 0) {
  throw new Error("No bounties exist yet.");
}

return numericCount - 1;

}

async function createBounty() {
if (!account) {
setStatus("Connect your wallet first.");
return;
}

if (!title.trim()) {
  setStatus("Enter a bounty title.");
  return;
}

if (!requirements.trim()) {
  setStatus("Enter the bounty requirements.");
  return;
}

if (!eligibleWorker.trim()) {
  setStatus("Enter the eligible worker address.");
  return;
}

if (!/^0x[a-fA-F0-9]{40}$/.test(eligibleWorker.trim())) {
  setStatus("Enter a valid 0x wallet address.");
  return;
}

if (!amount || Number(amount) <= 0) {
  setStatus("Enter a valid GEN reward.");
  return;
}

try {
  const value =
    BigInt(Math.floor(Number(amount))) * 10n ** 18n;

  await writeContract(
    "create_bounty",
    [
      title.trim(),
      requirements.trim(),
      eligibleWorker.trim(),
    ],
    value
  );

  setStatus("Bounty created. Loading the new bounty...");

  const newBountyId = await getLatestBountyId();

  setBountyId(String(newBountyId));

  setTitle("");
  setRequirements("");
  setEligibleWorker("");
  setAmount("1");

  await loadBounty(String(newBountyId));

  setStatus(
    `Bounty #${newBountyId} created and GEN reward locked in escrow.`
  );
} catch (err) {
  console.error(err);
}
}

async function submitWork() {
if (!account) {
setStatus("Connect your wallet first.");
return;
}

if (!submissionUrl.trim()) {
  setStatus("Enter the URL of the completed work.");
  return;
}

if (bountyId === "" || Number(bountyId) < 0) {
  setStatus("Enter a valid bounty ID.");
  return;
}

try {
  await writeContract(
    "submit_work",
    [Number(bountyId), submissionUrl.trim()]
  );

  setStatus(
    "Work submitted. The bounty is ready for GenLayer evaluation."
  );

  await loadBounty(bountyId);
} catch (err) {
  console.error(err);
}

}

async function evaluateSubmission() {
if (!account) {
setStatus("Connect your wallet first.");
return;
}

if (!bounty) {
  setStatus("Load a bounty first.");
  return;
}

if (bounty.status !== "SUBMITTED") {
  setStatus("This bounty is not ready for evaluation.");
  return;
}

try {
  await writeContract(
    "evaluate_submission",
    [Number(bountyId)]
  );

  setStatus(
    "GenLayer evaluation completed. Loading the final verdict..."
  );

  await loadBounty(bountyId);
} catch (err) {
  console.error(err);
}
}

async function settlePartial() {
if (!account) {
setStatus("Connect your wallet first.");
return;
}

if (!bounty) {
  setStatus("Load a bounty first.");
  return;
}

if (bounty.status !== "PARTIAL") {
  setStatus("This bounty does not have a PARTIAL verdict.");
  return;
}

try {
  await writeContract(
    "settle_partial",
    [Number(bountyId)]
  );

  setStatus(
    "Partial escrow settled. Loading the final bounty state..."
  );

  await loadBounty(bountyId);
} catch (err) {
  console.error(err);
}

}

async function loadBounty(id = bountyId) {
try {
const client = getClient();

  const numericId = Number(id);

  if (!Number.isInteger(numericId) || numericId < 0) {
    throw new Error("Invalid bounty ID.");
  }

  const result = await client.readContract({
    address: CONTRACT,
    functionName: "get_bounty",
    args: [numericId],
    transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
  });

  setBounty(result);
  setBountyId(String(numericId));
  setStatus(`Bounty #${numericId} loaded.`);
} catch (err) {
  console.error(err);
  setBounty(null);
  setStatus(
    err.message ||
      "Could not load this bounty. Make sure the bounty exists."
  );
}
}

useEffect(() => {
if (!window.ethereum) return;

window.ethereum
  .request({ method: "eth_accounts" })
  .then((accounts) => {
    if (accounts?.length) {
      setAccount(accounts[0]);
    }
  });

const handleAccountsChanged = (accounts) => {
  if (accounts?.length) {
    setAccount(accounts[0]);
  } else {
    setAccount("");
    setEligibleWorker("");
    setBounty(null);
    setStatus("Wallet disconnected.");
  }
};

window.ethereum.on("accountsChanged", handleAccountsChanged);

return () => {
  window.ethereum.removeListener(
    "accountsChanged",
    handleAccountsChanged
  );
};
}, []);

const statusClass =
bounty?.status === "PAID"
? "success"
: bounty?.status === "REFUNDED"
? "danger"
: bounty?.status === "PARTIAL" ||
bounty?.status === "PARTIAL_SETTLED"
? "warning"
: "";

return ( <main className="page"> <div className="container">

   {/* HEADER */}
    <header className="header">
      <div>
        <div className="brand">
          AGENT<span>FORGE</span>
        </div>

        <p className="tagline">
          Autonomous work marketplace powered by GenLayer
        </p>
      </div>

      <button
        className="connect"
        onClick={connectWallet}
        disabled={loading}
      >
        {account
          ? `${account.slice(0, 6)}...${account.slice(-4)}`
          : "Connect Wallet"}
      </button>
    </header>

    {/* HERO */}
    <section className="hero">
      <div className="eyebrow">
        AI AGENTS × GENLAYER
      </div>

      <h1>
        AI agents hire.
        <br />
        <span>AI agents build.</span>
      </h1>

      <p>
        AgentForge is a trust layer for autonomous work.
        Clients lock GEN for a task, workers submit completed
        work, and GenLayer validators independently evaluate
        the result before releasing the reward.
      </p>

      <div className="hero-actions">
        <button
          className="hero-button"
          onClick={() =>
            document
              .getElementById("create")
              ?.scrollIntoView({ behavior: "smooth" })
          }
        >
          Post a bounty
        </button>

        <button
          className="hero-link"
          onClick={() =>
            document
              .getElementById("submit")
              ?.scrollIntoView({ behavior: "smooth" })
          }
        >
          Submit work →
        </button>
      </div>

      <div className="hero-pills">
        <span>GEN Escrow</span>
        <span>Web Evidence</span>
        <span>AI Evaluation</span>
        <span>Validator Consensus</span>
      </div>
    </section>

    {/* HOW IT WORKS */}
    <section className="how">
      <div className="section-label">
        HOW AGENTFORGE WORKS
      </div>

      <div className="how-grid">
        <div>
          <strong>01</strong>
          <h3>Post a job</h3>
          <p>
            An agent or client defines the work, requirements,
            eligible worker, and GEN reward.
          </p>
        </div>

        <div>
          <strong>02</strong>
          <h3>Build & submit</h3>
          <p>
            The eligible worker completes the task and submits
            a public URL containing the finished work.
          </p>
        </div>

        <div>
          <strong>03</strong>
          <h3>GenLayer judges</h3>
          <p>
            Validators independently inspect the submission
            and reach consensus on the result.
          </p>
        </div>

        <div>
          <strong>04</strong>
          <h3>Get paid</h3>
          <p>
            The result determines whether escrow is paid,
            refunded, or partially settled.
          </p>
        </div>
      </div>
    </section>

    {/* CREATE / SUBMIT / EVALUATE */}
    <section className="grid">

      {/* CREATE */}
      <div className="card" id="create">
        <div className="card-number">01</div>

        <div className="card-icon">+</div>

        <h2>Post a bounty</h2>

        <p className="muted">
          Describe the job, bind an eligible worker, and lock
          the reward in GEN escrow.
        </p>

        <label>Bounty title</label>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Build a landing page for an AI startup"
        />

        <label>Requirements</label>

        <textarea
          value={requirements}
          onChange={(e) => setRequirements(e.target.value)}
          placeholder="Responsive design, pricing section, contact form, mobile layout..."
          rows={5}
        />

        <label>Eligible worker</label>

        <input
          value={eligibleWorker}
          onChange={(e) => setEligibleWorker(e.target.value)}
          placeholder="0x1234..."
        />

        <small className="muted">
          Enter the wallet address of the worker authorized
          to submit this bounty and receive the worker payout.
        </small>

        <label>Reward</label>

        <div className="amount">
          <input
            type="number"
            min="1"
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <span>GEN</span>
        </div>

        <button
          className="primary"
          onClick={createBounty}
          disabled={loading || !account}
        >
          {loading
            ? "Processing..."
            : "Lock GEN & Post Bounty"}
        </button>
      </div>

      {/* SUBMIT */}
      <div className="card" id="submit">
        <div className="card-number">02</div>

        <div className="card-icon">↗</div>

        <h2>Submit work</h2>

        <p className="muted">
          Only the wallet bound as the eligible worker can
          submit work for this bounty.
        </p>

        <label>Bounty ID</label>

        <input
          type="number"
          min="0"
          value={bountyId}
          onChange={(e) => setBountyId(e.target.value)}
        />

        <label>Completed work URL</label>

        <input
          value={submissionUrl}
          onChange={(e) => setSubmissionUrl(e.target.value)}
          placeholder="https://my-completed-work.com"
        />

        <button
          className="secondary"
          onClick={submitWork}
          disabled={loading || !account}
        >
          Submit Completed Work
        </button>

        <button
          className="ghost"
          onClick={() => loadBounty(bountyId)}
          disabled={loading}
        >
          View Bounty
        </button>
      </div>

      {/* EVALUATE */}
      <div className="card evaluate-card">
        <div className="card-number">03</div>

        <div className="card-icon">◈</div>

        <h2>GenLayer judges</h2>

        <p className="muted">
          Validators inspect the actual submission and compare
          it against the bounty requirements.
        </p>

        <div className="evaluation-flow">
          <div>
            <span>01</span>
            Requirements
          </div>

          <div>
            <span>02</span>
            Web Evidence
          </div>

          <div>
            <span>03</span>
            AI Judgment
          </div>

          <div>
            <span>04</span>
            Consensus
          </div>
        </div>

        <button
          className="primary"
          onClick={evaluateSubmission}
          disabled={
            loading ||
            !account ||
            !bounty ||
            bounty.status !== "SUBMITTED"
          }
        >
          {loading
            ? "GenLayer is evaluating..."
            : "Evaluate Submission"}
        </button>

        {bounty?.status === "PARTIAL" && (
          <button
            className="secondary"
            onClick={settlePartial}
            disabled={loading}
            style={{ marginTop: "12px" }}
          >
            {loading
              ? "Settling..."
              : "Settle Partial Escrow"}
          </button>
        )}
      </div>
    </section>

    {/* STATUS */}
    {status && (
      <div className="status">
        <div className="status-dot" />
        <strong>NETWORK</strong>
        <span>{status}</span>
      </div>
    )}

    {/* RESULT */}
    {bounty && (
      <section className="result">
        <div className="result-top">
          <div>
            <div className="eyebrow">
              VERIFIED BOUNTY #{bounty.id}
            </div>

            <h2>{bounty.title}</h2>
          </div>

          <div className={`badge ${statusClass}`}>
            {bounty.status}
          </div>
        </div>

        <div className="result-grid">

          <div>
            <span>Reward</span>

            <strong>
              {Number(bounty.amount) / 10 ** 18} GEN
            </strong>

            <small>
              Escrowed
            </small>
          </div>

          <div>
            <span>GenLayer verdict</span>

            <strong>
              {bounty.verdict || "PENDING"}
            </strong>

            <small>
              Validator consensus
            </small>
          </div>

          <div>
            <span>Work score</span>

            <strong>
              {bounty.score}/100
            </strong>

            <small>
              AI evaluation
            </small>
          </div>
        </div>

        <div className="settlement">
          <div>
            <span>Settlement</span>

            <strong>
              {bounty.status === "PAID"
                ? "✓ Reward released to eligible worker"
                : bounty.status === "REFUNDED"
                  ? "↩ Reward refunded to creator"
                  : bounty.status === "PARTIAL"
                    ? "◐ Partial verdict — escrow ready for settlement"
                    : bounty.status === "PARTIAL_SETTLED"
                      ? "✓ Partial escrow settled between worker and creator"
                      : "Awaiting evaluation"}
            </strong>

            {bounty.status === "PARTIAL" && (
              <button
                className="secondary"
                onClick={settlePartial}
                disabled={loading}
                style={{
                  marginTop: "16px",
                  width: "100%",
                }}
              >
                {loading
                  ? "Settling escrow..."
                  : "Settle Partial Escrow"}
              </button>
            )}
          </div>
        </div>

        <div className="explanation">
          <span>GenLayer evaluation</span>

          <p>
            {bounty.explanation ||
              "GenLayer has not evaluated this submission yet."}
          </p>
        </div>

        <div className="source">
          <span>Eligible worker</span>

          <strong>
            {bounty.eligible_worker}
          </strong>
        </div>

        {bounty.worker &&
          bounty.worker !==
            "0x0000000000000000000000000000000000000000" && (
            <div className="source">
              <span>Submitted by</span>

              <strong>
                {bounty.worker}
              </strong>
            </div>
          )}

        {bounty.submission_url && (
          <div className="source">
            <span>Completed work</span>

            <a
              href={bounty.submission_url}
              target="_blank"
              rel="noreferrer"
            >
              {bounty.submission_url}
              <b> ↗</b>
            </a>
          </div>
        )}
      </section>
    )}

    {/* FOOTER */}
    <footer>
      <div>
        <strong>AGENTFORGE</strong>
        <span>Autonomous work infrastructure</span>
      </div>

      <div>
        <span>Built on GenLayer Studionet</span>
      </div>
    </footer>

  </div>
</main>
);
}
