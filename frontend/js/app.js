/* Homepage bootstrap, data rendering, interaction binding and progressive enhancement. */
import { api } from "./api.js";
import { initializeTheme } from "./theme.js";
import { initializeNavigation } from "./navbar.js";
import { initializeSearch, initializeCategoryWheel } from "./search.js?v=save8";
import { initializeWishlist } from "./wishlist.js";
import { initializeCompare } from "./compare.js";
import { MARKETPLACES } from "./marketplace-data.js?v=save8";

function renderProducts() {
  const container = document.querySelector("[data-trending-products]");
  if (!container) return;
  container.innerHTML = `<div class="empty-state" style="grid-column:1/-1;padding:35px;text-align:center"><strong>Every comparison is searched live.</strong><p style="margin:8px 0 0;color:var(--muted);font-size:12px">Enter a product above to fetch fresh marketplace offers.</p></div>`;
}

function marketplacePill(marketplace, duplicate = false) {
  return `<a class="marketplace-pill" href="${marketplace.url}" target="_blank" rel="noopener noreferrer"${duplicate ? ' aria-hidden="true" tabindex="-1"' : ""} style="--market-color:${marketplace.color}"><img src="${marketplace.logo}" alt="" width="30" height="30"><span>${marketplace.name}</span></a>`;
}

function renderMarketplaceRibbon() {
  const container = document.querySelector("[data-marketplace-ribbon]");
  if (!container) return;
  const marketplaces = MARKETPLACES;
  const group = (duplicate = false) => marketplaces.map((marketplace) => (
    `<span class="ribbon-market"${duplicate ? ' aria-hidden="true"' : ""}><img src="${marketplace.logo}" alt="" width="24" height="24"><strong>${marketplace.name}</strong></span>`
  )).join("");
  container.innerHTML = `<span class="ribbon-group">${group()}</span><span class="ribbon-group" aria-hidden="true">${group(true)}</span>`;
}

function renderStores() {
  const container = document.querySelector("[data-store-ribbons]");
  if (!container) return;
  const renderRow = (marketplaces, direction) => {
    const group = (duplicate = false) => `<span class="marketplace-pill-set">${marketplaces.map((marketplace) => marketplacePill(marketplace, duplicate)).join("")}</span>`;
    return `<div class="marketplace-row marketplace-row-${direction}"><div class="marketplace-row-track">${group()}${group(true)}</div></div>`;
  };
  container.innerHTML = [
    renderRow(MARKETPLACES, "left"),
    renderRow([...MARKETPLACES].reverse(), "right"),
  ].join("");
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

initializeTheme(); initializeNavigation(); initializeSearch(); initializeCategoryWheel(); initializeWishlist(); initializeCompare();
renderProducts(); renderMarketplaceRibbon(); renderStores(); initializeRevealAnimations(); initializeCounters(); initializeForms();
