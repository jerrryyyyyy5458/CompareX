/* Intelligent search autocomplete — dropdown UI, scoring, cache, keyboard nav. */
import { debounce, formatPrice, safeJson, saveJson } from "./utils.js";
import { SUGGESTION_CATALOG } from "./suggestion-catalog.js";

const RECENT_KEY = "comparex-recent-searches";
const CACHE_LIMIT = 48;
const MAX_SUGGESTIONS = 8;
const MIN_CHARS = 2;

/** In-memory cache of scored suggestion lists keyed by normalized query. */
const suggestionCache = new Map();

function normalize(value = "") {
  return String(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightMatch(text, query) {
  const safe = escapeHtml(text);
  const needle = normalize(query);
  if (!needle) return safe;
  const tokens = needle.split(" ").filter(Boolean);
  if (!tokens.length) return safe;
  const pattern = new RegExp(`(${tokens.map(escapeRegExp).join("|")})`, "ig");
  return safe.replace(pattern, "<mark>$1</mark>");
}

function scoreSuggestion(item, query) {
  const q = normalize(query);
  if (!q) return 0;
  const name = normalize(item.name);
  const brand = normalize(item.brand);
  const category = normalize(item.category);
  const keywords = (item.keywords || []).map(normalize);
  let score = 0;

  if (name === q) score += 220;
  if (name.startsWith(q)) score += 160;
  if (brand.startsWith(q)) score += 120;
  if (keywords.some((keyword) => keyword.startsWith(q))) score += 110;

  const tokens = q.split(" ").filter(Boolean);
  for (const token of tokens) {
    if (name.includes(token)) score += 40;
    if (brand.includes(token)) score += 28;
    if (category.includes(token)) score += 12;
    if (keywords.some((keyword) => keyword.includes(token))) score += 22;
    if (name.split(" ").some((word) => word.startsWith(token))) score += 35;
  }

  if (name.includes(q)) score += 50;
  return score;
}

function recentSearches() {
  return safeJson(RECENT_KEY, []).filter((entry) => typeof entry === "string" && entry.trim());
}

function rememberSearch(query) {
  const cleaned = query.trim();
  if (cleaned.length < MIN_CHARS) return;
  const next = [cleaned, ...recentSearches().filter((entry) => normalize(entry) !== normalize(cleaned))].slice(0, 8);
  saveJson(RECENT_KEY, next);
}

function recentAsSuggestions(query) {
  const q = normalize(query);
  return recentSearches()
    .filter((entry) => !q || normalize(entry).includes(q) || normalize(entry).startsWith(q))
    .slice(0, 3)
    .map((entry) => ({
      id: `recent:${normalize(entry)}`,
      name: entry,
      brand: "Recent",
      category: "Recent search",
      price: null,
      image: null,
      isRecent: true,
      query: entry,
    }));
}

export function getSuggestions(query) {
  const cleaned = query.trim();
  if (cleaned.length < MIN_CHARS) return [];
  if (/^https?:\/\//i.test(cleaned)) return [];

  const cacheKey = normalize(cleaned);
  if (suggestionCache.has(cacheKey)) return suggestionCache.get(cacheKey);

  const scored = SUGGESTION_CATALOG
    .map((item) => ({ item, score: scoreSuggestion(item, cleaned) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || (a.item.price ?? Infinity) - (b.item.price ?? Infinity));

  const catalogHits = scored.slice(0, MAX_SUGGESTIONS).map(({ item }) => ({
    ...item,
    isRecent: false,
    query: item.name,
  }));

  const recentHits = recentAsSuggestions(cleaned).filter(
    (recent) => !catalogHits.some((hit) => normalize(hit.name) === normalize(recent.name)),
  );

  const merged = [...recentHits, ...catalogHits].slice(0, MAX_SUGGESTIONS);
  if (suggestionCache.size >= CACHE_LIMIT) {
    const oldest = suggestionCache.keys().next().value;
    suggestionCache.delete(oldest);
  }
  suggestionCache.set(cacheKey, merged);
  return merged;
}

function suggestionItemHtml(item, query, index, activeIndex) {
  const isActive = index === activeIndex;
  const price = item.price != null ? formatPrice(item.price) : "";
  const image = item.image
    ? `<img class="cx-ac-image" src="${escapeHtml(item.image)}" alt="" width="44" height="44" loading="lazy">`
    : `<span class="cx-ac-image cx-ac-image-recent" aria-hidden="true">⟲</span>`;
  const meta = item.isRecent
    ? `<span class="cx-ac-brand">Recent search</span>`
    : `<span class="cx-ac-brand">${escapeHtml(item.brand)}</span><span class="cx-ac-dot" aria-hidden="true">·</span><span class="cx-ac-category">${escapeHtml(item.category)}</span>`;

  return `
    <li class="cx-ac-item${isActive ? " is-active" : ""}" role="option" id="cx-ac-option-${index}" aria-selected="${isActive}" data-ac-index="${index}">
      <button type="button" class="cx-ac-option" data-ac-select="${index}">
        ${image}
        <span class="cx-ac-copy">
          <span class="cx-ac-name">${highlightMatch(item.name, query)}</span>
          <span class="cx-ac-meta">${meta}</span>
        </span>
        ${price ? `<span class="cx-ac-price">from ${escapeHtml(price)}</span>` : ""}
      </button>
    </li>
  `;
}

/**
 * Attach live autocomplete to a search input without changing submit behavior.
 * @param {{ input: HTMLInputElement, form?: HTMLFormElement|null, root?: ParentNode|null, onSelect?: (suggestion: object) => void }} options
 */
export function attachAutocomplete({ input, form = null, root = null, onSelect = null } = {}) {
  if (!input) return () => {};

  const host = root || input.closest(".hero-search, .search-form, .search-input") || input.parentElement;
  if (!host) return () => {};

  if (getComputedStyle(host).position === "static") host.style.position = "relative";

  const panel = document.createElement("div");
  panel.className = "cx-autocomplete";
  panel.hidden = true;
  panel.innerHTML = `
    <ul class="cx-ac-panel" role="listbox" aria-label="Search suggestions" data-ac-list></ul>
  `;
  host.append(panel);

  const list = panel.querySelector("[data-ac-list]");
  let items = [];
  let activeIndex = -1;
  let open = false;
  let lastQuery = "";

  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", list.id = `cx-ac-list-${Math.random().toString(36).slice(2, 8)}`);
  input.setAttribute("autocomplete", "off");

  const close = () => {
    if (!open) return;
    open = false;
    activeIndex = -1;
    panel.hidden = true;
    panel.classList.remove("is-open");
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  };

  const render = (query) => {
    lastQuery = query;
    items = getSuggestions(query);
    activeIndex = items.length ? 0 : -1;

    if (!items.length) {
      close();
      return;
    }

    list.innerHTML = items.map((item, index) => suggestionItemHtml(item, query, index, activeIndex)).join("");
    open = true;
    panel.hidden = false;
    requestAnimationFrame(() => panel.classList.add("is-open"));
    input.setAttribute("aria-expanded", "true");
    input.setAttribute("aria-activedescendant", `cx-ac-option-${activeIndex}`);
  };

  const setActive = (nextIndex) => {
    if (!items.length) return;
    activeIndex = (nextIndex + items.length) % items.length;
    list.querySelectorAll(".cx-ac-item").forEach((node, index) => {
      const active = index === activeIndex;
      node.classList.toggle("is-active", active);
      node.setAttribute("aria-selected", String(active));
    });
    input.setAttribute("aria-activedescendant", `cx-ac-option-${activeIndex}`);
    list.querySelector(".cx-ac-item.is-active")?.scrollIntoView({ block: "nearest" });
  };

  const choose = (index = activeIndex) => {
    const suggestion = items[index];
    if (!suggestion) return false;
    const value = suggestion.query || suggestion.name;
    input.value = value;
    rememberSearch(value);
    suggestionCache.clear();
    close();
    if (typeof onSelect === "function") onSelect(suggestion);
    else form?.requestSubmit();
    return true;
  };

  const updateFromInput = debounce(() => {
    const query = input.value.trim();
    if (query.length < MIN_CHARS) {
      close();
      return;
    }
    render(query);
  }, 300);

  const onInput = () => {
    const query = input.value.trim();
    if (query.length < MIN_CHARS) close();
    updateFromInput();
  };

  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        close();
      }
      return;
    }

    if (!open || !items.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(activeIndex + 1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(activeIndex - 1);
      return;
    }
    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      choose(activeIndex);
    }
  };

  const onPointerDown = (event) => {
    const button = event.target.closest("[data-ac-select]");
    if (!button || !panel.contains(button)) return;
    event.preventDefault();
    choose(Number(button.dataset.acSelect));
  };

  const onDocumentPointerDown = (event) => {
    if (!open) return;
    if (host.contains(event.target) || panel.contains(event.target)) return;
    close();
  };

  const onFocus = () => {
    const query = input.value.trim();
    if (query.length >= MIN_CHARS) render(query);
  };

  const onSubmit = () => {
    rememberSearch(input.value);
    close();
  };

  input.addEventListener("input", onInput);
  input.addEventListener("keydown", onKeyDown);
  input.addEventListener("focus", onFocus);
  panel.addEventListener("pointerdown", onPointerDown);
  document.addEventListener("pointerdown", onDocumentPointerDown);
  form?.addEventListener("submit", onSubmit);

  return () => {
    input.removeEventListener("input", onInput);
    input.removeEventListener("keydown", onKeyDown);
    input.removeEventListener("focus", onFocus);
    panel.removeEventListener("pointerdown", onPointerDown);
    document.removeEventListener("pointerdown", onDocumentPointerDown);
    form?.removeEventListener("submit", onSubmit);
    panel.remove();
  };
}
