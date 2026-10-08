"""Dark mode for the Fieldnotes web UI (standard library only, works offline).

Usage in app.py, right after the PAGE string is defined:

    import darkmode
    PAGE = darkmode.inject(PAGE)

What it adds:
  - a dark colour palette (overrides the CSS variables in :root)
  - a round sun/moon toggle button, fixed to the top-right corner
  - the choice is remembered in localStorage
  - on a first visit it follows the system setting (prefers-color-scheme)
  - the theme is applied in <head>, so there is no white flash on load
"""

DARK_CSS = """
:root[data-theme="dark"]{
  color-scheme:dark;
  --paper:#161a15; --card:#1f241e; --ink:#e9e7dc; --muted:#9b9888;
  --sage:#5b8a61; --sage-deep:#437048; --line:#343a30; --rec:#e0766a;
}
[data-theme="dark"] .cand:hover{background:#283027}
[data-theme="dark"] .chip.got{background:#222c21}
[data-theme="dark"] #srvwarn{background:#3a2320;border-color:#7a3f37;color:#f0b3aa}
[data-theme="dark"] .o1{background:radial-gradient(circle,#2b3d2c,transparent 70%)}
[data-theme="dark"] .o2{background:radial-gradient(circle,#40351f,transparent 70%)}
[data-theme="dark"] #typepanel textarea{color:var(--ink)}
[data-theme="dark"] #typepanel textarea::placeholder{color:var(--muted)}
body{transition:background-color .25s ease,color .25s ease}

#themetoggle{position:fixed;top:.8em;right:.8em;z-index:60;width:42px;height:42px;
  border-radius:50%;border:1px solid var(--line);background:var(--card);color:var(--ink);
  cursor:pointer;display:flex;align-items:center;justify-content:center;
  box-shadow:0 2px 10px rgba(0,0,0,.08);padding:0}
#themetoggle:hover{border-color:var(--sage)}
#themetoggle svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;
  stroke-linecap:round;stroke-linejoin:round}
#themetoggle .sun{display:none}
[data-theme="dark"] #themetoggle .sun{display:block}
[data-theme="dark"] #themetoggle .moon{display:none}
"""

# Runs in <head> so the right theme is set before the first paint.
EARLY_JS = """
(function () {
  var KEY = 'fieldnotes-theme', root = document.documentElement;
  function saved() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function sysDark() {
    return !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  }
  window.fieldnotesTheme = {
    set: function (t, persist) {
      root.setAttribute('data-theme', t);
      var m = document.querySelector('meta[name="theme-color"]');
      if (m) m.setAttribute('content', t === 'dark' ? '#161a15' : '#4c6b4f');
      if (persist) { try { localStorage.setItem(KEY, t); } catch (e) {} }
    },
    toggle: function () {
      this.set(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', true);
    }
  };
  var s = saved();
  window.fieldnotesTheme.set(s === 'dark' || s === 'light' ? s : (sysDark() ? 'dark' : 'light'), false);
  if (window.matchMedia) {
    var mq = matchMedia('(prefers-color-scheme: dark)');
    var follow = function (e) {
      if (!saved()) window.fieldnotesTheme.set(e.matches ? 'dark' : 'light', false);
    };
    if (mq.addEventListener) mq.addEventListener('change', follow);
    else if (mq.addListener) mq.addListener(follow);
  }
})();
"""

TOGGLE_HTML = """
<button id="themetoggle" type="button" aria-label="Toggle dark mode" title="Toggle dark mode">
  <svg class="moon" viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
  <svg class="sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
</button>
<script>
(function () {
  var b = document.getElementById('themetoggle');
  if (!b) return;
  function sync() {
    b.setAttribute('aria-pressed', document.documentElement.getAttribute('data-theme') === 'dark');
  }
  b.addEventListener('click', function () { window.fieldnotesTheme.toggle(); sync(); });
  sync();
})();
</script>
"""

HEAD_SNIPPET = '<style id="darkmode-css">' + DARK_CSS + "</style><script>" + EARLY_JS + "</script>"
MARKER = 'id="darkmode-css"'


def inject(page):
    """Return `page` with the dark-mode styles, script and toggle button added."""
    if MARKER in page:  # already injected
        return page
    page = page.replace("</head>", HEAD_SNIPPET + "</head>", 1)
    return page.replace("</body>", TOGGLE_HTML + "</body>", 1)
