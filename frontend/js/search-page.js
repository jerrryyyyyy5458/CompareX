/* Premium SaaS-style comparison table for live marketplace results. */
import { api } from "./api.js?v=live5";
import { formatPrice } from "./utils.js";
import { initializeTheme } from "./theme.js";
import { recommendOffer, animateIntelligenceCounters } from "./intelligence.js?v=1";

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
/** @type {"browse" | "compare"} */
let viewMode = "compare";
/** Selected product focus title when drilling from browse → compare (no re-scrape). */
let focusQuery = "";
/** @type {Map<string, object>} slug -> store metadata from GET /stores */
let registeredBySlug = new Map();
/** @type {Map<string, string>} lowercase name -> slug */
let slugByName = new Map();

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1560472354-b33ff0c44a43?auto=format&fit=crop&w=400&q=80";
const BROWSE_STOPWORDS = new Set([
  "with", "for", "and", "the", "pack", "pcs", "of", "by", "new", "ml", "gm", "g", "kg", "oz",
]);

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

function isProductUrl(query = "") {
  try {
    const url = new URL(String(query).trim());
    return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}

/** Mirror backend browse heuristic: short category queries browse; URLs / longer names compare. */
function isBrowseQuery(query = "") {
  if (isProductUrl(query)) return false;
  const tokens = tokenize(query);
  if (tokens.length <= 1) return true;
  if (tokens.length === 2) {
    if (/^(?:[a-z]{0,4})?\d+[a-z0-9]*$/.test(tokens[1])) return false;
    return true;
  }
  return false;
}

function extractBrand(title = "") {
  const tokens = tokenize(title);
  return tokens[0] || "";
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
    brand: extractBrand(displayName),
    offers,
    lowest_price: lowest,
    highest_price: highest,
    savings: offers.length > 1 ? highest - lowest : 0,
    best_marketplace: offers[0]?.marketplace,
    offer_count: offers.length,
  };
}

function identityTokens(title = "") {
  return tokenize(title).filter((token) => !BROWSE_STOPWORDS.has(token));
}

function tokenOverlap(left, right) {
  if (!left.size || !right.size) return 0;
  let hits = 0;
  for (const token of left) {
    if (right.has(token)) hits += 1;
  }
  return hits / Math.max(left.size, right.size);
}

/** Cluster scraped listings into shoppable product families for the browse grid. */
function buildBrowseResults(sourceProducts, query) {
  const candidates = filteredProducts(sourceProducts)
    .map((product) => ({
      product,
      score: matchScore(product.title || "", query),
      price: parseAmount(product.current_price ?? product.price),
      tokens: new Set(identityTokens(product.title || "")),
    }))
    .filter((item) => item.price != null)
    .sort((a, b) => b.score - a.score || a.price - b.price);

  const clusters = [];
  for (const item of candidates) {
    let bestCluster = null;
    let bestScore = 0;
    for (const cluster of clusters) {
      const score = tokenOverlap(item.tokens, cluster.tokens);
      if (score > bestScore) {
        bestScore = score;
        bestCluster = cluster;
      }
    }

    if (bestCluster && bestScore >= 0.42) {
      const market = marketplaceKey(item.product.store || item.product.marketplace || "");
      const existing = bestCluster.byMarket.get(market);
      if (!existing || item.score > existing.score + 0.05 || (Math.abs(item.score - existing.score) <= 0.05 && item.price < existing.price)) {
        bestCluster.byMarket.set(market, item);
      }
      for (const token of item.tokens) bestCluster.tokens.add(token);
      if (item.score > bestCluster.seed.score) bestCluster.seed = item;
    } else {
      clusters.push({
        tokens: new Set(item.tokens),
        byMarket: new Map([[marketplaceKey(item.product.store || item.product.marketplace || ""), item]]),
        seed: item,
      });
    }
  }

  return clusters.map((cluster, index) => {
    const members = [...cluster.byMarket.values()];
    const prices = members.map((member) => member.price);
    const ratings = members.map((member) => Number(member.product.rating)).filter((value) => Number.isFinite(value) && value > 0);
    const title = cluster.seed.product.title || query;
    return {
      id: `browse-${index}`,
      title,
      brand: extractBrand(title),
      image: members.find((member) => member.product.image_url || member.product.image)?.product.image_url
        || members.find((member) => member.product.image_url || member.product.image)?.product.image
        || null,
      lowest_price: Math.min(...prices),
      marketplace_count: members.length,
      rating: ratings.length ? (ratings.reduce((sum, value) => sum + value, 0) / ratings.length) : null,
      focus_query: title,
      relevance: cluster.seed.score,
    };
  }).sort((a, b) => b.relevance - a.relevance || a.lowest_price - b.lowest_price);
}

