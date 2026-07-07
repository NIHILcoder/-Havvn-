#!/usr/bin/env python3
"""
Havvn search-plugin template.

Called by Havvn as:
    python example_indexer.py "<query>" "<category>"

It must print a JSON array of result objects to stdout. See README.md for the
full contract. This template returns a single demo row so the provider's "Test"
button works out of the box, and shows (commented) how you'd hit a real source.

Havvn ships NO scrapers — replace the body of `search()` with your own
source. Only run code you trust.
"""

import sys
import json
# import urllib.request, urllib.parse   # uncomment for real HTTP requests


def search(query: str, category: str):
    results = []

    # --- DEMO ROW ---------------------------------------------------------
    # Lets the "Test" button confirm the plugin runs and parses. Delete this.
    results.append({
        "title": f"[demo] {query or 'test'} 1080p",
        "magnetUri": "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567",
        "size": 1610612736,           # 1.5 GB, in bytes
        "seeds": 12,
        "leechers": 1,
        "category": "Demo",
    })

    # --- REAL SOURCE (sketch) --------------------------------------------
    # q = urllib.parse.quote(query)
    # url = f"https://your-indexer.example/api?q={q}&cat={category}"
    # req = urllib.request.Request(url, headers={"User-Agent": "Havvn"})
    # with urllib.request.urlopen(req, timeout=20) as resp:
    #     data = json.loads(resp.read().decode("utf-8", "replace"))
    # for item in data["items"]:
    #     results.append({
    #         "title": item["name"],
    #         "magnetUri": item.get("magnet"),
    #         "torrentUrl": item.get("torrent"),
    #         "size": int(item.get("size", 0)),
    #         "seeds": int(item.get("seeders", 0)),
    #         "leechers": int(item.get("leechers", 0)),
    #     })

    return results


def main():
    query = sys.argv[1] if len(sys.argv) > 1 else ""
    category = sys.argv[2] if len(sys.argv) > 2 else ""
    try:
        rows = search(query, category)
    except Exception as exc:  # surface errors on stderr; stdout stays valid JSON
        print(f"plugin error: {exc}", file=sys.stderr)
        rows = []
    json.dump(rows, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
