/* Live search progress and expandable cross-marketplace comparison cards. */
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
let comparisons = [];
let marketplaceStatuses = new Map();
let activeSource;
let searchRun = 0;
let expandedIds = new Set();

const STORE_SLUGS = {
  "amazon india": "amazon",
  flipkart: "flipkart",
  myntra: "myntra",
  ajio: "ajio",
  croma: "croma",
  "vijay sales": "vijay-sales",
  nykaa: "nykaa",
};

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

function filteredOffers(comparison) {
  const selectedStores = [...document.querySelectorAll("[data-store-filter]:checked")].map((filter) => filter.value);
  const inStockOnly = document.querySelector("[data-in-stock-filter]")?.checked;
  return (comparison.offers || []).filter((offer) => {
    const slug = STORE_SLUGS[(offer.marketplace || "").toLowerCase()];
    const selected = !selectedStores.length || selectedStores.includes(slug);
    const available = !inStockOnly || (offer.availability || "").toLowerCase().includes("in stock");
    return selected && available;
  });
}

function summarizeOffers(offers) {
  if (!offers.length) return null;
  const prices = offers.map((offer) => offer.price);
  const lowest = Math.min(...prices);
  const highest = Math.max(...prices);
  const average = prices.reduce((sum, price) => sum + price, 0) / prices.length;
  const best = offers.find((offer) => offer.price === lowest);
  return {
    offers: [...offers].sort((a, b) => a.price - b.price),
    lowest_price: lowest,
    highest_price: highest,
    average_price: Math.round(average * 100) / 100,
    savings: offers.length > 1 ? highest - lowest : 0,
    best_marketplace: best?.marketplace,
    best_deal_url: best?.url,
    offer_count: offers.length,
  };
}

function offerRows(comparison, summary) {
  return summary.offers.map((offer) => {
    const isBest = offer.price === summary.lowest_price;
    const isHighest = summary.offer_count > 1 && offer.price === summary.highest_price;
    const badges = [
      isBest ? `<span class="deal-badge is-best">Lowest</span>` : "",
      isHighest ? `<span class="deal-badge is-high">Highest</span>` : "",
      isBest ? `<span class="deal-badge is-deal">Best deal</span>` : "",
    ].join("");
    return `<tr class="${isBest ? "is-best-offer" : ""}">
      <td>${escapeHtml(offer.marketplace || "Marketplace")}</td>
      <td><strong>${formatPrice(offer.price)}</strong> ${badges}</td>
      <td>${offer.rating != null ? `★ ${escapeHtml(String(offer.rating))}` : "—"}</td>
      <td>${escapeHtml(offer.availability || "Check availability")}</td>
      <td><a class="compare-button" href="${safeHttpUrl(offer.url)}" target="_blank" rel="noopener noreferrer">View</a></td>
    </tr>`;
  }).join("");
}

function comparisonCard(comparison) {
  const offers = filteredOffers(comparison);
  const summary = summarizeOffers(offers);
  if (!summary) return "";

  const title = escapeHtml(comparison.product_name);
  const image = safeHttpUrl(comparison.image, "https://images.unsplash.com/photo-1560472354-b33ff0c44a43?auto=format&fit=crop&w=400&q=80");
  const expanded = expandedIds.has(comparison.id);
  const savingsLabel = summary.savings > 0 ? `Save ${formatPrice(summary.savings)}` : "Single store";
  const meta = [
    comparison.brand ? escapeHtml(String(comparison.brand).toUpperCase()) : null,
    comparison.storage ? escapeHtml(String(comparison.storage).toUpperCase()) : null,
    comparison.ram ? `${escapeHtml(String(comparison.ram).toUpperCase())} RAM` : null,
    comparison.color ? escapeHtml(String(comparison.color)) : null,
  ].filter(Boolean).join(" · ");

  return `<article class="product-card comparison-card ${expanded ? "is-expanded" : ""} ${summary.savings > 0 ? "is-highlighted" : ""}" data-comparison-id="${escapeHtml(comparison.id)}">
    <div class="result-highlights">
      <span>Best · ${escapeHtml(summary.best_marketplace || "Marketplace")}</span>
      ${summary.savings > 0 ? `<span>${savingsLabel}</span>` : ""}
    </div>
    <div class="product-image"><img loading="lazy" src="${image}" alt="${title}"></div>
    <div class="product-content">
      <div class="product-store"><span class="store-logo">×</span>${summary.offer_count} marketplace${summary.offer_count === 1 ? "" : "s"}</div>
      <h3 class="product-title">${title}</h3>
      ${meta ? `<div class="product-availability">${meta}</div>` : ""}
      <div class="price-row"><strong>${formatPrice(summary.lowest_price)}</strong>${summary.offer_count > 1 ? `<del>${formatPrice(summary.highest_price)}</del>` : ""}</div>
      <div class="comparison-stats">
        <span>Low ${formatPrice(summary.lowest_price)}</span>
        <span>High ${formatPrice(summary.highest_price)}</span>
        <span>Avg ${formatPrice(summary.average_price)}</span>
        <span>${summary.savings > 0 ? `Savings ${formatPrice(summary.savings)}` : "No spread"}</span>
      </div>
      <div class="product-footer">
        <span class="rating">Best deal · ${escapeHtml(summary.best_marketplace || "Marketplace")}</span>
        <button class="compare-button" type="button" data-toggle-comparison="${escapeHtml(comparison.id)}">${expanded ? "Hide prices" : "Compare prices"}</button>
      </div>
      ${expanded ? `<div class="comparison-table-wrap"><table class="comparison-table"><thead><tr><th>Marketplace</th><th>Price</th><th>Rating</th><th>Availability</th><th></th></tr></thead><tbody>${offerRows(comparison, summary)}</tbody></table></div>` : ""}
    </div>
  </article>`;
}

