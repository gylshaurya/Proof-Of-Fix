const KEY = "pof-theme";

export function storedTheme() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* storage blocked, theme still applies for this page */
  }
}

export function initTheme() {
  const saved = storedTheme();
  const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
  document.documentElement.dataset.theme = saved || (prefersLight ? "light" : "dark");
}

export function bindThemeToggle(selector = "#themeToggle") {
  const button = document.querySelector(selector);
  if (!button) return;

  button.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    applyTheme(next);
  });
}

export function revealOnScroll(selector = ".reveal") {
  const nodes = document.querySelectorAll(selector);
  if (!nodes.length) return;

  if (!("IntersectionObserver" in window)) {
    nodes.forEach((node) => node.classList.add("seen"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry, index) => {
        if (!entry.isIntersecting) return;
        const delay = Math.min(index * 70, 280);
        setTimeout(() => entry.target.classList.add("seen"), delay);
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -12% 0px", threshold: 0.08 }
  );

  nodes.forEach((node) => observer.observe(node));
}

export function stickyHeader(selector = "#nav", className = "stuck") {
  const header = document.querySelector(selector);
  if (!header) return;

  const onScroll = () => header.classList.toggle(className, window.scrollY > 8);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
}
