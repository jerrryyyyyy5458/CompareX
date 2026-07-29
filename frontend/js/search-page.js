/* Premium SaaS-style comparison table for live marketplace results. */
import { api } from "./api.js?v=live5";
import { formatPrice } from "./utils.js";
import { initializeTheme } from "./theme.js";
import { attachAutocomplete } from "./autocomplete.js";

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
/** @type {"browse"|"compare"} */
let viewMode = "browse";
/** @type {"browse"|"compare"|null} */
let searchMode = null;
/** @type {string|null} */
let selectedGroupId = null;
/** @type {Array<object>} */
let productGroups = [];
/** @type {Map<string, object>} slug -> store metadata from GET /stores */
let registeredBySlug = new Map();
/** @type {Map<string, string>} lowercase name -> slug */
let slugByName = new Map();

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1560472354-b33ff0c44a43?auto=format&fit=crop&w=400&q=80";
const GENERIC_STOP_WORDS = new Set([
  "with", "for", "and", "the", "spf", "pa", "pack", "of", "india", "new", "ml", "gm", "g", "kg",
  "combo", "set", "pair", "size", "free", "offer", "sale", "original", "genuine",
]);

function isProductUrlQuery(query = "") {
  return /^https?:\/\//i.test(String(query).trim());
}

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

function normalizeTitleTokens(title = "") {
  return String(title)
    .toLowerCase()
    .replace(/[^a-z0-9+.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((token) => token && !GENERIC_STOP_WORDS.has(token) && !/^\d+(\.\d+)?$/.test(token));
}

function productGroupKey(product) {
  const tokens = normalizeTitleTokens(product.title || "");
  if (!tokens.length) return (product.id || product.url || Math.random().toString(36)).toString();
  // Brand + distinctive product words form a stable browse key across stores.
  return tokens.slice(0, 5).join(" ");
}

function guessBrand(title = "") {
  const tokens = normalizeTitleTokens(title);
  if (!tokens.length) return "Unknown";
  return tokens[0].replace(/^\w/, (char) => char.toUpperCase());
}

function buildProductGroups(sourceProducts, query) {
  const candidates = filteredProducts(sourceProducts);
  const groups = new Map();

  for (const product of candidates) {
    const key = productGroupKey(product);
    const price = parseAmount(product.current_price ?? product.price);
    const market = marketplaceKey(product.store || product.marketplace || "");
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        id: key,
        title: product.title,
        brand: guessBrand(product.title),
        image: product.image_url || product.image || null,
        lowestPrice: price,
        rating: product.rating ?? null,
        markets: new Set(market ? [market] : []),
        products: [product],
        relevance: matchScore(product.title || "", query),
      });
      continue;
    }

    existing.products.push(product);
    if (market) existing.markets.add(market);
    if (price != null && (existing.lowestPrice == null || price < existing.lowestPrice)) {
      existing.lowestPrice = price;
      existing.title = product.title;
      if (product.image_url || product.image) existing.image = product.image_url || product.image;
    }
    if (product.rating != null && (existing.rating == null || product.rating > existing.rating)) {
      existing.rating = product.rating;
    }
    existing.relevance = Math.max(existing.relevance, matchScore(product.title || "", query));
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      marketCount: group.markets.size,
      markets: [...group.markets],
    }))
    .sort((a, b) => b.relevance - a.relevance || (a.lowestPrice ?? Infinity) - (b.lowestPrice ?? Infinity));
}

function shouldShowProductBrowse(mode, groups) {
  if (isProductUrlQuery(searchQuery) || mode === "compare") return false;
  return groups.length > 1;
}

function productResultsGrid(groups) {
  return `<div class="cx-browse-grid" data-product-results>
    ${groups.map((group) => {
      const image = safeHttpUrl(group.image, FALLBACK_IMAGE);
      const rating = group.rating != null ? `★ ${escapeHtml(String(group.rating))}` : "";
      const markets = group.marketCount;
      return `<button type="button" class="cx-product-result" data-product-group="${escapeHtml(group.id)}">
        <img class="cx-product-result-image" src="${image}" alt="" loading="lazy">
        <span class="cx-product-result-copy">
          <span class="cx-product-result-brand">${escapeHtml(group.brand)}</span>
          <strong class="cx-product-result-title">${escapeHtml(group.title)}</strong>
          <span class="cx-product-result-meta">
            <span class="cx-product-result-price">Starts from ${formatPrice(group.lowestPrice)}</span>
            <span>Available on ${markets} marketplace${markets === 1 ? "" : "s"}</span>
            ${rating ? `<span class="cx-product-result-rating">${rating}</span>` : ""}
          </span>
        </span>
        <span class="cx-product-result-cta">Compare prices →</span>
      </button>`;
    }).join("")}
  </div>`;
}

