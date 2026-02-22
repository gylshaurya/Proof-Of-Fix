import { initTheme, bindThemeToggle, revealOnScroll, stickyHeader } from "../lib/theme.js";

initTheme();

document.addEventListener("DOMContentLoaded", () => {
  bindThemeToggle();
  revealOnScroll();
  stickyHeader();

  document.querySelectorAll('.nav-links a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      const target = document.querySelector(link.getAttribute("href"));
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
});
