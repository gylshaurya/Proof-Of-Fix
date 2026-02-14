import {
  ethers,
  getVotingContract,
  getTreasuryContract,
  readVotingContract,
  toChainId,
  inrToWei,
  hasWallet,
} from "../blockchain.js";
import { client, requireProfile, bindLogout } from "../lib/session.js";
import { h, fill, setText, show } from "../lib/dom.js";
import { toast, readableError, withBusy, confirmAction, skeleton, emptyState } from "../lib/ui.js";
import { rupees, shortAddress, ethAmount } from "../lib/format.js";
import { STATUS, STATUS_LABEL, PHASE } from "../config.js";

let voting;

document.addEventListener("DOMContentLoaded", async () => {
  const context = await requireProfile("id, isAdmin", "admin");
  if (!context) return;

  bindLogout("#logoutBtn");

  if (!hasWallet()) {
    show(document.getElementById("walletNotice"), true);
  } else {
    voting = readVotingContract();
    loadChainInfo();
  }

  document.getElementById("newRoundBtn")?.addEventListener("click", startNewRound);

  await loadProblems();
});

async function loadChainInfo() {
  try {
    const [round, quorum] = await Promise.all([voting.currentRound(), voting.completionQuorum()]);
    setText("#roundInfo", `Round ${round}`);
    setText("#quorumInfo", `Quorum ${quorum}`);
  } catch (err) {
    console.warn(err);
  }
}

async function startNewRound(event) {
  if (!confirmAction("Start a new round? Every resident gets a fresh 100 credits and all vote tallies reset.")) {
    return;
  }

  await withBusy(event.currentTarget, "Confirm in wallet...", async () => {
    try {
      const contract = await getVotingContract();
      const tx = await contract.newRound();
      await tx.wait();

      await client()
        .from("problems")
        .update({ status: STATUS_LABEL[STATUS.DRAFT], status_code: STATUS.DRAFT, vote_count: 0 })
        .in("status_code", [STATUS.VOTING]);

      toast("New round started", "success");
      await loadChainInfo();
      await loadProblems();
    } catch (err) {
      console.error(err);
      toast(readableError(err), "error");
    }
  });
}

async function loadProblems() {
  const container = document.getElementById("problemsContainer");
  fill(container, skeleton(4));

  const { data, error } = await client()
    .from("problems")
    .select("*")
    .order("status_code")
    .order("locality");

  if (error) {
    fill(container, emptyState("Could not load problems", readableError(error)));
    return;
  }

  if (!data.length) {
    fill(container, emptyState("No problems yet", "Reported issues will appear here for review."));
    return;
  }

  const byLocality = new Map();
  for (const problem of data) {
    const key = problem.locality || "Unassigned";
    if (!byLocality.has(key)) byLocality.set(key, []);
    byLocality.get(key).push(problem);
  }

  fill(
    container,
    [...byLocality.entries()].map(([locality, problems]) =>
      h(
        "section",
        { class: "locality-group" },
        h(
          "header",
          { class: "locality-header" },
          h("h2", null, locality),
          drafts(problems).length
            ? h(
                "button",
                {
                  class: "btn btn-secondary",
                  onClick: (event) => openVoting(event, locality, drafts(problems)),
                },
                `Open voting on ${drafts(problems).length} issue(s)`
              )
            : null,
          inVoting(problems).length
            ? h(
                "button",
                {
                  class: "btn btn-primary",
                  onClick: (event) => closeVoting(event, locality, inVoting(problems)),
                },
                "Close voting & pick winner"
              )
            : null
        ),
        h("div", { class: "problem-grid" }, problems.map(problemCard))
      )
    )
  );
}

const drafts = (problems) => problems.filter((p) => p.status_code === STATUS.DRAFT);
const inVoting = (problems) => problems.filter((p) => p.status_code === STATUS.VOTING);

function problemCard(problem) {
  const actions = [];

  if (problem.status_code === STATUS.UNDER_PROGRESS && !problem.contractor_wallet) {
    const input = h("input", {
      class: "contractor-input",
      type: "text",
      placeholder: "0x contractor wallet",
      spellcheck: "false",
    });

    actions.push(
      h(
        "div",
        { class: "escrow-form" },
        input,
        h(
          "button",
          { class: "btn btn-primary", onClick: (event) => createEscrow(event, problem, input.value) },
          "Fund escrow"
        )
      )
    );
  }

  if (problem.status_code === STATUS.COMPLETION_VOTING) {
    actions.push(
      h(
        "button",
        { class: "btn btn-primary", onClick: (event) => settle(event, problem) },
        "Close voting & settle"
      )
    );
  }

  return h(
    "article",
    { class: "problem-card" },
    h("h3", null, problem.title),
    h(
      "div",
      { class: "card-meta" },
      h("span", { class: `status-badge status-${problem.status_code}` }, STATUS_LABEL[problem.status_code]),
      h("span", null, rupees(problem.cost)),
      problem.vote_count ? h("span", null, `${problem.vote_count} votes`) : null
    ),
    problem.description ? h("p", { class: "card-desc" }, problem.description) : null,
    problem.contractor_wallet
      ? h(
          "p",
          { class: "card-contractor" },
          "Contractor: ",
          h("code", null, shortAddress(problem.contractor_wallet))
        )
      : null,
    ...actions
  );
}

