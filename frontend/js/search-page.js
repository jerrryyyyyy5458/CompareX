/* Premium SaaS-style comparison table for live marketplace results. */
import { api } from "./api.js?v=live5";
import { formatPrice } from "./utils.js";
import { initializeTheme } from "./theme.js";

const form = document.querySelector("[data-results-form]");
const input = document.querySelector("[data-results-input]");
const grid = document.querySelector("[data-results-grid]");
const count = document.querySelector("[data-result-count]");
const progress = document.querySelector("[data-search-progress]");
const progressLabel = document.querySelector("[data-progress-label]");
const progressCount = document.querySelector("[data-progress-count]");
const progressBar = document.querySelector("[data-progress-bar]");
const statusContainer = document.querySelector("[data-marketplace-statuses]");
const storeFilters = document.querySelector("[data-store-filters]");

let products = [];
let searchQuery = "";
let marketplaceStatuses = new Map();
let activeSource;
let searchRun = 0;
let tableSort = "low";
let chipFilter = "all";
let tableSearch = "";
/** @type {Map<string, object>} slug -> store metadata from GET /stores */
let registeredBySlug = new Map();
/** @type {Map<string, string>} lowercase name -> slug */
let slugByName = new Map();

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1560472354-b33ff0c44a43?auto=format&fit=crop&w=400&q=80";

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]);
}

function safeHttpUrl(value, fallback = "#") {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? escapeHtml(url.href) : fallback;
  } catch {
    return fallback;
  }
}

