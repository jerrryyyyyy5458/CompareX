"""Fresh concurrent marketplace search orchestration with progress events."""
import math
import queue
import threading
import time
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait

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

# Hard wall-clock budget for the whole search. Slow scrapers are abandoned after this.
SEARCH_DEADLINE_SECONDS = 10.0
# Minimum successful marketplace responses before an early return is allowed.
MIN_SUCCESSFUL_MARKETPLACES = 3
# Short window after quorum so near-finished scrapers can still contribute.
QUORUM_GRACE_SECONDS = 0.5
TIMEOUT_MESSAGE = "Marketplace timed out"


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


def _quorum_size(target_count):
    """Need a useful plurality of successes, capped by how many stores were selected."""
    if target_count <= 0:
        return 0
    return min(target_count, max(MIN_SUCCESSFUL_MARKETPLACES, math.ceil(target_count / 2)))


def _build_response(query, results, statuses, errors):
    products, highlights = finalize_products(results)
    return {
        "query": query,
        "source": "live",
        "cached": False,
        "products": products,
        "comparisons": build_comparisons(products, query),
        "marketplaces": list(statuses.values()),
        "errors": errors,
        "highlights": highlights,
    }


def _record_success(slug, store_products, statuses, results, emit):
    results.extend(store_products)
    statuses[slug] = _status(slug, "completed", len(store_products))
    emit({
        "type": "marketplace",
        "marketplace": statuses[slug],
        "products": store_products,
    })


def _record_failure(slug, message, statuses, errors, emit):
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


def _consume_future(future, slug, query, statuses, results, errors, emit):
    """Collect one finished scraper; return True when it succeeded."""
    try:
        store_products = _relevant_products(future.result(), query)
        _record_success(slug, store_products, statuses, results, emit)
        return True
    except Exception as error:
        message = str(error) or error.__class__.__name__
        _record_failure(slug, message, statuses, errors, emit)
        return False


def _abandon_pending(pending, futures, statuses, errors, emit):
    """Fail unfinished scrapers immediately without waiting for them."""
    for future in pending:
        slug = futures[future]
        future.cancel()
        if statuses[slug]["status"] == "searching":
            _record_failure(slug, TIMEOUT_MESSAGE, statuses, errors, emit)


def _run_live_search(query, selected_stores=None, emit=lambda _event: None):
    targets = _targets(selected_stores)
    statuses = {slug: _status(slug) for slug in targets}
    results, errors = [], []
    emit({"type": "started", "marketplaces": list(statuses.values())})

    if not targets:
        response = _build_response(query, results, statuses, errors)
        emit({"type": "complete", **response})
        return response

    deadline = time.monotonic() + SEARCH_DEADLINE_SECONDS
    needed = _quorum_size(len(targets))
    successful = 0
    quorum_met_at = None

    # Avoid `with ThreadPoolExecutor`: its __exit__ waits for every worker and
    # would re-block on the slowest marketplace after an early return.
    executor = ThreadPoolExecutor(max_workers=max(1, len(targets)))
    futures = {
        executor.submit(MARKETPLACES[slug]["scraper"], query): slug
        for slug in targets
    }
    pending = set(futures)

    try:
        while pending:
            now = time.monotonic()
            remaining = deadline - now
            if remaining <= 0:
                break
            if quorum_met_at is not None and now >= quorum_met_at + QUORUM_GRACE_SECONDS:
                break

            wait_timeout = remaining
            if quorum_met_at is not None:
                wait_timeout = min(
                    wait_timeout,
                    max(0.0, quorum_met_at + QUORUM_GRACE_SECONDS - now),
                )

            done, pending = wait(
                pending,
                timeout=wait_timeout,
                return_when=FIRST_COMPLETED,
            )
            if not done:
                break

            for future in done:
                slug = futures[future]
                if _consume_future(future, slug, query, statuses, results, errors, emit):
                    successful += 1
                    if successful >= needed and quorum_met_at is None:
                        quorum_met_at = time.monotonic()

        _abandon_pending(pending, futures, statuses, errors, emit)
    finally:
        executor.shutdown(wait=False, cancel_futures=True)

    response = _build_response(query, results, statuses, errors)
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
