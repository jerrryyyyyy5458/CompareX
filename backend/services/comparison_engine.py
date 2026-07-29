"""Cross-marketplace product matching and comparison grouping."""
from __future__ import annotations

import hashlib
import re

from services.normalizer import normalize_title

ACCESSORY_TERMS = (
    "adapter", "back cover", "band", "cable", "case", "charger", "cover",
    "earbud", "earbuds", "earphone", "earphones", "guard", "headphones",
    "headset", "holder", "loofah", "mouse", "pouch", "power bank", "protector",
    "screen guard", "screen protector", "sleeve", "stand", "strap",
    "tempered glass", "wallet",
)

BRANDS = (
    "apple", "samsung", "oneplus", "xiaomi", "redmi", "realme", "oppo", "vivo",
    "iqoo", "nothing", "google", "motorola", "nokia", "sony", "lg", "boat",
    "boult", "jbl", "noise", "fireboltt", "fastrack", "lenovo", "hp", "dell",
    "asus", "acer", "msi", "microsoft", "canon", "nikon", "dyson", "philips",
    "nike", "adidas", "puma", "reebok", "skechers", "woodland", "swiss beauty",
    "maybelline", "lakme", "nykaa", "plum", "minimalist", "cetaphil",
    "neutrogena", "nivea", "dove", "himalaya", "mamaearth", "biotique",
    "loreal", "l oreal", "faces canada", "m caffeine", "mars", "sugar",
    "colorbar", "insight", "reneu", "dot and key", "the derma co",
)

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
    "loreal": "l oreal",
}

CATEGORY_TYPE_MAP = {
    "beauty": (
        "concealer", "foundation", "compact", "powder", "primer", "lipstick",
        "mascara", "eyeliner", "blush", "serum", "moisturizer", "sunscreen",
        "cleanser", "face wash", "shampoo", "conditioner", "body wash",
    ),
    "electronics": (
        "iphone", "ipad", "macbook", "laptop", "notebook", "tablet", "smartphone",
        "phone", "earbuds", "headphones", "watch", "smartwatch", "mouse",
        "keyboard", "speaker", "monitor", "hair dryer", "trimmer", "straightener",
        "iron", "mixer", "grinder", "refrigerator", "television", "tv",
    ),
    "fashion": (
        "shirt", "t shirt", "kurta", "dress", "jeans", "jacket", "hoodie",
        "sneakers", "shoes", "sandals", "saree", "top", "bra", "briefs",
    ),
    "jewellery": (
        "jewellery", "jewelry", "necklace", "earring", "ring", "bracelet",
        "pendant", "bangle",
    ),
    "personal-care": ("loofah", "razor", "trimmer", "toothbrush"),
}

TYPE_TO_CATEGORY = {
    product_type: category
    for category, types in CATEGORY_TYPE_MAP.items()
    for product_type in types
}

COLORS = (
    "black", "white", "blue", "red", "green", "gold", "silver", "grey", "gray",
    "purple", "pink", "yellow", "orange", "brown", "beige", "cream", "navy",
    "midnight", "starlight", "graphite", "sierra", "alpine", "natural",
    "titanium", "ultramarine", "teal", "coral", "lavender", "mint", "ivory",
    "nude", "sand", "caramel", "honey", "rose", "taupe", "mocha",
    "space black", "space gray", "space grey", "phantom black", "awesome black",
)

STOPWORDS = {
    "with", "and", "for", "the", "a", "an", "in", "on", "of", "to", "by",
    "from", "buy", "offer", "off", "india", "indian", "official", "combo",
    "pack", "set", "pieces", "piece", "ml", "g", "kg", "cm", "inch", "inches",
    "sponsored", "ad", "amazon", "flipkart", "myntra", "ajio", "croma", "nykaa",
    "waterproof", "transfer", "proof", "matte", "liquid", "cream", "full",
    "coverage", "wear", "longwear", "spf", "pa", "new", "original", "sale",
    "bestseller", "trending", "limited", "edition",
}