function comparisonBackBar(groupTitle) {
  return `<div class="cx-compare-nav">
    <button type="button" class="cx-back-to-results" data-back-to-results>← Back to products</button>
    <span class="cx-crumb">Home <span>/</span> Search <span>/</span> <strong>${escapeHtml(groupTitle || "Product")}</strong></span>
  </div>`;
}

function productFactPills(title = "") {
  const text = String(title);
  const pills = [];
  const spf = text.match(/\bspf\s*\d+\b/i);
  if (spf) pills.push(spf[0].toUpperCase().replace(/\s+/, " "));
  const size = text.match(/\b\d+(?:\.\d+)?\s?(?:ml|g|gm|kg)\b/i);
  if (size) pills.push(size[0].replace(/\s+/g, ""));
  const skin = text.match(/\ball\s+skin\s+types\b|\boily\s+skin\b|\bdry\s+skin\b|\bsensitive\s+skin\b/i);
  if (skin) {
    pills.push(skin[0].replace(/\b\w/g, (char) => char.toUpperCase()));
  }
  return [...new Set(pills)].slice(0, 3);
}

function averageOfferRating(offers = []) {
  const ratings = offers.map((offer) => Number(offer.rating)).filter((value) => Number.isFinite(value) && value > 0);
  if (!ratings.length) return null;
  return Math.round((ratings.reduce((sum, value) => sum + value, 0) / ratings.length) * 10) / 10;
}

function sortOffers(offers, sortKey) {
  const sorted = [...offers];
  switch (sortKey) {
    case "high":
      return sorted.sort((a, b) => b.price - a.price);
    case "rating":
      return sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0) || a.price - b.price);
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
  return sortOffers(offers, tableSort);
}

function productHero(comparison, offers, group) {
  const image = safeHttpUrl(comparison.image || group?.image, FALLBACK_IMAGE);
  const brand = escapeHtml(group?.brand || guessBrand(comparison.product_name || ""));
  const title = escapeHtml(comparison.product_name || group?.title || "Product");
  const rating = averageOfferRating(offers);
  const pills = productFactPills(comparison.product_name || group?.title || "")
    .map((pill) => `<span class="cx-fact-pill">${escapeHtml(pill)}</span>`)
    .join("");
  const description = `Compare live prices for ${title} across trusted Indian marketplaces and pick the offer that fits your budget.`;

  return `<section class="cx-product-hero">
    <div class="cx-product-media">
      <img src="${image}" alt="${title}" loading="lazy">
    </div>
    <div class="cx-product-copy">
      <p class="cx-product-brand">${brand}</p>
      <h2 class="cx-product-title">${title}</h2>
      ${rating != null ? `<p class="cx-product-rating"><span>★ ${escapeHtml(String(rating))}</span> <small>avg across stores</small></p>` : ""}
      ${pills ? `<div class="cx-fact-row">${pills}</div>` : ""}
      <p class="cx-product-desc">${description}</p>
      <div class="cx-product-actions">
        <button type="button" class="cx-btn cx-btn-secondary" data-share-product>Share</button>
        <a class="cx-btn cx-btn-secondary" href="../wishlist/">Wishlist</a>
      </div>
    </div>
  </section>`;
}

