import { client, requireProfile, bindLogout, go } from "../lib/session.js";
import { h, fill, setText } from "../lib/dom.js";
import { readableError, skeleton, emptyState } from "../lib/ui.js";
import { rupees, relativeTime } from "../lib/format.js";
import { mountWalletCard } from "../lib/wallet.js";
import { STATUS, STATUS_LABEL } from "../config.js";
import { initTheme, bindThemeToggle } from "../lib/theme.js";
import { mountReportDialog } from "./report.js";

const PLACEHOLDER =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#e5e9f2"/><text x="50%" y="50%" text-anchor="middle" dy=".35em" fill="#93a0b8" font-family="sans-serif" font-size="15">No photo</text></svg>`
  );

const ACTIVE = [STATUS.VOTING, STATUS.UNDER_PROGRESS, STATUS.COMPLETION_VOTING];

initTheme();

document.addEventListener("DOMContentLoaded", async () => {
  const context = await requireProfile("id, full_name, locality, wallet, isContractor");
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
        h("span", { class: "chip" }, profile.isContractor ? "Contractor" : "Resident")
      )
    )
  );

  bindThemeToggle();

  mountWalletCard(document.getElementById("wallet-card"), {
    userId: profile.id,
    wallet: profile.wallet,
  });

  const contractorBtn = document.getElementById("contractor-btn");
  if (contractorBtn && profile.isContractor) contractorBtn.hidden = false;

  bindLogout("#logout");

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
    reportBtn.title = "Set your locality before reporting an issue";
  }

  await reload();
});

async function loadProblems(locality) {
  const container = document.getElementById("cards-container");
  fill(container, skeleton(3, 300));

  if (!locality) {
    fill(container, emptyState("No locality set", "Update your profile to see local issues."));
    return;
  }

  const { data, error } = await client()
    .from("problems")
    .select("id, title, description, image_url, status_code, cost, created_at, vote_count")
    .eq("locality", locality.trim())
    .order("status_code")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    fill(container, emptyState("Could not load problems", readableError(error)));
    return;
  }

  if (!data.length) {
    fill(
      container,
      emptyState("Nothing reported yet", "Be the first to report an issue in your area.")
    );
    return;
  }

  const active = data.filter((p) => ACTIVE.includes(p.status_code));
  const rest = data.filter((p) => !ACTIVE.includes(p.status_code));

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
      h("span", { class: `badge status-${problem.status_code}` }, status)
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
