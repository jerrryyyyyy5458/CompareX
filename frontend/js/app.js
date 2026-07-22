/* Homepage bootstrap, data rendering, interaction binding and progressive enhancement. */
import { api } from "./api.js";
import { initializeTheme } from "./theme.js";
import { initializeNavigation } from "./navbar.js";
import { initializeSearch, initializeCategoryWheel } from "./search.js";
import { initializeWishlist, isWishlisted, toggleWishlist } from "./wishlist.js";
import { initializeCompare, refreshCompareDock, toggleComparison } from "./compare.js";
import { formatPrice } from "./utils.js";

const featuredProducts = [
  { id: "demo-1", title: "Apple AirPods Pro (2nd Generation) with MagSafe Case", store: "Flipkart", store_mark: "F", current_price: 18999, original_price: 24900, discount: 24, rating: 4.7, image_url: "https://images.unsplash.com/photo-1606841837239-c5a1a4a07af7?auto=format&fit=crop&w=400&q=80" },
  { id: "demo-2", title: "Sony WH-1000XM5 Wireless Noise Cancelling Headphones", store: "Amazon", store_mark: "a", current_price: 26990, original_price: 34990, discount: 23, rating: 4.8, image_url: "https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&w=400&q=80" },
  { id: "demo-3", title: "Nike Air Max Dn Men's Shoes", store: "Myntra", store_mark: "M", current_price: 11197, original_price: 13995, discount: 20, rating: 4.5, image_url: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=400&q=80" },
  { id: "demo-4", title: "Samsung Galaxy Watch7 Bluetooth 44mm", store: "Reliance Digital", store_mark: "R", current_price: 27999, original_price: 33999, discount: 18, rating: 4.6, image_url: "https://images.unsplash.com/photo-1434493789847-2f02dc6ca35d?auto=format&fit=crop&w=400&q=80" },
];

const fallbackStores = [
  { name: "Amazon", mark: "a", description: "Electronics, home & more", color: "#202531" },
  { name: "Flipkart", mark: "F", description: "India’s shopping destination", color: "#2874f0" },
  { name: "Myntra", mark: "M", description: "Fashion & lifestyle", color: "#f44380" },
  { name: "AJIO", mark: "A", description: "Curated fashion", color: "#202020" },
  { name: "Nykaa", mark: "N", description: "Beauty & wellness", color: "#ed5f7f" },
  { name: "Reliance Digital", mark: "R", description: "Tech & appliances", color: "#e31d3b" },
];

function productCard(product) {
  const saved = isWishlisted(product.id);
  return `<article class="product-card reveal is-visible">
    <div class="product-image"><span class="discount-badge">${product.discount}% off</span><button class="wishlist-button ${saved ? "is-saved" : ""}" type="button" aria-label="Save ${product.title}" data-wishlist-product="${product.id}">${saved ? "♥" : "♡"}</button><img loading="lazy" src="${product.image_url}" alt="${product.title}"></div>
    <div class="product-content"><div class="product-store"><span class="store-logo">${product.store_mark || product.store?.charAt(0)}</span>${product.store}</div><a class="product-title" href="pages/product/?id=${encodeURIComponent(product.id)}">${product.title}</a><div class="price-row"><strong>${formatPrice(product.current_price)}</strong><del>${formatPrice(product.original_price)}</del></div><div class="product-footer"><span class="rating"><span>★</span> ${product.rating} · In stock</span><button class="compare-button" type="button" data-compare-product="${product.id}">Compare</button></div></div>
  </article>`;
}

function bindProductActions(products) {
  document.querySelectorAll("[data-wishlist-product]").forEach((button) => button.addEventListener("click", () => {
    const saved = toggleWishlist(button.dataset.wishlistProduct);
    button.classList.toggle("is-saved", saved); button.textContent = saved ? "♥" : "♡";
  }));
  document.querySelectorAll("[data-compare-product]").forEach((button) => button.addEventListener("click", () => {
    const product = products.find((item) => String(item.id) === button.dataset.compareProduct);
    toggleComparison(button.dataset.compareProduct, product); refreshCompareDock();
  }));
}

function renderProducts(products = featuredProducts) {
  const container = document.querySelector("[data-trending-products]");
  if (!container) return;
  container.innerHTML = products.slice(0, 4).map(productCard).join("");
  bindProductActions(products);
}

function renderStores(stores = fallbackStores) {
  const container = document.querySelector("[data-store-list]");
  if (!container) return;
  container.innerHTML = stores.map((store) => `<a class="store-card" href="pages/stores/?store=${encodeURIComponent(store.slug || store.name)}"><span class="store-logo" style="background:${store.color || "#2874f0"}">${store.mark || store.name.charAt(0)}</span><span><strong>${store.name}</strong><small>${store.description || store.product_count + " products tracked"}</small></span><span class="store-arrow">→</span></a>`).join("");
}

function initializeRevealAnimations() {
  const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (entry.isIntersecting) { entry.target.classList.add("is-visible"); observer.unobserve(entry.target); }
  }), { threshold: .12 });
  document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));
}

function initializeCounters() {
  const counterObserver = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    const element = entry.target; const target = Number(element.dataset.counter); const suffix = target === 1200000 ? "+" : target === 18 ? "%" : target === 4.9 ? "/5" : "";
    const startedAt = performance.now();
    const tick = (now) => { const value = Math.min(1, (now - startedAt) / 950); const displayed = target * (1 - Math.pow(1 - value, 3)); element.textContent = target === 4.9 ? displayed.toFixed(1) : Math.round(displayed).toLocaleString("en-IN"); if (value < 1) requestAnimationFrame(tick); else element.textContent += suffix; };
    requestAnimationFrame(tick); counterObserver.unobserve(element);
  }), { threshold: .7 });
  document.querySelectorAll("[data-counter]").forEach((element) => counterObserver.observe(element));
}

function initializeForms() {
  document.querySelector("[data-login-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault(); const form = event.currentTarget; const message = form.querySelector("[data-login-message]"); const data = Object.fromEntries(new FormData(form));
    message.textContent = "Signing you in…";
    try { const result = await api.login(data); localStorage.setItem("comparex-token", result.access_token); message.textContent = "Welcome back. You’re signed in."; }
    catch { message.textContent = "Demo mode: account service starts with the Flask API."; }
  });
  document.querySelector("[data-newsletter-form]")?.addEventListener("submit", (event) => {
    event.preventDefault(); event.currentTarget.querySelector("[data-newsletter-message]").textContent = "You’re on the list. Watch this space for excellent prices.";
    event.currentTarget.reset();
  });
}

async function hydrateFromApi() {
  try { const stores = await api.stores(); renderStores(stores.stores || stores); } catch { renderStores(); }
}

initializeTheme(); initializeNavigation(); initializeSearch(); initializeCategoryWheel(); initializeWishlist(); initializeCompare();
renderProducts(); renderStores(); initializeRevealAnimations(); initializeCounters(); initializeForms(); hydrateFromApi();
