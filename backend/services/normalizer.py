"""Marketplace-independent product text and money normalization."""
import re


def parse_price(value):
    """Return a float from marketplace price text, or None when absent."""
    if value is None: return None
    numeric = re.sub(r"[^\d.]", "", str(value).replace(",", ""))
    try: return float(numeric) if numeric else None
    except ValueError: return None


def normalize_title(title):
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", title.lower())).strip()


def normalized_product(raw, store):
    current_price = parse_price(raw.get("current_price"))
    original_price = parse_price(raw.get("original_price"))
    discount = raw.get("discount") or (round((1 - current_price / original_price) * 100) if current_price and original_price and original_price > current_price else 0)
    return {**raw, "store": store, "current_price": current_price, "original_price": original_price, "discount": max(0, discount), "normalized_title": normalize_title(raw.get("title", "")), "availability": raw.get("availability", "In stock")}
