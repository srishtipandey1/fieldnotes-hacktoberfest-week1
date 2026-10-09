/* ==========================================================================
   FIELDNOTES v2 — app.js
   Same flow as the classic UI (record → transcribe → identify → confirm →
   journal), re-skinned: theme toggle, health LED, species filters + detail
   pods, field journal. Talks to /api/* served by webv2/server.py.
   ========================================================================== */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const L = window.FnLiving;

  let REGION = 'gujarat', cur = null, rec = null, chunks = [], stream = null;
  let actx = null, analyser = null, stopWave = null, secs = 0, tickT = null;
  let filterCat = 'all', SPECIES = [];
  const MAXS = 20;

  /* ---------- theme (localStorage + system pref, no flash) -------------- */
  const THEME_KEY = 'fieldnotes-theme-v2';
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', t === 'night' ? '#041008' : '#a3e635');
  }
  $('themetoggle').onclick = () => {
    const next = document.documentElement.getAttribute('data-theme') === 'night' ? 'day' : 'night';
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
    L.blip();
  };

  /* ---------- tiny api helper -------------------------------------------- */
  async function api(path, body, raw) {
    const o = {};
    if (raw) { o.method = 'POST'; o.body = body; }
    else { o.headers = { 'Content-Type': 'application/json' };
           if (body) { o.method = 'POST'; o.body = JSON.stringify(body); } }
    const r = await fetch(path, o);
    return r.json();
  }

  /* ---------- boot -------------------------------------------------------- */
  async function load() {
    const r = await api('/api/regions').catch(() => ({ regions: ['gujarat'] }));
    const avail = r.regions.length ? r.regions : ['gujarat'];
    if (!avail.includes(REGION)) REGION = avail[0];
    $('pills').innerHTML = avail.map(x =>
      `<button class="pill${x === REGION ? ' on' : ''}" onclick="Fn.setRegion('${esc(x)}')">${esc(x)}</button>`).join('');
    showStats(await api('/api/stats').catch(() => ({})));
    loadSpecies();
    loadJournal();
  }

  async function loadSpecies() {
    const c = await api('/api/species?region=' + encodeURIComponent(REGION)).catch(() => null);
    if (!c || !c.species) return;
    SPECIES = c.species;
    const CIRC = 2 * Math.PI * 47;
    $('ringfg').style.strokeDasharray = CIRC;
    $('ringfg').style.strokeDashoffset = CIRC * (1 - (c.found / Math.max(1, c.total)));
    $('ringtxt').textContent = c.found + '/' + c.total;
    const st = await api('/api/stats').catch(() => ({ streak: 0 }));
    const el = $('streak');
    if (st.streak > 0) {
      el.className = 'streak';
      el.innerHTML = `☀ ${st.streak}-day sun-streak`;
    } else {
      el.className = 'streak off';
      el.textContent = 'no streak yet — log today';
    }
    renderGrid();
  }

  function renderGrid() {
    const cats = [...new Set(SPECIES.map(s => s.cat))];
    $('filters').innerHTML = ['all', ...cats].map(k =>
      `<button class="fchip${k === filterCat ? ' on' : ''}" onclick="Fn.setFilter('${esc(k)}')">${esc(k)}</button>`).join('');
    const list = SPECIES.filter(s => filterCat === 'all' || s.cat === filterCat);
    $('grid').innerHTML = list.map((s, i) => s.n
      ? `<div class="chip got" data-cat="${esc(s.cat)}" style="--i:${i}" onclick="Fn.showPod('${esc(s.id)}')"><span class="n">×${s.n}</span><b>${esc(s.name)}</b><span class="cat">${esc(s.cat)} · ${esc(s.id)}</span></div>`
      : `<div class="chip miss" data-cat="${esc(s.cat)}" style="--i:${i}" onclick="Fn.showPod('${esc(s.id)}')"><b>? ? ?</b><span class="cat">${esc(s.cat)} — unstudied</span></div>`).join('');
    $('podetail').classList.remove('open');
  }

  function showPod(id) {
    const s = SPECIES.find(x => x.id === id);
    if (!s) return;
    const d = $('podetail');
    d.innerHTML = `<div class="card">
      <p class="heard">specimen pod · ${esc(s.id)}</p>
      <p class="follow">${s.n ? esc(s.name) : 'Unidentified organism — get out there'}</p>
      <p class="small muted">habitat: ${esc(s.habitat)}</p>
      <ul>${s.features.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
      <p class="small">${s.n ? `logged <b>${s.n}×</b> in your journal` : 'not yet observed this season'}</p>
      <button class="btn small ghostbtn" onclick="Fn.hidePod()">close pod</button>
    </div>`;
    d.classList.add('open');
    d.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    L.blip();
  }

  function journalHTML(j) {
    return j.entries.length ? j.entries.map(e => {
      const lab = e.confirmed_label;
      const cls = !lab || lab === 'none' ? 'none' : (e.correct ? '' : 'bad');
      const when = (e.timestamp || '').slice(0, 16).replace('T', ' ');
      const tag = !lab || lab === 'none' ? '<span class="tagline-bad">unresolved</span>'
        : e.correct ? '<span class="tagline-ok">top-1 \u2713</span>'
        : e.in_top3 ? '<span class="tagline-ok">in top-3</span>' : 'corrected';
      return `<div class="jentry ${cls}"><span class="when">${esc(when)}</span>
        <div class="what">${lab && lab !== 'none' ? esc(lab) : '? ? ?'} <span class="small muted">${esc(e.region || '')}</span></div>
        <div class="said">\u201c${esc(e.transcript)}\u201d</div>
        <div class="meta">${tag} \u00b7 conf ${(e.model_answer?.candidates?.[0]?.confidence ?? 0).toFixed(2)} \u00b7 ${esc(e.confidence_source || '')}${e.model_answer?.grounding_violation ? ' \u00b7 \u26a0 grounding drop' : ''}</div>
      </div>`;
    }).join('') : '<p class="small muted">No field entries yet \u2014 the garden awaits.</p>';
  }

  async function loadJournal() {
    const j = await api('/api/journal?limit=15').catch(() => null);
    if (!j) return;
    $('journal').innerHTML = journalHTML(j);
  }

  function showStats(s) {
    $('metrics').innerHTML = [
      ['entries', s.entries], ['top-1', s.top1], ['top-3', s.top3],
      ['coverage', s.coverage], ['unique', s.unique], ['violations', s.violations],
    ].map(([k, v]) => `<span class="metric"><b>${v}</b>${k}</span>`).join('');
  }

  /* ---------- status line & idle hints ----------------------------------- */
  function setStatus(html) { $('status').innerHTML = html; }
  const HINTS = [
    'Tap the seed-pod and describe what you see',
    'The mycelium is listening — what moved out there?',
    'Small? Brown? Glowing? Every detail feeds the hive.',
    'Your terrarium grows one sighting at a time.',
  ];
  let hinti = 1, idleMode = true;
  setInterval(() => { if (idleMode && !rec && !cur) setStatus(HINTS[hinti++ % HINTS.length]); }, 7000);

  /* ---------- health LED -------------------------------------------------- */
  async function checkHealth() {
    const led = $('led');
    try {
      const h = await api('/api/health');
      if (h.ollama && h.model_ready) { led.className = 'led ok'; led.innerHTML = '<i></i>hive mind online'; }
      else if (h.ollama) { led.className = 'led warn'; led.innerHTML = `<i></i>pull ${esc(h.model)}`; }
      else { led.className = 'led bad'; led.innerHTML = '<i></i>hive offline'; }
      led.title = `ollama:${h.ollama} model:${h.model_ready} whisper:${h.whisper}`;
    } catch (e) {
      led.className = 'led bad'; led.innerHTML = '<i></i>server down';
    }
  }

  /* ---------- recording ---------------------------------------------------- */
  $('mic').onclick = () => { rec ? stopRec() : startRec(); };
  $('typetoggle').onclick = () => $('typepanel').classList.toggle('open');

  async function startRec() {
    $('err').textContent = '';
    try {
      if (!stream) stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      $('err').textContent = 'Microphone blocked — allow it in the address bar.';
      L.buzz(); return;
    }
    chunks = [];
    const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
    rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = finishRec;
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    analyser = actx.createAnalyser(); analyser.fftSize = 256;
    actx.createMediaStreamSource(stream).connect(analyser);
    rec.start();
    $('mic').classList.add('rec');
    $('wave').style.display = 'block';
    stopWave = L.wavePainter(analyser, $('wave'));
    secs = 0; $('timer').textContent = '0:00';
    setStatus('<b>Listening…</b> tap the pod to stop');
    tickT = setInterval(() => {
      secs++;
      $('timer').textContent = '0:' + String(secs).padStart(2, '0');
      if (secs >= MAXS) stopRec();
    }, 1000);
  }

  function stopRec() { if (rec && rec.state !== 'inactive') rec.stop(); }

  async function finishRec() {
    clearInterval(tickT); if (stopWave) stopWave();
    $('mic').classList.remove('rec');
    $('wave').style.display = 'none'; $('timer').textContent = '';
    const mime = rec && rec.mimeType ? rec.mimeType : 'audio/webm';
    rec = null;
    const blob = new Blob(chunks, { type: mime });
    $('mic').classList.add('busy');
    setStatus('<span class="spin"></span> Transcribing with the local ear…');
    $('work').innerHTML = '';
    let t;
    try { t = await api('/api/transcribe', blob, true); }
    catch (e) {
      $('mic').classList.remove('busy');
      $('err').textContent = 'Could not reach the server — is webv2 still running?';
      L.buzz(); setStatus('Tap the seed-pod and describe what you see'); return;
    }
    $('mic').classList.remove('busy');
    if (t.error) { $('err').textContent = t.error; L.buzz(); setStatus('Tap the seed-pod and describe what you see'); return; }
    setStatus(`Heard as <b>“${esc(t.transcript)}”</b>`);
    await identify(t.transcript);
  }

  async function fromText() {
    $('err').textContent = '';
    const v = $('text').value.trim();
    if (!v) { $('err').textContent = 'Write a word or two first.'; L.buzz(); return; }
    $('mic').classList.add('busy');
    setStatus('<span class="spin"></span> Consulting the hive mind…');
    await identify(v);
    $('mic').classList.remove('busy');
  }

  async function identify(text) {
    const d = await api('/api/identify', { text, region: REGION });
    if (d.error) { $('err').textContent = d.error; L.buzz(); return; }
    cur = d;
    render(d);
  }

  function render(d) {
    idleMode = false;
    $('work').innerHTML = `<div class="card">
      <p class="heard">heard · “${esc(d.transcript || '')}”</p>
      <p class="follow">${esc(d.followup)}</p>` +
      d.candidates.map((c, i) =>
        `<button class="cand" style="--i:${i}" onclick="Fn.pick('${esc(c.id)}')">
          <span class="cf">${c.confidence.toFixed(2)}</span>
          <span class="nm">${esc(c.common_name)}</span> <span class="id">${esc(c.id)}</span>
          <span class="bar"><i style="width:0%" data-w="${Math.round(c.confidence * 100)}"></i></span>
        </button>`).join('') +
      `<button class="cand" style="--i:${d.candidates.length}" onclick="Fn.pick('none')"><span class="nm">✦ None of these — the right one isn't listed</span></button>` +
      (d.grounding_violation ? '<p class="violation">⚠ The model named something outside the shortlist; it was dropped.</p>' : '') +
      '</div>';
    // animate confidence bars after paint
    requestAnimationFrame(() => setTimeout(() => {
      document.querySelectorAll('#work .bar i').forEach(el => { el.style.width = el.dataset.w + '%'; });
    }, 120));
  }

  async function pick(id) {
    if (!cur) return;
    const d = await api('/api/confirm', Object.assign({}, cur, {
      confirmed_label: id, device: document.body.dataset.device, location: LOC }));
    if (d.error) { $('err').textContent = d.error; L.buzz(); return; }
    const name = (cur.candidates.find(c => c.id === id) || {}).common_name;
    $('work').innerHTML = `<div class="card" style="text-align:center">
      <p class="done">${id === 'none' ? '✦ logged as unidentified' : '✓ ' + esc(name || id)}</p>
      <p class="small muted">${id === 'none' ? 'the spore stays wild in the journal' : esc(id)}</p>
      <button class="btn small" onclick="Fn.again()">spot another</button>
    </div>`;
    setStatus('Nice spot. ' + (d.entry.confidence_source === 'rank' ? 'Confidence is rank-based.' : ''));
    showStats(d.stats);
    loadSpecies(); loadJournal();
    L.celebrate(); L.chime();
  }

  function again() {
    $('work').innerHTML = ''; cur = null; idleMode = true;
    $('text').value = ''; $('typepanel').classList.remove('open');
    setStatus('Tap the seed-pod and describe what you see');
  }

  function setRegion(x) { REGION = x; load(); }
  function setFilter(k) { filterCat = k; renderGrid(); }

  /* ---------- device + geolocation (kept from v1 behaviour) --------------- */
  const MOBILE = matchMedia('(pointer:coarse)').matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  document.body.dataset.device = MOBILE ? 'mobile-field' : 'desktop-nest';
  let LOC = null;
  function paintLoc() {
    let s = MOBILE ? '🌱 mobile field mode' : '💻 desktop nest mode';
    s += LOC ? ' · ' + (LOC.lat >= 20 && LOC.lat <= 24.8 && LOC.lon >= 68 && LOC.lon <= 74.6 ? 'Gujarat, India' : 'outside Gujarat') + ' · ±' + LOC.acc + ' m' : ' · location off';
    $('devline').textContent = s;
  }
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      p => { LOC = { lat: +p.coords.latitude.toFixed(5), lon: +p.coords.longitude.toFixed(5), acc: Math.round(p.coords.accuracy || 0) }; paintLoc(); },
      () => paintLoc(), { timeout: 9000 });
  } else paintLoc();

  /* ---------- expose for inline handlers ---------------------------------- */
  window.Fn = { setRegion, setFilter, showPod, hidePod: () => $('podetail').classList.remove('open'), pick, again, fromText, journalHTML };

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

  /* offline banner: show when a fetch just failed, hide when server answers */
  addEventListener('offline', () => $('srvwarn').classList.add('show'));
  addEventListener('online', () => $('srvwarn').classList.remove('show'));

  /* ---------- go ----------------------------------------------------------- */
  L.ambientEngine();
  load();
  checkHealth(); setInterval(checkHealth, 20000);
})();
