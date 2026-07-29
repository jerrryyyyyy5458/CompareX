/* Compare page renderer using selections stored by the floating comparison dock. */
import { formatPrice, safeJson } from "./utils.js";
import { initializeTheme } from "./theme.js";

const container = document.querySelector("[data-comparison]");
const requestedIds = new URLSearchParams(window.location.search).get("products")?.split(",") || [];
const products = safeJson("comparex-compare", []).filter((product) => requestedIds.includes(String(product.id)));

function renderComparison() {
  if (!products.length) {
    container.innerHTML = `<section class="compare-empty"><h2>Your comparison is empty</h2><p>Add up to four products from a product card, then CompareX will put the important details side by side.</p><a class="button button-primary" href="../../">Discover products →</a></section>`;
    return;
  }
  const lowestPrice = Math.min(...products.map((product) => product.current_price));
  const cells = products.map((product) => `<div class="product-head"><img src="${product.image_url}" alt="${product.title}"><strong>${product.title}</strong><small>${product.store}</small></div>`).join("");
  const row = (label, renderValue, extraClass = "") => `<div class="label">${label}</div>${products.map((product) => `<div class="${extraClass}">${renderValue(product)}</div>`).join("")}`;
  container.innerHTML = `<div class="comparison-grid" style="--product-count:${products.length}">
    <div class="label">Product</div>${cells}
    ${row("Current price", (product) => `${formatPrice(product.current_price)}${product.current_price === lowestPrice ? '<span style="display:block;margin-top:7px;font-size:9px;font-weight:700">LOWEST PRICE</span>' : ""}`, "best-price")}
    ${row("Original price", (product) => product.original_price ? formatPrice(product.original_price) : "—")}
    ${row("Saving", (product) => `${product.discount || 0}% off`, "winner")}
    ${row("Marketplace", (product) => product.store || "—")}
    ${row("Rating", (product) => product.rating ? `★ ${product.rating} / 5` : "Not rated")}
    ${row("Availability", (product) => product.availability || "In stock")}
    ${row("Buy", (product) => `<a class="button button-primary" style="min-height:38px;font-size:10px" href="${product.url || "#"}" target="_blank" rel="noopener">View offer →</a>`)}
  </div>`;
}

initializeTheme();
renderComparison();
