import {
  ethers,
  getVotingContract,
  getTreasuryContract,
  readVotingContract,
  toChainId,
  inrToWei,
  hasWallet,
  contractsReady,
} from "../blockchain.js";
import { requireProfile } from "../lib/session.js";
import { select, update } from "../lib/db.js";
import { h, fill, setText, show } from "../lib/dom.js";
import { toast, readableError, withBusy, confirmAction, skeleton, emptyState, pageReady } from "../lib/ui.js";
import { rupees, shortAddress, ethAmount } from "../lib/format.js";
import { STATUS, STATUS_LABEL, PHASE } from "../config.js";
import { initTheme } from "../lib/theme.js";
import { mountAppBar } from "../lib/appbar.js";

let voting;
let chainActionsReady = false;
let people = [];

initTheme();

document.addEventListener("DOMContentLoaded", async () => {
  const context = await requireProfile("admin");
  if (!context) return;

  mountAppBar(context.profile);
  bindTabs();

  if (!hasWallet() || !contractsReady()) {
    const notice = document.getElementById("walletNotice");
    notice.textContent = contractsReady()
      ? "Connect the government wallet when you are ready to perform an on-chain action. Database review remains available."
      : "Sepolia contracts are not configured. Database review remains available, but on-chain actions are disabled.";
    show(notice, true);
    document.getElementById("newRoundBtn").disabled = true;
  } else {
    chainActionsReady = true;
    voting = readVotingContract();
    loadChainInfo();
  }

  document.getElementById("newRoundBtn")?.addEventListener("click", startNewRound);

  pageReady();
  await loadPeople();
  await loadProblems();
});

function bindTabs() {
  const tabs = [...document.querySelectorAll(".admin-tab")];
  tabs.forEach((tab) =>
    tab.addEventListener("click", () => {
      tabs.forEach((other) => {
        const selected = other === tab;
        other.setAttribute("aria-selected", String(selected));
        document.getElementById(other.getAttribute("aria-controls")).hidden = !selected;
      });
    })
  );
}

// Admins can read every profile (see neon/schema.sql), which is what lets the
// ward office pick a contractor from a list instead of pasting an address.
async function loadPeople() {
  const container = document.getElementById("peopleContainer");
  fill(container, skeleton(3, 64));

  try {
    people = await select("profiles", {
      columns: "id,full_name,locality,wallet,is_contractor,is_admin",
      order: "is_contractor.desc,full_name.asc",
    });
  } catch (err) {
    fill(container, emptyState("Could not load accounts", readableError(err)));
    return;
  }

  renderPeople();
}

function renderPeople() {
  const container = document.getElementById("peopleContainer");
  const others = people.filter((person) => !person.is_admin);

  if (!others.length) {
    fill(container, emptyState("No accounts yet", "People appear here after they sign up and open the app once."));
    return;
  }

  fill(
    container,
    h(
      "ul",
      { class: "people-list" },
      others.map((person) =>
        h(
          "li",
          { class: "person-row" },
          h(
            "div",
            { class: "person-main" },
            h("strong", null, person.full_name || "Unnamed"),
            h(
              "span",
              { class: "person-meta" },
              person.locality || "No sector",
              " · ",
              person.wallet ? h("code", null, shortAddress(person.wallet)) : h("span", { class: "muted" }, "no wallet linked")
            )
          ),
          person.is_contractor ? h("span", { class: "badge status-4" }, "Contractor") : null,
          h(
            "button",
            {
              class: `btn btn-sm ${person.is_contractor ? "btn-ghost" : "btn-quiet"}`,
              onClick: (event) => toggleContractor(event, person),
            },
            person.is_contractor ? "Remove contractor" : "Make contractor"
          )
        )
      )
    )
  );
}

async function toggleContractor(event, person) {
  const next = !person.is_contractor;
  await withBusy(event.currentTarget, "Saving...", async () => {
    try {
      await update("profiles", { is_contractor: next }, { id: person.id });
      person.is_contractor = next;
      toast(next ? `${person.full_name} is now a contractor` : `${person.full_name} is no longer a contractor`, "success");
    } catch (err) {
      toast(readableError(err), "error");
    }
  });
  renderPeople();
  await loadProblems();
}

