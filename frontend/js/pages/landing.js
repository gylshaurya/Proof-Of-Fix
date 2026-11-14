import { initTheme, bindThemeToggle, revealOnScroll, stickyHeader } from "../lib/theme.js";

initTheme();

document.addEventListener("DOMContentLoaded", () => {
  bindThemeToggle();
  revealOnScroll();
  stickyHeader();

  // Signed-in visitors see "Open dashboard" (toggled by the inline head script).
  // Point it at their own dashboard: residents, contractors and the ward office differ.
  let home = null;
  try {
    home = localStorage.getItem("pof-session");
  } catch {
    /* storage blocked */
  }
  if (home && /^[a-z]+\.html$/.test(home)) {
    document.querySelectorAll("[data-home-link]").forEach((link) => (link.href = home));
  }

  document.querySelectorAll('.nav-links a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      const target = document.querySelector(link.getAttribute("href"));
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
});
