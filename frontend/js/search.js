/* Search form behavior, typeahead-friendly navigation and horizontal category drag. */
import { debounce } from "./utils.js";
import { SEARCH_MARKETPLACES } from "./marketplace-data.js?v=save8";

export function initializeSearch() {
  const form = document.querySelector("[data-search-form]");
  const input = document.querySelector("[data-search-input]");
  const placeholder = document.querySelector("[data-dynamic-placeholder]");
  const marketSlot = document.querySelector("[data-placeholder-market-slot]");
  let marketplaceIndex = 0;
  let placeholderTimer = null;

  const marketplaceToken = (marketplace, entering = false) => {
    const token = document.createElement("span");
    token.className = `placeholder-market${entering ? " is-entering" : ""}`;
    token.style.setProperty("--market-color", marketplace.color);
    token.innerHTML = `<img src="${marketplace.logo}" alt=""><strong>${marketplace.name}</strong>`;
    return token;
  };

  const showNextMarketplace = () => {
    if (!marketSlot || input?.value) return;
    marketplaceIndex = (marketplaceIndex + 1) % SEARCH_MARKETPLACES.length;
    const current = marketSlot.querySelector(".placeholder-market");
    const next = marketplaceToken(SEARCH_MARKETPLACES[marketplaceIndex], true);
    marketSlot.append(next);
    requestAnimationFrame(() => {
      current?.classList.add("is-leaving");
      next.classList.remove("is-entering");
    });
    window.setTimeout(() => current?.remove(), 300);
  };

  const stopPlaceholderCycle = () => {
    window.clearInterval(placeholderTimer);
    placeholderTimer = null;
  };

  const startPlaceholderCycle = () => {
    stopPlaceholderCycle();
    if (!input?.value) placeholderTimer = window.setInterval(showNextMarketplace, 2000);
  };

  if (marketSlot) {
    marketSlot.append(marketplaceToken(SEARCH_MARKETPLACES[marketplaceIndex]));
    startPlaceholderCycle();
  }

  const syncPlaceholder = () => {
    const hasValue = Boolean(input?.value);
    placeholder?.classList.toggle("is-hidden", hasValue);
    if (hasValue) stopPlaceholderCycle();
    else startPlaceholderCycle();
  };

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = input?.value.trim();
    if (query) window.location.href = `pages/search/?query=${encodeURIComponent(query)}`;
  });
  document.querySelector("[data-clear-search]")?.addEventListener("click", () => {
    if (input) input.value = "";
    syncPlaceholder();
    input?.focus();
  });
  document.querySelectorAll("[data-search-suggestion]").forEach((button) => button.addEventListener("click", () => {
    if (!input) return;
    input.value = button.textContent; form?.requestSubmit();
  }));
  input?.addEventListener("input", syncPlaceholder);
  syncPlaceholder();

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
