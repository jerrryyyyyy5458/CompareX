"""Fresh concurrent marketplace search orchestration with progress events."""
import queue
import re
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import unquote, urlsplit

from services.comparison_engine import (
    build_comparisons,
    extract_attributes,
    is_accessory,
    select_best_per_marketplace,
)
from services.normalizer import finalize_products, normalize_title
from services.scrapers.adidas import search_adidas
from services.scrapers.ajio import search_ajio
from services.scrapers.amazon import search_amazon
from services.scrapers.apollo import search_apollo
from services.scrapers.flipkart import search_flipkart
from services.scrapers.lenskart import search_lenskart
from services.scrapers.meesho import search_meesho
from services.scrapers.myntra import search_myntra
from services.scrapers.nike import search_nike
from services.scrapers.nykaa import search_nykaa
from services.scrapers.tatacliq import search_tatacliq
from services.scrapers.vijay_sales import search_vijay_sales

MARKETPLACES = {
    "amazon": {"name": "Amazon India", "scraper": search_amazon, "strategy": "requests-with-playwright-fallback", "color": "#202531", "description": "Electronics, home & more"},
    "flipkart": {"name": "Flipkart", "scraper": search_flipkart, "strategy": "playwright", "color": "#2874f0", "description": "India's shopping destination"},
    "myntra": {"name": "Myntra", "scraper": search_myntra, "strategy": "embedded-search-data", "color": "#f44380", "description": "Fashion & lifestyle"},
    "ajio": {"name": "AJIO", "scraper": search_ajio, "strategy": "public-api", "color": "#222222", "description": "Curated fashion"},
    "vijay-sales": {"name": "Vijay Sales", "scraper": search_vijay_sales, "strategy": "graphql", "color": "#e22b2f", "description": "Consumer electronics"},
    "nykaa": {"name": "Nykaa", "scraper": search_nykaa, "strategy": "server-rendered", "color": "#ed5f7f", "description": "Beauty & wellness"},
    "tatacliq": {"name": "Tata CLiQ", "scraper": search_tatacliq, "strategy": "playwright", "color": "#212121", "description": "Fashion, electronics & home"},
    "meesho": {"name": "Meesho", "scraper": search_meesho, "strategy": "playwright", "color": "#9f2089", "description": "Fashion & lifestyle deals"},
    "lenskart": {"name": "Lenskart", "scraper": search_lenskart, "strategy": "server-rendered", "color": "#0db7af", "description": "Eyewear & accessories"},
    "nike": {"name": "Nike", "scraper": search_nike, "strategy": "playwright", "color": "#111111", "description": "Sportswear & footwear"},
    "adidas": {"name": "Adidas", "scraper": search_adidas, "strategy": "playwright", "color": "#000000", "description": "Sportswear & footwear"},
    "apollo": {"name": "Apollo Pharmacy", "scraper": search_apollo, "strategy": "server-rendered", "color": "#0072bc", "description": "Pharmacy & healthcare"},
}

# Accessory phrases excluded unless the shopper explicitly searches for them.
ACCESSORY_QUERY_TERMS = (
    "adapter", "back cover", "band", "cable", "case", "charger", "charging",
    "cover", "earbud", "earbuds", "earpod", "earpods", "guard", "headphone",
    "headphones", "headset", "holder", "protector", "screen guard",
    "screen protector", "skin", "sleeve", "stand", "strap", "tempered glass",
    "wallet", "pouch", "folio", "bumper",
)

# Brand searches target core devices, not add-ons or side categories.
BRAND_PRIMARY_LINES = {
    "apple": (
        r"\biphone\b", r"\bipad\b", r"\bmacbook\b", r"\bimac\b", r"\bmac mini\b",
        r"\bmac studio\b", r"\bapple watch\b", r"\bwatch series\b",
    ),
    "samsung": (
        r"\bgalaxy s", r"\bgalaxy a", r"\bgalaxy z\b", r"\bgalaxy tab\b",
        r"\bgalaxy note\b", r"\bgalaxy m\b", r"\bgalaxy f\b",
    ),
    "oneplus": (r"\boneplus\b", r"\bnord\b", r"\bnord ce\b"),
    "xiaomi": (r"\bredmi\b", r"\bmi\b", r"\bpoco\b"),
    "realme": (r"\brealme\b", r"\bnarzo\b"),
    "google": (r"\bpixel\b",),
    "sony": (r"\bxperia\b", r"\bplaystation\b", r"\bps5\b", r"\bps4\b"),
    "boat": (r"\bboat\b", r"\brockerz\b", r"\bairdopes\b"),
    "jbl": (r"\bjbl\b",),
    "nike": (r"\bnike\b",),
    "adidas": (r"\badidas\b",),
}

