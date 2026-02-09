import {
  ethers,
  connect,
  currentAddress,
  getVotingContract,
  readVotingContract,
  readTreasuryContract,
  toChainId,
  txUrl,
  hasWallet,
} from "../blockchain.js";
import { client, requireProfile, bindLogout } from "../lib/session.js";
import { h, fill, setText, show } from "../lib/dom.js";
import { toast, readableError, withBusy, emptyState } from "../lib/ui.js";
import { rupees, shortAddress, shortHash, timeLeft } from "../lib/format.js";
import { STATUS, STATUS_LABEL, DEPLOY_BLOCK } from "../config.js";

const MAX_VOTES = 10;

let problem;
let chainId;
let voting;
let account;

document.addEventListener("DOMContentLoaded", async () => {
  const context = await requireProfile("id, locality, wallet, isContractor");
  if (!context) return;

  bindLogout("#logoutBtn");

  const problemId = new URLSearchParams(window.location.search).get("problemId");
  if (!problemId) {
    fill(document.querySelector(".problem-container"), emptyState("No problem selected"));
    return;
  }

  chainId = toChainId(problemId);

  const { data, error } = await client()
    .from("problems")
    .select("*")
    .eq("id", problemId)
    .maybeSingle();

  if (error || !data) {
    console.error(error);
    fill(document.querySelector(".problem-container"), emptyState("Problem not found"));
    return;
  }

  problem = data;
  renderDetails();

  if (!hasWallet()) {
    show(document.getElementById("walletNotice"), true);
    return;
  }

  voting = readVotingContract();

  try {
    await refreshStats();
    await renderVoteHistory();
    await renderEscrowTxs();
  } catch (err) {
    console.error(err);
    toast("Could not read on-chain data", "error");
  }

  if (problem.status_code === STATUS.VOTING) await setupVoting(context.profile);
  if (problem.status_code === STATUS.COMPLETION_VOTING) await setupCompletionVoting(context.profile);
});

function renderDetails() {
  setText("#problemTitle", problem.title);
  setText("#description", problem.description || "No description provided.");
  setText("#locality", problem.locality);
  setText("#cost", rupees(problem.cost));
  setText("#chainProblemId", chainId);

  const status = document.getElementById("status");
  status.textContent = STATUS_LABEL[problem.status_code] ?? "Unknown";
  status.className = `status-badge status-${problem.status_code}`;

  if (problem.image_url) {
    const img = document.getElementById("problemImage");
    img.src = problem.image_url;
    img.alt = problem.title;
    img.hidden = false;
  }

  if (problem.contractor_wallet) {
    setText("#contractorWallet", shortAddress(problem.contractor_wallet));
    show(document.getElementById("contractorRow"), true);
  }

  if (problem.remark) {
    setText("#contractorRemark", problem.remark);
    show(document.getElementById("remarkRow"), true);
  }
}

async function currentAccount() {
  if (!account) account = await connect();
  return account;
}

async function refreshStats() {
  const address = account || (await currentAddress());

  const [total, completion] = await Promise.all([
    voting.getTotalVotes(chainId),
    voting.getCompletionVotes(chainId),
  ]);

  setText("#chainTotalVotes", total.toString());

  let mine = 0;
  let credits = 0;

  if (address) {
    const [userVotes, userCredits] = await Promise.all([
      voting.getUserVotes(address, chainId),
      voting.creditsOf(address),
    ]);
    mine = Number(userVotes);
    credits = Number(userCredits);
    setText("#myVotes", String(mine));
    setText("#myCredits", String(credits));
  } else {
    setText("#myVotes", "connect wallet");
    setText("#myCredits", "connect wallet");
  }

  if (problem.status_code === STATUS.COMPLETION_VOTING) {
    setText("#yesCount", completion[0].toString());
    setText("#noCount", completion[1].toString());
    show(document.getElementById("completionStats"), true);
  }

  return { total, mine, credits };
}

function quadraticCost(current, additional) {
  const next = current + additional;
  return next * next - current * current;
}

async function setupVoting(profile) {
  const section = document.getElementById("votingSection");
  const input = document.getElementById("voteInput");
  const preview = document.getElementById("voteCostPreview");
  const button = document.getElementById("voteBtn");

  show(section, true);
  input.max = String(MAX_VOTES);

  const initial = await refreshStats();
  let currentVotes = initial.mine;
  let credits = initial.credits;

  input.addEventListener("input", () => {
    const additional = Number(input.value);

    if (!Number.isInteger(additional) || additional <= 0) {
      preview.textContent = "";
      preview.className = "";
      return;
    }

    const cost = quadraticCost(currentVotes, additional);
    const affordable = cost <= credits;

    preview.textContent = affordable
      ? `${additional} more vote(s) costs ${cost} credits, giving you ${currentVotes + additional} on this issue`
      : `${cost} credits needed but you only have ${credits}`;
    preview.className = affordable ? "cost-ok" : "cost-over";
  });

  button.addEventListener("click", async (event) => {
    if (!profile.wallet) {
      toast("Link your wallet on the dashboard first", "error");
      return;
    }

    const additional = Number(input.value);

    if (!Number.isInteger(additional) || additional <= 0) {
      toast("Enter a whole number of votes", "error");
      return;
    }

    if (additional > MAX_VOTES) {
      toast(`You can add at most ${MAX_VOTES} votes at a time`, "error");
      return;
    }

    await withBusy(event.currentTarget, "Confirm in wallet...", async () => {
      try {
        const address = await currentAccount();

        if (address.toLowerCase() !== profile.wallet.toLowerCase()) {
          toast(`Switch to your linked wallet ${shortAddress(profile.wallet)}`, "error");
          return;
        }

        const cost = quadraticCost(currentVotes, additional);
        if (cost > credits) {
          toast(`Not enough credits, this costs ${cost}`, "error");
          return;
        }

        const contract = await getVotingContract();
        const tx = await contract.vote(chainId, additional);

        event.currentTarget.textContent = "Waiting for confirmation...";
        await tx.wait();

        showTx(tx.hash);
        toast("Vote recorded on chain", "success");
        input.value = "";
        preview.textContent = "";

        const stats = await refreshStats();
        currentVotes = stats.mine;
        credits = stats.credits;

        await syncVoteCount(stats.total);
        await renderVoteHistory();
      } catch (err) {
        console.error(err);
        toast(readableError(err), "error");
      }
    });
  });
}