function bestDealCard(comparison, offers) {
  const prices = offers.map((offer) => offer.price).filter((price) => price != null);
  const lowest = prices.length ? Math.min(...prices) : comparison.lowest_price;
  const highest = prices.length ? Math.max(...prices) : comparison.highest_price;
  const best = offers.find((offer) => offer.price === lowest) || comparison.offers[0];
  const savings = prices.length > 1 ? highest - lowest : 0;
  const marketCount = comparison.offer_count || comparison.offers.length;
  const url = safeHttpUrl(best?.url);

  return `<aside class="cx-best-deal">
    <div class="cx-best-deal-top">
      <p class="cx-best-deal-label">🏆 Best Deal</p>
      ${savings > 0 ? `<span class="cx-save-pill">You save ${formatPrice(savings)}</span>` : ""}
    </div>
    <p class="cx-best-deal-price">${formatPrice(lowest)}</p>
    <p class="cx-best-deal-store">on <strong>${escapeHtml(best?.marketplace || "—")}</strong></p>
    <p class="cx-best-deal-meta">Compared across ${marketCount} store${marketCount === 1 ? "" : "s"}</p>
    <a class="cx-btn cx-btn-primary" href="${url}" target="_blank" rel="noopener noreferrer" data-buy-link>View Deal →</a>
  </aside>`;
}

function comparisonToolbar() {
  return `<div class="cx-table-head">
    <h3>Compare prices</h3>
    <label class="cx-sort-wrap">
      <span>Sort by</span>
      <select data-table-sort aria-label="Sort comparison table">
        <option value="low"${tableSort === "low" ? " selected" : ""}>Lowest Price</option>
        <option value="high"${tableSort === "high" ? " selected" : ""}>Highest Price</option>
        <option value="rating"${tableSort === "rating" ? " selected" : ""}>Rating</option>
      </select>
    </label>
  </div>`;
}

function tableRow(offer, isBest) {
  const meta = marketplaceMeta(offer.marketplace);
  const url = safeHttpUrl(offer.url);
  const original = parseAmount(offer.original_price);
  const rating = offer.rating != null ? `★ ${escapeHtml(String(offer.rating))}` : "—";

  return `<tr class="cx-row${isBest ? " is-best-deal" : ""}">
    <td class="cx-col-store">
      <div class="cx-store-cell">
        ${storeIdentityHtml(meta, 28)}
        <div>
          <strong>${escapeHtml(offer.marketplace || meta.name)}</strong>
          ${isBest ? `<span class="cx-best-badge">Best Deal</span>` : ""}
        </div>
      </div>
    </td>
    <td class="cx-col-price">
      <strong>${formatPrice(offer.price)}</strong>
      ${original && original > offer.price ? `<small class="cx-original">${formatPrice(original)}</small>` : ""}
    </td>
    <td class="cx-col-rating">${rating}</td>
    <td class="cx-col-buy">
      <a class="cx-btn ${isBest ? "cx-btn-primary" : "cx-btn-ghost"}" href="${url}" target="_blank" rel="noopener noreferrer" data-buy-link>View Deal</a>
    </td>
  </tr>`;
}

function mobileCard(offer, isBest) {
  const meta = marketplaceMeta(offer.marketplace);
  const url = safeHttpUrl(offer.url);
  const original = parseAmount(offer.original_price);
  const rating = offer.rating != null ? `★ ${escapeHtml(String(offer.rating))}` : "—";

  return `<article class="cx-mobile-card${isBest ? " is-best-deal" : ""}">
    <div class="cx-mobile-top">
      ${storeIdentityHtml(meta, 24)}
      <div>
        <strong>${escapeHtml(offer.marketplace || meta.name)}</strong>
        ${isBest ? `<span class="cx-best-badge">Best Deal</span>` : ""}
      </div>
    </div>
    <div class="cx-mobile-price">
      <strong>${formatPrice(offer.price)}</strong>
      ${original && original > offer.price ? `<small class="cx-original">${formatPrice(original)}</small>` : ""}
      <span class="cx-mobile-rating">${rating}</span>
    </div>
    <a class="cx-btn ${isBest ? "cx-btn-primary" : "cx-btn-ghost"}" href="${url}" target="_blank" rel="noopener noreferrer" data-buy-link>View Deal</a>
  </article>`;
}

function comparisonTable(comparison, group = null) {
  const offers = visibleOffers(comparison);
  if (!offers.length) {
    return `<section class="cx-comparison-page">
      ${productHero(comparison, comparison.offers, group)}
      <div class="empty-state"><h2>No matching marketplaces</h2><p>Try enabling more stores in the sidebar.</p></div>
    </section>`;
  }

  const lowest = Math.min(...offers.map((offer) => offer.price));

  return `<section class="cx-comparison-page" data-comparison-id="${escapeHtml(comparison.id)}">
    <div class="cx-compare-top">
      ${productHero(comparison, offers, group)}
      ${bestDealCard(comparison, offers)}
    </div>
    <div class="cx-compare-table-card">
      ${comparisonToolbar()}
      <div class="cx-table-shell">
        <table class="cx-compare-table">
          <thead>
            <tr>
              <th>Store</th>
              <th>Price</th>
              <th>Rating</th>
              <th>Action</th>
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
    </div>
  </section>`;
}