# Secondary catalog items to drop on brand-level searches (e.g. AirPods for "Apple").
BRAND_SECONDARY_LINES = {
    "apple": (
        r"\bairpods?\b", r"\bearpods?\b", r"\bmagsafe\b", r"\bpower adapter\b",
        r"\busb c cable\b", r"\blightning cable\b", r"\bapple tv\b", r"\bhomepod\b",
        r"\bairtag\b", r"\bpencil\b", r"\bsmart folio\b",
    ),
    "samsung": (
        r"\bgalaxy buds\b", r"\bgalaxy watch\b", r"\bgalaxy fit\b",
        r"\bwireless charger\b",
    ),
    "oneplus": (r"\bbuds\b", r"\bwatch\b", r"\bcharger\b",),
    "boat": (r"\bcharger\b", r"\bcable\b", r"\bpowerbank\b",),
}

# Direct product-line queries map to the listing patterns they should match.
PRODUCT_LINE_PATTERNS = {
    "iphone": (r"\biphone\b",),
    "ipad": (r"\bipad\b",),
    "macbook": (r"\bmacbook\b",),
    "imac": (r"\bimac\b",),
    "apple watch": (r"\bapple watch\b", r"\bwatch series\b",),
    "airpods": (r"\bairpods?\b",),
    "galaxy": (r"\bgalaxy\b",),
    "pixel": (r"\bpixel\b",),
    "laptop": (r"\blaptop\b", r"\bnotebook\b", r"\bmacbook\b", r"\bchromebook\b",),
    "earbuds": (r"\bearbuds?\b", r"\bearphones?\b", r"\bairdopes\b", r"\brockerz\b",),
    "headphones": (r"\bheadphones?\b", r"\bheadset\b",),
    "watch": (r"\bwatch\b", r"\bsmartwatch\b",),
    "shampoo": (r"\bshampoo\b",),
    "sunscreen": (r"\bsunscreen\b", r"\bsun cream\b", r"\bspf\b",),
}

PRODUCT_LINE_ORDER = sorted(PRODUCT_LINE_PATTERNS, key=len, reverse=True)
BRAND_ORDER = sorted(BRAND_PRIMARY_LINES, key=len, reverse=True)

ACCESSORY_TITLE_HINTS = ACCESSORY_QUERY_TERMS + (
    "compatible with", "for iphone", "for ipad", "for macbook", "for galaxy",
    "for pixel", "for apple", "replacement", "spare", "refurbished battery",
)

PRODUCT_URL_HOSTS = {
    "amazon.in": "amazon",
    "www.amazon.in": "amazon",
    "amzn.in": "amazon",
    "flipkart.com": "flipkart",
    "www.flipkart.com": "flipkart",
    "myntra.com": "myntra",
    "www.myntra.com": "myntra",
    "ajio.com": "ajio",
    "www.ajio.com": "ajio",
    "vijaysales.com": "vijay-sales",
    "www.vijaysales.com": "vijay-sales",
    "nykaa.com": "nykaa",
    "www.nykaa.com": "nykaa",
    "tatacliq.com": "tatacliq",
    "www.tatacliq.com": "tatacliq",
    "meesho.com": "meesho",
    "www.meesho.com": "meesho",
    "lenskart.com": "lenskart",
    "www.lenskart.com": "lenskart",
    "nike.com": "nike",
    "www.nike.com": "nike",
    "adidas.co.in": "adidas",
    "www.adidas.co.in": "adidas",
    "apollopharmacy.in": "apollo",
    "www.apollopharmacy.in": "apollo",
}

URL_PATH_NOISE = {
    "dp", "gp", "product", "products", "p", "buy", "shop", "search",
    "www", "m", "in", "result",
}


def _word_match(term: str, text: str) -> bool:
    return bool(re.search(rf"\b{re.escape(term)}\b", text))


def _matches_any(patterns: tuple[str, ...], text: str) -> bool:
    return any(re.search(pattern, text) for pattern in patterns)


