"""Uncached live-search JSON and progress-stream endpoints."""
import json

from flask import Blueprint, Response, jsonify, request, stream_with_context

from services.search_service import search_marketplaces, stream_marketplaces

search_blueprint = Blueprint("search", __name__)


@search_blueprint.get("/search")
def search():
    query = request.args.get("query", "").strip()
    if len(query) < 2: return jsonify({"message": "Search query must contain at least 2 characters."}), 400
    stores = request.args.getlist("store") or None
    result = search_marketplaces(query, stores)
    response = jsonify(result)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    return response


@search_blueprint.get("/search/stream")
def search_stream():
    """Stream per-marketplace progress while the same live search is running."""
    query = request.args.get("query", "").strip()
    if len(query) < 2:
        return jsonify({"message": "Search query must contain at least 2 characters."}), 400
    stores = request.args.getlist("store") or None

    @stream_with_context
    def generate():
        for event in stream_marketplaces(query, stores):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
