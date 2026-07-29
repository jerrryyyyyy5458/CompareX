/* Persistent light/dark theme selection. */
export function initializeTheme() {
  const savedTheme = localStorage.getItem("comparex-theme");
  const initialTheme = savedTheme || (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  document.documentElement.dataset.theme = initialTheme;

  document.querySelector("[data-theme-toggle]")?.addEventListener("click", () => {
    const nextTheme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem("comparex-theme", nextTheme);
  });
}