def _parse_query_intent(query: str) -> dict:
    """Infer whether the shopper wants a primary device or an accessory."""
    normalized = normalize_title(query)
    allows_accessories = any(_word_match(term, normalized) for term in ACCESSORY_QUERY_TERMS)

    product_line = next(
        (line for line in PRODUCT_LINE_ORDER if _word_match(line, normalized)),
        None,
    )
    brand = next(
        (name for name in BRAND_ORDER if _word_match(name, normalized)),
        None,
    )
    primary_patterns = PRODUCT_LINE_PATTERNS.get(product_line, ())
    secondary_patterns = BRAND_SECONDARY_LINES.get(brand, ())
    if brand and not product_line:
        primary_patterns = BRAND_PRIMARY_LINES.get(brand, ())

    return {
        "normalized": normalized,
        "tokens": [token for token in normalized.split() if len(token) > 1],
        "brand": brand,
        "product_line": product_line,
        "allows_accessories": allows_accessories,
        "primary_patterns": primary_patterns,
        "secondary_patterns": secondary_patterns,
    }


def _title_is_accessory(title: str, query: str, intent: dict) -> bool:
    if intent["allows_accessories"]:
        return False
    normalized_title = normalize_title(title)
    if is_accessory(title, query):
        return True
    if any(hint in normalized_title for hint in ACCESSORY_TITLE_HINTS):
        return True
    if intent["product_line"] and re.search(
        rf"\b(for|compatible with)\s+{re.escape(intent['product_line'])}\b",
        normalized_title,
    ):
        return True
    return False


def _title_is_secondary(title: str, intent: dict) -> bool:
    if intent["allows_accessories"] or intent["product_line"]:
        return False
    if not intent["brand"] or not intent["secondary_patterns"]:
        return False
    normalized_title = normalize_title(title)
    return _matches_any(intent["secondary_patterns"], normalized_title)


def _title_is_primary(title: str, intent: dict) -> bool:
    normalized_title = normalize_title(title)
    if intent["primary_patterns"]:
        return _matches_any(intent["primary_patterns"], normalized_title)
    if not intent["tokens"]:
        return True
    return any(_word_match(token, normalized_title) for token in intent["tokens"])


def _relevance_score(title: str, intent: dict) -> float:
    normalized_title = normalize_title(title)
    score = 0.0

    if intent["primary_patterns"] and _matches_any(intent["primary_patterns"], normalized_title):
        score += 120
    if intent["brand"] and _word_match(intent["brand"], normalized_title):
        score += 35
    if intent["product_line"] and _word_match(intent["product_line"], normalized_title):
        score += 80

    if intent["tokens"]:
        hits = sum(1 for token in intent["tokens"] if _word_match(token, normalized_title))
        score += hits * 12

    if _title_is_accessory(title, intent["normalized"], intent):
        score -= 250
    if _title_is_secondary(title, intent):
        score -= 180

    if intent["brand"] and intent["primary_patterns"] and not intent["product_line"]:
        if not _matches_any(intent["primary_patterns"], normalized_title):
            score -= 90

    return score


def _keep_product(title: str, query: str, intent: dict) -> bool:
    if not title:
        return False
    if _title_is_accessory(title, query, intent):
        return False
    if _title_is_secondary(title, intent):
        return False
    if intent["primary_patterns"] and not _title_is_primary(title, intent):
        return False
    if intent["brand"] and intent["primary_patterns"] and not intent["product_line"]:
        return _matches_any(intent["primary_patterns"], normalize_title(title))
    return True


def _rank_products(products: list[dict], query: str) -> list[dict]:
    intent = _parse_query_intent(query)
    scored = [
        (product, _relevance_score(product.get("title") or "", intent))
        for product in products
    ]
    scored.sort(key=lambda item: (-item[1], item[0].get("current_price") or float("inf")))
    return [product for product, _score in scored]


def _product_url_source(query: str):
    parts = urlsplit((query or "").strip())
    if parts.scheme not in {"http", "https"} or not parts.netloc:
        return None
    host = parts.netloc.lower()
    for domain, slug in PRODUCT_URL_HOSTS.items():
        if host == domain or host.endswith(f".{domain}"):
            return slug
    return None


def _query_from_product_url(query: str) -> str:
    parts = urlsplit(query.strip())
    path = unquote(parts.path or "")
    segments = [segment for segment in path.split("/") if segment]
    candidates = []
    for segment in segments:
        lowered = segment.lower()
        if lowered in URL_PATH_NOISE:
            continue
        if re.fullmatch(r"[a-z0-9]{8,20}", lowered):
            continue
        candidate = re.sub(r"[-_+]+", " ", segment)
        candidate = re.sub(r"\.[a-z0-9]+$", "", candidate, flags=re.I)
        candidate = re.sub(r"\s+", " ", candidate).strip()
        if len(candidate) >= 4:
            candidates.append(candidate)
    return max(candidates, key=len, default=query)


