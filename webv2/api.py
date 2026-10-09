"""API layer for webv2.

Reuses the *functions* of app.py (do_identify, do_confirm, ...) without editing
it, and adds new read-only endpoints the solar-punk UI needs:

  GET /api/species?region=X   full species list (id, name, cat, features, habitat)
  GET /api/journal?limit=N    recent journal entries (newest first)
  GET /api/health             ollama + whisper availability for the status LED
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import fieldnotes as fn  # noqa: E402

try:
    import app as legacy  # reused read-only; importing it does nothing but define strings
except Exception:       # even if app.py ever breaks, v2 keeps working
    legacy = None

def _legacy():
    """Import app.py lazily so merely starting the server can't crash on it."""
    if legacy is None:
        raise RuntimeError("app.py not importable — shared logic unavailable")
    return legacy


# Thin proxies: identical journal + grounding rules as classic app.py, no edits to it.
def do_identify(data):        return _legacy().do_identify(data)
def do_confirm(data):         return _legacy().do_confirm(data)
def do_transcribe(b, ctype):  return _legacy().do_transcribe(b, ctype)
def stats():                  return _legacy().stats()
def do_collection(region):    return _legacy().do_collection(region)
try:
    day_streak = legacy.day_streak
except Exception:
    day_streak = None


def _load_journal():
    try:
        with open(fn.JOURNAL, encoding="utf-8") as f:
            js = json.load(f)
        return js if isinstance(js, list) else []
    except (OSError, ValueError):
        return []


def do_species(region):
    """Every species of a region — the UI renders unfound ones as glowing '???' pods."""
    try:
        species = fn.load_species(region)
    except SystemExit:
        return {"error": f"unknown region '{region}'"}
    seen = {}
    for e in _load_journal():
        if e.get("region") == region and e.get("confirmed_label") not in ("", "none", None):
            seen[e["confirmed_label"]] = seen.get(e["confirmed_label"], 0) + 1
    out = [{"id": s["id"], "name": s["common_name"], "cat": s["category"],
            "features": s.get("key_features", []), "habitat": s.get("habitat", ""),
            "n": seen.get(s["id"], 0)} for s in species]
    return {"region": region, "total": len(out),
            "found": sum(1 for s in out if s["n"]), "species": out}


def do_journal(limit=30):
    js = _load_journal()
    items = list(reversed(js))[:max(1, min(int(limit or 30), 200))]
    return {"entries": items, "total": len(js)}


def health():
    h = {"ollama": False, "whisper": False, "model": fn.MODEL}
    try:
        import urllib.request
        with urllib.request.urlopen("http://localhost:11434/api/tags", timeout=1.2) as r:
            names = [m.get("name", "") for m in json.load(r).get("models", [])]
        h["ollama"] = True
        base = fn.MODEL.split(":")[0]
        h["model_ready"] = any(n == fn.MODEL or n.split(":")[0] == base for n in names)
    except Exception:
        h["model_ready"] = False
    try:
        import faster_whisper  # noqa: F401
        h["whisper"] = True
    except ImportError:
        pass
    return h
