/* Search form behavior, typeahead-friendly navigation and horizontal category drag. */
import { debounce } from "./utils.js";

export function initializeSearch() {
  const form = document.querySelector("[data-search-form]");
  const input = document.querySelector("[data-search-input]");
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = input?.value.trim();
    if (query) window.location.href = `pages/search/?query=${encodeURIComponent(query)}`;
  });
  document.querySelector("[data-clear-search]")?.addEventListener("click", () => { if (input) input.value = ""; input?.focus(); });
  document.querySelectorAll("[data-search-suggestion]").forEach((button) => button.addEventListener("click", () => {
    if (!input) return;
    input.value = button.textContent; form?.requestSubmit();
  }));

  // Debounced history storage avoids noisy writes while preserving recent intent.
  input?.addEventListener("input", debounce(() => {
    const searches = JSON.parse(localStorage.getItem("comparex-recent-searches") || "[]");
    const query = input.value.trim();
    if (query.length > 2 && !searches.includes(query)) localStorage.setItem("comparex-recent-searches", JSON.stringify([query, ...searches].slice(0, 5)));
  }, 500));
}

export function initializeCategoryWheel() {
  const track = document.querySelector("[data-wheel-track]");
  if (!track) return;
  const scrollByCard = (direction) => track.scrollBy({ left: direction * 220, behavior: "smooth" });
  document.querySelector("[data-wheel-prev]")?.addEventListener("click", () => scrollByCard(-1));
  document.querySelector("[data-wheel-next]")?.addEventListener("click", () => scrollByCard(1));

  let startX = 0; let scrollStart = 0;
  track.addEventListener("pointerdown", (event) => { startX = event.clientX; scrollStart = track.scrollLeft; track.setPointerCapture(event.pointerId); track.classList.add("is-dragging"); });
  track.addEventListener("pointermove", (event) => { if (!track.classList.contains("is-dragging")) return; track.scrollLeft = scrollStart - (event.clientX - startX); });
  ["pointerup", "pointercancel"].forEach((eventName) => track.addEventListener(eventName, () => track.classList.remove("is-dragging")));
  track.addEventListener("wheel", (event) => {
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) { event.preventDefault(); track.scrollLeft += event.deltaY; }
  }, { passive: false });
}
