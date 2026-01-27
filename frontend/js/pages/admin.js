import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@5.7.2/dist/ethers.esm.min.js";
import { getVotingContract, getTreasuryContract } from "../blockchain.js";

function toChainId(uuid) {
  return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(uuid));
}

document.addEventListener("DOMContentLoaded", async () => {
  const supabase = window.supabaseClient;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = "../html/login.html";
    return;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("isAdmin")
    .eq("id", session.user.id)
    .single();

  if (!profile?.isAdmin) {
    window.location.href = "../html/home.html";
    return;
  }

  await loadProblems();

  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.href = "../html/index.html";
  });
});

async function loadProblems() {
  const supabase = window.supabaseClient;
  const container = document.getElementById("problemsContainer");
  container.innerHTML = "Loading...";

  const { data: problems, error } = await supabase
    .from("problems")
    .select("*")
    .order("status_code");

  if (error || !problems) {
    container.innerHTML = "Failed to load problems.";
    return;
  }

  container.innerHTML = "";

  problems.forEach((p) => {
    const card = document.createElement("div");
    card.className = "problem-card";
    card.innerHTML = `
      <h3>${p.title}</h3>
      <p><strong>Locality:</strong> ${p.locality}</p>
      <p><strong>Status:</strong> ${p.status}</p>
      <p><strong>Cost:</strong> ₹${p.cost}</p>
      ${p.image_url ? `<img src="${p.image_url}" style="max-width:200px"/>` : ""}

      ${p.status_code === 0 ? `
        <button class="start-voting-btn" data-id="${p.id}">Start Voting</button>
      ` : ""}

      ${p.status_code === 1 ? `
        <button class="close-voting-btn" data-id="${p.id}">Close Voting & Select Winner</button>
      ` : ""}

      ${p.status_code === 2 ? `
        <input class="contractor-input" data-id="${p.id}" placeholder="Contractor wallet address" />
        <button class="create-escrow-btn" data-id="${p.id}" data-cost="${p.cost}">
          Create Escrow & Assign Contractor
        </button>
      ` : ""}

      ${p.status_code === 3 ? `
        <button class="close-completion-btn" data-id="${p.id}">Close Completion Voting</button>
      ` : ""}
    `;
    container.appendChild(card);
  });

  container.addEventListener("click", async (e) => {
    const supabase = window.supabaseClient;

    if (e.target.closest(".start-voting-btn")) {
      const id = e.target.closest(".start-voting-btn").dataset.id;
      await supabase
        .from("problems")
        .update({ status: "Voting Open", status_code: 1 })
        .eq("id", id);
      alert("Voting started");
      location.reload();
    }

    if (e.target.closest(".close-voting-btn")) {
      const id = e.target.closest(".close-voting-btn").dataset.id;
      const chainId = toChainId(id);
      const voting = await getVotingContract();
      const tx = await voting.moveToUnderProgress(chainId);
      await tx.wait();
      await supabase
        .from("problems")
        .update({ status: "Under Progress", status_code: 2 })
        .eq("id", id);
      alert("Voting closed. Problem moved to Under Progress.");
      location.reload();
    }

    if (e.target.closest(".create-escrow-btn")) {
      const btn = e.target.closest(".create-escrow-btn");
      const id = btn.dataset.id;
      const costINR = Number(btn.dataset.cost);
      const contractorAddress = document.querySelector(
        `.contractor-input[data-id="${id}"]`
      ).value.trim();

      if (!ethers.utils.isAddress(contractorAddress)) {
        return alert("Invalid contractor wallet address");
      }

      const ethAmount = (costINR / 200000).toFixed(6);
      const value = ethers.utils.parseEther(ethAmount);
      const chainId = toChainId(id);

      const treasury = await getTreasuryContract();
      const tx = await treasury.createEscrow(chainId, contractorAddress, { value });
      await tx.wait();

      await supabase
        .from("problems")
        .update({
          assigned: true,
          contractor_wallet: contractorAddress,
          advance_paid: costINR / 2,
        })
        .eq("id", id);

      alert(`Escrow created. Advance of ₹${costINR / 2} sent to contractor.`);
      location.reload();
    }

    if (e.target.closest(".close-completion-btn")) {
      const id = e.target.closest(".close-completion-btn").dataset.id;
      const chainId = toChainId(id);
      const voting = await getVotingContract();

      const closeTx = await voting.closeCompletionVoting(chainId);
      await closeTx.wait();

      const phase = await voting.getPhase(chainId);
      const passed = phase === 3;

      const treasury = await getTreasuryContract();
      const finalizeTx = await treasury.finalize(chainId);
      await finalizeTx.wait();

      await supabase
        .from("problems")
        .update({
          status: passed ? "Completed" : "Failed",
          status_code: passed ? 4 : 5,
        })
        .eq("id", id);

      alert(passed ? "Work approved. Final payment released." : "Work rejected. Funds retained.");
      location.reload();
    }
  });
}