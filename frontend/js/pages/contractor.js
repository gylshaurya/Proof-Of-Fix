import {
  ethers,
  getVotingContract,
  readProvider,
  toChainId,
  txUrl,
  hasWallet,
} from "../blockchain.js";
import { requireProfile } from "../lib/session.js";
import { select, update } from "../lib/db.js";
import { h, fill, setText, show } from "../lib/dom.js";
import { toast, readableError, withBusy, confirmAction, skeleton, emptyState, pageReady } from "../lib/ui.js";
import { rupees, ethAmount } from "../lib/format.js";
import { mountAppBar } from "../lib/appbar.js";
import { STATUS, STATUS_LABEL } from "../config.js";
import { initTheme } from "../lib/theme.js";

let profile;

initTheme();

document.addEventListener("DOMContentLoaded", async () => {
  const context = await requireProfile("contractor");
  if (!context) return;

  profile = context.profile;

  mountAppBar(profile, {
    onWalletChange: () => {
      refreshBalance();
      loadProblems();
    },
  });

  pageReady();
  refreshBalance();
  await loadProblems();
});

async function refreshBalance() {
  const target = document.getElementById("balance");

  if (!profile.wallet) {
    setText(target, "Not linked");
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
  fill(container, skeleton(2, 220));

  if (!profile.wallet) {
    fill(
      container,
      emptyState("Connect your wallet to see assigned work", "Use the Connect wallet button in the top bar. Jobs are matched to your wallet address.")
    );
    setText("#statTotal", "0");
    setText("#statProgress", "0");
    setText("#statCompleted", "0");
    return;
  }

  let data;
  try {
    data = await select("problems", {
      filters: { contractor_wallet: { operator: "ilike", value: profile.wallet } },
      order: "status_code.asc",
    });
  } catch (err) {
    fill(container, emptyState("Could not load your jobs", readableError(err)));
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
    fill(
      container,
      emptyState(
        "No jobs assigned yet",
        "When the ward office funds an issue and picks you as the contractor, it will appear here and the advance lands in your wallet."
      )
    );
    return;
  }

  fill(container, data.map(jobCard));
}

function jobCard(problem) {
  const editable = problem.status_code === STATUS.UNDER_PROGRESS;
  const remark = editable
    ? h("textarea", {
        class: "field",
        rows: "3",
        maxlength: "400",
        placeholder: "Add a work update residents can read...",
      })
    : null;
  if (remark) remark.value = problem.remark || "";

  const actions = [];

  if (editable) {
    actions.push(
      h(
        "button",
        { class: "btn btn-ghost", onClick: (event) => saveRemark(event, problem.id, remark.value) },
        "Save update"
      )
    );
    actions.push(
      h(
        "button",
        { class: "btn btn-primary", disabled: !hasWallet(), onClick: (event) => markComplete(event, problem) },
        "Mark work completed"
      )
    );
    if (!hasWallet()) {
      actions.push(h("span", { class: "action-note" }, "MetaMask is needed when you submit the completed work."));
    }
  }

  if (problem.status_code === STATUS.COMPLETION_VOTING) {
    actions.push(h("span", { class: "await-note" }, "Residents are verifying your work"));
  }

  return h(
    "article",
    { class: "card card-pad job-card" },
    h("h3", null, problem.title),
    h(
      "div",
      { class: "card-meta" },
      h("span", { class: `badge status-${problem.status_code}` }, STATUS_LABEL[problem.status_code]),
      h("span", null, `Budget ${rupees(problem.cost)}`),
      problem.advance_paid ? h("span", null, `Advance ${rupees(problem.advance_paid)}`) : null
    ),
    problem.description ? h("p", { class: "card-desc" }, problem.description) : null,
    !editable && problem.remark
      ? h("div", { class: "job-update" }, h("strong", null, "Latest work update"), h("p", null, problem.remark))
      : null,
    problem.escrow_tx
      ? h(
          "a",
          { class: "tx-ref", href: txUrl(problem.escrow_tx), target: "_blank", rel: "noreferrer" },
          "View escrow transaction"
        )
      : null,
    remark,
    actions.length ? h("div", { class: "job-actions" }, ...actions) : null
  );
}

async function saveRemark(event, id, remark) {
  const value = remark.trim();

  if (!value) {
    toast("Write an update first", "error");
    return;
  }

  await withBusy(event.currentTarget, "Saving...", async () => {
    try {
      await update("problems", { remark: value }, { id });
      toast("Update saved", "success");
    } catch (err) {
      toast(readableError(err), "error");
    }
  });
}

async function markComplete(event, problem) {
  if (!confirmAction("Mark this work as completed? Residents will vote to verify it.")) return;

  const button = event.currentTarget;
  await withBusy(button, "Confirm in wallet...", async () => {
    try {
      const contract = await getVotingContract();
      const tx = await contract.startCompletionVoting(toChainId(problem.id));

      button.textContent = "Waiting for confirmation...";
      await tx.wait();

      await update(
        "problems",
        {
          status: STATUS_LABEL[STATUS.COMPLETION_VOTING],
          status_code: STATUS.COMPLETION_VOTING,
        },
        { id: problem.id }
      );

      toast("Residents can now verify your work", "success");
      await loadProblems();
    } catch (err) {
      console.error(err);
      toast(readableError(err), "error");
    }
  });
}