def _url_match_score(source_url: str, candidate_url: str, candidate_title: str) -> int:
    source_parts = urlsplit(source_url)
    candidate_parts = urlsplit(candidate_url or "")
    source_text = normalize_title(unquote(source_parts.path or ""))
    candidate_text = normalize_title(unquote(candidate_parts.path or ""))
    title_text = normalize_title(candidate_title or "")
    score = 0

    source_ids = re.findall(r"[a-z0-9]{8,20}", source_text)
    for value in source_ids:
        if value and value in candidate_text:
            score += 50

    source_tokens = {token for token in source_text.split() if len(token) > 2 and token not in URL_PATH_NOISE}
    candidate_tokens = {token for token in candidate_text.split() if len(token) > 2}
    title_tokens = {token for token in title_text.split() if len(token) > 2}
    score += len(source_tokens & candidate_tokens) * 8
    score += len(source_tokens & title_tokens) * 5
    return score


# Marketing fluff stripped from URL-derived comparison queries.
_QUERY_MARKETING_WORDS = frozenset({
    "lightweight", "long", "lasting", "longlasting", "longwear",
    "multipurpose", "multi", "purpose", "premium", "professional",
    "waterproof", "ultra", "new", "latest", "bestseller", "best", "seller",
    "exclusive", "official", "special", "edition", "limited", "original",
    "advanced", "intense", "enriched",
})


def _extract_spf_pa_tokens(text: str) -> list[str]:
    """Keep SPF / PA markers that matter for beauty product matching."""
    normalized = normalize_title(text or "")
    tokens = []
    for match in re.finditer(r"\bspf\s*\d+\b", normalized):
        tokens.append(re.sub(r"\s+", "", match.group(0)))
    for match in re.finditer(r"\bpa\++(?=\s|$)", normalized):
        tokens.append(match.group(0))
    return tokens


def _filter_marketing_phrase(value: str | None) -> str | None:
    if not value:
        return None
    kept = [
        token for token in normalize_title(value).split()
        if token not in _QUERY_MARKETING_WORDS and len(token) > 1
    ]
    return " ".join(kept) if kept else None


def _build_search_query_from_product(product: dict) -> str:
    """Build a concise cross-marketplace query from a source PDP title."""
    title = product.get("title") or ""
    attrs = extract_attributes(title)
    parts = []

    def add(value):
        cleaned = _filter_marketing_phrase(value) if value and " " in str(value) else value
        if isinstance(cleaned, str):
            cleaned = cleaned.strip()
        if cleaned and cleaned not in parts:
            parts.append(cleaned)

    add(attrs.get("brand"))
    for token in _extract_spf_pa_tokens(title):
        add(token)
    add(attrs.get("model"))
    add(attrs.get("product_type"))
    # Prefer shade/color/size over noisy marketing-laden variant phrases.
    color = attrs.get("shade") or attrs.get("color")
    if color:
        normalized_title = normalize_title(title)
        shade_match = re.search(
            rf"\b((?:warm|cool|fair|light|medium|deep|dark)\s+)?{re.escape(color)}\b",
            normalized_title,
        )
        add(shade_match.group(0) if shade_match else color)
    add(attrs.get("storage") or attrs.get("quantity"))
    variant = _filter_marketing_phrase(attrs.get("variant"))
    if variant:
        add(variant)

    if parts:
        return " ".join(parts[:8])

    normalized = normalize_title(title)
    tokens = [
        token for token in normalized.split()
        if len(token) > 1 and token not in _QUERY_MARKETING_WORDS
    ][:8]
    return " ".join(tokens) if tokens else title


def _resolve_search_seed(query: str):
    """If the query is a product URL, derive a clean product-name search query."""
    source_slug = _product_url_source(query)
    if not source_slug or source_slug not in MARKETPLACES:
        return query, None, {}

    source_scraper = MARKETPLACES[source_slug]["scraper"]
    try:
        # Source marketplace must receive the original product URL so it can
        # extract that exact PDP instead of running a name-based search.
        source_products = source_scraper(query)
    except Exception:
        return query, None, {}
    if not source_products:
        return query, None, {}

    source_product = max(
        source_products,
        key=lambda product: _url_match_score(query, product.get("url") or "", product.get("title") or ""),
    )
    cleaned_query = _build_search_query_from_product(source_product).strip()
    if not cleaned_query:
        return query, None, {}
    return cleaned_query, source_slug, {source_slug: _relevant_products([source_product], cleaned_query)}

