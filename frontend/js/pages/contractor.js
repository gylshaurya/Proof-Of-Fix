import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@5.7.2/dist/ethers.esm.min.js";
import { getVotingContract } from "../blockchain.js";

function toChainId(uuid) {
  return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(uuid));
}

document.addEventListener("DOMContentLoaded", async () => {
  const supabase = window.supabaseClient;
  const container = document.getElementById("problemsContainer");

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = "../html/login.html";
    return;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("locality, isContractor, wallet")
    .eq("id", session.user.id)
    .single();

  if (!profile || !profile.isContractor) {
    window.location.href = "../html/home.html";
    return;
  }

  const provider = new ethers.providers.Web3Provider(window.ethereum);
  const bal = await provider.getBalance(profile.wallet);
  document.getElementById("balance").innerText = `${ethers.utils.formatEther(bal)} ETH`;
  document.getElementById("localityBadge").innerText = `Locality: ${profile.locality}`;

  const { data: problems } = await supabase
    .from("problems")
    .select("*")
    .eq("locality", profile.locality)
    .eq("assigned", true)
    .in("status_code", [2, 3, 4, 5]);

  const totalIssues = problems?.length ?? 0;
  const inProgress = problems?.filter(p => p.status_code === 2 || p.status_code === 3).length ?? 0;
  const completed = problems?.filter(p => p.status_code === 4).length ?? 0;

  document.getElementById("statTotal").innerText = totalIssues;
  document.getElementById("statProgress").innerText = inProgress;
  document.getElementById("statCompleted").innerText = completed;

  if (!problems || problems.length === 0) {
    container.innerHTML = "<p>No assigned problems.</p>";
    return;
  }

  container.innerHTML = "";

  const ordered = [
    ...problems.filter(p => p.status_code === 2),
    ...problems.filter(p => p.status_code !== 2),
  ];

  ordered.forEach((p) => {
    const card = document.createElement("div");
    card.className = "problem-card";
    card.innerHTML = `
      <h3>${p.title}</h3>
      <img src="${p.image_url || "https://via.placeholder.com/300x150"}" />
      ${p.assigned ? `<p><strong>Advance Paid:</strong> ₹${p.advance_paid}</p>` : ""}
      <p><strong>Status:</strong> ${p.status}</p>
      <p><strong>Sector:</strong> ${p.locality}</p>
      <textarea id="remark-${p.id}" placeholder="Add work update...">${p.remark || ""}</textarea>
      <button class="save-btn" data-id="${p.id}">Save Remark</button>
      ${p.status === "Under Progress"
        ? `<button class="complete-btn" data-id="${p.id}">Mark Work Completed</button>`
        : ""}
    `;
    container.appendChild(card);
  });

  container.addEventListener("click", async (e) => {
    const saveBtn = e.target.closest(".save-btn");
    const completeBtn = e.target.closest(".complete-btn");

    if (saveBtn) {
      const id = saveBtn.dataset.id;
      const remark = document.getElementById(`remark-${id}`).value.trim();
      if (!remark) return alert("Remark is empty");
      await supabase.from("problems").update({ remark }).eq("id", id);
      alert("Remark saved");
    }

    if (completeBtn) {
      const id = completeBtn.dataset.id;
      if (!confirm("Mark work as completed and start completion voting?")) return;

      const chainProblemId = toChainId(id);
      const voting = await getVotingContract();

      try {
        const tx = await voting.startCompletionVoting(chainProblemId);
        await tx.wait();
        await supabase
          .from("problems")
          .update({ status: "Completion Voting", status_code: 3 })
          .eq("id", id);
        alert("Completion voting started");
        location.reload();
      } catch (err) {
        console.error(err);
        alert("Transaction failed: " + (err.reason || err.message));
      }
    }
  });

  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.href = "../html/index.html";
  });
});