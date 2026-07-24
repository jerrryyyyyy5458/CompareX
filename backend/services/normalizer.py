"""Marketplace-independent product normalization and result ranking."""
import hashlib
import re
from urllib.parse import urlsplit, urlunsplit


def parse_price(value):
    """Return a float from marketplace price text, or None when absent."""
    if value is None: return None
    match = re.search(r"\d[\d,]*(?:\.\d+)?", str(value))
    numeric = match.group().replace(",", "") if match else ""
    try: return float(numeric) if numeric else None
    except ValueError: return None


def parse_number(value, maximum=None):
    """Parse ratings, percentages, and compact review counts."""
    if value is None:
        return None
    text = str(value).replace(",", "").strip().lower()
    match = re.search(r"\d+(?:\.\d+)?", text)
    if not match:
        return None
    number = float(match.group())
    if "k" in text:
        number *= 1_000
    elif "m" in text:
        number *= 1_000_000
    if maximum is not None and number > maximum:
        return None
    return number


def normalize_title(title):
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", title.lower())).strip()


def normalized_product(raw, store):
    current_price = parse_price(raw.get("current_price"))
    original_price = parse_price(raw.get("original_price"))
    parsed_discount = parse_number(raw.get("discount"), maximum=100)
    discount = parsed_discount if parsed_discount is not None else (
        round((1 - current_price / original_price) * 100)
        if current_price and original_price and original_price > current_price else 0
    )
    title = re.sub(r"\s+", " ", str(raw.get("title", ""))).strip()
    url = str(raw.get("url", "")).strip()
    product_id = hashlib.sha1(f"{store}:{url or title}".encode("utf-8")).hexdigest()[:16]
    rating = parse_number(raw.get("rating"), maximum=5)
    review_count = parse_number(raw.get("review_count"))
    return {
        "id": product_id,
        "title": title,
        "current_price": current_price,
        "original_price": original_price,
        "discount": max(0, min(100, round(discount))),
        "rating": rating,
        "review_count": int(review_count) if review_count is not None else None,
        "availability": raw.get("availability") or "Check availability",
        "image_url": raw.get("image_url"),
        "url": url,
        "store": store,
        "marketplace": store,
        "normalized_title": normalize_title(title),
        "highlights": [],
    }


def canonical_url(value):
    """Remove tracking fragments while retaining the product identity."""
    parts = urlsplit(value or "")
    return urlunsplit((parts.scheme, parts.netloc.lower(), parts.path.rstrip("/"), "", ""))


def finalize_products(products):
    """Remove repeated listings, sort by price, and mark result leaders."""
    unique = {}
    for product in products:
        if not product.get("title") or not product.get("current_price") or not product.get("url"):
            continue
        key = (
            product["store"].lower(),
            canonical_url(product["url"]) or product["normalized_title"],
            product["current_price"],
        )
        unique.setdefault(key, product)

    ranked = sorted(unique.values(), key=lambda item: item["current_price"])
    if not ranked:
        return ranked, {"lowest_price": [], "best_discount": [], "best_rated": []}

    lowest = min(item["current_price"] for item in ranked)
    best_discount = max(item.get("discount") or 0 for item in ranked)
    rated = [item for item in ranked if item.get("rating") is not None]
    best_rating = max((item["rating"] for item in rated), default=None)
    highlights = {"lowest_price": [], "best_discount": [], "best_rated": []}

    for item in ranked:
        if item["current_price"] == lowest:
            item["highlights"].append("lowest_price")
            highlights["lowest_price"].append(item["id"])
        if best_discount > 0 and item.get("discount") == best_discount:
            item["highlights"].append("best_discount")
            highlights["best_discount"].append(item["id"])
        if best_rating is not None and item.get("rating") == best_rating:
            item["highlights"].append("best_rated")
            highlights["best_rated"].append(item["id"])
    return ranked, highlights