function contractorPicker(problem) {
  const contractors = people
    .filter((person) => person.is_contractor && person.wallet)
    .sort((a, b) => Number(b.locality === problem.locality) - Number(a.locality === problem.locality));

  const dropdown = h(
    "select",
    { class: "field contractor-select", "aria-label": "Contractor" },
    h("option", { value: "" }, contractors.length ? "Choose a contractor" : "No contractors with a wallet yet"),
    contractors.map((person) =>
      h("option", { value: person.wallet }, `${person.full_name} · ${person.locality || "any sector"} · ${shortAddress(person.wallet)}`)
    ),
    h("option", { value: "__manual" }, "Enter a wallet address...")
  );

  const manual = h("input", {
    class: "field contractor-input",
    type: "text",
    placeholder: "0x contractor wallet",
    spellcheck: "false",
    hidden: true,
  });

  dropdown.addEventListener("change", () => {
    manual.hidden = dropdown.value !== "__manual";
    if (!manual.hidden) manual.focus();
  });

  return {
    nodes: [dropdown, manual],
    value: () => (dropdown.value === "__manual" ? manual.value : dropdown.value),
  };
}

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

      await update(
        "problems",
        { status: STATUS_LABEL[STATUS.DRAFT], status_code: STATUS.DRAFT, vote_count: 0 },
        { status_code: STATUS.VOTING }
      );

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
  fill(container, skeleton(4, 190));

  let data;
  try {
    data = await select("problems", { order: "locality.asc,status_code.asc" });
  } catch (err) {
    fill(container, emptyState("Could not load problems", readableError(err)));
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
    [...byLocality.entries()].map(([locality, problems]) => {
      const votingProblems = inVoting(problems);
      const draftProblems = drafts(problems);

      return h(
        "section",
        { class: "locality-group" },
        h(
          "header",
          { class: "locality-header" },
          h("h2", null, locality),
          !votingProblems.length && draftProblems.length
            ? h(
                "button",
                {
                  class: "btn btn-secondary",
                  onClick: (event) => openVoting(event, locality, draftProblems),
                },
                `Open voting on ${draftProblems.length} issue(s)`
              )
            : null,
          votingProblems.length
            ? h(
                "button",
                {
                  class: "btn btn-primary",
                  disabled: !chainActionsReady,
                  onClick: (event) => closeVoting(event, locality, votingProblems),
                },
                "Close voting & pick winner"
              )
            : null
        ),
        h("div", { class: "issue-grid" }, problems.map(problemCard))
      );
    })
  );
}

const drafts = (problems) => problems.filter((p) => p.status_code === STATUS.DRAFT);
const inVoting = (problems) => problems.filter((p) => p.status_code === STATUS.VOTING);

function problemCard(problem) {
  const actions = [];

  if (problem.status_code === STATUS.UNDER_PROGRESS && !problem.contractor_wallet) {
    const picker = contractorPicker(problem);

    actions.push(
      h(
        "div",
        { class: "escrow-form" },
        h("p", { class: "escrow-label" }, "Assign a contractor and fund the escrow"),
        ...picker.nodes,
        h(
          "button",
          { class: "btn btn-primary", disabled: !chainActionsReady, onClick: (event) => createEscrow(event, problem, picker.value()) },
          "Assign & fund escrow"
        )
      )
    );
  }

  if (problem.status_code === STATUS.COMPLETION_VOTING) {
    actions.push(
      h(
        "button",
        { class: "btn btn-primary", disabled: !chainActionsReady, onClick: (event) => settle(event, problem) },
        "Close voting & settle"
      )
    );
  }

  return h(
    "article",
    { class: "card card-pad admin-card" },
    h("h3", null, problem.title),
    h(
      "div",
      { class: "card-meta" },
      h("span", { class: `badge status-${problem.status_code}` }, STATUS_LABEL[problem.status_code]),
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
    try {
      await update(
        "problems",
        { status: STATUS_LABEL[STATUS.VOTING], status_code: STATUS.VOTING },
        { id: problems.map((problem) => problem.id) }
      );
    } catch (err) {
      toast(readableError(err), "error");
      return;
    }

    toast(`Voting open in ${locality}`, "success");
    await loadProblems();
  });
}

async function closeVoting(event, locality, problems) {
  if (!problems.length) return;

  const button = event.currentTarget;
  await withBusy(button, "Reading votes...", async () => {
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

      button.textContent = "Confirm in wallet...";

      const contract = await getVotingContract();
      const tx = await contract.moveToUnderProgress(toChainId(winner.problem.id));

      button.textContent = "Waiting for confirmation...";
      await tx.wait();

      await update(
        "problems",
        {
          status: STATUS_LABEL[STATUS.UNDER_PROGRESS],
          status_code: STATUS.UNDER_PROGRESS,
          vote_count: winner.votes,
        },
        { id: winner.problem.id }
      );

      const losers = tallies.slice(1).map((t) => t.problem.id);
      if (losers.length) {
        await update(
          "problems",
          { status: STATUS_LABEL[STATUS.DRAFT], status_code: STATUS.DRAFT },
          { id: losers }
        );
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
  const address = (contractorAddress || "").trim();

  if (!address) {
    toast("Choose a contractor first", "error");
    return;
  }

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

      try {
        await update(
          "problems",
          {
            assigned: true,
            contractor_wallet: address,
            escrow_wei: value.toString(),
            advance_paid: problem.cost / 2,
            escrow_tx: tx.hash,
          },
          { id: problem.id }
        );
      } catch (err) {
        toast("Escrow funded but the database did not update, refresh and check", "error");
        console.error(err);
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

      await update(
        "problems",
        {
          status: approved ? STATUS_LABEL[STATUS.COMPLETED] : STATUS_LABEL[STATUS.FAILED],
          status_code: approved ? STATUS.COMPLETED : STATUS.FAILED,
          settle_tx: finalizeTx.hash,
        },
        { id: problem.id }
      );

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
