import {
  ethers,
  getVotingContract,
  readProvider,
  toChainId,
  txUrl,
  hasWallet,
} from "../blockchain.js";
import { client, requireProfile, bindLogout, go } from "../lib/session.js";
import { h, fill, setText, show } from "../lib/dom.js";
import { toast, readableError, withBusy, confirmAction, skeleton, emptyState } from "../lib/ui.js";
import { rupees, ethAmount } from "../lib/format.js";
import { mountWalletCard } from "../lib/wallet.js";
import { STATUS, STATUS_LABEL } from "../config.js";

let profile;

document.addEventListener("DOMContentLoaded", async () => {
  const context = await requireProfile("id, full_name, locality, wallet, isContractor", "contractor");
  if (!context) return;

  profile = context.profile;

  setText("#localityBadge", profile.locality || "No locality");
  bindLogout("#logoutBtn");

  mountWalletCard(
    document.getElementById("wallet-card"),
    { userId: profile.id, wallet: profile.wallet },
    (address) => {
      profile.wallet = address;
      refreshBalance();
      loadProblems();
    }
  );

  document.getElementById("homeBtn")?.addEventListener("click", () => go("home"));

  await refreshBalance();
  await loadProblems();
});

async function refreshBalance() {
  const target = document.getElementById("balance");

  if (!profile.wallet) {
    setText(target, "Not linked");
    return;
  }

  if (!hasWallet()) {
    setText(target, "-");
    return;
  }

  try {
    const balance = await readProvider().getBalance(profile.wallet);
    setText(target, `${ethAmount(ethers.utils.formatEther(balance))} ETH`);
  } catch (err) {
    console.warn(err);
    setText(target, "-");
  }
}

async function loadProblems() {
  const container = document.getElementById("problemsContainer");
  fill(container, skeleton(2));

  if (!profile.wallet) {
    fill(
      container,
      emptyState("Link your wallet to see assigned work", "Jobs are matched to your wallet address.")
    );
    setText("#statTotal", "0");
    setText("#statProgress", "0");
    setText("#statCompleted", "0");
    return;
  }

  const { data, error } = await client()
    .from("problems")
    .select("*")
    .ilike("contractor_wallet", profile.wallet)
    .order("status_code");

  if (error) {
    fill(container, emptyState("Could not load your jobs", readableError(error)));
    return;
  }

  const inProgress = data.filter((p) =>
    [STATUS.UNDER_PROGRESS, STATUS.COMPLETION_VOTING].includes(p.status_code)
  );
  const completed = data.filter((p) => p.status_code === STATUS.COMPLETED);

  setText("#statTotal", String(data.length));
  setText("#statProgress", String(inProgress.length));
  setText("#statCompleted", String(completed.length));

  if (!data.length) {
    fill(container, emptyState("No jobs assigned yet", "Funded work in your locality will show up here."));
    return;
  }

  fill(container, data.map(jobCard));
}

function jobCard(problem) {
  const remark = h("textarea", {
    class: "remark-input",
    rows: "3",
    maxlength: "400",
    placeholder: "Add a work update residents can read...",
  });
  remark.value = problem.remark || "";

  const actions = [
    h(
      "button",
      { class: "btn btn-ghost", onClick: (event) => saveRemark(event, problem.id, remark.value) },
      "Save update"
    ),
  ];

  if (problem.status_code === STATUS.UNDER_PROGRESS) {
    actions.push(
      h(
        "button",
        { class: "btn btn-primary", onClick: (event) => markComplete(event, problem) },
        "Mark work completed"
      )
    );
  }

  if (problem.status_code === STATUS.COMPLETION_VOTING) {
    actions.push(h("span", { class: "await-note" }, "Residents are verifying your work"));
  }

  return h(
    "article",
    { class: "problem-card" },
    h("h3", null, problem.title),
    h(
      "div",
      { class: "card-meta" },
      h("span", { class: `status-badge status-${problem.status_code}` }, STATUS_LABEL[problem.status_code]),
      h("span", null, `Budget ${rupees(problem.cost)}`),
      problem.advance_paid ? h("span", null, `Advance ${rupees(problem.advance_paid)}`) : null
    ),
    problem.description ? h("p", { class: "card-desc" }, problem.description) : null,
    problem.escrow_tx
      ? h(
          "a",
          { class: "tx-ref", href: txUrl(problem.escrow_tx), target: "_blank", rel: "noreferrer" },
          "View escrow transaction"
        )
      : null,
    remark,
    h("div", { class: "card-actions" }, ...actions)
  );
}

async function saveRemark(event, id, remark) {
  const value = remark.trim();

  if (!value) {
    toast("Write an update first", "error");
    return;
  }

  await withBusy(event.currentTarget, "Saving...", async () => {
    const { error } = await client().from("problems").update({ remark: value }).eq("id", id);

    if (error) {
      toast(readableError(error), "error");
      return;
    }

    toast("Update saved", "success");
  });
}

async function markComplete(event, problem) {
  if (!confirmAction("Mark this work as completed? Residents will vote to verify it.")) return;

  await withBusy(event.currentTarget, "Confirm in wallet...", async () => {
    try {
      const contract = await getVotingContract();
      const tx = await contract.startCompletionVoting(toChainId(problem.id));

      event.currentTarget.textContent = "Waiting for confirmation...";
      await tx.wait();

      const { error } = await client()
        .from("problems")
        .update({
          status: STATUS_LABEL[STATUS.COMPLETION_VOTING],
          status_code: STATUS.COMPLETION_VOTING,
        })
        .eq("id", problem.id);

      if (error) console.error(error);

      toast("Residents can now verify your work", "success");
      await loadProblems();
    } catch (err) {
      console.error(err);
      toast(readableError(err), "error");
    }
  });
}
