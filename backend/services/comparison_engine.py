"""Cross-marketplace product matching and comparison grouping."""
from __future__ import annotations

import hashlib
import re

from services.normalizer import normalize_title

ACCESSORY_TERMS = (
    "adapter",
    "back cover",
    "cable",
    "case",
    "charger",
    "cover",
    "guard",
    "holder",
    "mobile skin",
    "phone skin",
    "pouch",
    "protector",
    "screen guard",
    "screen protector",
    "sleeve",
    "stand",
    "strap",
    "tempered glass",
    "wallet",
)

BRANDS = (
    "apple", "samsung", "oneplus", "xiaomi", "redmi", "realme", "oppo", "vivo",
    "iqoo", "nothing", "google", "motorola", "nokia", "sony", "lg", "boat",
    "boult", "jbl", "noise", "fireboltt", "fastrack", "lenovo", "hp", "dell",
    "asus", "acer", "msi", "microsoft", "canon", "nikon", "dyson", "philips",
    "nike", "adidas", "puma", "reebok", "skechers", "woodland",
    "loreal", "lakme", "maybelline", "nykaa", "plum", "minimalist", "cetaphil",
    "neutrogena", "nivea", "dove", "himalaya", "mamaearth", "biotique",
)

# Product-line tokens that imply a manufacturer when the brand word is absent.
BRAND_ALIASES = {
    "iphone": "apple",
    "ipad": "apple",
    "macbook": "apple",
    "airpods": "apple",
    "galaxy": "samsung",
    "pixel": "google",
    "redmi": "xiaomi",
    "poco": "xiaomi",
    "narzo": "realme",
    "nord": "oneplus",
}

COLORS = (
    "black", "white", "blue", "red", "green", "gold", "silver", "grey", "gray",
    "purple", "pink", "yellow", "orange", "brown", "beige", "cream", "navy",
    "midnight", "starlight", "graphite", "sierra", "alpine", "natural",
    "titanium", "ultramarine", "teal", "coral", "lavender", "mint", "ivory",
    "space black", "space gray", "space grey", "phantom black", "awesome black",
)

STOPWORDS = {
    "with", "and", "for", "the", "a", "an", "in", "on", "of", "to", "by",
    "from", "new", "buy", "sale", "offer", "off", "india", "indian", "official",
    "storage", "ram", "rom", "gb", "tb", "cm", "inch", "inches", "display",
    "battery", "camera", "mobile", "phone", "smartphone", "5g", "4g", "lte",
    "ai", "series", "edition", "version", "pack", "combo", "set", "ml", "g",
    "kg", "watt", "w", "mah", "hz", "fps", "mp", "led", "oled", "amoled",
    "sponsored", "ad", "amazon", "flipkart", "myntra", "ajio", "croma", "nykaa",
}


def _word_boundary_match(term: str, text: str) -> bool:
    return bool(re.search(rf"\b{re.escape(term)}\b", text))


def is_accessory(title: str, query: str = "") -> bool:
    """True when the listing is an accessory and the shopper did not ask for one."""
    normalized_title = normalize_title(title)
    normalized_query = normalize_title(query)
    if any(_word_boundary_match(term, normalized_query) for term in ACCESSORY_TERMS):
        return False
    return any(_word_boundary_match(term, normalized_title) for term in ACCESSORY_TERMS)


def _extract_brand(normalized: str) -> str | None:
    for brand in sorted(BRANDS, key=len, reverse=True):
        if brand == "noise" and _word_boundary_match("noise cancelling", normalized):
            continue
        if _word_boundary_match(brand, normalized):
            return brand
    for alias, brand in sorted(BRAND_ALIASES.items(), key=lambda item: len(item[0]), reverse=True):
        if _word_boundary_match(alias, normalized):
            return brand
    tokens = normalized.split()
    return tokens[0] if tokens else None


def _canonical_brand(brand: str | None) -> str | None:
    if not brand:
        return None
    return BRAND_ALIASES.get(brand, brand)


def _colors_compatible(left: str | None, right: str | None) -> bool:
    if not left or not right:
        return True
    if left == right:
        return True
    return left in right or right in left


