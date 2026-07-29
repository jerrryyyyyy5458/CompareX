/* Small reusable DOM, formatting and storage helpers. */
export const formatPrice = (price) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 0,
}).format(price);

export const debounce = (callback, delay = 250) => {
  let timer;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => callback(...args), delay);
  };
};

export const safeJson = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};

export const saveJson = (key, value) => localStorage.setItem(key, JSON.stringify(value));
export const bySelector = (selector, parent = document) => parent.querySelector(selector);
export const bySelectorAll = (selector, parent = document) => [...parent.querySelectorAll(selector)];