def marketplace_catalog():
    """Return public metadata without reading a local product database."""
    return [
        {
            "slug": slug,
            "name": details["name"],
            "strategy": details["strategy"],
            "color": details["color"],
            "description": details["description"],
            "mark": details["name"][0],
            "enabled": True,
        }
        for slug, details in MARKETPLACES.items()
    ]


def _targets(selected_stores):
    selected = selected_stores or list(MARKETPLACES)
    return [slug for slug in selected if slug in MARKETPLACES]


def _status(slug, state="searching", product_count=0, message=None):
    return {
        "slug": slug,
        "name": MARKETPLACES[slug]["name"],
        "status": state,
        "product_count": product_count,
        "message": message,
    }


def _relevant_products(products, query):
    """Keep primary-device matches and rank them ahead of accessory noise."""
    intent = _parse_query_intent(query)
    kept = [
        product
        for product in products
        if _keep_product(product.get("title") or "", query, intent)
    ]
    return _rank_products(kept, query)


def _is_browse_query(query: str) -> bool:
    """Generic category searches should keep product variety for a browse page."""
    if _product_url_source(query):
        return False
    tokens = [token for token in normalize_title(query).split() if len(token) > 1]
    if len(tokens) <= 1:
        return True
    if len(tokens) == 2:
        # "iphone 15" / "galaxy s24" style → treat as a specific product.
        if re.fullmatch(r"(?:[a-z]{0,4})?\d+[a-z0-9]*", tokens[1]):
            return False
        return True
    return False


def _run_live_search(query, selected_stores=None, emit=lambda _event: None):
    effective_query, preloaded_slug, preloaded_results = _resolve_search_seed(query)
    browse_mode = _is_browse_query(query) and not preloaded_slug
    targets = _targets(selected_stores)
    statuses = {slug: _status(slug) for slug in targets}
    results, errors = [], []
    emit({"type": "started", "marketplaces": list(statuses.values())})

    if preloaded_slug in statuses:
        source_products = preloaded_results.get(preloaded_slug) or []
        results.extend(source_products)
        statuses[preloaded_slug] = _status(preloaded_slug, "completed", len(source_products))
        emit({
            "type": "marketplace",
            "marketplace": statuses[preloaded_slug],
            "products": source_products,
        })

    with ThreadPoolExecutor(max_workers=max(1, len(targets))) as executor:
        futures = {
            executor.submit(MARKETPLACES[slug]["scraper"], effective_query): slug
            for slug in targets
            if slug != preloaded_slug
        }
        for future in as_completed(futures):
            slug = futures[future]
            try:
                store_products = _relevant_products(future.result(), effective_query)
                if browse_mode:
                    # Keep ranked variety so the frontend can show a product grid.
                    store_products = store_products[:10]
                else:
                    store_products = select_best_per_marketplace(store_products, effective_query)
                results.extend(store_products)
                statuses[slug] = _status(slug, "completed", len(store_products))
                emit({
                    "type": "marketplace",
                    "marketplace": statuses[slug],
                    "products": store_products,
                })
            except Exception as error:
                message = str(error) or error.__class__.__name__
                statuses[slug] = _status(slug, "failed", message=message)
                failure = {
                    "store": slug,
                    "marketplace": MARKETPLACES[slug]["name"],
                    "message": message,
                }
                errors.append(failure)
                emit({
                    "type": "marketplace",
                    "marketplace": statuses[slug],
                    "error": failure,
                })

    products, highlights = finalize_products(results)
    if browse_mode:
        products = _rank_products(products, effective_query)
        comparisons = []
    else:
        products = select_best_per_marketplace(products, effective_query)
        products = _rank_products(products, effective_query)
        comparisons = build_comparisons(products, effective_query)
    response = {
        "query": query,
        "source": "live",
        "cached": False,
        "products": products,
        "comparisons": comparisons,
        "marketplaces": list(statuses.values()),
        "errors": errors,
        "highlights": highlights,
    }
    emit({"type": "complete", **response})
    return response


def search_marketplaces(query, selected_stores=None):
    """Perform a new live search; no result is read from or written to storage."""
    return _run_live_search(query, selected_stores)


def stream_marketplaces(query, selected_stores=None):
    """Bridge concurrent workers to a Server-Sent Events response."""
    events = queue.Queue()
    finished = object()

    def run():
        try:
            _run_live_search(query, selected_stores, events.put)
        finally:
            events.put(finished)

    threading.Thread(target=run, name="comparex-live-search", daemon=True).start()
    while True:
        event = events.get()
        if event is finished:
            break
        yield event
