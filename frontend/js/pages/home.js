import { requireProfile, go } from "../lib/session.js";
import { select } from "../lib/db.js";
import { h, fill, setText } from "../lib/dom.js";
import { readableError, skeleton, emptyState, pageReady } from "../lib/ui.js";
import { rupees, relativeTime } from "../lib/format.js";
import { mountAppBar } from "../lib/appbar.js";
import { loadChain } from "../lib/chain.js";
import { STATUS, STATUS_LABEL } from "../config.js";
import { mountReportDialog } from "./report.js";
import { initTheme } from "../lib/theme.js";

const PLACEHOLDER =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="225"><rect width="400" height="225" fill="#eeece7"/><text x="50%" y="50%" text-anchor="middle" dy=".35em" fill="#75758a" font-family="sans-serif" font-size="14">No photo</text></svg>`
  );

const ACTIVE = [STATUS.VOTING, STATUS.UNDER_PROGRESS, STATUS.COMPLETION_VOTING];

initTheme();
loadChain().catch(() => {});

let profile;
let rows = [];

document.addEventListener("DOMContentLoaded", async () => {
  const context = await requireProfile();
  if (!context) return;

  profile = context.profile;
  setText("#sectorName", profile.locality || "your sector");

  mountAppBar(profile, {
    onWalletChange: () => {
      loadCredits();
      loadChainStats();
    },
  });

  const reportBtn = document.getElementById("report-btn");
  if (profile.locality) {
    mountReportDialog({
      trigger: reportBtn,
      locality: profile.locality,
      userId: profile.id,
      onCreated: loadProblems,
    });
  } else {
    reportBtn.disabled = true;
    reportBtn.title = "Set your sector before reporting an issue";
  }

  pageReady();
  loadCredits();
  await loadProblems();
});

async function loadCredits() {
  if (!profile.wallet) {
    setText("#dashboardCredits", "-");
    document.getElementById("creditChip").title = "Connect a wallet to see your voting credits";
    return;
  }

  try {
    const { contractsReady, readVotingContract } = await loadChain();
    if (!contractsReady()) return;
    const credits = await readVotingContract().creditsOf(profile.wallet);
    setText("#dashboardCredits", credits.toString());
    document.getElementById("creditChip").title = "Voting credits left this round";
  } catch (err) {
    console.warn(err);
  }
}

async function loadProblems() {
  const container = document.getElementById("cards-container");
  fill(container, skeleton(3, 300));

  if (!profile.locality) {
    fill(container, emptyState("No sector set", "Your account has no sector yet, so there is nothing local to show."));
    return;
  }

  try {
    rows = await select("problems", {
      columns: "id,title,description,image_url,status_code,cost,vote_count,is_demo,created_at",
      filters: { locality: profile.locality.trim() },
      order: "status_code.asc,created_at.desc",
    });
  } catch (err) {
    fill(container, emptyState("Could not load issues", readableError(err)));
    return;
  }

  if (!rows.length) {
    setText("#active-count", "0");
    fill(container, emptyState("Nothing reported yet", "Be the first to report an issue in your area."));
    return;
  }

  const active = rows.filter((p) => ACTIVE.includes(p.status_code));
  const rest = rows.filter((p) => !ACTIVE.includes(p.status_code));

  setText("#active-count", String(active.length));
  fill(container, [...active, ...rest].map(card));

  loadChainStats();
}

// Live vote numbers for issues that are open for voting. Runs after the cards
// are on screen, so a slow RPC never delays the page.
async function loadChainStats() {
  const voting = rows.filter((p) => p.status_code === STATUS.VOTING);
  if (!voting.length) return;

  try {
    const { contractsReady, readVotingContract, toChainId } = await loadChain();
    if (!contractsReady()) return;
    const contract = readVotingContract();

    await Promise.all(
      voting.map(async (problem) => {
        const id = toChainId(problem.id);
        const [total, mine] = await Promise.all([
          contract.getTotalVotes(id),
          profile.wallet ? contract.getUserVotes(profile.wallet, id) : null,
        ]);

        const slot = document.querySelector(`[data-votes-for="${problem.id}"]`);
        if (!slot) return;

        const totalVotes = Number(total);
        const myVotes = mine === null ? 0 : Number(mine);
        fill(
          slot,
          h("span", null, `${totalVotes} ${totalVotes === 1 ? "vote" : "votes"}`),
          myVotes > 0 ? h("span", { class: "my-votes-pill" }, `You: ${myVotes}`) : null
        );
      })
    );
  } catch (err) {
    console.warn("Could not read live votes", err);
  }
}

function card(problem) {
  const status = STATUS_LABEL[problem.status_code] ?? "Unknown";
  const open = () => go("problem", { problemId: problem.id });

  return h(
    "article",
    {
      class: "issue-card",
      tabindex: "0",
      role: "link",
      onClick: open,
      onKeydown: (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      },
    },
    h(
      "div",
      { class: "issue-media" },
      h("img", {
        src: problem.image_url || PLACEHOLDER,
        alt: "",
        loading: "lazy",
        decoding: "async",
        onError: (event) => {
          event.currentTarget.src = PLACEHOLDER;
        },
      }),
      h("span", { class: `badge status-${problem.status_code}` }, status),
      problem.is_demo ? h("span", { class: "demo-flag" }, "Demo") : null
    ),
    h(
      "div",
      { class: "issue-body" },
      h("h3", null, problem.title),
      h("p", null, problem.description || "No description provided."),
      h(
        "div",
        { class: "issue-foot" },
        problem.cost ? h("span", { class: "issue-cost" }, rupees(problem.cost)) : null,
        h(
          "span",
          { class: "issue-votes", dataset: { votesFor: problem.id } },
          problem.vote_count ? `${problem.vote_count} votes` : null
        ),
        h("span", { class: "issue-time" }, relativeTime(problem.created_at))
      )
    )
  );
}
