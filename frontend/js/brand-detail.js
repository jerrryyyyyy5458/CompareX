/* Dedicated brand landing page with fresh marketplace offers. */
import { api } from "./api.js";
import { initializeTheme } from "./theme.js";
import { formatPrice } from "./utils.js";

const BRANDS = {
  apple: { name: "Apple", logo: "https://cdn.simpleicons.org/apple/ffffff" },
  samsung: { name: "Samsung", logo: "https://cdn.simpleicons.org/samsung/ffffff" },
  nike: { name: "Nike", logo: "https://cdn.simpleicons.org/nike/ffffff" },
  sony: { name: "Sony", logo: "https://cdn.simpleicons.org/sony/ffffff" },
  adidas: { name: "adidas", logo: "https://cdn.simpleicons.org/adidas/ffffff" },
  boat: { name: "boAt", logo: "https://cdn.simpleicons.org/boat/ffffff" },
  oneplus: { name: "OnePlus", logo: "https://cdn.simpleicons.org/oneplus/ffffff" },
  puma: { name: "Puma", logo: "https://cdn.simpleicons.org/puma/ffffff" },
  dyson: { name: "Dyson", logo: "https://www.google.com/s2/favicons?domain=dyson.com&sz=128", colorLogo: true },
  lego: { name: "LEGO", logo: "https://www.google.com/s2/favicons?domain=lego.com&sz=128", colorLogo: true },
  loreal: { name: "L'Oréal", logo: "https://www.google.com/s2/favicons?domain=loreal.com&sz=128", colorLogo: true },
  philips: { name: "Philips", logo: "https://www.google.com/s2/favicons?domain=philips.com&sz=128", colorLogo: true },
};

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]);
}

function safeUrl(value, fallback = "#") {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? escapeHtml(url.href) : fallback;
  } catch {
    return fallback;
  }
}

function productCard(product) {
  const title = escapeHtml(product.title);
  const url = safeUrl(product.url);
  const image = safeUrl(product.image_url, "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=500&q=80");
  return `<article class="product-card brand-result-card">
    <div class="product-image">${product.discount ? `<span class="discount-badge">${product.discount}% off</span>` : ""}<img src="${image}" alt="${title}" loading="lazy"></div>
    <div class="product-content">
      <div class="product-store">${escapeHtml(product.store || product.marketplace || "Marketplace")}</div>
      <a class="product-title" href="${url}" target="_blank" rel="noopener noreferrer">${title}</a>
      <div class="price-row"><strong>${formatPrice(product.current_price)}</strong>${product.original_price ? `<del>${formatPrice(product.original_price)}</del>` : ""}</div>
      <div class="product-footer"><span class="rating">${product.rating ? `★ ${product.rating}` : "Live offer"}</span><a class="compare-button" href="${url}" target="_blank" rel="noopener noreferrer">View offer</a></div>
    </div>
  </article>`;
}

async function initializeBrandPage() {
  initializeTheme();
  const key = new URLSearchParams(window.location.search).get("brand")?.toLowerCase();
  const brand = BRANDS[key] || BRANDS.apple;
  const query = key && BRANDS[key] ? key : "apple";
  const title = document.querySelector("[data-brand-title]");
  const logo = document.querySelector("[data-brand-logo]");
  const searchLink = document.querySelector("[data-brand-search-link]");
  const status = document.querySelector("[data-brand-status]");
  const grid = document.querySelector("[data-brand-products]");

  document.title = `${brand.name} products — CompareX`;
  if (title) title.textContent = brand.name;
  if (logo) {
    logo.src = brand.logo;
    logo.alt = `${brand.name} logo`;
    logo.style.filter = brand.colorLogo ? "none" : "";
  }
  if (searchLink) searchLink.href = `../search/?query=${encodeURIComponent(query)}`;

  try {
    const response = await api.search(query);
    const products = (response.products || []).slice(0, 12);
    if (status) status.textContent = `${products.length} current offer${products.length === 1 ? "" : "s"}`;
    if (grid) grid.innerHTML = products.length
      ? products.map(productCard).join("")
      : `<div class="empty-state" style="grid-column:1/-1"><h2>No live offers found</h2><p>Use the search button above to try a more specific product.</p></div>`;
  } catch {
    if (status) status.textContent = "Live service is currently unavailable";
    if (grid) grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><h2>Start a brand search</h2><p>Open the CompareX API to load fresh marketplace offers here.</p></div>`;
  }
}

initializeBrandPage();
