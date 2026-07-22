/* Search results page: query parsing, API request, filtering and sort controls. */
import { api } from "./api.js";
import { formatPrice } from "./utils.js";
import { initializeTheme } from "./theme.js";

const form = document.querySelector("[data-results-form]");
const input = document.querySelector("[data-results-input]");
const grid = document.querySelector("[data-results-grid]");
const count = document.querySelector("[data-result-count]");
let products = [];

function productCard(product) {
  const image = product.image_url || "https://images.unsplash.com/photo-1560472354-b33ff0c44a43?auto=format&fit=crop&w=400&q=80";
  return `<article class="product-card">
    <div class="product-image"><span class="discount-badge">${product.discount || 0}% off</span><img loading="lazy" src="${image}" alt="${product.title}"></div>
    <div class="product-content"><div class="product-store"><span class="store-logo">${product.store_mark || product.store?.charAt(0) || "C"}</span>${product.store || "CompareX"}</div><a class="product-title" href="../product/?id=${encodeURIComponent(product.id)}">${product.title}</a><div class="price-row"><strong>${formatPrice(product.current_price)}</strong>${product.original_price ? `<del>${formatPrice(product.original_price)}</del>` : ""}</div><div class="product-footer"><span class="rating"><span>★</span> ${product.rating || "New"} · ${product.availability || "In stock"}</span><a class="compare-button" href="../product/?id=${encodeURIComponent(product.id)}">View</a></div></div>
  </article>`;
}

function render() {
  const selectedStores = [...document.querySelectorAll("[data-store-filter]:checked")].map((filter) => filter.value);
  const sort = document.querySelector("[data-sort]").value;
  let visibleProducts = products.filter((product) => !selectedStores.length || selectedStores.some((store) => product.store?.toLowerCase().replace(" ", "").startsWith(store)));
  if (sort === "low") visibleProducts.sort((a, b) => a.current_price - b.current_price);
  if (sort === "high") visibleProducts.sort((a, b) => b.current_price - a.current_price);
  if (sort === "rating") visibleProducts.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  count.textContent = `${visibleProducts.length} product${visibleProducts.length === 1 ? "" : "s"} found across marketplaces`;
  grid.innerHTML = visibleProducts.length ? visibleProducts.map(productCard).join("") : `<div class="empty-state" style="grid-column:1/-1"><h2>No matching offers yet</h2><p>Try another product name or choose more marketplaces.</p></div>`;
}

async function performSearch(query) {
  if (query.length < 2) { count.textContent = "Enter at least two characters to search."; grid.innerHTML = ""; return; }
  count.textContent = "Searching stores…";
  grid.innerHTML = "<div class=\"skeleton\"></div>".repeat(4);
  try {
    const response = await api.search(query);
    products = response.products || [];
    render();
  } catch (error) {
    count.textContent = "We couldn’t reach the comparison service.";
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><h2>Comparison service unavailable</h2><p>Start the Flask API at <code>http://127.0.0.1:5000</code>, then try again.</p></div>`;
  }
}

const query = new URLSearchParams(window.location.search).get("query") || "";
input.value = query;
form.addEventListener("submit", (event) => { event.preventDefault(); const nextQuery = input.value.trim(); history.replaceState({}, "", `?query=${encodeURIComponent(nextQuery)}`); performSearch(nextQuery); });
document.querySelectorAll("[data-store-filter], [data-sort]").forEach((control) => control.addEventListener("change", render));
initializeTheme();
performSearch(query);