MODEL_PATTERNS = [
    r"\biphone\s*\d{1,2}\s*(?:pro\s*max|pro|plus|mini|e)?\b",
    r"\bgalaxy\s*[a-z]?\s*\d{1,3}\s*(?:ultra|plus|fe|edge)?\b",
    r"\bpixel\s*\d{1,2}\s*(?:pro\s*xl|pro|a)?\b",
    r"\bmacbook\s*(?:air|pro)?\b",
    r"\bnord\s*(?:ce\s*)?\d*\s*(?:lite)?\b",
    r"\bredmi\s*(?:note\s*)?\d+\s*(?:pro\s*plus|pro|plus|5g)?\b",
    r"\brealme\s*(?:narzo\s*)?\d+\s*(?:pro|plus|5g)?\b",
    r"\boneplus\s*\d+\s*(?:r|t|pro)?\b",
]

VARIANT_TOKENS = {"pro", "plus", "max", "ultra", "mini", "fe", "air", "e", "lite", "edge", "xl"}


def _word_boundary_match(term: str, text: str) -> bool:
    return bool(re.search(rf"\b{re.escape(term)}\b", text))


def is_accessory(title: str, query: str = "") -> bool:
    normalized_title = normalize_title(title)
    normalized_query = normalize_title(query)
    if any(_word_boundary_match(term, normalized_query) for term in ACCESSORY_TERMS):
        return False
    return any(_word_boundary_match(term, normalized_title) for term in ACCESSORY_TERMS)


def _extract_brand(normalized: str) -> str | None:
    for brand in sorted(BRANDS, key=len, reverse=True):
        if _word_boundary_match(brand, normalized):
            return brand
    for alias, brand in sorted(BRAND_ALIASES.items(), key=lambda item: len(item[0]), reverse=True):
        if _word_boundary_match(alias, normalized):
            return brand
    return None


def _canonical_brand(brand: str | None) -> str | None:
    if not brand:
        return None
    return BRAND_ALIASES.get(brand, brand)


def _extract_product_type(normalized: str) -> str | None:
    for product_type in sorted(TYPE_TO_CATEGORY, key=len, reverse=True):
        if _word_boundary_match(product_type, normalized):
            return product_type
    return None


def _extract_category(normalized: str, product_type: str | None) -> str | None:
    if product_type:
        return TYPE_TO_CATEGORY.get(product_type)
    return None


def _extract_color(normalized: str) -> str | None:
    for color in sorted(COLORS, key=len, reverse=True):
        if _word_boundary_match(color, normalized):
            return color
    return None


def _extract_storage_and_ram(normalized: str) -> tuple[str | None, str | None]:
    ram = None
    storage = None
    ram_match = re.search(r"\b(\d+)\s*gb\s*ram\b", normalized)
    if ram_match:
        ram = f"{ram_match.group(1)}gb"
    combo = re.search(r"\b(\d+)\s*gb\s*[+/|]\s*(\d+)\s*(gb|tb)\b", normalized)
    if combo:
        left, right, unit = combo.group(1), combo.group(2), combo.group(3)
        if unit == "tb" or int(right) >= 32:
            ram = ram or f"{left}gb"
            storage = f"{right}{unit}"
    if not storage:
        storage_match = re.search(r"\b(\d+)\s*(gb|tb)\b", normalized)
        if storage_match and int(storage_match.group(1)) >= 32:
            storage = f"{storage_match.group(1)}{storage_match.group(2)}"
    return storage, ram


def _extract_quantity(normalized: str) -> str | None:
    patterns = (
        r"\b\d+\s*ml\b",
        r"\b\d+\s*g\b",
        r"\b\d+\s*kg\b",
        r"\b\d+\s*pcs\b",
        r"\bpack of \d+\b",
        r"\b\d+\s*count\b",
    )
    for pattern in patterns:
        match = re.search(pattern, normalized)
        if match:
            return match.group(0).replace(" ", "")
    return None


def _extract_model(normalized: str) -> str | None:
    for pattern in MODEL_PATTERNS:
        match = re.search(pattern, normalized)
        if match:
            return re.sub(r"\s+", " ", match.group(0)).strip()
    return None


def _extract_shade(normalized: str, color: str | None) -> str | None:
    shade_patterns = (
        r"\bshade\s*[a-z0-9]+\b",
        r"\b\d{2,4}\s*[a-z]+\b",
        r"\b(?:ivory|nude|beige|sand|caramel|honey|mocha|rose|taupe)\b",
    )
    for pattern in shade_patterns:
        match = re.search(pattern, normalized)
        if match:
            value = match.group(0).strip()
            if color and value == color:
                continue
            return value
    return None


