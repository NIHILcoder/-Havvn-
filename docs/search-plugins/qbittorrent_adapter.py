#!/usr/bin/env python3
"""
Run your existing **qBittorrent search plugins** as a Havvn provider.

WHY
    qBittorrent has a large ecosystem of community search plugins (the "nova3"
    engine). This adapter lets Havvn reuse them unchanged: it provides the
    `novaprinter` and `helpers` modules those plugins expect, runs each plugin's
    `search()`, and translates the results into Havvn's JSON contract.

SETUP
    1. Put your qBittorrent plugin .py files in a folder named `qbt-plugins/`
       next to this adapter (or set the env var TH_QBT_PLUGINS_DIR to any folder).
    2. In Havvn: Search → Providers → add a provider of type
       "Python Script" pointing at THIS file (qbittorrent_adapter.py).
    3. Make sure Python 3 is installed.

    All plugins in the folder are queried in parallel-ish (sequentially here) and
    their results merged. A broken plugin is skipped, not fatal.

NOTES
    - Only run plugins you trust — they execute on your machine.
    - This implements the common subset of the nova3 API (retrieve_url,
      download_file, prettyPrinter). Exotic plugins may need tweaks.
"""

import sys
import os
import json
import glob
import types
import importlib.util
import urllib.request
import urllib.parse
import gzip
import io
import re

# --------------------------------------------------------------------------
# Shim modules that qBittorrent plugins import. We register them in sys.modules
# BEFORE importing any plugin so `from novaprinter import prettyPrinter` etc work.
# --------------------------------------------------------------------------

_collected = []  # rows emitted by plugins via prettyPrinter


def _pretty_printer(dictionary):
    _collected.append(dict(dictionary))


def _retrieve_url(url, *args, **kwargs):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Havvn qbt-adapter)",
            "Accept-Encoding": "gzip, deflate",
        },
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = resp.read()
        enc = (resp.headers.get("Content-Encoding") or "").lower()
        if enc == "gzip":
            data = gzip.GzipFile(fileobj=io.BytesIO(data)).read()
        charset = resp.headers.get_content_charset() or "utf-8"
    return data.decode(charset, "replace")


def _download_file(url, referer=None):
    # Search rarely needs this; download to a temp file and echo "path url".
    import tempfile
    fd, path = tempfile.mkstemp(suffix=".torrent")
    os.close(fd)
    req = urllib.request.Request(url, headers={"User-Agent": "Havvn"})
    if referer:
        req.add_header("Referer", referer)
    with urllib.request.urlopen(req, timeout=20) as resp, open(path, "wb") as fh:
        fh.write(resp.read())
    return path + " " + url


def _install_shims():
    novaprinter = types.ModuleType("novaprinter")
    novaprinter.prettyPrinter = _pretty_printer
    sys.modules["novaprinter"] = novaprinter

    helpers = types.ModuleType("helpers")
    helpers.retrieve_url = _retrieve_url
    helpers.download_file = _download_file
    # Some plugins reference these; provide harmless defaults.
    helpers.htmlentitydecode = lambda s: s
    sys.modules["helpers"] = helpers


# --------------------------------------------------------------------------
# Result translation
# --------------------------------------------------------------------------

_SIZE_RE = re.compile(r"([\d.,]+)\s*([KMGT]?I?B)", re.IGNORECASE)
_UNIT = {"B": 1, "KB": 1024, "MB": 1024**2, "GB": 1024**3, "TB": 1024**4}


def _size_to_bytes(value):
    if value is None:
        return 0
    if isinstance(value, (int, float)):
        return int(value) if value > 0 else 0
    s = str(value).strip()
    if s in ("", "-1"):
        return 0
    if s.isdigit():
        return int(s)
    m = _SIZE_RE.search(s)
    if not m:
        return 0
    num = float(m.group(1).replace(",", ""))
    unit = m.group(2).upper().replace("IB", "B")
    return int(num * _UNIT.get(unit, 1))


def _to_int(value):
    try:
        n = int(str(value).strip())
        return n if n > 0 else 0
    except (ValueError, TypeError):
        return 0


def _translate(row):
    link = (row.get("link") or "").strip()
    out = {
        "title": (row.get("name") or "").strip(),
        "size": _size_to_bytes(row.get("size")),
        "seeds": _to_int(row.get("seeds")),
        "leechers": _to_int(row.get("leech")),
    }
    if link.startswith("magnet:"):
        out["magnetUri"] = link
    elif link:
        out["torrentUrl"] = link
    # Surface which indexer produced the row (its host) as the category label.
    engine = (row.get("engine_url") or "").strip()
    if engine:
        out["category"] = urllib.parse.urlparse(engine).netloc or engine
    return out


# Newznab numeric category -> qBittorrent category name.
_CAT_MAP = {
    "2000": "movies",
    "5000": "tv",
    "3000": "music",
    "4000": "software",
    "6000": "all",
}


def _plugins_dir():
    env = os.environ.get("TH_QBT_PLUGINS_DIR")
    if env:
        return env
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "qbt-plugins")


def _load_plugin(path):
    name = os.path.splitext(os.path.basename(path))[0]
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    cls = getattr(module, name, None)
    if cls is None:
        # Fall back: first class that has a `search` method.
        for attr in vars(module).values():
            if isinstance(attr, type) and hasattr(attr, "search"):
                cls = attr
                break
    if cls is None:
        raise RuntimeError("no plugin class with search()")
    return cls()


def main():
    query = sys.argv[1] if len(sys.argv) > 1 else ""
    category = sys.argv[2] if len(sys.argv) > 2 else ""
    qbt_cat = _CAT_MAP.get(category, "all")

    _install_shims()

    pdir = _plugins_dir()
    skip = {"qbittorrent_adapter", "example_indexer", "__init__"}
    plugin_files = [
        f for f in glob.glob(os.path.join(pdir, "*.py"))
        if os.path.splitext(os.path.basename(f))[0] not in skip
    ]

    if not plugin_files:
        print(f"no qBittorrent plugins found in {pdir}", file=sys.stderr)
        json.dump([], sys.stdout)
        return

    what = urllib.parse.quote(query)
    for path in plugin_files:
        # Results accumulate in the shared _collected list across all plugins.
        try:
            plugin = _load_plugin(path)
            try:
                plugin.search(what, qbt_cat)
            except TypeError:
                plugin.search(what)  # older single-arg plugins
        except Exception as exc:
            print(f"plugin {os.path.basename(path)} failed: {exc}", file=sys.stderr)

    results = []
    for row in _collected:
        t = _translate(row)
        if t["title"] and (t.get("magnetUri") or t.get("torrentUrl")):
            results.append(t)

    json.dump(results, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
