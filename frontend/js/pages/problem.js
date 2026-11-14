import { requireProfile } from "../lib/session.js";
import { selectOne } from "../lib/db.js";
import { h, fill, setText, show } from "../lib/dom.js";
import { toast, readableError, withBusy, emptyState, pageReady } from "../lib/ui.js";
import { rupees, shortAddress, shortHash, timeLeft } from "../lib/format.js";
import { STATUS, STATUS_LABEL, DEPLOY_BLOCK, CHAIN, VOTING_ADDRESS, TREASURY_ADDRESS } from "../config.js";
import { initTheme } from "../lib/theme.js";
import { mountAppBar } from "../lib/appbar.js";
import { loadChain, hasWallet } from "../lib/chain.js";

const MAX_VOTES = 10;

const STAGE_COPY = {
  [STATUS.DRAFT]: ["Waiting for the ward office", "This report is ready for review. The ward office can include it in the next voting round."],
  [STATUS.VOTING]: ["Residents are choosing a priority", "Spend voting credits to support this issue before the ward office closes the round."],
  [STATUS.UNDER_PROGRESS]: ["Repair work is underway", "The selected contractor can post updates and submit the work for resident verification."],
  [STATUS.COMPLETION_VOTING]: ["Residents are checking the repair", "Vote on whether the work shown here is complete. The result controls the locked payment."],
  [STATUS.COMPLETED]: ["Repair approved", "Residents approved the work and the remaining escrow payment was released."],
  [STATUS.FAILED]: ["Repair not approved", "The completion vote did not approve the work, so the remaining funds return to the treasury."],
};

initTheme();
const chainLoading = loadChain();

let chain;
let voting;
let problem;
let chainId;
let viewer;
let countdownTimer = null;

const state = {
  loaded: false,
  total: 0,
  mine: 0,
  credits: 0,
  yes: 0,
  no: 0,
  deadline: 0,
  hasVotedCompletion: false,
  verdict: null,
};

const $id = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", async () => {
  const context = await requireProfile();
  if (!context) return;
  viewer = context.profile;

  mountAppBar(viewer, { onWalletChange: () => refresh() });

  const problemId = new URLSearchParams(window.location.search).get("problemId");
  if (!problemId) {
    pageReady();
    fill(document.querySelector(".detail"), emptyState("No issue selected", "Open an issue from the list to see its details."));
    return;
  }

  try {
    problem = await selectOne("problems", { filters: { id: problemId } });
  } catch (err) {
    console.error(err);
  }

  pageReady();

  if (!problem) {
    fill(document.querySelector(".detail"), emptyState("Issue not found", "It may have been removed, or the link is incomplete."));
    return;
  }

  renderDetails();

  try {
    chain = await chainLoading;
  } catch (err) {
    console.error(err);
    toast("Could not load the blockchain library. Check your connection and refresh.", "error");
    return;
  }

  chainId = chain.toChainId(problem.id);
  setText("#chainProblemId", chainId);

  if (!chain.contractsReady()) {
    setText("#stageDescription", "The report is available, but its Sepolia contracts have not been configured yet.");
    return;
  }

  voting = chain.readVotingContract();
  bindActions();

  try {
    await refresh();
  } catch (err) {
    console.error(err);
    toast("Could not read on-chain data", "error");
  }

  renderVoteHistory().catch((err) => {
    console.error(err);
    fill($id("voteHistory"), h("li", { class: "muted" }, "Could not load vote history"));
  });
  renderEscrowTxs().catch((err) => {
    console.error(err);
    fill($id("escrowTxList"), h("li", { class: "muted" }, "Could not load treasury activity"));
  });
});

function renderDetails() {
  document.title = `${problem.title} | Proof of Fix`;
  setText("#problemTitle", problem.title);
  setText("#description", problem.description || "No description provided.");
  setText("#locality", problem.locality);
  setText("#cost", rupees(problem.cost));

  const [stageAction, stageDescription] = STAGE_COPY[problem.status_code] ?? ["Status unavailable", "No lifecycle information is available for this issue."];
  setText("#stageAction", stageAction);
  setText("#stageDescription", stageDescription);

  const status = $id("status");
  status.textContent = STATUS_LABEL[problem.status_code] ?? "Unknown";
  status.className = `badge status-${problem.status_code}`;

  if (problem.image_url) {
    const img = h("img", { id: "problemImage", src: problem.image_url, alt: problem.title, decoding: "async" });
    document.querySelector(".detail-hero").prepend(img);
  }

  if (problem.contractor_wallet) {
    const link = $id("contractorWallet");
    link.textContent = shortAddress(problem.contractor_wallet);
    link.href = `${CHAIN.explorer}/address/${problem.contractor_wallet}`;
    show($id("contractorRow"), true);
  }

  if (problem.remark) {
    setText("#contractorRemark", problem.remark);
    show($id("remarkRow"), true);
  }

  $id("votingContractLink").href = `${CHAIN.explorer}/address/${VOTING_ADDRESS}`;
  $id("treasuryContractLink").href = `${CHAIN.explorer}/address/${TREASURY_ADDRESS}`;
}