def _extract_color(normalized: str) -> str | None:
    for color in sorted(COLORS, key=len, reverse=True):
        if _word_boundary_match(color, normalized):
            return color
    return None


def _extract_storage_and_ram(normalized: str) -> tuple[str | None, str | None]:
    """Return (storage, ram) as normalized strings like '128gb' / '8gb'."""
    ram = None
    storage = None

    ram_match = re.search(r"\b(\d+)\s*gb\s*ram\b", normalized)
    if ram_match:
        ram = f"{ram_match.group(1)}gb"

    combo = re.search(r"\b(\d+)\s*gb\s*[+/|]\s*(\d+)\s*(gb|tb)\b", normalized)
    if combo:
        left, right, unit = combo.group(1), combo.group(2), combo.group(3)
        right_n = int(right)
        if unit == "tb" or right_n >= 32:
            ram = ram or f"{left}gb"
            storage = f"{right}{unit}"
        else:
            storage = storage or f"{left}gb"
            ram = ram or f"{right}gb"

    storage_tb = re.search(r"\b(\d+)\s*tb\b", normalized)
    if storage_tb and not storage:
        storage = f"{storage_tb.group(1)}tb"

    gb_values = [int(value) for value in re.findall(r"\b(\d+)\s*gb\b", normalized)]
    if gb_values:
        unique = sorted(set(gb_values))
        ram_candidates = [value for value in unique if value <= 24]
        storage_candidates = [value for value in unique if value >= 32]
        if not ram and ram_candidates:
            ram = f"{ram_candidates[-1]}gb"
        if not storage and storage_candidates:
            storage = f"{storage_candidates[-1]}gb"
        elif not storage and unique and max(unique) >= 64:
            storage = f"{max(unique)}gb"

    return storage, ram