function render() {
  const sort = document.querySelector("[data-sort]").value;
  let visible = comparisons
    .map((comparison) => {
      const offers = filteredOffers(comparison);
      const summary = summarizeOffers(offers);
      return summary ? { comparison, summary } : null;
    })
    .filter(Boolean);

  if (sort === "low") visible.sort((a, b) => a.summary.lowest_price - b.summary.lowest_price);
  if (sort === "high") visible.sort((a, b) => b.summary.lowest_price - a.summary.lowest_price);
  if (sort === "rating") {
    visible.sort((a, b) => {
      const rating = (item) => Math.max(0, ...item.summary.offers.map((offer) => offer.rating || 0));
      return rating(b) - rating(a);
    });
  }
  if (sort === "relevance") visible.sort((a, b) => a.summary.lowest_price - b.summary.lowest_price);

  count.textContent = `${visible.length} comparison${visible.length === 1 ? "" : "s"} across marketplaces`;
  grid.innerHTML = visible.length
    ? visible.map(({ comparison }) => comparisonCard(comparison)).join("")
    : `<div class="empty-state" style="grid-column:1/-1"><h2>No matching comparisons yet</h2><p>Try another product name or choose more marketplaces.</p></div>`;
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
  if (query.length < 2) {
    count.textContent = "Enter at least two characters to search.";
    grid.innerHTML = "";
    progress.hidden = true;
    return;
  }
  const stores = [...document.querySelectorAll("[data-store-filter]:checked")].map((filter) => filter.value);
  if (!stores.length) {
    count.textContent = "Enable at least one marketplace.";
    grid.innerHTML = "";
    progress.hidden = true;
    return;
  }

  comparisons = [];
  expandedIds.clear();
  marketplaceStatuses.clear();
  let searchCompleted = false;
  count.textContent = "Searching live marketplaces…";
  grid.innerHTML = "<div class=\"skeleton\"></div>".repeat(4);
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
      comparisons = event.comparisons || [];
      marketplaceStatuses = new Map(event.marketplaces.map((item) => [item.slug, item]));
      renderProgress(true);
      render();
      source.close();
      activeSource = null;
    }
  };

  const showConnectionError = () => {
    count.textContent = "We couldn’t reach the comparison service.";
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><h2>Comparison service unavailable</h2><p>Start the Flask API at <code>http://127.0.0.1:5000</code>, then try again.</p></div>`;
    progressLabel.textContent = "Live search connection failed";
  };

  const handleError = (_error, source) => {
    if (currentRun !== searchRun || !activeSource) return;
    if (searchCompleted || source.readyState === EventSource.CLOSED) {
      source.close();
      activeSource = null;
      return;
    }
    if (comparisons.length) {
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
  const toggle = event.target.closest("[data-toggle-comparison]");
  if (!toggle) return;
  const id = toggle.getAttribute("data-toggle-comparison");
  if (expandedIds.has(id)) expandedIds.delete(id);
  else expandedIds.add(id);
  render();
});

const query = new URLSearchParams(window.location.search).get("query") || "";
input.value = query;
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const nextQuery = input.value.trim();
  history.replaceState({}, "", `?query=${encodeURIComponent(nextQuery)}`);
  performSearch(nextQuery);
});
document.querySelectorAll("[data-store-filter], [data-sort], [data-in-stock-filter]").forEach((control) => control.addEventListener("change", render));
initializeTheme();
performSearch(query);