// Reads every on-chain number this page shows, then re-renders the panels.
async function refresh() {
  if (!voting) return;
  const wallet = viewer.wallet;
  const stage = problem.status_code;
  const completionStage = [STATUS.COMPLETION_VOTING, STATUS.COMPLETED, STATUS.FAILED].includes(stage);

  const [total, completion, mine, credits, hasVoted, deadline] = await Promise.all([
    voting.getTotalVotes(chainId),
    completionStage ? voting.getCompletionVotes(chainId) : [0, 0],
    wallet ? voting.getUserVotes(wallet, chainId) : 0,
    wallet ? voting.creditsOf(wallet) : 0,
    wallet && completionStage ? voting.hasVotedCompletion(chainId, wallet) : false,
    stage === STATUS.COMPLETION_VOTING ? voting.getCompletionDeadline(chainId) : 0,
  ]);

  state.total = Number(total);
  state.yes = Number(completion[0]);
  state.no = Number(completion[1]);
  state.mine = Number(mine);
  state.credits = Number(credits);
  state.hasVotedCompletion = Boolean(hasVoted);
  state.deadline = Number(deadline);

  if (state.hasVotedCompletion && state.verdict === null) {
    state.verdict = await readMyVerdict(wallet).catch(() => null);
  }

  state.loaded = true;
  render();
}

async function readMyVerdict(wallet) {
  const events = await voting.queryFilter(voting.filters.CompletionVoteCast(chainId, wallet), DEPLOY_BLOCK);
  const last = events.at(-1);
  return last ? Boolean(last.args.solved) : null;
}

function render() {
  const wallet = viewer.wallet;
  const stage = problem.status_code;

  setText("#chainTotalVotes", String(state.total));
  show($id("sideMyVotesRow"), Boolean(wallet) && state.mine > 0);
  setText("#sideMyVotes", String(state.mine));

  renderVoting(stage === STATUS.VOTING, wallet);
  renderCompletion(stage === STATUS.COMPLETION_VOTING, wallet);

  const showTally = stage === STATUS.COMPLETION_VOTING || ([STATUS.COMPLETED, STATUS.FAILED].includes(stage) && state.yes + state.no > 0);
  show($id("completionStats"), showTally);
  if (showTally) {
    setText("#yesCount", String(state.yes));
    setText("#noCount", String(state.no));
    const sum = state.yes + state.no;
    $id("tallyFill").style.transform = `scaleX(${sum === 0 ? 0 : state.yes / sum})`;
  }
}

function renderVoting(active, wallet) {
  show($id("votingSection"), active);
  if (!active) return;

  const linked = Boolean(wallet) && hasWallet();
  show($id("myStake"), linked);
  show($id("voteControls"), linked);
  show($id("voteCostPreview"), linked);
  renderWalletPrompt($id("walletNotice"), linked, "vote on this issue");

  if (!linked) return;
  setText("#myVotes", String(state.mine));
  setText("#myCredits", String(state.credits));
  setText("#nextVoteCost", `${2 * state.mine + 1} credit${state.mine === 0 ? "" : "s"}`);
  updatePreview();
}

