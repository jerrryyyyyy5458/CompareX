/* Fresh live-search progress, marketplace status, filtering, and result cards. */
import { api } from "./api.js?v=live3";
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
let products = [];
let marketplaceStatuses = new Map();
let activeSource;
let searchRun = 0;

const STORE_SLUGS = {
  "amazon india": "amazon",
  flipkart: "flipkart",
  myntra: "myntra",
  ajio: "ajio",
  croma: "croma",
  "vijay sales": "vijay-sales",
  nykaa: "nykaa",
};

const HIGHLIGHT_LABELS = {
  lowest_price: "Lowest price",
  best_discount: "Best discount",
  best_rated: "Best rated",
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

function formatReviews(value) {
  if (value == null) return "";
  return ` · ${Number(value).toLocaleString("en-IN")} reviews`;
}

function productCard(product) {
  const title = escapeHtml(product.title);
  const store = escapeHtml(product.store || product.marketplace || "Marketplace");
  const image = safeHttpUrl(product.image_url, "https://images.unsplash.com/photo-1560472354-b33ff0c44a43?auto=format&fit=crop&w=400&q=80");
  const productUrl = safeHttpUrl(product.url);
  const highlights = (product.highlights || []).map((item) => `<span>${HIGHLIGHT_LABELS[item]}</span>`).join("");
  const rating = product.rating != null ? `★ ${product.rating}${formatReviews(product.review_count)}` : "Not rated";
  return `<article class="product-card ${highlights ? "is-highlighted" : ""}">
    ${highlights ? `<div class="result-highlights">${highlights}</div>` : ""}
    <div class="product-image">${product.discount ? `<span class="discount-badge">${product.discount}% off</span>` : ""}<img loading="lazy" src="${image}" alt="${title}"></div>
    <div class="product-content"><div class="product-store"><span class="store-logo">${store.charAt(0)}</span>${store}</div><a class="product-title" href="${productUrl}" target="_blank" rel="noopener noreferrer">${title}</a><div class="price-row"><strong>${formatPrice(product.current_price)}</strong>${product.original_price ? `<del>${formatPrice(product.original_price)}</del>` : ""}</div><div class="product-availability">${escapeHtml(product.availability || "Check availability")}</div><div class="product-footer"><span class="rating"><span>★</span> ${escapeHtml(rating.replace(/^★ /, ""))}</span><a class="compare-button" href="${productUrl}" target="_blank" rel="noopener noreferrer">View offer</a></div></div>
  </article>`;
}

function render() {
  const selectedStores = [...document.querySelectorAll("[data-store-filter]:checked")].map((filter) => filter.value);
  const inStockOnly = document.querySelector("[data-in-stock-filter]")?.checked;
  const sort = document.querySelector("[data-sort]").value;
  let visibleProducts = products.filter((product) => {
    const slug = STORE_SLUGS[(product.store || "").toLowerCase()];
    const selected = !selectedStores.length || selectedStores.includes(slug);
    const available = !inStockOnly || (product.availability || "").toLowerCase().includes("in stock");
    return selected && available;
  });
  if (sort === "low") visibleProducts.sort((a, b) => a.current_price - b.current_price);
  if (sort === "high") visibleProducts.sort((a, b) => b.current_price - a.current_price);
  if (sort === "rating") visibleProducts.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  count.textContent = `${visibleProducts.length} product${visibleProducts.length === 1 ? "" : "s"} found across marketplaces`;
  grid.innerHTML = visibleProducts.length ? visibleProducts.map(productCard).join("") : `<div class="empty-state" style="grid-column:1/-1"><h2>No matching offers yet</h2><p>Try another product name or choose more marketplaces.</p></div>`;
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

function mergeProducts(nextProducts) {
  const byId = new Map(products.map((product) => [product.id, product]));
  nextProducts.forEach((product) => byId.set(product.id, product));
  products = [...byId.values()].sort((a, b) => a.current_price - b.current_price);
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

  products = [];
  marketplaceStatuses.clear();
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
      if (event.products?.length) {
        mergeProducts(event.products);
        render();
      }
      renderProgress();
    }
    if (event.type === "complete") {
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
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><h2>Comparison service unavailable</h2><p>Start the Flask API at <code>http://127.0.0.1:5000</code>, then try again.</p></div>`;
    progressLabel.textContent = "Live search connection failed";
  };

  const handleError = (_error, source) => {
    if (currentRun !== searchRun || !activeSource) return;
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

const query = new URLSearchParams(window.location.search).get("query") || "";
input.value = query;
form.addEventListener("submit", (event) => { event.preventDefault(); const nextQuery = input.value.trim(); history.replaceState({}, "", `?query=${encodeURIComponent(nextQuery)}`); performSearch(nextQuery); });
document.querySelectorAll("[data-store-filter], [data-sort], [data-in-stock-filter]").forEach((control) => control.addEventListener("change", render));
initializeTheme();
performSearch(query);