function browseResultsHtml(results) {
  if (!results.length) {
    return `<div class="empty-state"><h2>No products found</h2><p>Try a broader search or enable more marketplaces.</p></div>`;
  }

  return `<section class="cx-browse-panel">
    <div class="cx-browse-header">
      <p class="cx-summary-eyebrow">Product results</p>
      <h2 class="cx-summary-title">Choose a product to compare prices</h2>
      <p class="cx-summary-product">Showing ${results.length} product${results.length === 1 ? "" : "s"} for “${escapeHtml(searchQuery)}”</p>
    </div>
    <div class="cx-browse-grid">
      ${results.map((item) => {
        const image = safeHttpUrl(item.image, FALLBACK_IMAGE);
        const rating = item.rating != null ? `★ ${item.rating.toFixed(1)}` : "";
        return `<button type="button" class="cx-browse-card" data-focus-product="${escapeHtml(item.focus_query)}">
          <div class="cx-browse-media">
            <img src="${image}" alt="${escapeHtml(item.title)}" loading="lazy">
          </div>
          <div class="cx-browse-body">
            ${item.brand ? `<span class="cx-browse-brand">${escapeHtml(item.brand)}</span>` : ""}
            <strong class="cx-browse-title">${escapeHtml(item.title)}</strong>
            <p class="cx-browse-price">Starts from <strong>${formatPrice(item.lowest_price)}</strong></p>
            <p class="cx-browse-meta">Available on ${item.marketplace_count} marketplace${item.marketplace_count === 1 ? "" : "s"}${rating ? ` · ${rating}` : ""}</p>
            <span class="cx-browse-cta">Compare prices →</span>
          </div>
        </button>`;
      }).join("")}
    </div>
  </section>`;
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

function avgOfferRating(offers) {
  const ratings = offers.map((offer) => Number(offer.rating)).filter((value) => Number.isFinite(value) && value > 0);
  if (!ratings.length) return null;
  return ratings.reduce((sum, value) => sum + value, 0) / ratings.length;
}

function productSpecsFromTitle(title = "") {
  const specs = [];
  const normalized = String(title);
  const spf = normalized.match(/\bSPF\s*\d+/i);
  const pa = normalized.match(/\bPA\++/i);
  const size = normalized.match(/\b\d+(?:\.\d+)?\s?(?:ml|g|gm|kg|oz|gb|tb)\b/i);
  if (spf) specs.push(spf[0].toUpperCase().replace(/\s+/g, ""));
  if (pa) specs.push(pa[0].toUpperCase());
  if (size) specs.push(size[0]);
  const tokens = tokenize(title).filter((token) => !BROWSE_STOPWORDS.has(token) && token.length > 3);
  for (const token of tokens.slice(1, 6)) {
    if (specs.length >= 5) break;
    const label = token.replace(/^\w/, (char) => char.toUpperCase());
    if (!specs.some((spec) => spec.toLowerCase() === label.toLowerCase())) specs.push(label);
  }
  return specs.slice(0, 5);
}

function productHero(comparison, offers) {
  const image = safeHttpUrl(comparison.image || offers.find((offer) => offer.image_url)?.image_url, FALLBACK_IMAGE);
  const brand = comparison.brand || extractBrand(comparison.product_name);
  const rating = avgOfferRating(offers);
  const specs = productSpecsFromTitle(comparison.product_name);
  const description = `Live prices for ${comparison.product_name} across trusted Indian marketplaces. Pick the best deal without opening a dozen tabs.`;

  return `<div class="cx-product-hero">
    <div class="cx-product-media">
      <img src="${image}" alt="${escapeHtml(comparison.product_name)}" loading="lazy">
    </div>
    <div class="cx-product-info">
      ${brand ? `<p class="cx-product-brand">${escapeHtml(brand)}</p>` : ""}
      <h2 class="cx-product-title">${escapeHtml(comparison.product_name)}</h2>
      <div class="cx-product-rating">
        ${rating != null ? `<span class="cx-stars">★ ${rating.toFixed(1)}</span><span class="cx-rating-label">Average store rating</span>` : `<span class="cx-rating-label">Ratings updating live</span>`}
      </div>
      <p class="cx-product-desc">${escapeHtml(description)}</p>
      ${specs.length ? `<div class="cx-spec-row">${specs.map((spec) => `<span class="cx-spec-chip">${escapeHtml(spec)}</span>`).join("")}</div>` : ""}
      <div class="cx-product-actions">
        <button type="button" class="cx-ghost-btn" data-wishlist-btn>♡ Wishlist</button>
        <button type="button" class="cx-ghost-btn" data-share-btn>↗ Share</button>
      </div>
    </div>
  </div>`;
}

function dealSummaryCard(comparison, offers) {
  const prices = offers.map((offer) => offer.price);
  const lowest = prices.length ? Math.min(...prices) : comparison.lowest_price;
  const highest = prices.length ? Math.max(...prices) : comparison.highest_price;
  const best = offers.find((offer) => offer.price === lowest) || comparison.offers[0];
  const savings = prices.length > 1 ? highest - lowest : 0;
  const marketCount = comparison.offer_count || comparison.offers.length;
  const updated = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return `<aside class="cx-deal-card">
    <span class="cx-best-badge is-large">🏆 Best Deal</span>
    <p class="cx-deal-label">Lowest Price</p>
    <p class="cx-deal-price">${formatPrice(lowest)}</p>
    <p class="cx-deal-store">on ${escapeHtml(best?.marketplace || "—")}</p>
    <div class="cx-deal-grid">
      <div><span>You Save</span><strong class="is-save">${savings > 0 ? formatPrice(savings) : "—"}</strong></div>
      <div><span>Compared Across</span><strong>${marketCount} store${marketCount === 1 ? "" : "s"}</strong></div>
      <div><span>Best Marketplace</span><strong class="is-best">${escapeHtml(best?.marketplace || "—")}</strong></div>
      <div><span>Last Updated</span><strong>${escapeHtml(updated)}</strong></div>
    </div>
    ${best?.url ? `<a class="cx-buy-btn cx-deal-cta" href="${safeHttpUrl(best.url)}" target="_blank" rel="noopener noreferrer" data-buy-link>View best deal →</a>` : ""}
  </aside>`;
}

function analyticsStrip(comparison, offers) {
  const prices = offers.map((offer) => offer.price);
  const lowest = prices.length ? Math.min(...prices) : comparison.lowest_price;
  const highest = prices.length ? Math.max(...prices) : comparison.highest_price;
  const average = prices.length ? prices.reduce((sum, value) => sum + value, 0) / prices.length : lowest;
  const savings = prices.length > 1 ? highest - lowest : 0;
  const best = offers.find((offer) => offer.price === lowest) || comparison.offers[0];
  const marketCount = comparison.offer_count || comparison.offers.length;

  return `<div class="cx-analytics">
    <div><span>Compared across</span><strong>${marketCount} marketplace${marketCount === 1 ? "" : "s"}</strong></div>
    <div><span>Lowest Price</span><strong>${formatPrice(lowest)}</strong></div>
    <div><span>Highest Price</span><strong>${formatPrice(highest)}</strong></div>
    <div><span>Average Price</span><strong>${formatPrice(average)}</strong></div>
    <div><span>Potential Savings</span><strong class="is-save">${savings > 0 ? formatPrice(savings) : "—"}</strong></div>
    <div><span>Best Deal</span><strong class="is-best">${escapeHtml(best?.marketplace || "—")}</strong></div>
  </div>`;
}

function intelligenceCard(offers) {
  const insight = recommendOffer(offers);
  if (!insight) return "";

  const offer = insight.offer;
  const meta = marketplaceMeta(offer.marketplace);
  const flags = [
    insight.highlights.lowestPrice ? "Lowest Price" : null,
    insight.highlights.fastestDelivery ? "Fastest Delivery" : null,
    insight.highlights.highestRated ? "Highest Rated Seller" : null,
  ].filter(Boolean);

  return `<section class="cx-intel" aria-label="CompareX Intelligence recommendation">
    <div class="cx-intel-glow" aria-hidden="true"></div>
    <div class="cx-intel-head">
      <div>
        <p class="cx-intel-kicker">🏆 CompareX Intelligence</p>
        <h3 class="cx-intel-title">Balanced recommendation</h3>
      </div>
      <span class="cx-best-badge is-large">Best Deal</span>
    </div>
    <div class="cx-intel-body">
      <div class="cx-intel-primary">
        <div class="cx-intel-store">
          ${storeIdentityHtml(meta, 36)}
          <div>
            <span class="cx-intel-label">Recommended marketplace</span>
            <strong>${escapeHtml(offer.marketplace || meta.name)}</strong>
          </div>
        </div>
        <p class="cx-intel-price" data-cx-count="${offer.price}" data-cx-format="inr">${formatPrice(offer.price)}</p>
        <div class="cx-intel-meta">
          <span>Compared across <strong data-cx-count="${insight.marketCount}">${insight.marketCount}</strong> marketplace${insight.marketCount === 1 ? "" : "s"}</span>
          <span class="is-save">You Save <strong${insight.savings > 0 ? ` data-cx-count="${Math.round(insight.savings)}" data-cx-format="inr"` : ""}>${insight.savings > 0 ? formatPrice(insight.savings) : "—"}</strong></span>
        </div>
        ${flags.length ? `<div class="cx-intel-flags">${flags.map((flag) => `<span>${escapeHtml(flag)}</span>`).join("")}</div>` : ""}
        ${offer.url ? `<a class="cx-buy-btn cx-intel-cta" href="${safeHttpUrl(offer.url)}" target="_blank" rel="noopener noreferrer" data-buy-link>View recommended deal →</a>` : ""}
      </div>
      <div class="cx-intel-side">
        <div class="cx-intel-score">
          <span>Overall Score</span>
          <p><strong data-cx-count="${insight.score}">${insight.score}</strong><small> / 100</small></p>
        </div>
        <p class="cx-intel-why-label">Why CompareX recommends this</p>
        <ul class="cx-intel-reasons">
          ${insight.reasons.map((reason) => `<li>✓ ${escapeHtml(reason)}</li>`).join("")}
        </ul>
        <div class="cx-intel-breakdown" aria-label="Score breakdown">
          <div><span>Price</span><strong>${Math.round(insight.scores.price)}</strong></div>
          <div><span>Delivery</span><strong>${Math.round(insight.scores.delivery)}</strong></div>
          <div><span>Rating</span><strong>${Math.round(insight.scores.rating)}</strong></div>
          <div><span>Discount</span><strong>${Math.round(insight.scores.discount)}</strong></div>
          <div><span>Stock</span><strong>${Math.round(insight.scores.availability)}</strong></div>
        </div>
      </div>
    </div>
  </section>`;
}

function filterChips(comparison) {
  const markets = [...new Map(
    comparison.offers.map((offer) => [marketplaceKey(offer.marketplace), offer.marketplace]),
  ).entries()];

  return `<div class="cx-chip-row" role="toolbar" aria-label="Filter marketplaces">
    <span class="cx-chip-label">Filter Marketplace</span>
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
    <label class="cx-sort-wrap">
      <span>Sort By</span>
      <select data-table-sort aria-label="Sort comparison table">
        <option value="low"${tableSort === "low" ? " selected" : ""}>Lowest Price</option>
        <option value="high"${tableSort === "high" ? " selected" : ""}>Highest Price</option>
        <option value="discount"${tableSort === "discount" ? " selected" : ""}>Highest Discount</option>
        <option value="delivery"${tableSort === "delivery" ? " selected" : ""}>Fastest Delivery</option>
        <option value="rating"${tableSort === "rating" ? " selected" : ""}>Highest Rating</option>
        <option value="alpha"${tableSort === "alpha" ? " selected" : ""}>Alphabetical</option>
        <option value="relevance"${tableSort === "relevance" ? " selected" : ""}>Most Relevant</option>
      </select>
    </label>
    <label class="cx-search-wrap">
      <span class="cx-search-label">Search Marketplace</span>
      <span class="cx-search-icon" aria-hidden="true">⌕</span>
      <input type="search" class="cx-table-search" data-table-search placeholder="Amazon, Nykaa, Myntra…" value="${escapeHtml(tableSearch)}" aria-label="Search marketplaces">
    </label>
  </div>`;
}

function tableRow(offer, isBest) {
  const meta = marketplaceMeta(offer.marketplace);
  const url = safeHttpUrl(offer.url);
  const original = parseAmount(offer.original_price);
  const discount = discountLabel(offer);
  const rating = offer.rating != null ? `★ ${escapeHtml(String(offer.rating))}` : "—";
  const delivery = escapeHtml(deliveryLabel(offer));
  const availability = escapeHtml(offer.availability || "Check availability");
  const inStock = String(offer.availability || "").toLowerCase().includes("in stock");

  return `<tr class="cx-row${isBest ? " is-best-deal" : ""}" data-offer-url="${url}" tabindex="0" role="link">
    <td class="cx-col-store">
      <div class="cx-store-cell">
        <div>
          <strong>${escapeHtml(offer.marketplace || meta.name)}</strong>
          ${isBest ? `<span class="cx-best-badge">🏆 Best Deal</span>` : ""}
        </div>
      </div>
    </td>
    <td class="cx-col-logo">${storeIdentityHtml(meta, 28)}</td>
    <td class="cx-col-price">
      <strong>${formatPrice(offer.price)}</strong>
      ${isBest ? `<span class="cx-lowest-tag">Lowest</span>` : ""}
    </td>
    <td class="cx-col-original">${original && original > offer.price ? `<del>${formatPrice(original)}</del>` : "—"}</td>
    <td class="cx-col-discount"><span class="cx-discount">${escapeHtml(discount)}</span></td>
    <td class="cx-col-delivery">${delivery}</td>
    <td class="cx-col-rating">${rating}</td>
    <td class="cx-col-availability"><span class="cx-stock${inStock ? " is-in" : ""}">${availability}</span></td>
    <td class="cx-col-seller">${escapeHtml(offer.marketplace || meta.name)}</td>
    <td class="cx-col-buy">
      <a class="cx-buy-btn" href="${url}" target="_blank" rel="noopener noreferrer" data-buy-link>View Deal</a>
    </td>
  </tr>`;
}

function mobileCard(offer, isBest) {
  const meta = marketplaceMeta(offer.marketplace);
  const url = safeHttpUrl(offer.url);
  const original = parseAmount(offer.original_price);
  const discount = discountLabel(offer);

  return `<a class="cx-mobile-card${isBest ? " is-best-deal" : ""}" href="${url}" target="_blank" rel="noopener noreferrer">
    <div class="cx-mobile-top">
      ${storeIdentityHtml(meta, 24)}
      <strong>${escapeHtml(offer.marketplace || meta.name)}</strong>
      ${isBest ? `<span class="cx-best-badge">🏆 Best Deal</span>` : ""}
    </div>
    <div class="cx-mobile-price">
      <strong>${formatPrice(offer.price)}</strong>
      ${original && original > offer.price ? `<del>${formatPrice(original)}</del>` : ""}
      <span class="cx-discount">${escapeHtml(discount)}</span>
    </div>
    <small>${escapeHtml(offer.availability || "Check availability")} · ${escapeHtml(deliveryLabel(offer))}</small>
    <span class="cx-buy-btn">View Deal</span>
  </a>`;
}

function comparisonTable(comparison) {
  const offers = visibleOffers(comparison);
  const allOffers = comparison.offers || [];
  const nav = focusQuery && isBrowseQuery(searchQuery)
    ? `<div class="cx-compare-nav"><button type="button" class="cx-back-btn" data-back-to-browse>← Back to products</button></div>`
    : "";

  if (!offers.length) {
    return `<section class="cx-comparison-panel" data-comparison-id="${escapeHtml(comparison.id)}">
      ${nav}
      <div class="cx-product-layout">
        ${productHero(comparison, allOffers)}
        ${dealSummaryCard(comparison, allOffers)}
      </div>
      ${analyticsStrip(comparison, allOffers)}
      ${toolbar()}
      ${filterChips(comparison)}
      <div class="empty-state"><h2>No matching marketplaces</h2><p>Try another filter or search term.</p></div>
    </section>`;
  }

  const lowest = Math.min(...offers.map((offer) => offer.price));

  return `<section class="cx-comparison-panel" data-comparison-id="${escapeHtml(comparison.id)}">
    ${nav}
    <div class="cx-product-layout">
      ${productHero(comparison, offers)}
      ${dealSummaryCard(comparison, offers)}
    </div>
    ${analyticsStrip(comparison, offers)}
    ${intelligenceCard(offers)}
    <div class="cx-table-header">
      <div>
        <p class="cx-summary-eyebrow">Live marketplace prices</p>
        <h3 class="cx-table-title">Compare Prices</h3>
      </div>
      <div class="cx-trust-row">
        <span>100% live listings</span>
        <span>Safe checkout on store</span>
      </div>
    </div>
    ${toolbar()}
    ${filterChips(comparison)}
    <div class="cx-table-shell">
      <table class="cx-compare-table">
        <thead>
          <tr>
            <th>Marketplace</th>
            <th>Logo</th>
            <th>Price</th>
            <th>Original Price</th>
            <th>Discount</th>
            <th>Delivery</th>
            <th>Rating</th>
            <th>Availability</th>
            <th>Seller</th>
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
  </section>`;
}

function render() {
  if (!products.length) {
    count.textContent = "No marketplace matches yet";
    grid.innerHTML = `<div class="empty-state"><h2>No matching products yet</h2><p>Try another product name or choose more marketplaces.</p></div>`;
    return;
  }

  if (viewMode === "browse") {
    const results = buildBrowseResults(products, searchQuery);
    count.textContent = `${results.length} product${results.length === 1 ? "" : "s"} found`;
    grid.innerHTML = browseResultsHtml(results);
    return;
  }

  const compareAgainst = focusQuery || searchQuery;
  const comparison = buildUnifiedComparison(products, compareAgainst);
  if (!comparison) {
    count.textContent = "No marketplace matches yet";
    grid.innerHTML = `<div class="empty-state"><h2>No matching comparisons yet</h2><p>Try another product name or choose more marketplaces.</p></div>`;
    return;
  }

  const offers = visibleOffers(comparison);
  count.textContent = `1 comparison · ${offers.length} marketplace${offers.length === 1 ? "" : "s"} shown`;
  grid.innerHTML = comparisonTable(comparison);
  animateIntelligenceCounters(grid);
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

async function performSearch(query, options = {}) {
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

  const requestedFocus = options.focus || "";
  products = [];
  focusQuery = "";
  viewMode = isBrowseQuery(query) ? "browse" : "compare";
  chipFilter = "all";
  tableSearch = "";
  tableSort = "low";
  marketplaceStatuses.clear();
  let searchCompleted = false;
  count.textContent = viewMode === "browse" ? "Finding products across stores…" : "Searching live marketplaces…";
  grid.innerHTML = "<div class=\"skeleton\"></div>".repeat(viewMode === "browse" ? 4 : 2);
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
      count.textContent = viewMode === "browse"
        ? "Collecting product matches…"
        : "Matching the same products across stores…";
    }
    if (event.type === "complete") {
      searchCompleted = true;
      products = event.products || [];
      marketplaceStatuses = new Map(event.marketplaces.map((item) => [item.slug, item]));
      if (requestedFocus && isBrowseQuery(query)) {
        focusQuery = requestedFocus;
        viewMode = "compare";
      }
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
  const wishlist = event.target.closest("[data-wishlist-btn]");
  if (wishlist) {
    wishlist.classList.toggle("is-active");
    wishlist.textContent = wishlist.classList.contains("is-active") ? "♥ Saved" : "♡ Wishlist";
    return;
  }
  const share = event.target.closest("[data-share-btn]");
  if (share) {
    const shareUrl = window.location.href;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(shareUrl).then(() => {
        share.textContent = "✓ Link copied";
        setTimeout(() => { share.textContent = "↗ Share"; }, 1600);
      }).catch(() => {});
    }
    return;
  }

  const back = event.target.closest("[data-back-to-browse]");
  if (back) {
    focusQuery = "";
    viewMode = "browse";
    const params = new URLSearchParams(window.location.search);
    params.delete("focus");
    history.replaceState({}, "", `?${params.toString()}`);
    render();
    return;
  }

  const browseCard = event.target.closest("[data-focus-product]");
  if (browseCard) {
    focusQuery = browseCard.getAttribute("data-focus-product") || "";
    viewMode = "compare";
    chipFilter = "all";
    tableSearch = "";
    const params = new URLSearchParams(window.location.search);
    params.set("query", searchQuery);
    params.set("focus", focusQuery);
    history.replaceState({}, "", `?${params.toString()}`);
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

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
const initialFocus = new URLSearchParams(window.location.search).get("focus") || "";
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
  performSearch(query, { focus: initialFocus });
})();