def _extract_variant(normalized: str, product_type: str | None, model: str | None) -> str | None:
    tokens = [
        token for token in normalized.split()
        if token not in STOPWORDS
        and token not in COLORS
        and token not in TYPE_TO_CATEGORY
        and token not in VARIANT_TOKENS
    ]
    if model:
        for token in model.split():
            if token in tokens:
                tokens.remove(token)
    if product_type:
        for token in product_type.split():
            if token in tokens:
                tokens.remove(token)
    tokens = [token for token in tokens if not re.fullmatch(r"\d+(?:gb|tb|ml|g|kg)", token)]
    return " ".join(tokens[:3]) if tokens else None


def extract_attributes(title: str) -> dict:
    normalized = normalize_title(title)
    brand = _canonical_brand(_extract_brand(normalized))
    product_type = _extract_product_type(normalized)
    category = _extract_category(normalized, product_type)
    model = _extract_model(normalized)
    color = _extract_color(normalized)
    shade = _extract_shade(normalized, color)
    storage, ram = _extract_storage_and_ram(normalized)
    quantity = _extract_quantity(normalized)
    variant = _extract_variant(normalized, product_type, model)
    core_tokens = tuple(
        token for token in normalized.split()
        if token not in STOPWORDS
        and token not in COLORS
        and token != brand
        and token != product_type
        and len(token) > 1
        and not re.fullmatch(r"\d+(?:gb|tb|ml|g|kg)", token)
    )[:8]
    return {
        "brand": brand,
        "category": category,
        "product_type": product_type,
        "model": model,
        "variant": variant,
        "shade": shade,
        "color": color,
        "quantity": quantity,
        "storage": storage,
        "ram": ram,
        "normalized_title": normalized,
        "core_tokens": core_tokens,
    }


def match_key(attributes: dict) -> str | None:
    brand = attributes.get("brand")
    category = attributes.get("category")
    product_type = attributes.get("product_type")
    model = attributes.get("model")
    if not category or not product_type:
        return None
    return "|".join([
        brand or "",
        category,
        product_type,
        model or "",
        attributes.get("variant") or "",
        attributes.get("shade") or "",
        attributes.get("storage") or attributes.get("quantity") or "",
    ])


def _token_similarity(left: tuple[str, ...], right: tuple[str, ...]) -> float:
    if not left or not right:
        return 0.0
    left_set, right_set = set(left), set(right)
    return len(left_set & right_set) / len(left_set | right_set)


def _same_or_missing(left: str | None, right: str | None) -> bool:
    return not left or not right or left == right


def _similarity_score(anchor: dict, candidate: dict) -> float:
    left = anchor["_attrs"]
    right = candidate["_attrs"]
    if left.get("category") and right.get("category") and left["category"] != right["category"]:
        return 0.0
    if left.get("product_type") and right.get("product_type") and left["product_type"] != right["product_type"]:
        return 0.0
    score = 0.0
    if left.get("brand") and right.get("brand") and left["brand"] == right["brand"]:
        score += 40
    elif left.get("brand") and right.get("brand"):
        return 0.0
    if left.get("category") and right.get("category") and left["category"] == right["category"]:
        score += 20
    if left.get("product_type") and right.get("product_type") and left["product_type"] == right["product_type"]:
        score += 18
    if left.get("model") and right.get("model"):
        if left["model"] == right["model"]:
            score += 14
        else:
            return 0.0
    if left.get("variant") and right.get("variant") and left["variant"] == right["variant"]:
        score += 8
    if left.get("shade") and right.get("shade") and left["shade"] == right["shade"]:
        score += 10
    elif left.get("shade") and right.get("shade"):
        return 0.0
    if left.get("color") and right.get("color") and left["color"] == right["color"]:
        score += 6
    if left.get("storage") and right.get("storage"):
        if left["storage"] == right["storage"]:
            score += 10
        else:
            return 0.0
    if left.get("ram") and right.get("ram"):
        if left["ram"] == right["ram"]:
            score += 8
        else:
            return 0.0
    if left.get("quantity") and right.get("quantity"):
        if left["quantity"] == right["quantity"]:
            score += 10
        else:
            return 0.0
    score += _token_similarity(left["core_tokens"], right["core_tokens"]) * 20
    return score


def _minimum_similarity(anchor: dict) -> float:
    attrs = anchor["_attrs"]
    threshold = 42.0
    if attrs.get("brand"):
        threshold += 8
    if attrs.get("product_type"):
        threshold += 5
    if attrs.get("model") or attrs.get("shade") or attrs.get("quantity") or attrs.get("storage"):
        threshold += 5
    return threshold


