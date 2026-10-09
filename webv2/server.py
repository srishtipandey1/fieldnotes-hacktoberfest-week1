"""webv2.server — stdlib HTTP server for the solar-punk UI.

Run:  python -m webv2.server      -> http://127.0.0.1:8766

Serves webv2/static/* and the /api/* routes (see webv2/api.py). The classic
app.py keeps running untouched on port 8765 if you want it.
"""
import json
import mimetypes
import os
import threading
import urllib.parse
import webbrowser

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

if __package__ in (None, ""):  # allow `python webv2/server.py` too
    import sys; sys.path.insert(0, HERE)
    import api  # type: ignore
else:
    from . import api

HERE = os.path.dirname(os.path.abspath(__file__))
STATIC = os.path.join(HERE, "static")
PORT = int(os.environ.get("FIELDNOTES_V2_PORT", "8766"))


SW = """const C='fieldnotes-v2';
const ASSETS=['/','/static/style.css','/static/app.js','/static/living.js','/manifest.json'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(self.clients.claim());});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  e.respondWith(caches.match(e.request).then(hit=>{
    const net=fetch(e.request).then(r=>{if(r.ok)caches.open(C).then(c=>c.put(e.request,r.clone()));return r;}).catch(()=>hit);
    return hit||net;
  }));
});
"""

MANIFEST = {"name": "Fieldnotes · field lab", "short_name": "fieldnotes",
            "start_url": "/", "display": "standalone",
            "background_color": "#041008", "theme_color": "#a3e635"}


def _safe_static(path):
    """Resolve a /static/... path inside STATIC only (no traversal)."""
    full = os.path.normpath(os.path.join(STATIC, path))
    if not full.startswith(STATIC) or not os.path.isfile(full):
        return None
    return full


class Handler(BaseHTTPRequestHandler):
    def _send(self, body, ctype, code=200):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, obj, code=200):
        self._send(json.dumps(obj).encode(), "application/json", code)

    def _read(self):
        n = int(self.headers.get("Content-Length", 0) or 0)
        return self.rfile.read(n)

    # ---- routes ----------------------------------------------------------
    def do_GET(self):
        p = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(p.query)
        if p.path == "/":
            f = _safe_static("index.html")
            return self._send(open(f, "rb").read(), "text/html; charset=utf-8") if f else self._json({"error": "ui missing"}, 500)
        if p.path.startswith("/static/"):
            f = _safe_static(p.path[len("/static/"):])
            if not f:
                return self._json({"error": "not found"}, 404)
            ctype = mimetypes.guess_type(f)[0] or "application/octetstream"
            if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
                ctype += "; charset=utf-8"
            with open(f, "rb") as fh:
                return self._send(fh.read(), ctype)
        if p.path == "/manifest.json":
            return self._json(MANIFEST)
        if p.path == "/sw.js":
            return self._send(SW.encode(), "application/javascript")
        if p.path == "/api/regions":
            return self._json({"regions": api.fn.regions()})
        if p.path == "/api/stats":
            return self._json(api.stats())
        if p.path == "/api/health":
            return self._json(api.health())
        if p.path.startswith("/api/collection"):
            return self._json(api.do_collection((q.get("region") or ["gujarat"])[0]))
        if p.path.startswith("/api/species"):
            return self._json(api.do_species((q.get("region") or ["gujarat"])[0]))
        if p.path.startswith("/api/journal"):
            return self._json(api.do_journal((q.get("limit") or ["30"])[0]))
        return self._json({"error": "not found"}, 404)

    def do_POST(self):
        if self.path == "/api/transcribe":
            try:
                body = self._read()
            except (OSError, ValueError):
                return self._json({"error": "bad upload"}, 400)
            return self._json(api.do_transcribe(body, self.headers.get("Content-Type", "")))
        try:
            data = json.loads(self._read() or b"{}")
        except ValueError:
            return self._json({"error": "bad JSON"}, 400)
        if self.path == "/api/identify":
            return self._json(api.do_identify(data))
        if self.path == "/api/confirm":
            return self._json(api.do_confirm(data))
        return self._json({"error": "not found"}, 404)

    def log_message(self, *a):
        pass


def main():
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    threading.Timer(0.6, lambda: webbrowser.open(f"http://127.0.0.1:{PORT}")).start()
    print(f"🌱 Fieldnotes v2 (solar-punk UI) at http://127.0.0.1:{PORT}  (Ctrl+C to stop)")
    srv.serve_forever()


if __name__ == "__main__":
    main()
