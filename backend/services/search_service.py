"""Fresh concurrent marketplace search orchestration with progress events."""
import queue
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

from services.comparison_engine import build_comparisons, is_accessory
from services.normalizer import finalize_products
from services.scrapers.ajio import search_ajio
from services.scrapers.amazon import search_amazon
from services.scrapers.croma import search_croma
from services.scrapers.flipkart import search_flipkart
from services.scrapers.myntra import search_myntra
from services.scrapers.nykaa import search_nykaa
from services.scrapers.vijay_sales import search_vijay_sales

MARKETPLACES = {
    "amazon": {"name": "Amazon India", "scraper": search_amazon, "strategy": "requests-with-playwright-fallback", "color": "#202531", "description": "Electronics, home & more"},
    "flipkart": {"name": "Flipkart", "scraper": search_flipkart, "strategy": "playwright", "color": "#2874f0", "description": "India's shopping destination"},
    "myntra": {"name": "Myntra", "scraper": search_myntra, "strategy": "embedded-search-data", "color": "#f44380", "description": "Fashion & lifestyle"},
    "ajio": {"name": "AJIO", "scraper": search_ajio, "strategy": "public-api", "color": "#222222", "description": "Curated fashion"},
    "croma": {"name": "Croma", "scraper": search_croma, "strategy": "playwright", "color": "#24a148", "description": "Electronics & appliances"},
    "vijay-sales": {"name": "Vijay Sales", "scraper": search_vijay_sales, "strategy": "graphql", "color": "#e22b2f", "description": "Consumer electronics"},
    "nykaa": {"name": "Nykaa", "scraper": search_nykaa, "strategy": "server-rendered", "color": "#ed5f7f", "description": "Beauty & wellness"},
}


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
    """Drop accessory upsells unless the shopper searched for an accessory."""
    return [
        product
        for product in products
        if not is_accessory(product.get("title") or "", query)
    ]


def _run_live_search(query, selected_stores=None, emit=lambda _event: None):
    targets = _targets(selected_stores)
    statuses = {slug: _status(slug) for slug in targets}
    results, errors = [], []
    emit({"type": "started", "marketplaces": list(statuses.values())})

    with ThreadPoolExecutor(max_workers=max(1, len(targets))) as executor:
        futures = {
            executor.submit(MARKETPLACES[slug]["scraper"], query): slug
            for slug in targets
        }
        for future in as_completed(futures):
            slug = futures[future]
            try:
                store_products = _relevant_products(future.result(), query)
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
    comparisons = build_comparisons(products, query)
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