def _query_match_score(product: dict, query: str) -> float:
    """Score how well a scraped candidate matches the searched product."""
    title = product.get("title") or ""
    if not title:
        return 0.0

    query_attrs = extract_attributes(query)
    product_attrs = product.get("_attrs") or extract_attributes(title)
    query_tokens = set(
        token for token in normalize_title(query).split()
        if token not in STOPWORDS and len(token) > 1
    )
    title_tokens = set(
        token for token in normalize_title(title).split()
        if token not in STOPWORDS and len(token) > 1
    )

    # Hard gates: wrong brand / category / product type must not win.
    if query_attrs.get("brand") and product_attrs.get("brand"):
        if query_attrs["brand"] != product_attrs["brand"]:
            return 0.0
    elif query_attrs.get("brand") and query_attrs["brand"] not in title_tokens:
        # Query brand known but missing from title entirely.
        return 0.0

    if query_attrs.get("category") and product_attrs.get("category"):
        if query_attrs["category"] != product_attrs["category"]:
            return 0.0

    if query_attrs.get("product_type") and product_attrs.get("product_type"):
        if query_attrs["product_type"] != product_attrs["product_type"]:
            return 0.0
    elif query_attrs.get("product_type"):
        type_tokens = set(query_attrs["product_type"].split())
        if not type_tokens.issubset(title_tokens):
            return 0.0

    if query_attrs.get("model") and product_attrs.get("model"):
        if query_attrs["model"] != product_attrs["model"]:
            return 0.0

    if query_attrs.get("shade") and product_attrs.get("shade"):
        if query_attrs["shade"] != product_attrs["shade"]:
            return 0.0

    if query_attrs.get("storage") and product_attrs.get("storage"):
        if query_attrs["storage"] != product_attrs["storage"]:
            return 0.0

    if query_attrs.get("quantity") and product_attrs.get("quantity"):
        if query_attrs["quantity"] != product_attrs["quantity"]:
            return 0.0

    score = 0.0
    if query_attrs.get("brand") and product_attrs.get("brand") == query_attrs["brand"]:
        score += 45
    if query_attrs.get("category") and product_attrs.get("category") == query_attrs["category"]:
        score += 18
    if query_attrs.get("product_type") and product_attrs.get("product_type") == query_attrs["product_type"]:
        score += 22
    if query_attrs.get("model") and product_attrs.get("model") == query_attrs["model"]:
        score += 16
    if query_attrs.get("variant") and product_attrs.get("variant"):
        score += _token_similarity(
            tuple(query_attrs["variant"].split()),
            tuple(product_attrs["variant"].split()),
        ) * 10
    if query_attrs.get("shade") and product_attrs.get("shade") == query_attrs["shade"]:
        score += 12
    if query_attrs.get("color") and product_attrs.get("color") == query_attrs["color"]:
        score += 8
    if query_attrs.get("quantity") and product_attrs.get("quantity") == query_attrs["quantity"]:
        score += 10
    if query_attrs.get("storage") and product_attrs.get("storage") == query_attrs["storage"]:
        score += 10

    if query_tokens and title_tokens:
        score += (len(query_tokens & title_tokens) / len(query_tokens)) * 35

    # Prefer exact-ish title containment of the full query phrase.
    normalized_query = normalize_title(query)
    normalized_title = normalize_title(title)
    if normalized_query and normalized_query in normalized_title:
        score += 15

    return score


def _minimum_query_match(query: str) -> float:
    attrs = extract_attributes(query)
    threshold = 28.0
    if attrs.get("brand"):
        threshold += 12
    if attrs.get("product_type"):
        threshold += 8
    if attrs.get("model") or attrs.get("shade") or attrs.get("quantity") or attrs.get("storage"):
        threshold += 6
    return threshold