function parseAmount(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return value;
  const parsed = Number(String(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function tokenize(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function registerStores(stores = []) {
  registeredBySlug = new Map();
  slugByName = new Map();
  for (const store of stores) {
    if (!store?.slug) continue;
    registeredBySlug.set(store.slug, store);
    if (store.name) slugByName.set(String(store.name).toLowerCase().trim(), store.slug);
    slugByName.set(String(store.slug).toLowerCase().trim(), store.slug);
  }
}

function marketplaceKey(name = "") {
  const normalized = String(name).toLowerCase().trim();
  if (!normalized) return "";
  if (registeredBySlug.has(normalized)) return normalized;
  if (slugByName.has(normalized)) return slugByName.get(normalized);

  for (const [label, slug] of slugByName.entries()) {
    if (normalized.includes(label) || label.includes(normalized)) return slug;
  }
  return normalized.replace(/\s+/g, "-");
}

function marketplaceMeta(name = "") {
  const slug = marketplaceKey(name);
  const store = registeredBySlug.get(slug);
  if (store) {
    return {
      name: store.name || name,
      color: store.color || "#5f6368",
      logo: store.logo || null,
      mark: store.mark || String(store.name || name || "?").charAt(0).toUpperCase(),
    };
  }
  return {
    name,
    color: "#5f6368",
    logo: null,
    mark: String(name || "?").charAt(0).toUpperCase(),
  };
}

function storeIdentityHtml(meta, size = 28) {
  if (meta.logo) {
    return `<img class="cx-store-logo" src="${escapeHtml(meta.logo)}" alt="" width="${size}" height="${size}" loading="lazy">`;
  }
  return `<span class="cx-store-badge" style="width:${size}px;height:${size}px;background:${escapeHtml(meta.color)}" aria-hidden="true">${escapeHtml(meta.mark)}</span>`;
}

function selectedStoreSlugs() {
  return [...document.querySelectorAll("[data-store-filter]:checked")].map((filter) => filter.value);
}

async function loadStoreFilters() {
  if (!storeFilters) return false;
  storeFilters.innerHTML = `<p class="store-filter-empty">Loading marketplaces…</p>`;
  try {
    const payload = await api.stores();
    const stores = (payload.stores || []).filter((store) => store?.slug && store.enabled !== false);
    registerStores(stores);
    if (!stores.length) {
      storeFilters.innerHTML = `<p class="store-filter-error">No marketplaces available from the API.</p>`;
      return false;
    }
    storeFilters.innerHTML = stores.map((store) => {
      const mark = escapeHtml(store.mark || String(store.name || "?").charAt(0).toUpperCase());
      const color = escapeHtml(store.color || "#5f6368");
      const name = escapeHtml(store.name || store.slug);
      const slug = escapeHtml(store.slug);
      const badge = store.logo
        ? `<img class="cx-store-logo" src="${escapeHtml(store.logo)}" alt="" width="18" height="18" loading="lazy">`
        : `<span class="store-filter-mark" style="background:${color}">${mark}</span>`;
      return `<label>
        <input type="checkbox" value="${slug}" checked data-store-filter>
        ${badge}
        <span>${name}</span>
      </label>`;
    }).join("");
    return true;
  } catch {
    storeFilters.innerHTML = `<p class="store-filter-error">Could not load marketplaces. Start the API at <code>http://127.0.0.1:5000</code>.</p>`;
    return false;
  }
}

function matchScore(title, query) {
  const titleTokens = new Set(tokenize(title));
  const queryTokens = tokenize(query);
  if (!queryTokens.length) return 0;
  const overlap = queryTokens.filter((token) => titleTokens.has(token)).length;
  return overlap / queryTokens.length;
}

function discountValue(offer) {
  if (offer.discount != null && offer.discount !== "") {
    const parsed = parseAmount(offer.discount);
    if (parsed != null) return parsed;
  }
  const original = parseAmount(offer.original_price);
  if (original && offer.price && original > offer.price) {
    return Math.round((1 - offer.price / original) * 100);
  }
  return 0;
}

function discountLabel(offer) {
  const value = discountValue(offer);
  return value > 0 ? `${value}%` : "—";
}

function deliveryLabel(offer) {
  if (offer.delivery) return String(offer.delivery);
  const availability = String(offer.availability || "").toLowerCase();
  if (availability.includes("tomorrow")) return "Tomorrow";
  if (availability.includes("today") || availability.includes("minutes")) return "Today";
  if (/\d+\s*day/.test(availability)) {
    const match = availability.match(/(\d+)\s*day/);
    return match ? `${match[1]} Days` : offer.availability;
  }
  return "—";
}

function productToOffer(product) {
  const price = parseAmount(product.current_price ?? product.price);
  return {
    marketplace: product.store || product.marketplace,
    price,
    url: product.url,
    rating: product.rating,
    availability: product.availability || "Check availability",
    delivery: product.delivery || null,
    image_url: product.image_url || product.image,
    original_price: product.original_price,
    discount: product.discount,
    title: product.title,
    relevance: matchScore(product.title || "", searchQuery),
  };
}

function filteredProducts(sourceProducts) {
  const selectedStores = selectedStoreSlugs();
  const inStockOnly = document.querySelector("[data-in-stock-filter]")?.checked;
  return (sourceProducts || []).filter((product) => {
    const market = product.store || product.marketplace || "";
    const slug = marketplaceKey(market);
    const selected = !selectedStores.length || selectedStores.includes(slug);
    const available = !inStockOnly || String(product.availability || "").toLowerCase().includes("in stock");
    const price = parseAmount(product.current_price ?? product.price);
    return selected && available && price != null && product.url && product.title;
  });
}

/** One offer per marketplace: best title match to the search, then lowest price. */
function buildUnifiedComparison(sourceProducts, query) {
  const candidates = filteredProducts(sourceProducts);
  if (!candidates.length) return null;

  const bestByMarket = new Map();
  for (const product of candidates) {
    const key = marketplaceKey(product.store || product.marketplace || "");
    if (!key) continue;
    const score = matchScore(product.title || "", query);
    const price = parseAmount(product.current_price ?? product.price);
    const current = bestByMarket.get(key);
    if (
      !current
      || score > current.score + 0.05
      || (Math.abs(score - current.score) <= 0.05 && price < current.price)
    ) {
      bestByMarket.set(key, { product, score, price });
    }
  }

  const offers = [...bestByMarket.values()]
    .map(({ product, score }) => ({ ...productToOffer(product), relevance: score }))
    .sort((a, b) => a.price - b.price);

  if (!offers.length) return null;

  const rankedByMatch = [...bestByMarket.values()].sort((a, b) => b.score - a.score || a.price - b.price);
  const displayName = rankedByMatch[0]?.product?.title || query || "Product";
  const image = offers.find((offer) => offer.image_url)?.image_url || null;
  const prices = offers.map((offer) => offer.price);
  const lowest = Math.min(...prices);
  const highest = Math.max(...prices);

  return {
    id: "unified-search-comparison",
    product_name: displayName,
    image,
    offers,
    lowest_price: lowest,
    highest_price: highest,
    savings: offers.length > 1 ? highest - lowest : 0,
    best_marketplace: offers[0]?.marketplace,
    offer_count: offers.length,
  };
}

function sortOffers(offers, sortKey) {
  const sorted = [...offers];
  switch (sortKey) {
    case "high":
      return sorted.sort((a, b) => b.price - a.price);
    case "discount":
      return sorted.sort((a, b) => discountValue(b) - discountValue(a) || a.price - b.price);
    case "rating":
      return sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0) || a.price - b.price);
    case "delivery":
      return sorted.sort((a, b) => deliveryLabel(a).localeCompare(deliveryLabel(b)) || a.price - b.price);
    case "alpha":
      return sorted.sort((a, b) => String(a.marketplace).localeCompare(String(b.marketplace)));
    case "relevance":
      return sorted.sort((a, b) => (b.relevance || 0) - (a.relevance || 0) || a.price - b.price);
    case "low":
    default:
      return sorted.sort((a, b) => a.price - b.price);
  }
}

function visibleOffers(comparison) {
  let offers = [...comparison.offers];
  if (chipFilter !== "all") {
    offers = offers.filter((offer) => marketplaceKey(offer.marketplace) === chipFilter);
  }
  if (tableSearch.trim()) {
    const needle = tableSearch.trim().toLowerCase();
    offers = offers.filter((offer) => {
      const haystack = `${offer.marketplace || ""} ${offer.title || ""}`.toLowerCase();
      return haystack.includes(needle);
    });
  }
  return sortOffers(offers, tableSort);
}

function summaryBar(comparison, offers) {
  const prices = offers.map((offer) => offer.price);
  const lowest = prices.length ? Math.min(...prices) : comparison.lowest_price;
  const highest = prices.length ? Math.max(...prices) : comparison.highest_price;
  const best = offers.find((offer) => offer.price === lowest) || comparison.offers[0];
  const savings = prices.length > 1 ? highest - lowest : 0;

  const marketCount = comparison.offer_count || comparison.offers.length;
  return `<div class="cx-summary-bar">
    <div class="cx-summary-main">
      <p class="cx-summary-eyebrow">CompareX intelligence</p>
      <h2 class="cx-summary-title">Compared across ${marketCount} marketplace${marketCount === 1 ? "" : "s"}</h2>
      <p class="cx-summary-product">${escapeHtml(comparison.product_name)}</p>
    </div>
    <div class="cx-summary-stats">
      <div><span>Lowest Price</span><strong>${formatPrice(lowest)}</strong></div>
      <div><span>Highest Price</span><strong>${formatPrice(highest)}</strong></div>
      <div><span>You Save</span><strong class="is-save">${savings > 0 ? formatPrice(savings) : "—"}</strong></div>
      <div><span>Best Deal</span><strong class="is-best">${escapeHtml(best?.marketplace || "—")}</strong></div>
    </div>
  </div>`;
}

function filterChips(comparison) {
  const markets = [...new Map(
    comparison.offers.map((offer) => [marketplaceKey(offer.marketplace), offer.marketplace]),
  ).entries()];

  return `<div class="cx-chip-row" role="toolbar" aria-label="Filter marketplaces">
    <button type="button" class="cx-chip${chipFilter === "all" ? " is-active" : ""}" data-chip-filter="all">All</button>
    ${markets.map(([slug, name]) => `
      <button type="button" class="cx-chip${chipFilter === slug ? " is-active" : ""}" data-chip-filter="${escapeHtml(slug)}">
        ${escapeHtml(name)}
      </button>
    `).join("")}
  </div>`;
}

function toolbar() {
  return `<div class="cx-toolbar">
    <label class="cx-search-wrap">
      <span class="cx-search-icon" aria-hidden="true">⌕</span>
      <input type="search" class="cx-table-search" data-table-search placeholder="Search marketplaces..." value="${escapeHtml(tableSearch)}" aria-label="Search marketplaces">
    </label>
    <label class="cx-sort-wrap">
      <span>Sort By</span>
      <select data-table-sort aria-label="Sort comparison table">
        <option value="low"${tableSort === "low" ? " selected" : ""}>Lowest Price</option>
        <option value="high"${tableSort === "high" ? " selected" : ""}>Highest Price</option>
        <option value="discount"${tableSort === "discount" ? " selected" : ""}>Highest Discount</option>
        <option value="rating"${tableSort === "rating" ? " selected" : ""}>Rating</option>
        <option value="delivery"${tableSort === "delivery" ? " selected" : ""}>Delivery Time</option>
        <option value="alpha"${tableSort === "alpha" ? " selected" : ""}>Alphabetical</option>
        <option value="relevance"${tableSort === "relevance" ? " selected" : ""}>Most Relevant</option>
      </select>
    </label>
  </div>`;
}

function tableRow(offer, isBest) {
  const meta = marketplaceMeta(offer.marketplace);
  const title = escapeHtml(offer.title || "");
  const image = safeHttpUrl(offer.image_url, FALLBACK_IMAGE);
  const url = safeHttpUrl(offer.url);
  const original = parseAmount(offer.original_price);
  const discount = discountLabel(offer);
  const rating = offer.rating != null ? `★ ${escapeHtml(String(offer.rating))}` : "—";
  const delivery = escapeHtml(deliveryLabel(offer));
  const availability = escapeHtml(offer.availability || "Check availability");

  return `<tr class="cx-row${isBest ? " is-best-deal" : ""}" data-offer-url="${url}" tabindex="0" role="link">
    <td class="cx-col-store">
      <div class="cx-store-cell">
        <div>
          <strong>${escapeHtml(offer.marketplace || meta.name)}</strong>
          ${isBest ? `<span class="cx-best-badge">🏆 Best Deal</span>` : ""}
        </div>
      </div>
    </td>
    <td class="cx-col-logo">
      ${storeIdentityHtml(meta, 28)}
    </td>
    <td class="cx-col-image">
      <img class="cx-product-thumb" src="${image}" alt="${title}" loading="lazy">
    </td>
    <td class="cx-col-name">
      <span class="cx-product-name">${title}</span>
    </td>
    <td class="cx-col-price"><strong>${formatPrice(offer.price)}</strong></td>
    <td class="cx-col-original">${original && original > offer.price ? `<del>${formatPrice(original)}</del>` : "—"}</td>
    <td class="cx-col-discount"><span class="cx-discount">${escapeHtml(discount)}</span></td>
    <td class="cx-col-availability">${availability}</td>
    <td class="cx-col-rating">${rating}</td>
    <td class="cx-col-delivery">${delivery}</td>
    <td class="cx-col-buy">
      <a class="cx-buy-btn" href="${url}" target="_blank" rel="noopener noreferrer" data-buy-link>Buy</a>
    </td>
  </tr>`;
}

function mobileCard(offer, isBest) {
  const meta = marketplaceMeta(offer.marketplace);
  const title = escapeHtml(offer.title || "");
  const image = safeHttpUrl(offer.image_url, FALLBACK_IMAGE);
  const url = safeHttpUrl(offer.url);
  const original = parseAmount(offer.original_price);
  const discount = discountLabel(offer);

  return `<a class="cx-mobile-card${isBest ? " is-best-deal" : ""}" href="${url}" target="_blank" rel="noopener noreferrer">
    <div class="cx-mobile-top">
      ${storeIdentityHtml(meta, 24)}
      <strong>${escapeHtml(offer.marketplace || meta.name)}</strong>
      ${isBest ? `<span class="cx-best-badge">🏆 Best Deal</span>` : ""}
    </div>
    <div class="cx-mobile-body">
      <img class="cx-product-thumb" src="${image}" alt="${title}" loading="lazy">
      <div>
        <p class="cx-product-name">${title}</p>
        <div class="cx-mobile-price">
          <strong>${formatPrice(offer.price)}</strong>
          ${original && original > offer.price ? `<del>${formatPrice(original)}</del>` : ""}
          <span class="cx-discount">${escapeHtml(discount)}</span>
        </div>
        <small>${escapeHtml(offer.availability || "Check availability")} · ${escapeHtml(deliveryLabel(offer))}</small>
      </div>
    </div>
    <span class="cx-buy-btn">Buy</span>
  </a>`;
}

function comparisonTable(comparison) {
  const offers = visibleOffers(comparison);
  if (!offers.length) {
    return `${summaryBar(comparison, comparison.offers)}
      ${toolbar()}
      ${filterChips(comparison)}
      <div class="empty-state"><h2>No matching marketplaces</h2><p>Try another filter or search term.</p></div>`;
  }

  const lowest = Math.min(...offers.map((offer) => offer.price));

  return `<section class="cx-comparison-panel" data-comparison-id="${escapeHtml(comparison.id)}">
    ${summaryBar(comparison, offers)}
    ${toolbar()}
    ${filterChips(comparison)}
    <div class="cx-table-shell">
      <table class="cx-compare-table">
        <thead>
          <tr>
            <th>Store</th>
            <th>Logo</th>
            <th>Product Image</th>
            <th>Product Name</th>
            <th>Price</th>
            <th>Original Price</th>
            <th>Discount %</th>
            <th>Availability</th>
            <th>Rating</th>
            <th>Delivery</th>
            <th>Buy</th>
          </tr>
        </thead>
        <tbody>
          ${offers.map((offer) => tableRow(offer, offer.price === lowest && offers.length > 1)).join("")}
        </tbody>
      </table>
    </div>
    <div class="cx-mobile-list">
      ${offers.map((offer) => mobileCard(offer, offer.price === lowest && offers.length > 1)).join("")}
    </div>
  </section>`;
}

function render() {
  const comparison = buildUnifiedComparison(products, searchQuery);
  if (!comparison) {
    count.textContent = "No marketplace matches yet";
    grid.innerHTML = `<div class="empty-state"><h2>No matching comparisons yet</h2><p>Try another product name or choose more marketplaces.</p></div>`;
    return;
  }

  const offers = visibleOffers(comparison);
  count.textContent = `1 comparison · ${offers.length} marketplace${offers.length === 1 ? "" : "s"} shown`;
  grid.innerHTML = comparisonTable(comparison);
}

function renderProgress(isComplete = false) {
  const statuses = [...marketplaceStatuses.values()];
  const finished = statuses.filter(({ status }) => status !== "searching").length;
  const failed = statuses.filter(({ status }) => status === "failed").length;
  const total = statuses.length;
  progress.hidden = false;
  progressCount.textContent = `${finished} / ${total} complete`;
  progressBar.style.width = `${total ? (finished / total) * 100 : 0}%`;
  progressLabel.textContent = isComplete
    ? `Live search complete${failed ? ` · ${failed} unavailable` : ""}`
    : "Searching live marketplaces…";
  statusContainer.innerHTML = statuses.map((marketplace) => {
    const failedText = marketplace.status === "failed" ? `${marketplace.name} temporarily unavailable` : marketplace.name;
    const completedText = marketplace.status === "completed" ? `${failedText} · ${marketplace.product_count} found` : failedText;
    return `<span class="marketplace-status is-${marketplace.status}" title="${escapeHtml(marketplace.message || "")}">${escapeHtml(completedText)}</span>`;
  }).join("");
}

async function performSearch(query) {
  activeSource?.close();
  const currentRun = ++searchRun;
  searchQuery = query;
  if (query.length < 2) {
    count.textContent = "Enter at least two characters to search.";
    grid.innerHTML = "";
    progress.hidden = true;
    return;
  }
  const stores = selectedStoreSlugs();
  if (!stores.length) {
    count.textContent = "Enable at least one marketplace.";
    grid.innerHTML = "";
    progress.hidden = true;
    return;
  }

  products = [];
  chipFilter = "all";
  tableSearch = "";
  tableSort = "low";
  marketplaceStatuses.clear();
  let searchCompleted = false;
  count.textContent = "Searching live marketplaces…";
  grid.innerHTML = "<div class=\"skeleton\"></div>".repeat(2);
  progress.hidden = false;
  progressLabel.textContent = "Connecting to marketplaces…";
  progressCount.textContent = `0 / ${stores.length} complete`;
  progressBar.style.width = "0";
  statusContainer.innerHTML = "";

  const handleEvent = (event, source) => {
    if (currentRun !== searchRun) return source.close();
    if (event.type === "started") {
      marketplaceStatuses = new Map(event.marketplaces.map((item) => [item.slug, item]));
      renderProgress();
    }
    if (event.type === "marketplace") {
      marketplaceStatuses.set(event.marketplace.slug, event.marketplace);
      renderProgress();
      count.textContent = "Matching the same products across stores…";
    }
    if (event.type === "complete") {
      searchCompleted = true;
      products = event.products || [];
      marketplaceStatuses = new Map(event.marketplaces.map((item) => [item.slug, item]));
      renderProgress(true);
      render();
      source.close();
      activeSource = null;
    }
  };

  const showConnectionError = () => {
    count.textContent = "We couldn’t reach the comparison service.";
    grid.innerHTML = `<div class="empty-state"><h2>Comparison service unavailable</h2><p>Start the Flask API at <code>http://127.0.0.1:5000</code>, then try again.</p></div>`;
    progressLabel.textContent = "Live search connection failed";
  };

  const handleError = (_error, source) => {
    if (currentRun !== searchRun || !activeSource) return;
    if (searchCompleted || source.readyState === EventSource.CLOSED) {
      source.close();
      activeSource = null;
      return;
    }
    if (products.length) {
      source.close();
      activeSource = null;
      progressLabel.textContent = "Live search interrupted · showing comparisons";
      renderProgress(true);
      render();
      return;
    }
    source.close();
    activeSource = null;
    showConnectionError();
  };

  if ("EventSource" in window) {
    activeSource = api.searchStream(query, stores, handleEvent, handleError);
  } else {
    try {
      const response = await api.search(query, stores);
      handleEvent({ type: "complete", ...response }, { close() {} });
    } catch (error) {
      showConnectionError();
    }
  }
}

grid?.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-chip-filter]");
  if (chip) {
    chipFilter = chip.getAttribute("data-chip-filter") || "all";
    render();
    return;
  }

  if (event.target.closest("[data-buy-link]")) return;

  const row = event.target.closest("[data-offer-url]");
  if (row) {
    const url = row.getAttribute("data-offer-url");
    if (url && url !== "#") window.open(url, "_blank", "noopener,noreferrer");
  }
});