async function syncVoteCount(total) {
  const { error } = await client()
    .from("problems")
    .update({ vote_count: Number(total) })
    .eq("id", problem.id);

  if (error) console.warn("vote count sync failed", error);
}

async function setupCompletionVoting(profile) {
  const section = document.getElementById("completionVoting");
  const notice = document.getElementById("alreadyCompletionVotedMsg");
  const countdown = document.getElementById("completionCountdown");

  const address = await currentAddress();
  const [hasVoted, deadline] = await Promise.all([
    address ? voting.hasVotedCompletion(chainId, address) : false,
    voting.getCompletionDeadline(chainId),
  ]);

  const closesAt = Number(deadline);
  if (closesAt > 0) {
    const tick = () => setText(countdown, `Voting ${timeLeft(closesAt)}`);
    tick();
    setInterval(tick, 60000);
    show(countdown, true);
  }

  const expired = closesAt > 0 && Date.now() / 1000 >= closesAt;
  const isContractor =
    address &&
    problem.contractor_wallet &&
    address.toLowerCase() === problem.contractor_wallet.toLowerCase();

  if (hasVoted) {
    setText(notice, "You have already voted on this completion.");
    show(notice, true);
    return;
  }

  if (isContractor) {
    setText(notice, "Contractors cannot vote on their own work.");
    show(notice, true);
    return;
  }

  if (expired) {
    setText(notice, "The completion voting window has closed.");
    show(notice, true);
    return;
  }

  show(section, true);

  const cast = async (event, solved) => {
    if (!profile.wallet) {
      toast("Link your wallet on the dashboard first", "error");
      return;
    }

    await withBusy(event.currentTarget, "Confirm in wallet...", async () => {
      try {
        const signerAddress = await currentAccount();

        if (signerAddress.toLowerCase() !== profile.wallet.toLowerCase()) {
          toast(`Switch to your linked wallet ${shortAddress(profile.wallet)}`, "error");
          return;
        }

        const contract = await getVotingContract();
        const tx = await contract.voteCompletion(chainId, solved);

        event.currentTarget.textContent = "Waiting for confirmation...";
        await tx.wait();

        showTx(tx.hash);
        toast(solved ? "Marked as solved" : "Marked as not solved", "success");

        show(section, false);
        setText(notice, "Your verification has been recorded.");
        show(notice, true);

        await refreshStats();
      } catch (err) {
        console.error(err);
        toast(readableError(err), "error");
      }
    });
  };

  document.getElementById("yesBtn").addEventListener("click", (e) => cast(e, true));
  document.getElementById("noBtn").addEventListener("click", (e) => cast(e, false));
}

function showTx(hash) {
  const info = document.getElementById("txInfo");
  const link = document.getElementById("txLink");
  if (!info || !link) return;

  link.href = txUrl(hash);
  link.textContent = shortHash(hash);
  show(info, true);
}

async function renderVoteHistory() {
  const list = document.getElementById("voteHistory");
  if (!list) return;

  const events = await voting.queryFilter(voting.filters.VoteCast(chainId), DEPLOY_BLOCK);

  if (!events.length) {
    fill(list, h("li", { class: "muted" }, "No votes cast yet"));
    return;
  }

  const rows = events
    .slice(-15)
    .reverse()
    .map((event) =>
      h(
        "li",
        null,
        h("span", { class: "history-voter" }, shortAddress(event.args.voter)),
        h("span", { class: "history-detail" }, `+${event.args.votes} votes, ${event.args.cost} credits`),
        h(
          "a",
          { href: txUrl(event.transactionHash), target: "_blank", rel: "noreferrer", class: "history-link" },
          "tx"
        )
      )
    );

  fill(list, rows);
}

async function renderEscrowTxs() {
  const list = document.getElementById("escrowTxList");
  if (!list) return;

  const treasury = readTreasuryContract();

  const [created, advances, finals, failed] = await Promise.all([
    treasury.queryFilter(treasury.filters.EscrowCreated(chainId), DEPLOY_BLOCK),
    treasury.queryFilter(treasury.filters.AdvanceReleased(chainId), DEPLOY_BLOCK),
    treasury.queryFilter(treasury.filters.FinalReleased(chainId), DEPLOY_BLOCK),
    treasury.queryFilter(treasury.filters.EscrowFailed(chainId), DEPLOY_BLOCK),
  ]);

  const rows = [
    ...created.map((e) => ["Escrow created", e]),
    ...advances.map((e) => ["Advance released", e]),
    ...finals.map((e) => ["Final payment", e]),
    ...failed.map((e) => ["Funds returned", e]),
  ].map(([label, event]) =>
    h(
      "li",
      null,
      h("span", { class: "tx-label" }, label),
      h("span", { class: "tx-amount" }, event.args.amount ? `${ethers.utils.formatEther(event.args.amount)} ETH` : ""),
      h(
        "a",
        { href: txUrl(event.transactionHash), target: "_blank", rel: "noreferrer" },
        shortHash(event.transactionHash)
      )
    )
  );

  fill(list, rows.length ? rows : h("li", { class: "muted" }, "No treasury activity yet"));
}