async function openVoting(event, locality, problems) {
  await withBusy(event.currentTarget, "Opening...", async () => {
    const { error } = await client()
      .from("problems")
      .update({ status: STATUS_LABEL[STATUS.VOTING], status_code: STATUS.VOTING })
      .in("id", problems.map((p) => p.id));

    if (error) {
      toast(readableError(error), "error");
      return;
    }

    toast(`Voting open in ${locality}`, "success");
    await loadProblems();
  });
}

async function closeVoting(event, locality, problems) {
  if (!problems.length) return;

  await withBusy(event.currentTarget, "Reading votes...", async () => {
    try {
      const tallies = await Promise.all(
        problems.map(async (problem) => ({
          problem,
          votes: Number(await voting.getTotalVotes(toChainId(problem.id))),
        }))
      );

      tallies.sort((a, b) => b.votes - a.votes);
      const winner = tallies[0];

      if (winner.votes === 0) {
        toast(`No votes cast in ${locality} yet`, "error");
        return;
      }

      if (!confirmAction(`"${winner.problem.title}" wins with ${winner.votes} votes. Move it to Under Progress?`)) {
        return;
      }

      event.currentTarget.textContent = "Confirm in wallet...";

      const contract = await getVotingContract();
      const tx = await contract.moveToUnderProgress(toChainId(winner.problem.id));

      event.currentTarget.textContent = "Waiting for confirmation...";
      await tx.wait();

      await client()
        .from("problems")
        .update({
          status: STATUS_LABEL[STATUS.UNDER_PROGRESS],
          status_code: STATUS.UNDER_PROGRESS,
          vote_count: winner.votes,
        })
        .eq("id", winner.problem.id);

      const losers = tallies.slice(1).map((t) => t.problem.id);
      if (losers.length) {
        await client()
          .from("problems")
          .update({ status: STATUS_LABEL[STATUS.DRAFT], status_code: STATUS.DRAFT })
          .in("id", losers);
      }

      toast(`${winner.problem.title} selected for funding`, "success");
      await loadProblems();
    } catch (err) {
      console.error(err);
      toast(readableError(err), "error");
    }
  });
}

async function createEscrow(event, problem, contractorAddress) {
  const address = contractorAddress.trim();

  if (!ethers.utils.isAddress(address)) {
    toast("Enter a valid wallet address", "error");
    return;
  }

  let value;
  try {
    value = inrToWei(problem.cost);
  } catch (err) {
    toast("This problem has no valid cost set", "error");
    return;
  }

  if (value.isZero()) {
    toast("Cost is too small to fund on chain", "error");
    return;
  }

  const eth = ethAmount(ethers.utils.formatEther(value));
  if (!confirmAction(`Lock ${eth} ETH for ${rupees(problem.cost)}? Half is released immediately.`)) {
    return;
  }

  await withBusy(event.currentTarget, "Assigning contractor...", async () => {
    const button = event.currentTarget;

    try {
      const chainId = toChainId(problem.id);

      const votingContract = await getVotingContract();
      const assignTx = await votingContract.assignContractor(chainId, address);
      await assignTx.wait();

      button.textContent = "Funding escrow...";

      const treasury = await getTreasuryContract();
      const tx = await treasury.createEscrow(chainId, address, { value });
      await tx.wait();

      const { error } = await client()
        .from("problems")
        .update({
          assigned: true,
          contractor_wallet: address,
          escrow_wei: value.toString(),
          advance_paid: problem.cost / 2,
          escrow_tx: tx.hash,
        })
        .eq("id", problem.id);

      if (error) {
        toast("Escrow funded but the database did not update, refresh and check", "error");
        console.error(error);
        return;
      }

      toast(`Escrow funded, advance sent to ${shortAddress(address)}`, "success");
      await loadProblems();
    } catch (err) {
      console.error(err);
      toast(readableError(err), "error");
    }
  });
}

async function settle(event, problem) {
  await withBusy(event.currentTarget, "Closing voting...", async () => {
    const button = event.currentTarget;

    try {
      const chainId = toChainId(problem.id);
      const votingContract = await getVotingContract();

      const [yes, no] = await votingContract.getCompletionVotes(chainId);
      if (!confirmAction(`Close verification with ${yes} yes and ${no} no votes?`)) return;

      const closeTx = await votingContract.closeCompletionVoting(chainId);
      await closeTx.wait();

      const phase = Number(await votingContract.getPhase(chainId));
      const approved = phase === PHASE.COMPLETED;

      button.textContent = "Settling escrow...";

      const treasury = await getTreasuryContract();
      const finalizeTx = await treasury.finalize(chainId);
      await finalizeTx.wait();

      await client()
        .from("problems")
        .update({
          status: approved ? STATUS_LABEL[STATUS.COMPLETED] : STATUS_LABEL[STATUS.FAILED],
          status_code: approved ? STATUS.COMPLETED : STATUS.FAILED,
          settle_tx: finalizeTx.hash,
        })
        .eq("id", problem.id);

      toast(
        approved ? "Work approved, final payment released" : "Work rejected, funds returned to treasury",
        approved ? "success" : "info"
      );

      await loadProblems();
    } catch (err) {
      console.error(err);
      toast(readableError(err), "error");
    }
  });
}
