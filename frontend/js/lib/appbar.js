import { h, fill } from "./dom.js";
import { bindThemeToggle } from "./theme.js";
import { homeFor, logout, PAGES } from "./session.js";
import { mountWalletCard } from "./wallet.js";

function roleLabel(profile) {
  if (profile.is_admin) return "Ward office";
  if (profile.is_contractor) return "Contractor";
  return "Resident";
}

// Fills the shared top bar: logo link to the user's own dashboard, role links,
// wallet button and a small profile menu. Every signed-in page calls this.
export function mountAppBar(profile, { onWalletChange } = {}) {
  bindThemeToggle();

  const home = PAGES[homeFor(profile)];
  document.querySelectorAll("[data-home-link]").forEach((link) => (link.href = home));

  document.querySelectorAll("[data-role]").forEach((node) => {
    const role = node.dataset.role;
    node.hidden = !((role === "admin" && profile.is_admin) || (role === "contractor" && profile.is_contractor));
  });

  const walletRoot = document.getElementById("wallet-card");
  if (walletRoot) {
    mountWalletCard(walletRoot, { userId: profile.id, wallet: profile.wallet }, (address) => {
      profile.wallet = address;
      onWalletChange?.(address);
    });
  }

  mountProfileMenu(document.getElementById("profile-menu"), profile);
}

function mountProfileMenu(root, profile) {
  if (!root) return;

  const name = (profile.full_name || "Resident").trim();
  const navLinks = [...document.querySelectorAll(".app-nav a")]
    .filter((link) => !link.hidden)
    .map((link) =>
      h("a", { class: "profile-link", href: link.getAttribute("href"), "aria-current": link.getAttribute("aria-current") }, link.textContent)
    );

  const pop = h(
    "div",
    { class: "profile-pop", role: "menu", hidden: true },
    h(
      "div",
      { class: "profile-head" },
      h("p", { class: "profile-name" }, name),
      h("p", { class: "profile-meta" }, [profile.locality || "No sector set", roleLabel(profile)].join(" · "))
    ),
    navLinks.length ? h("nav", { class: "profile-nav", "aria-label": "Pages" }, navLinks) : null,
    h("button", { class: "profile-link profile-signout", type: "button", onClick: (event) => logout(event.currentTarget) }, "Sign out")
  );

  const button = h(
    "button",
    {
      class: "avatar-btn",
      type: "button",
      "aria-haspopup": "menu",
      "aria-expanded": "false",
      "aria-label": `Account menu for ${name}`,
      onClick: () => toggle(),
    },
    name.charAt(0).toUpperCase()
  );

  function toggle(open = pop.hidden) {
    pop.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
  }

  document.addEventListener("click", (event) => {
    if (!pop.hidden && !root.contains(event.target)) toggle(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !pop.hidden) {
      toggle(false);
      button.focus();
    }
  });

  fill(root, button, pop);
}