function render() {
  productGroups = buildProductGroups(products, searchQuery);

  if (!productGroups.length) {
    selectedGroupId = null;
    viewMode = "browse";
    count.textContent = "No marketplace matches yet";
    grid.innerHTML = `<div class="empty-state"><h2>No matching products yet</h2><p>Try another product name or choose more marketplaces.</p></div>`;
    return;
  }

  const browse = shouldShowProductBrowse(searchMode, productGroups);
  if (browse && viewMode !== "compare") {
    viewMode = "browse";
    selectedGroupId = null;
    count.textContent = `${productGroups.length} products · pick one to compare prices`;
    grid.innerHTML = productResultsGrid(productGroups);
    return;
  }

  viewMode = "compare";
  const selectedGroup = productGroups.find((group) => group.id === selectedGroupId) || productGroups[0];
  selectedGroupId = selectedGroup.id;
  const comparison = buildUnifiedComparison(selectedGroup.products, selectedGroup.title || searchQuery);
  if (!comparison) {
    count.textContent = "No marketplace matches yet";
    grid.innerHTML = `<div class="empty-state"><h2>No matching comparisons yet</h2><p>Try another product name or choose more marketplaces.</p></div>`;
    return;
  }

  const offers = visibleOffers(comparison);
  count.textContent = `${offers.length} store${offers.length === 1 ? "" : "s"} compared`;
  const backBar = browse || productGroups.length > 1
    ? comparisonBackBar(selectedGroup.title)
    : "";
  grid.innerHTML = `${backBar}${comparisonTable(comparison, selectedGroup)}`;
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
  selectedGroupId = null;
  productGroups = [];
  searchMode = isProductUrlQuery(query) ? "compare" : "browse";
  viewMode = searchMode === "compare" ? "compare" : "browse";
  marketplaceStatuses.clear();
  let searchCompleted = false;
  count.textContent = searchMode === "compare"
    ? "Comparing this product across marketplaces…"
    : "Searching live marketplaces…";
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
      count.textContent = searchMode === "compare"
        ? "Matching this product across stores…"
        : "Gathering matching products…";
    }
    if (event.type === "complete") {
      searchCompleted = true;
      products = event.products || [];
      searchMode = event.mode === "compare" || isProductUrlQuery(searchQuery) ? "compare" : "browse";
      viewMode = searchMode === "compare" ? "compare" : "browse";
      selectedGroupId = null;
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
  const productCard = event.target.closest("[data-product-group]");
  if (productCard) {
    selectedGroupId = productCard.getAttribute("data-product-group");
    viewMode = "compare";
    chipFilter = "all";
    tableSearch = "";
    render();
    grid.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (event.target.closest("[data-back-to-results]")) {
    selectedGroupId = null;
    viewMode = "browse";
    chipFilter = "all";
    tableSearch = "";
    render();
    return;
  }

  const shareBtn = event.target.closest("[data-share-product]");
  if (shareBtn) {
    const shareUrl = window.location.href;
    if (navigator.share) {
      navigator.share({ title: "CompareX", text: "Compare prices on CompareX", url: shareUrl }).catch(() => {});
    } else if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(shareUrl).then(() => {
        shareBtn.textContent = "Link copied";
        window.setTimeout(() => { shareBtn.textContent = "Share"; }, 1600);
      }).catch(() => {});
    }
    return;
  }

  if (event.target.closest("[data-buy-link]")) return;
});

grid?.addEventListener("change", (event) => {
  if (event.target.matches("[data-table-sort]")) {
    tableSort = event.target.value;
    render();
  }
});

const query = new URLSearchParams(window.location.search).get("query") || "";
input.value = query;
attachAutocomplete({
  input,
  form,
  root: form,
  onSelect: (suggestion) => {
    const nextQuery = (suggestion.query || suggestion.name || "").trim();
    input.value = nextQuery;
    history.replaceState({}, "", `?query=${encodeURIComponent(nextQuery)}`);
    performSearch(nextQuery);
  },
});
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