grid?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const row = event.target.closest("[data-offer-url]");
  if (!row) return;
  event.preventDefault();
  const url = row.getAttribute("data-offer-url");
  if (url && url !== "#") window.open(url, "_blank", "noopener,noreferrer");
});

grid?.addEventListener("change", (event) => {
  if (event.target.matches("[data-table-sort]")) {
    tableSort = event.target.value;
    render();
  }
});

grid?.addEventListener("input", (event) => {
  if (event.target.matches("[data-table-search]")) {
    tableSearch = event.target.value;
    const caretStart = event.target.selectionStart;
    const caretEnd = event.target.selectionEnd;
    render();
    const next = grid.querySelector("[data-table-search]");
    if (next) {
      next.focus();
      try { next.setSelectionRange(caretStart, caretEnd); } catch { /* ignore */ }
    }
  }
});

const query = new URLSearchParams(window.location.search).get("query") || "";
input.value = query;
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const nextQuery = input.value.trim();
  history.replaceState({}, "", `?query=${encodeURIComponent(nextQuery)}`);
  performSearch(nextQuery);
});

storeFilters?.addEventListener("change", (event) => {
  if (event.target.matches("[data-store-filter]")) render();
});
document.querySelectorAll("[data-sort], [data-in-stock-filter]").forEach((control) => {
  control.addEventListener("change", () => {
    if (control.matches("[data-sort]")) {
      tableSort = control.value === "high"
        ? "high"
        : control.value === "rating"
          ? "rating"
          : control.value === "relevance"
            ? "relevance"
            : "low";
    }
    render();
  });
});

initializeTheme();
(async () => {
  const ready = await loadStoreFilters();
  if (!ready) {
    count.textContent = "Marketplaces unavailable";
    grid.innerHTML = `<div class="empty-state"><h2>Could not load marketplaces</h2><p>Start the Flask API at <code>http://127.0.0.1:5000</code>, then refresh.</p></div>`;
    return;
  }
  performSearch(query);
})();
