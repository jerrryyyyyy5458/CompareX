"""Concurrent marketplace search orchestration with safe degraded responses."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from services.scrapers.amazon import search_amazon
from services.scrapers.flipkart import search_flipkart
from services.scrapers.myntra import search_myntra
from services.scrapers.ajio import search_ajio
from services.scrapers.nykaa import search_nykaa
from services.scrapers.reliance import search_reliance

SCRAPERS = {
    "amazon": search_amazon, "flipkart": search_flipkart, "myntra": search_myntra,
    "ajio": search_ajio, "nykaa": search_nykaa, "reliance": search_reliance,
}


def search_marketplaces(query, selected_stores=None):
    """Search stores concurrently so one unavailable marketplace never blocks results."""
    targets = selected_stores or list(SCRAPERS)
    results, errors = [], []
    with ThreadPoolExecutor(max_workers=len(targets)) as executor:
        futures = {executor.submit(SCRAPERS[store], query): store for store in targets if store in SCRAPERS}
        for future in as_completed(futures):
            store = futures[future]
            try: results.extend(future.result())
            except Exception as error: errors.append({"store": store, "message": str(error)})
    return {"products": sorted(results, key=lambda item: item["current_price"] or float("inf")), "errors": errors}