function renderCompletion(active, wallet) {
  const section = $id("completionVoting");
  const notice = $id("completionNotice");
  const countdown = $id("completionCountdown");

  show(section, false);
  show(notice, false);
  if (!active) {
    if (state.hasVotedCompletion && state.verdict !== null) {
      setNotice(notice, state.verdict);
    }
    return;
  }

  const closesAt = state.deadline;
  const expired = closesAt > 0 && Date.now() / 1000 >= closesAt;
  const isContractor = wallet && problem.contractor_wallet && wallet.toLowerCase() === problem.contractor_wallet.toLowerCase();

  if (state.hasVotedCompletion) {
    setNotice(notice, state.verdict);
    return;
  }
  if (isContractor) {
    notice.className = "my-verdict";
    notice.textContent = "This is your job, so you cannot vote on its completion.";
    show(notice, true);
    return;
  }
  if (expired) {
    notice.className = "my-verdict";
    notice.textContent = "The completion voting window has closed. The ward office will settle the result.";
    show(notice, true);
    return;
  }

  show(section, true);
  const linked = Boolean(wallet) && hasWallet();
  show($id("verdictControls"), linked);
  renderWalletPrompt($id("completionWalletNotice"), linked, "verify this repair");

  clearInterval(countdownTimer);
  if (closesAt > 0) {
    const tick = () => setText(countdown, `Voting ${timeLeft(closesAt)}`);
    tick();
    countdownTimer = setInterval(tick, 60000);
    show(countdown, true);
  }
}

function setNotice(node, verdict) {
  node.className = "my-verdict my-verdict-done";
  fill(
    node,
    h("span", { class: "my-verdict-label" }, "Your verdict"),
    h(
      "strong",
      { class: verdict === false ? "verdict-no" : "verdict-yes" },
      verdict === null ? "Recorded" : verdict ? "It's fixed" : "Still broken"
    )
  );
  show(node, true);
}

function renderWalletPrompt(node, linked, action) {
  if (linked) {
    show(node, false);
    return;
  }

  if (!hasWallet()) {
    fill(
      node,
      h("p", null, `Install MetaMask to ${action}. You can still read the issue and its public history.`),
      h("a", { class: "btn btn-sm btn-ghost", href: "https://metamask.io/download", target: "_blank", rel: "noreferrer" }, "Get MetaMask")
    );
  } else {
    fill(
      node,
      h("p", null, `Connect your wallet to ${action}.`),
      h(
        "button",
        {
          class: "btn btn-sm",
          type: "button",
          onClick: () => document.querySelector("#wallet-card button")?.click(),
        },
        "Connect wallet"
      )
    );
  }
  show(node, true);
}

function quadraticCost(current, additional) {
  const next = current + additional;
  return next * next - current * current;
}

function updatePreview() {
  const input = $id("voteInput");
  const preview = $id("voteCostPreview");
  const additional = Number(input.value);

  if (!input.value || !Number.isInteger(additional) || additional <= 0) {
    preview.textContent = "";
    preview.className = "cost-preview";
    return;
  }

  const cost = quadraticCost(state.mine, additional);
  const affordable = cost <= state.credits;
  preview.textContent = affordable
    ? `${additional} more vote${additional === 1 ? "" : "s"} costs ${cost} credits, taking you to ${state.mine + additional} on this issue`
    : `${cost} credits needed, you have ${state.credits}`;
  preview.className = `cost-preview ${affordable ? "cost-ok" : "cost-over"}`;
}

function bindActions() {
  const input = $id("voteInput");
  input.max = String(MAX_VOTES);
  input.addEventListener("input", updatePreview);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") $id("voteBtn").click();
  });

  $id("voteBtn").addEventListener("click", castVote);
  $id("yesBtn").addEventListener("click", (event) => castVerdict(event, true));
  $id("noBtn").addEventListener("click", (event) => castVerdict(event, false));
}

async function signerMatchesLinkedWallet() {
  const address = await chain.connect();
  if (address.toLowerCase() !== viewer.wallet.toLowerCase()) {
    toast(`Switch MetaMask to your linked wallet ${shortAddress(viewer.wallet)}`, "error");
    return false;
  }
  return true;
}

async function castVote(event) {
  const button = event.currentTarget;
  const input = $id("voteInput");
  const additional = Number(input.value);

  if (!viewer.wallet) {
    toast("Connect your wallet first", "error");
    return;
  }
  if (!Number.isInteger(additional) || additional <= 0) {
    toast("Enter a whole number of votes", "error");
    return;
  }
  if (additional > MAX_VOTES) {
    toast(`You can add at most ${MAX_VOTES} votes at a time`, "error");
    return;
  }

  const cost = quadraticCost(state.mine, additional);
  if (cost > state.credits) {
    toast(`Not enough credits, this costs ${cost}`, "error");
    return;
  }

  await withBusy(button, "Confirm in wallet...", async () => {
    try {
      if (!(await signerMatchesLinkedWallet())) return;

      const contract = await chain.getVotingContract();
      const tx = await contract.vote(chainId, additional);

      button.textContent = "Waiting for confirmation...";
      const receipt = await tx.wait();

      showTx(tx.hash, "Vote recorded");
      toast(`${additional} vote${additional === 1 ? "" : "s"} recorded on chain`, "success");
      input.value = "";

      button.textContent = "Updating...";
      await afterTransaction(receipt);
      renderVoteHistory().catch(console.error);
    } catch (err) {
      console.error(err);
      toast(readableError(err), "error");
    }
  });
}