def _extract_model(normalized: str, brand: str | None) -> str | None:
    patterns = [
        r"\bwh\s*\d{3,4}\s*xm\d+\b",
        r"\bwf\s*\d{3,4}\s*xm\d+\b",
        r"\b[a-z]{1,3}\s*\d{3,5}[a-z]{0,3}\b",
        r"\biphone\s*(air|\d{1,2}\s*(?:pro\s*max|pro|plus|e|mini)?)\b",
        r"\bgalaxy\s*[a-z]?\s*\d{1,3}\s*(?:ultra|plus|fe|edge)?\b",
        r"\bpixel\s*\d{1,2}\s*(?:pro\s*xl|pro|a)?\b",
        r"\bnord\s*(?:ce\s*)?\d*\s*(?:lite)?\b",
        r"\bredmi\s*(?:note\s*)?\d+\s*(?:pro\s*plus|pro|plus|5g)?\b",
        r"\brealme\s*(?:narzo\s*)?\d+\s*(?:pro|plus|5g)?\b",
        r"\boneplus\s*\d+\s*(?:r|t|pro)?\b",
        r"\biqoo\s*(?:neo\s*)?\d+\s*(?:pro|5g)?\b",
        r"\bnothing\s*phone\s*\(?\s*\d+\s*a?\s*\)?\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, normalized)
        if match:
            return re.sub(r"\s+", " ", match.group(0)).strip()

    if not brand:
        return None
    remainder = normalized
    if brand in remainder:
        remainder = remainder.split(brand, 1)[1].strip()
    tokens = [
        token for token in remainder.split()
        if token not in STOPWORDS
        and token not in COLORS
        and not re.fullmatch(r"\d+(?:gb|tb|mp|mah|hz|w|cm|ml)", token)
    ]
    if not tokens:
        return None
    model_tokens = []
    for token in tokens[:4]:
        if token in {"with", "and", "for"}:
            break
        model_tokens.append(token)
        if len(model_tokens) >= 3:
            break
    return " ".join(model_tokens) if model_tokens else None


def extract_attributes(title: str) -> dict:
    """Pull brand/model/storage/RAM/color from a marketplace title."""
    normalized = normalize_title(title)
    brand = _extract_brand(normalized)
    storage, ram = _extract_storage_and_ram(normalized)
    color = _extract_color(normalized)
    model = _extract_model(normalized, brand)
    core_tokens = tuple(
        token for token in normalized.split()
        if token not in STOPWORDS
        and token not in COLORS
        and token != brand
        and not re.fullmatch(r"\d+(?:gb|tb)", token)
        and len(token) > 1
    )[:8]
    return {
        "brand": brand,
        "model": model,
        "storage": storage,
        "ram": ram,
        "color": color,
        "normalized_title": normalized,
        "core_tokens": core_tokens,
    }


VARIANT_TOKENS = {"pro", "plus", "max", "ultra", "mini", "fe", "air", "e", "lite", "edge", "xl"}


def _models_equivalent(left: str | None, right: str | None) -> bool:
    if not left or not right:
        return False
    if left == right:
        return True
    shorter, longer = sorted((left, right), key=len)
    if not longer.startswith(shorter):
        return False
    remainder = longer[len(shorter):].strip()
    if not remainder:
        return True
    remainder_tokens = set(remainder.split())
    if remainder_tokens & VARIANT_TOKENS:
        return False
    return remainder_tokens <= {"5g", "4g"}


def _attributes_compatible(left: dict, right: dict) -> bool:
    left_brand = _canonical_brand(left.get("brand"))
    right_brand = _canonical_brand(right.get("brand"))
    if left_brand and right_brand and left_brand != right_brand:
        return False
    for field in ("storage", "ram"):
        a, b = left.get(field), right.get(field)
        if a and b and a != b:
            return False
    left_model, right_model = left.get("model"), right.get("model")
    if left_model and right_model:
        return _models_equivalent(left_model, right_model)
    return True


def _same_product(left: dict, right: dict) -> bool:
    left_attrs, right_attrs = left["_attrs"], right["_attrs"]
    left_key, right_key = left.get("_match_key"), right.get("_match_key")
    if left_key and right_key and left_key == right_key:
        return True
    if not _attributes_compatible(left_attrs, right_attrs):
        return False
    left_model, right_model = left_attrs.get("model"), right_attrs.get("model")
    if _models_equivalent(left_model, right_model):
        return True
    similarity = _token_similarity(left_attrs["core_tokens"], right_attrs["core_tokens"])
    left_brand = _canonical_brand(left_attrs.get("brand"))
    right_brand = _canonical_brand(right_attrs.get("brand"))
    if left_brand and left_brand == right_brand:
        return similarity >= 0.4
    return similarity >= 0.7


def match_key(attributes: dict) -> str | None:
    """Stable identity key when enough structured attributes are present."""
    brand = _canonical_brand(attributes.get("brand"))
    model = attributes.get("model")
    if not brand or not model:
        return None
    return "|".join([
        brand,
        model,
        attributes.get("storage") or "",
        attributes.get("ram") or "",
    ])


def _token_similarity(left: tuple[str, ...], right: tuple[str, ...]) -> float:
    if not left or not right:
        return 0.0
    left_set, right_set = set(left), set(right)
    return len(left_set & right_set) / len(left_set | right_set)


def _pretty_token(token: str) -> str:
    specials = {
        "iphone": "iPhone",
        "ipad": "iPad",
        "macbook": "MacBook",
        "airpods": "AirPods",
        "iqoo": "iQOO",
        "oneplus": "OnePlus",
        "redmi": "Redmi",
        "realme": "realme",
        "galaxy": "Galaxy",
        "pixel": "Pixel",
    }
    return specials.get(token.lower(), token.title())


def _pretty_name(value: str | None) -> str:
    if not value:
        return ""
    return " ".join(_pretty_token(token) for token in value.split())


def _best_display_name(products: list[dict], attrs: dict) -> str:
    """Build a concise shared product name from structured attributes."""
    brand = _pretty_name(_canonical_brand(attrs.get("brand")))
    model = _pretty_name(attrs.get("model"))
    storage = attrs.get("storage")
    ram = attrs.get("ram")
    color = _pretty_name(attrs.get("color"))
    if brand and model:
        bits = [brand if brand.lower() not in model.lower() else None, model]
        name = " ".join(bit for bit in bits if bit)
        details = []
        if ram:
            details.append(ram.upper())
        if storage:
            details.append(storage.upper())
        if color:
            details.append(color)
        if details:
            name = f"{name} ({' / '.join(details)})"
        return name
    ranked = sorted(products, key=lambda item: len(item.get("title") or ""))
    return ranked[0]["title"]


def _offer_from_product(product: dict) -> dict:
    return {
        "marketplace": product.get("store") or product.get("marketplace"),
        "store_slug": product.get("store_slug"),
        "price": product["current_price"],
        "url": product.get("url"),
        "rating": product.get("rating"),
        "availability": product.get("availability") or "Check availability",
        "image_url": product.get("image_url"),
        "original_price": product.get("original_price"),
        "discount": product.get("discount"),
        "product_id": product.get("id"),
        "title": product.get("title"),
    }


def _build_comparison(products: list[dict]) -> dict:
    attrs_list = [product["_attrs"] for product in products]
    attrs = {
        "brand": _canonical_brand(next((item["brand"] for item in attrs_list if item.get("brand")), None)),
        "model": next((item["model"] for item in attrs_list if item.get("model")), None),
        "storage": next((item["storage"] for item in attrs_list if item.get("storage")), None),
        "ram": next((item["ram"] for item in attrs_list if item.get("ram")), None),
        "color": (
            next(iter(colors))
            if len(colors := {item["color"] for item in attrs_list if item.get("color")}) == 1
            else None
        ),
    }
    offers = sorted((_offer_from_product(product) for product in products), key=lambda offer: offer["price"])
    by_market = {}
    for offer in offers:
        key = (offer["marketplace"] or "").lower()
        if key not in by_market or offer["price"] < by_market[key]["price"]:
            by_market[key] = offer
    offers = sorted(by_market.values(), key=lambda offer: offer["price"])

    prices = [offer["price"] for offer in offers]
    lowest = min(prices)
    highest = max(prices)
    average = round(sum(prices) / len(prices), 2)
    savings = round(highest - lowest, 2) if len(prices) > 1 else 0
    best = next(offer for offer in offers if offer["price"] == lowest)
    image = next((offer["image_url"] for offer in offers if offer.get("image_url")), None)
    product_name = _best_display_name(products, attrs)
    comparison_id = hashlib.sha1(
        f"{attrs.get('brand')}|{attrs.get('model')}|{attrs.get('storage')}|"
        f"{attrs.get('ram')}|{attrs.get('color')}|{product_name}".encode("utf-8")
    ).hexdigest()[:16]

    return {
        "id": comparison_id,
        "product_name": product_name,
        "image": image,
        "brand": attrs.get("brand"),
        "model": attrs.get("model"),
        "storage": attrs.get("storage"),
        "ram": attrs.get("ram"),
        "color": attrs.get("color"),
        "offers": offers,
        "lowest_price": lowest,
        "highest_price": highest,
        "average_price": average,
        "savings": savings,
        "best_marketplace": best["marketplace"],
        "best_deal_url": best["url"],
        "offer_count": len(offers),
    }


def build_comparisons(products: list[dict], query: str = "") -> list[dict]:
    """Group equivalent marketplace listings into comparison objects."""
    prepared = []
    for product in products:
        title = product.get("title") or ""
        if not title or not product.get("current_price") or not product.get("url"):
            continue
        if is_accessory(title, query):
            continue
        attrs = extract_attributes(title)
        prepared.append({
            **product,
            "_attrs": attrs,
            "_match_key": match_key(attrs),
        })

    # Pairwise connected components avoid order-dependent first-item grouping.
    parents = list(range(len(prepared)))

    def find(index):
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    def union(left, right):
        left_root, right_root = find(left), find(right)
        if left_root != right_root:
            parents[right_root] = left_root

    for left in range(len(prepared)):
        for right in range(left + 1, len(prepared)):
            if _same_product(prepared[left], prepared[right]):
                union(left, right)

    grouped = {}
    for index, product in enumerate(prepared):
        grouped.setdefault(find(index), []).append(product)
    groups = list(grouped.values())

    comparisons = [_build_comparison(group) for group in groups if group]
    comparisons.sort(key=lambda item: item["lowest_price"])
    return comparisons
