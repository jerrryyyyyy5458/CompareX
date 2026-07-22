/* Client-side comparison selection and floating dock renderer. */
import { formatPrice, safeJson, saveJson } from "./utils.js";

const MAX_COMPARE_ITEMS = 4;
let selectedProducts = safeJson("comparex-compare", []);

function renderDock() {
  const dock = document.querySelector("[data-compare-dock]");
  const container = document.querySelector("[data-compare-items]");
  if (!dock || !container) return;
  dock.classList.toggle("is-open", selectedProducts.length > 0);
  container.innerHTML = selectedProducts.map((product) => `
    <div class="compare-item">
      <img src="${product.image_url}" alt="">
      <span title="${product.title}">${formatPrice(product.current_price)}</span>
      <button type="button" data-remove-compare="${product.id}" aria-label="Remove ${product.title}">×</button>
    </div>`).join("");
  document.querySelector("[data-compare-count]")?.replaceChildren(String(selectedProducts.length));
  container.querySelectorAll("[data-remove-compare]").forEach((button) => button.addEventListener("click", () => {
    toggleComparison(button.dataset.removeCompare);
  }));
  document.querySelectorAll("[data-compare-product]").forEach((button) => {
    button.classList.toggle("is-selected", selectedProducts.some((product) => String(product.id) === button.dataset.compareProduct));
    button.textContent = button.classList.contains("is-selected") ? "Added ✓" : "Compare";
  });
}

export function toggleComparison(productId, product = null) {
  const index = selectedProducts.findIndex((item) => String(item.id) === String(productId));
  if (index >= 0) selectedProducts.splice(index, 1);
  else if (product && selectedProducts.length < MAX_COMPARE_ITEMS) selectedProducts.push(product);
  else if (product) window.alert(`You can compare up to ${MAX_COMPARE_ITEMS} products at a time.`);
  saveJson("comparex-compare", selectedProducts);
  renderDock();
}

export function initializeCompare() {
  renderDock();
  document.querySelector("[data-compare-action]")?.addEventListener("click", () => {
    const ids = selectedProducts.map((product) => product.id).join(",");
    window.location.href = `pages/compare/?products=${encodeURIComponent(ids)}`;
  });
}

export const refreshCompareDock = renderDock;
