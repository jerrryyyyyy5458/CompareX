/* REST client with response caching and graceful local fallback. */
const API_BASE_URL = window.COMPAREX_API_URL || "http://127.0.0.1:5000";
const cache = new Map();

async function request(path, options = {}) {
  const { cacheFor = 0, ...fetchOptions } = options;
  const cacheKey = `${path}:${JSON.stringify(fetchOptions)}`;
  const stored = cache.get(cacheKey);
  if (stored && stored.expiresAt > Date.now()) return stored.data;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...fetchOptions.headers },
    ...fetchOptions,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "We couldn't complete that request.");
  if (cacheFor) cache.set(cacheKey, { data: payload, expiresAt: Date.now() + cacheFor });
  return payload;
}

export const api = {
  search: (query, filters = {}) => request(`/search?${new URLSearchParams({ query, ...filters })}`, { cacheFor: 60_000 }),
  stores: () => request("/stores", { cacheFor: 300_000 }),
  brands: () => request("/brands", { cacheFor: 300_000 }),
  login: (credentials) => request("/login", { method: "POST", body: JSON.stringify(credentials) }),
  register: (details) => request("/register", { method: "POST", body: JSON.stringify(details) }),
  saveWishlist: (productId) => request("/wishlist", { method: "POST", body: JSON.stringify({ product_id: productId }) }),
  removeWishlist: (productId) => request(`/wishlist/${productId}`, { method: "DELETE" }),
};
