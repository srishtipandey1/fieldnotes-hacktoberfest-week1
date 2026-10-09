/* ==========================================================================
   FIELDNOTES v2 — living.js
   ambient canvas life: drifting spores, fireflies (night), leaf confetti,
   audio waveform, chimes. No frameworks, no CDNs — pure browser APIs.
   ========================================================================== */
(function () {
  'use strict';

  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NIGHT = () => document.documentElement.getAttribute('data-theme') === 'night';

  /* ---------- shared helpers ------------------------------------------- */
  function fitCanvas(c) {
    c.width = innerWidth; c.height = innerHeight;
  }
  addEventListener('resize', () => {
    document.querySelectorAll('canvas.layer').forEach(fitCanvas);
  });

  /* ---------- 1. background: spores by day, fireflies at night --------- */
  function ambientEngine() {
    const c = document.getElementById('bg');
    if (!c || REDUCED) return;
    fitCanvas(c);
    const x = c.getContext('2d');
    const DAY = ['163,230,53', '20,184,166', '251,191,36', '167,139,250'];
    const NGT = ['74,222,128', '45,212,191', '240,171,252', '250,204,21'];
    const N = innerWidth < 600 ? 26 : 48;
    let ps = [];
    const spawn = any => ({
      x: Math.random() * innerWidth,
      y: any ? Math.random() * innerHeight : innerHeight + 20,
      s: 2.5 + Math.random() * 6,          // spore size
      a: Math.random() * 6.28,             // rotation
      vy: 0.15 + Math.random() * 0.45,     // drift up
      ph: Math.random() * 6.28,            // sway phase
      sp: 0.004 + Math.random() * 0.012,   // spin
      col: null,                           // picked per-frame from palette
      ci: Math.random() * 4 | 0,
      al: 0.08 + Math.random() * 0.2,
      blink: Math.random() * 6.28,         // firefly pulse phase
    });
    ps = Array.from({ length: N }, () => spawn(true));
    (function tick() {
      requestAnimationFrame(tick);
      if (document.hidden) return;
      const night = NIGHT(), pal = night ? NGT : DAY;
      x.clearRect(0, 0, c.width, c.height);
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        p.y -= p.vy; p.ph += 0.011; p.a += p.sp; p.blink += 0.03;
        p.x += Math.sin(p.ph) * 0.35;
        if (p.y < -24) { ps[i] = spawn(false); continue; }
        const rgb = pal[p.ci % pal.length];
        if (night) {
          // firefly: soft pulsing glow dot
          const g = 0.35 + 0.65 * Math.abs(Math.sin(p.blink));
          const r = p.s * 1.4;
          const grad = x.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 4);
          grad.addColorStop(0, `rgba(${rgb},${(0.55 * g).toFixed(3)})`);
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          x.fillStyle = grad;
          x.beginPath(); x.arc(p.x, p.y, r * 4, 0, 6.29); x.fill();
        } else {
          // spore: little rotating leaf ellipse
          x.save(); x.translate(p.x, p.y); x.rotate(p.a);
          x.fillStyle = `rgba(${rgb},${p.al})`;
          x.beginPath(); x.ellipse(0, 0, p.s, p.s * 0.55, 0, 0, 6.29); x.fill();
          x.strokeStyle = `rgba(${rgb},${Math.min(p.al * 1.6, 0.3)})`;
          x.lineWidth = 0.8;
          x.beginPath(); x.moveTo(-p.s, 0); x.lineTo(p.s, 0); x.stroke();
          x.restore();
        }
      }
    })();
  }

  /* ---------- 2. celebration: leaf + spore burst ------------------------ */
  function celebrate() {
    const c = document.getElementById('fx');
    if (!c || REDUCED) return;
    fitCanvas(c);
    const x = c.getContext('2d');
    const cols = ['#a3e635', '#14b8a6', '#fbbf24', '#f0abfc', '#f97316', '#ec4899'];
    const shapes = ['leaf', 'spark', 'ring'];
    const ps = Array.from({ length: 110 }, () => ({
      x: innerWidth / 2 + (Math.random() - 0.5) * 160,
      y: innerHeight * 0.33,
      vx: (Math.random() - 0.5) * 11,
      vy: -5 - Math.random() * 7,
      s: 4 + Math.random() * 8,
      r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.35,
      col: cols[Math.random() * cols.length | 0],
      shape: shapes[Math.random() * shapes.length | 0],
      life: 80 + Math.random() * 45,
    }));
    (function tick() {
      x.clearRect(0, 0, c.width, c.height);
      let alive = false;
      for (const p of ps) {
        if (p.life-- <= 0) continue; alive = true;
        p.x += p.vx; p.y += p.vy; p.vy += 0.23; p.r += p.vr;
        x.save(); x.translate(p.x, p.y); x.rotate(p.r);
        x.globalAlpha = Math.min(1, p.life / 30);
        x.fillStyle = x.strokeStyle = p.col;
        if (p.shape === 'leaf') {
          x.beginPath(); x.ellipse(0, 0, p.s, p.s * 0.5, 0, 0, 6.29); x.fill();
        } else if (p.shape === 'spark') {
          x.lineWidth = 2;
          x.beginPath(); x.moveTo(-p.s, 0); x.lineTo(p.s, 0);
          x.moveTo(0, -p.s); x.lineTo(0, p.s); x.stroke();
        } else {
          x.lineWidth = 2;
          x.beginPath(); x.arc(0, 0, p.s * 0.7, 0, 6.29); x.stroke();
        }
        x.restore();
      }
      if (alive) requestAnimationFrame(tick);
      else x.clearRect(0, 0, c.width, c.height);
    })();
  }

  /* ---------- 3. audio: chime + growl ----------------------------------- */
  let actx = null;
  function tone(freqs, type, dur, vol) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      freqs.forEach((f, i) => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.frequency.value = f; o.type = type;
        const t = actx.currentTime + i * 0.09;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(vol, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g); g.connect(actx.destination);
        o.start(t); o.stop(t + dur + 0.05);
      });
    } catch (e) { /* audio blocked — silent is fine */ }
  }
  const chime = () => tone([523.25, 659.25, 783.99, 1046.5], 'sine', 0.5, 0.16);   // C major pentatonic rise
  const blip = () => tone([880], 'triangle', 0.12, 0.08);
  const buzz = () => tone([138.5, 116.5], 'sawtooth', 0.3, 0.06);                  // bio-punk growl for errors

  /* ---------- 4. live waveform (recording) ------------------------------ */
  function wavePainter(analyser, canvas) {
    const x = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
    const buf = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;
    const bars = 34;
    (function paint() {
      raf = requestAnimationFrame(paint);
      analyser.getByteFrequencyData(buf);
      x.clearRect(0, 0, W, H);
      const bw = W / bars;
      for (let i = 0; i < bars; i++) {
        const v = buf[Math.floor(i * buf.length / bars)] / 255;
        const h = 4 + v * (H - 8);
        const hue = 90 + v * 210;                       // lime → magenta with volume
        x.fillStyle = `hsl(${hue} 85% ${NIGHT() ? 62 : 45}%)`;
        x.shadowColor = `hsl(${hue} 90% 60%)`;
        x.shadowBlur = 8;
        const bh = Math.max(3, bw - 4);
        x.beginPath();
        x.roundRect(i * bw + 2, (H - h) / 2, bh, h, bh / 2);
        x.fill();
      }
    })();
    return () => cancelAnimationFrame(raf);
  }

  window.FnLiving = { celebrate, chime, blip, buzz, wavePainter, ambientEngine, REDUCED };
})();
