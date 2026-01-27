import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@5.7.2/dist/ethers.esm.min.js";
import { castVote } from "./vote/vote.js";
import { voteCompletion } from "./vote/completionVote.js";
import { getVotingContract } from "../blockchain.js";
import { TREASURY_ADDRESS } from "../config.js";
import treasuryABI from "../abis/TreasuryABI.js";

const TREASURY_DEPLOY_BLOCK = 10133869;

function toChainId(uuid) {
  return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(uuid));
}

async function loadEscrowTransactions(chainProblemId) {
  const provider = new ethers.providers.Web3Provider(window.ethereum);
  const treasury = new ethers.Contract(TREASURY_ADDRESS, treasuryABI, provider);
  return {
    created: await treasury.queryFilter(treasury.filters.EscrowCreated(chainProblemId), TREASURY_DEPLOY_BLOCK),
    advances: await treasury.queryFilter(treasury.filters.AdvanceReleased(chainProblemId), TREASURY_DEPLOY_BLOCK),
    finals: await treasury.queryFilter(treasury.filters.FinalReleased(chainProblemId), TREASURY_DEPLOY_BLOCK),
    failed: await treasury.queryFilter(treasury.filters.EscrowFailed(chainProblemId), TREASURY_DEPLOY_BLOCK),
  };
}

async function renderEscrowTxs(chainProblemId) {
  const list = document.getElementById("escrowTxList");
  list.innerHTML = "";

  const { created, advances, finals, failed } = await loadEscrowTransactions(chainProblemId);

  function addTx(label, e) {
    const li = document.createElement("li");
    li.innerHTML = `
      <strong>${label}</strong>:
      <a href="https://sepolia.etherscan.io/tx/${e.transactionHash}" target="_blank">
        ${e.transactionHash}
      </a>
    `;
    list.appendChild(li);
  }

  created.forEach(e => addTx("Escrow Created", e));
  advances.forEach(e => addTx("Advance Paid", e));
  finals.forEach(e => addTx("Final Payment", e));
  failed.forEach(e => addTx("Escrow Failed", e));

  if (!list.children.length) list.innerHTML = "<li>No contractor payments yet</li>";
}

function showTx(hash) {
  const txInfo = document.getElementById("txInfo");
  const txLink = document.getElementById("txLink");
  if (!txInfo || !txLink) return;
  txLink.href = `https://sepolia.etherscan.io/tx/${hash}`;
  txLink.innerText = hash;
  txInfo.hidden = false;
}

document.addEventListener("DOMContentLoaded", async () => {
  const supabase = window.supabaseClient;
  if (!supabase) return;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = "../html/login.html";
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const problemUUID = params.get("problemId");
  if (!problemUUID) return;

  const chainProblemId = toChainId(problemUUID);

  const { data: p, error } = await supabase
    .from("problems")
    .select("*")
    .eq("id", problemUUID)
    .single();

  if (error || !p) { console.error(error); return; }

  document.getElementById("problemTitle").innerText = p.title;
  document.getElementById("description").innerText = p.description;
  document.getElementById("status").innerText = p.status;
  document.getElementById("locality").innerText = p.locality;
  document.getElementById("cost").innerText = `Estimated Cost: ₹${p.cost}`;
  document.getElementById("chainProblemId").innerText = chainProblemId;

  if (p.image_url) {
    const img = document.getElementById("problemImage");
    img.src = p.image_url;
    img.hidden = false;
  }

  const voting = await getVotingContract();
  const userAddress = await voting.signer.getAddress();

  async function refreshStats() {
    const totalVotes = await voting.getTotalVotes(chainProblemId);
    const myVotes = await voting.getUserVotes(userAddress, chainProblemId);
    const [yes, no] = await voting.getCompletionVotes(chainProblemId);

    let credits = await voting.credits(userAddress);
    if (credits.toString() === "0" && myVotes.toString() === "0") credits = 100;

    document.getElementById("chainTotalVotes").innerText = `Total Votes: ${totalVotes}`;
    document.getElementById("myVotes").innerText = `Your Votes on this problem: ${myVotes}`;
    document.getElementById("myCredits").innerText = `Credits Left: ${credits}`;

    if (p.status_code === 3) {
      document.getElementById("completionStats").innerText =
        `Completion Votes - Yes: ${yes} | No: ${no}`;
    }
  }

  await refreshStats();

  if (p.status_code === 1) {
    const section = document.getElementById("votingSection");
    section.hidden = false;

    const currentVotes = Number(await voting.getUserVotes(userAddress, chainProblemId));
    const voteInput = document.getElementById("voteInput");
    const costPreview = document.getElementById("voteCostPreview");

    voteInput.addEventListener("input", () => {
      const additional = Number(voteInput.value);
      if (additional <= 0) { costPreview.innerText = ""; return; }
      const newTotal = currentVotes + additional;
      const cost = (newTotal * newTotal) - (currentVotes * currentVotes);
      costPreview.innerText = `Adding ${additional} vote(s) costs ${cost} credits (${newTotal} total on this problem)`;
    });

    document.getElementById("voteBtn").onclick = async () => {
      const additional = Number(voteInput.value);
      if (additional <= 0) return alert("Enter a valid number of votes");

      const newTotal = currentVotes + additional;
      const cost = (newTotal * newTotal) - (currentVotes * currentVotes);
      const actualCredits = Number(await voting.credits(userAddress));

      if (cost > actualCredits) {
        return alert(`Not enough credits. This costs ${cost} but you have ${actualCredits}.`);
      }

      try {
        const tx = await castVote(chainProblemId, additional);
        alert("Vote recorded!");
        showTx(tx.hash);
        await refreshStats();
      } catch (err) {
        console.error(err);
        alert("Transaction failed: " + (err.reason || err.message));
      }
    };
  }

  if (p.status_code === 3) {
    const section = document.getElementById("completionVoting");
    const hasVoted = await voting.completionVoted(chainProblemId, userAddress);

    if (hasVoted) {
      section.hidden = true;
      document.getElementById("alreadyCompletionVotedMsg").hidden = false;
    } else {
      section.hidden = false;

      document.getElementById("yesBtn").onclick = async () => {
        try {
          const tx = await voteCompletion(chainProblemId, true);
          showTx(tx.hash);
          await refreshStats();
          section.hidden = true;
          document.getElementById("alreadyCompletionVotedMsg").hidden = false;
        } catch (err) {
          alert("Transaction failed: " + (err.reason || err.message));
        }
      };

      document.getElementById("noBtn").onclick = async () => {
        try {
          const tx = await voteCompletion(chainProblemId, false);
          showTx(tx.hash);
          await refreshStats();
          section.hidden = true;
          document.getElementById("alreadyCompletionVotedMsg").hidden = false;
        } catch (err) {
          alert("Transaction failed: " + (err.reason || err.message));
        }
      };
    }
  }

  await renderEscrowTxs(chainProblemId);
});