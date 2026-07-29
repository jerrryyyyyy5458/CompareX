/* Uncached REST and live-search stream client. */
const API_BASE_URL = window.COMPAREX_API_URL || "http://127.0.0.1:5000";

async function request(path, options = {}) {
  const { headers = {}, ...fetchOptions } = options;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...headers },
    ...fetchOptions,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "We couldn't complete that request.");
  return payload;
}

function searchParams(query, stores = []) {
  const params = new URLSearchParams({ query });
  stores.forEach((store) => params.append("store", store));
  return params;
}

export const api = {
  search: (query, stores = []) => request(`/search?${searchParams(query, stores)}`),
  searchStream(query, stores, onEvent, onError) {
    const source = new EventSource(`${API_BASE_URL}/search/stream?${searchParams(query, stores)}`);
    source.onmessage = ({ data }) => {
      try { onEvent(JSON.parse(data), source); }
      catch (error) { onError?.(error, source); }
    };
    source.onerror = (error) => onError?.(error, source);
    return source;
  },
  stores: () => request("/stores"),
  login: (credentials) => request("/login", { method: "POST", body: JSON.stringify(credentials) }),
  register: (details) => request("/register", { method: "POST", body: JSON.stringify(details) }),
  saveWishlist: (productId) => request("/wishlist", { method: "POST", body: JSON.stringify({ product_id: productId }) }),
  removeWishlist: (productId) => request(`/wishlist/${productId}`, { method: "DELETE" }),
};