async function castVerdict(event, solved) {
  const button = event.currentTarget;

  if (!viewer.wallet) {
    toast("Connect your wallet first", "error");
    return;
  }

  await withBusy(button, "Confirm in wallet...", async () => {
    try {
      if (!(await signerMatchesLinkedWallet())) return;

      const contract = await chain.getVotingContract();
      const tx = await contract.voteCompletion(chainId, solved);

      button.textContent = "Waiting for confirmation...";
      const receipt = await tx.wait();

      showTx(tx.hash, "Verdict recorded");
      toast(solved ? "Marked as fixed" : "Marked as still broken", "success");
      state.verdict = solved;

      button.textContent = "Updating...";
      await afterTransaction(receipt);
    } catch (err) {
      console.error(err);
      toast(readableError(err), "error");
    }
  });
}

// MetaMask's node confirms a transaction before the public read node has the
// block. Wait for the read node to catch up so the refreshed numbers are real.
async function afterTransaction(receipt) {
  const target = receipt?.blockNumber ?? 0;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      if ((await voting.provider.getBlockNumber()) >= target) break;
    } catch {
      /* keep waiting */
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  await refresh();
}

function showTx(hash, title = "Transaction confirmed") {
  const link = $id("txLink");
  link.href = chain.txUrl(hash);
  link.textContent = `View ${shortHash(hash)} on Sepolia Etherscan`;
  setText("#txTitle", title);
  show($id("txInfo"), true);
}

async function renderVoteHistory() {
  const list = $id("voteHistory");
  const events = await voting.queryFilter(voting.filters.VoteCast(chainId), DEPLOY_BLOCK);

  if (!events.length) {
    fill(list, h("li", { class: "muted" }, "No votes cast yet"));
    return;
  }

  const mine = viewer.wallet?.toLowerCase();
  const rows = events
    .slice(-15)
    .reverse()
    .map((event) => {
      const isMine = mine && event.args.voter.toLowerCase() === mine;
      return h(
        "li",
        { class: isMine ? "is-mine" : null },
        h("span", { class: "history-voter" }, isMine ? "You" : shortAddress(event.args.voter)),
        h("span", { class: "history-detail" }, `+${event.args.votes} votes, ${event.args.cost} credits`),
        h("a", { href: chain.txUrl(event.transactionHash), target: "_blank", rel: "noreferrer", class: "history-link" }, "View tx")
      );
    });

  fill(list, rows);
}

async function renderEscrowTxs() {
  const list = $id("escrowTxList");
  const treasury = chain.readTreasuryContract();

  const [created, advances, finals, failed] = await Promise.all([
    treasury.queryFilter(treasury.filters.EscrowCreated(chainId), DEPLOY_BLOCK),
    treasury.queryFilter(treasury.filters.AdvanceReleased(chainId), DEPLOY_BLOCK),
    treasury.queryFilter(treasury.filters.FinalReleased(chainId), DEPLOY_BLOCK),
    treasury.queryFilter(treasury.filters.EscrowFailed(chainId), DEPLOY_BLOCK),
  ]);

  const rows = [
    ...created.map((e) => ["Escrow created", e, e.args.amount]),
    ...advances.map((e) => ["Advance released", e, e.args.amount]),
    ...finals.map((e) => ["Final payment", e, e.args.amount]),
    ...failed.map((e) => ["Funds returned", e, e.args.refunded]),
  ]
    .sort((a, b) => a[1].blockNumber - b[1].blockNumber)
    .map(([label, event, amount]) =>
      h(
        "li",
        null,
        h("span", { class: "tx-label" }, label),
        h("span", { class: "tx-amount addr" }, amount ? `${chain.ethers.utils.formatEther(amount)} ETH` : ""),
        h("a", { href: chain.txUrl(event.transactionHash), target: "_blank", rel: "noreferrer" }, shortHash(event.transactionHash))
      )
    );

  fill(list, rows.length ? rows : h("li", { class: "muted" }, "No treasury activity yet"));
}
