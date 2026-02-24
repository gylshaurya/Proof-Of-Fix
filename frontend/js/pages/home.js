import { requireProfile, bindLogout, go } from "../lib/session.js";
import { sql } from "../lib/db.js";
import { h, fill, setText } from "../lib/dom.js";
import { readableError, skeleton, emptyState } from "../lib/ui.js";
import { rupees, relativeTime } from "../lib/format.js";
import { mountWalletCard } from "../lib/wallet.js";
import { STATUS, STATUS_LABEL } from "../config.js";
import { mountReportDialog } from "./report.js";
import { initTheme, bindThemeToggle } from "../lib/theme.js";

const PLACEHOLDER =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="225"><rect width="400" height="225" fill="#16191d"/><text x="50%" y="50%" text-anchor="middle" dy=".35em" fill="#828890" font-family="sans-serif" font-size="14">No photo</text></svg>`
  );

const ACTIVE = [STATUS.VOTING, STATUS.UNDER_PROGRESS, STATUS.COMPLETION_VOTING];

initTheme();

document.addEventListener("DOMContentLoaded", async () => {
  const context = await requireProfile();
  if (!context) return;

  const { profile } = context;
  const name = profile.full_name || "Resident";

  fill(
    document.getElementById("user-info"),
    h("div", { class: "avatar", "aria-hidden": "true" }, name.trim().charAt(0).toUpperCase()),
    h(
      "div",
      null,
      h("p", { class: "identity-name" }, name),
      h(
        "div",
        { class: "identity-meta" },
        h("span", { class: "chip" }, profile.locality || "No sector set"),
        h("span", { class: "chip" }, profile.is_contractor ? "Contractor" : "Resident")
      )
    )
  );

  bindThemeToggle();
  bindLogout("#logout");

  mountWalletCard(document.getElementById("wallet-card"), {
    userId: profile.id,
    wallet: profile.wallet,
  });

  const contractorBtn = document.getElementById("contractor-btn");
  if (contractorBtn && profile.is_contractor) contractorBtn.hidden = false;

  const reload = () => loadProblems(profile.locality);

  const reportBtn = document.getElementById("report-btn");
  if (profile.locality) {
    mountReportDialog({
      trigger: reportBtn,
      locality: profile.locality,
      userId: profile.id,
      onCreated: reload,
    });
  } else {
    reportBtn.disabled = true;
    reportBtn.title = "Set your sector before reporting an issue";
  }

  await reload();
});

async function loadProblems(locality) {
  const container = document.getElementById("cards-container");
  fill(container, skeleton(3, 300));

  if (!locality) {
    fill(container, emptyState("No sector set", "Pick a sector in your profile to see local issues."));
    return;
  }

  let rows;
  try {
    rows = await sql`
      select id, title, description, image_url, status_code, cost, vote_count, is_demo, created_at
      from problems
      where locality = ${locality.trim()}
      order by status_code asc, created_at desc
    `;
  } catch (err) {
    fill(container, emptyState("Could not load issues", readableError(err)));
    return;
  }

  if (!rows.length) {
    fill(container, emptyState("Nothing reported yet", "Be the first to report an issue in your area."));
    return;
  }

  const active = rows.filter((p) => ACTIVE.includes(p.status_code));
  const rest = rows.filter((p) => !ACTIVE.includes(p.status_code));

  setText("#active-count", String(active.length));
  fill(container, [...active, ...rest].map(card));
}

function card(problem) {
  const status = STATUS_LABEL[problem.status_code] ?? "Unknown";

  return h(
    "article",
    {
      class: "issue-card",
      tabindex: "0",
      role: "link",
      onClick: () => go("problem", { problemId: problem.id }),
      onKeydown: (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          go("problem", { problemId: problem.id });
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
        problem.vote_count ? h("span", null, `${problem.vote_count} votes`) : null,
        h("span", { class: "issue-time" }, relativeTime(problem.created_at))
      )
    )
  );
}
