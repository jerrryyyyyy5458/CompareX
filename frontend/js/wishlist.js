/* Local wishlist state that can later synchronize with authenticated APIs. */
import { safeJson, saveJson } from "./utils.js";

let wishlist = new Set(safeJson("comparex-wishlist", []));

function syncCount() {
  document.querySelectorAll("[data-wishlist-count]").forEach((element) => { element.textContent = wishlist.size; });
}

export function toggleWishlist(productId) {
  if (wishlist.has(String(productId))) wishlist.delete(String(productId));
  else wishlist.add(String(productId));
  saveJson("comparex-wishlist", [...wishlist]);
  syncCount();
  return wishlist.has(String(productId));
}

export function isWishlisted(productId) { return wishlist.has(String(productId)); }
export function initializeWishlist() { syncCount(); }
