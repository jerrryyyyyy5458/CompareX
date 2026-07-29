/* CompareX Intelligence — modular marketplace recommendation scoring. */
/* Weights are intentionally balanced so cheapest is not always selected. */

export const INTELLIGENCE_WEIGHTS = Object.freeze({
  price: 0.35,
  delivery: 0.2,
  rating: 0.2,
  discount: 0.15,
  availability: 0.1,
});

function toNumber(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

/** Lower is faster. Unknown delivery gets a neutral-mid penalty. */
export function deliverySpeedRank(offer = {}) {
  const text = `${offer.delivery || ""} ${offer.availability || ""}`.toLowerCase();
  if (!text.trim() || text.includes("—")) return 55;
  if (/(today|minutes|instant|same.?day|express|1.?hour|few hours)/.test(text)) return 8;
  if (/tomorrow/.test(text)) return 18;
  const days = text.match(/(\d+)\s*day/);
  if (days) return clamp(20 + Number(days[1]) * 12, 20, 95);
  if (/free/.test(text)) return 40;
  return 55;
}

export function availabilityScore(offer = {}) {
  const text = String(offer.availability || "").toLowerCase();
  if (!text || text.includes("check")) return 48;
  if (/out of stock|sold out|unavailable/.test(text)) return 0;
  if (/limited|few left|hurry/.test(text)) return 72;
  if (/in stock|available/.test(text)) return 100;
  return 55;
}

export function discountPercent(offer = {}) {
  const explicit = toNumber(offer.discount);
  if (explicit != null && explicit > 0) return clamp(explicit, 0, 90);
  const original = toNumber(offer.original_price);
  const price = toNumber(offer.price);
  if (original && price && original > price) {
    return clamp(Math.round((1 - price / original) * 100), 0, 90);
  }
  return 0;
}

function priceScore(price, lowest, highest) {
  if (price == null) return 0;
  if (highest <= lowest) return 100;
  return clamp(100 - ((price - lowest) / (highest - lowest)) * 100);
}

function deliveryScore(rank, bestRank, worstRank) {
  if (worstRank <= bestRank) return 100;
  return clamp(100 - ((rank - bestRank) / (worstRank - bestRank)) * 100);
}

function ratingScore(rating) {
  const value = toNumber(rating);
  if (value == null || value <= 0) return 52;
  return clamp((value / 5) * 100);
}

function discountScore(percent, maxDiscount) {
  if (maxDiscount <= 0) return 50;
  return clamp((percent / maxDiscount) * 100);
}

function buildReasons(offer, context, scores) {
  const reasons = [];
  const price = toNumber(offer.price);
  if (price != null && price === context.lowest) reasons.push("Lowest Price");
  else if (scores.price >= 85) reasons.push("Strong Price");

  if (deliverySpeedRank(offer) === context.bestDeliveryRank) reasons.push("Fastest Delivery");
  else if (scores.delivery >= 80) reasons.push("Fast Delivery");

  const rating = toNumber(offer.rating);
  if (rating != null && rating === context.highestRating) reasons.push("Highest Rated Seller");
  else if (scores.rating >= 80) reasons.push("Trusted Seller");

  if (availabilityScore(offer) >= 95) reasons.push("In Stock");
  if (scores.discount >= 75 && discountPercent(offer) > 0) reasons.push("High Discount");

  if (!reasons.length) reasons.push("Balanced overall value");
  return [...new Set(reasons)].slice(0, 5);
}

function highlightFlags(offer, context) {
  const price = toNumber(offer.price);
  const rating = toNumber(offer.rating);
  return {
    lowestPrice: price != null && price === context.lowest,
    fastestDelivery: deliverySpeedRank(offer) === context.bestDeliveryRank,
    highestRated: rating != null && rating === context.highestRating && context.highestRating > 0,
  };
}

/**
 * Score marketplace offers and pick a balanced recommendation.
 * @param {Array<object>} offers
 * @returns {object|null}
 */
export function recommendOffer(offers = []) {
  const usable = (offers || []).filter((offer) => toNumber(offer.price) != null);
  if (!usable.length) return null;

  const prices = usable.map((offer) => toNumber(offer.price));
  const lowest = Math.min(...prices);
  const highest = Math.max(...prices);
  const deliveryRanks = usable.map((offer) => deliverySpeedRank(offer));
  const bestDeliveryRank = Math.min(...deliveryRanks);
  const worstDeliveryRank = Math.max(...deliveryRanks);
  const ratings = usable.map((offer) => toNumber(offer.rating)).filter((value) => value != null && value > 0);
  const highestRating = ratings.length ? Math.max(...ratings) : 0;
  const discounts = usable.map((offer) => discountPercent(offer));
  const maxDiscount = Math.max(...discounts, 0);

  const context = { lowest, highest, bestDeliveryRank, highestRating };

  const scored = usable.map((offer) => {
    const price = toNumber(offer.price);
    const scores = {
      price: priceScore(price, lowest, highest),
      delivery: deliveryScore(deliverySpeedRank(offer), bestDeliveryRank, worstDeliveryRank),
      rating: ratingScore(offer.rating),
      discount: discountScore(discountPercent(offer), maxDiscount),
      availability: availabilityScore(offer),
    };

    const overall = Math.round(
      scores.price * INTELLIGENCE_WEIGHTS.price
      + scores.delivery * INTELLIGENCE_WEIGHTS.delivery
      + scores.rating * INTELLIGENCE_WEIGHTS.rating
      + scores.discount * INTELLIGENCE_WEIGHTS.discount
      + scores.availability * INTELLIGENCE_WEIGHTS.availability,
    );

    return {
      offer,
      scores,
      overall: clamp(overall),
      reasons: buildReasons(offer, context, scores),
      highlights: highlightFlags(offer, context),
    };
  }).sort((a, b) => b.overall - a.overall || a.offer.price - b.offer.price);

  const winner = scored[0];
  const savings = highest > lowest ? highest - lowest : 0;

  return {
    offer: winner.offer,
    score: winner.overall,
    scores: winner.scores,
    reasons: winner.reasons,
    highlights: winner.highlights,
    marketCount: usable.length,
    lowestPrice: lowest,
    highestPrice: highest,
    savings,
    ranked: scored,
    weights: INTELLIGENCE_WEIGHTS,
  };
}

/**
 * Animate numeric counters inside a rendered intelligence card.
 * @param {ParentNode} root
 */
export function animateIntelligenceCounters(root = document) {
  const nodes = root.querySelectorAll("[data-cx-count]");
  nodes.forEach((node) => {
    const target = Number(node.getAttribute("data-cx-count"));
    if (!Number.isFinite(target)) return;
    const prefix = node.getAttribute("data-cx-prefix") || "";
    const suffix = node.getAttribute("data-cx-suffix") || "";
    const format = node.getAttribute("data-cx-format") || "plain";
    const duration = 900;
    const start = performance.now();

    const frame = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 3;
      const value = Math.round(target * eased);
      if (format === "inr") {
        node.textContent = `${prefix}${new Intl.NumberFormat("en-IN", {
          style: "currency",
          currency: "INR",
          maximumFractionDigits: 0,
        }).format(value)}${suffix}`;
      } else {
        node.textContent = `${prefix}${value}${suffix}`;
      }
      if (progress < 1) requestAnimationFrame(frame);
    };

    requestAnimationFrame(frame);
  });
}