def select_best_per_marketplace(products: list[dict], query: str = "") -> list[dict]:
    """Keep only the highest-scoring product for each marketplace."""
    best_by_market: dict[str, tuple[dict, float]] = {}
    threshold = _minimum_query_match(query)

    for product in products:
        title = product.get("title") or ""
        if not title or not product.get("current_price") or not product.get("url"):
            continue
        if is_accessory(title, query):
            continue

        prepared = product
        if "_attrs" not in product:
            prepared = {**product, "_attrs": extract_attributes(title)}

        score = _query_match_score(prepared, query)
        if score < threshold:
            continue

        market = (prepared.get("store") or prepared.get("marketplace") or "").lower()
        if not market:
            continue

        current = best_by_market.get(market)
        if not current or score > current[1] or (
            score == current[1]
            and (prepared.get("current_price") or float("inf")) < (current[0].get("current_price") or float("inf"))
        ):
            best_by_market[market] = (prepared, score)

    selected = []
    for item, _score in best_by_market.values():
        clean = {key: value for key, value in item.items() if not str(key).startswith("_")}
        selected.append(clean)
    selected.sort(key=lambda item: item.get("current_price") or float("inf"))
    return selected


def build_comparisons(products: list[dict], query: str = "") -> list[dict]:
    """Build comparisons using one best-matching product per marketplace."""
    selected = select_best_per_marketplace(products, query)
    if not selected:
        return []

    prepared = []
    for product in selected:
        title = product.get("title") or ""
        attrs = product.get("_attrs") or extract_attributes(title)
        prepared.append({**product, "_attrs": attrs, "_match_key": match_key(attrs)})

    # Anchor on the best query match, then attach other marketplaces that still fit.
    prepared.sort(
        key=lambda item: (
            -_query_match_score(item, query),
            item.get("current_price") or float("inf"),
        )
    )
    anchor = prepared[0]
    group = [anchor]
    used_markets = {(anchor.get("store") or "").lower()}

    for candidate in prepared[1:]:
        market = (candidate.get("store") or "").lower()
        if market in used_markets:
            continue
        score = _similarity_score(anchor, candidate)
        # Also accept candidates that scored well against the query itself.
        query_score = _query_match_score(candidate, query)
        if score < _minimum_similarity(anchor) and query_score < _minimum_query_match(query):
            continue
        group.append(candidate)
        used_markets.add(market)

    if not group:
        return []

    comparison = _build_comparison(group)
    return [comparison]


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
    brand = _pretty_name(attrs.get("brand"))
    model = _pretty_name(attrs.get("model"))
    product_type = _pretty_name(attrs.get("product_type"))
    shade = _pretty_name(attrs.get("shade"))
    color = _pretty_name(attrs.get("color"))
    size = attrs.get("storage") or attrs.get("quantity")
    if brand and (model or product_type):
        name = " ".join(part for part in (brand, model or product_type) if part)
        details = [detail for detail in (shade, color, size.upper() if size else None) if detail]
        if details:
            name = f"{name} ({' / '.join(details)})"
        return name
    ranked = sorted(products, key=lambda item: len(item.get("title") or ""))
    return ranked[0]["title"]


def _offer_from_product(product: dict) -> dict:
    return {
        "marketplace": product.get("store") or product.get("marketplace"),
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
        "brand": next((item["brand"] for item in attrs_list if item.get("brand")), None),
        "category": next((item["category"] for item in attrs_list if item.get("category")), None),
        "product_type": next((item["product_type"] for item in attrs_list if item.get("product_type")), None),
        "model": next((item["model"] for item in attrs_list if item.get("model")), None),
        "variant": next((item["variant"] for item in attrs_list if item.get("variant")), None),
        "shade": next((item["shade"] for item in attrs_list if item.get("shade")), None),
        "storage": next((item["storage"] for item in attrs_list if item.get("storage")), None),
        "ram": next((item["ram"] for item in attrs_list if item.get("ram")), None),
        "quantity": next((item["quantity"] for item in attrs_list if item.get("quantity")), None),
        "color": next((item["color"] for item in attrs_list if item.get("color")), None),
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
        f"{attrs.get('brand')}|{attrs.get('category')}|{attrs.get('product_type')}|"
        f"{attrs.get('model')}|{attrs.get('shade')}|{attrs.get('storage')}|{product_name}".encode("utf-8")
    ).hexdigest()[:16]

    return {
        "id": comparison_id,
        "product_name": product_name,
        "image": image,
        "brand": attrs.get("brand"),
        "model": attrs.get("model") or attrs.get("product_type"),
        "storage": attrs.get("storage") or attrs.get("quantity"),
        "ram": attrs.get("ram"),
        "color": attrs.get("shade") or attrs.get("color"),
        "offers": offers,
        "lowest_price": lowest,
        "highest_price": highest,
        "average_price": average,
        "savings": savings,
        "best_marketplace": best["marketplace"],
        "best_deal_url": best["url"],
        "offer_count": len(offers),
    }
