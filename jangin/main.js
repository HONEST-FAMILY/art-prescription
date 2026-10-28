(() => {
  const $ = (s) => document.querySelector(s);
  const stage = $('#stage');
  const glc = $('#gl');
  const gc = $('#guide');
  const fc = $('#fx');
  const hint = $('#hint');
  const sheet = $('#sheet');
  const live = $('#live');
  const cur = $('#cursor');
  const curDot = cur.querySelector('i');
  const curRing = cur.querySelector('b');
  const curLab = cur.querySelector('em');
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (fine) document.body.classList.add('fine');

  const METALS = {
    gold: [0.87, 0.67, 0.35],
    silver: [0.79, 0.8, 0.83],
    bronze: [0.76, 0.47, 0.3]
  };
  const metal = METALS.gold.slice();
  let metalTo = METALS.gold;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  let W = 0, H = 0, DPR = 1, HD = 1, M = 18, lastW = -1;
  const hc = document.createElement('canvas');
  hc.id = 'hmap';
  const hx = hc.getContext('2d');
  const gx = gc.getContext('2d');
  const fx = fc.getContext('2d');
  let dirty = true;

  const userCuts = [];
  let strokes = 0;
  let chipsMade = 0;
  let carvedPx = 0;

  const chips = [];
  const MAXCHIPS = fine ? 1400 : 800;
  let pile = new Float32Array(1);

  const lamp = { x: 0, y: 0, z: 600, tx: 0, ty: 0 };
  let pointer = { x: -1, y: -1, seen: 0 };
  let tilt = null;
  let lastUser = -1e9;
  let shake = 0;
  let t0 = performance.now();
  let clock = 0;

  const glints = [];
  const jobs = [];
  let hatchRuns = [];
  let hatchIdx = 0;
  let hatchJob = null;
  let title = null;

  function depthFor(w) {
    return clamp(0.42 + w * 0.045, 0.42, 0.9);
  }

  function cut(x0, y0, x1, y1, w, d) {
    if (w < 0.3) return;
    hx.globalCompositeOperation = 'darken';
    hx.lineCap = 'round';
    const N = 9;
    for (let i = 0; i < N; i++) {
      const f = 1 - i / N;
      const v = Math.round(255 * (1 - (d * (i + 1)) / N));
      hx.strokeStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
      hx.lineWidth = Math.max(0.6, w * f) * HD;
      hx.beginPath();
      hx.moveTo(x0 * HD, y0 * HD);
      hx.lineTo(x1 * HD, y1 * HD);
      hx.stroke();
    }
    dirty = true;
  }

  function userCut(x0, y0, x1, y1, w, d) {
    userCuts.push(x0, y0, x1, y1, w, d);
    carvedPx += Math.hypot(x1 - x0, y1 - y0);
    cut(x0, y0, x1, y1, w, d);
  }

  function frameLines() {
    const a = M, b = M + 7;
    return [
      { pts: [a, a, W - a, a, W - a, H - a], w: 4.2 },
      { pts: [W - a, H - a, a, H - a, a, a], w: 4.2 },
      { pts: [b, b, W - b, b, W - b, H - b], w: 1.8 },
      { pts: [W - b, H - b, b, H - b, b, b], w: 1.8 }
    ];
  }

  function cutPoly(pts, w, d) {
    for (let i = 0; i < pts.length - 2; i += 2) cut(pts[i], pts[i + 1], pts[i + 2], pts[i + 3], w, d);
  }

  function layoutTitle() {
    const small = W < 760;
    const size = Math.round(Math.min(W * 0.23, H * 0.24, 230));
    const gap = size * 1.28;
    const cy = small ? H * 0.37 : H * 0.42;
    const chars = ['감', '사', '패'];
    const xs = chars.map((_, i) => W / 2 + (i - 1) * gap);
    title = { size, gap, cy, chars, xs, small };
  }

  function fontStr(weight, px) {
    return weight + ' ' + px + 'px "Pretendard Variable", Pretendard, system-ui, sans-serif';
  }

  function drawGuide() {
    gc.width = Math.round(W * DPR);
    gc.height = Math.round(H * DPR);
    gx.setTransform(DPR, 0, 0, DPR, 0, 0);
    gx.clearRect(0, 0, W, H);
    const t = title;
    const box = t.size * 1.12;
    gx.strokeStyle = 'rgba(40,26,8,0.22)';
    gx.lineWidth = 1;
    for (const x of t.xs) {
      gx.strokeRect(Math.round(x - box / 2) + 0.5, Math.round(t.cy - box / 2) + 0.5, Math.round(box), Math.round(box));
      gx.beginPath();
      gx.setLineDash([3, 5]);
      gx.moveTo(x, t.cy - box / 2);
      gx.lineTo(x, t.cy + box / 2);
      gx.moveTo(x - box / 2, t.cy);
      gx.lineTo(x + box / 2, t.cy);
      gx.stroke();
      gx.setLineDash([]);
    }
    gx.font = fontStr(800, t.size);
    gx.textAlign = 'center';
    gx.textBaseline = 'middle';
    gx.strokeStyle = 'rgba(36,22,6,0.5)';
    gx.lineWidth = 1.1;
    t.chars.forEach((c, i) => gx.strokeText(c, t.xs[i], t.cy + t.size * 0.04));
    const phrase = '귀하께서는 지난 한 해 동안 보여준 남다른 노고와 헌신을 치하하기 위해 OOO의 전 임직원의 깊은 감사의 마음을 이 패에 담아드립니다.';
    const fs = t.small ? 12.5 : 15;
    gx.font = fontStr(600, fs);
    gx.fillStyle = 'rgba(36,22,6,0.5)';
    const maxW = Math.min(W - 2 * (M + 34), t.gap * 2 + t.size);
    const lines = [];
    let line = '';
    for (const word of phrase.split(' ')) {
      const test = line ? line + ' ' + word : word;
      if (gx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = word;
      } else line = test;
    }
    if (line) lines.push(line);
    const y0 = t.cy + box / 2 + fs * 2.1;
    lines.forEach((l, i) => gx.fillText(l, W / 2, y0 + i * fs * 1.7));
    hint.style.top = Math.round(y0 + lines.length * fs * 1.7 + 8) + 'px';
  }

  function buildHatch() {
    const t = title;
    const c = document.createElement('canvas');
    c.width = Math.ceil(W);
    c.height = Math.ceil(H);
    const x = c.getContext('2d', { willReadFrequently: true });
    x.font = fontStr(800, t.size);
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = '#000';
    t.chars.forEach((ch, i) => x.fillText(ch, t.xs[i], t.cy + t.size * 0.04));
    const data = x.getImageData(0, 0, c.width, c.height).data;
    const ang = -0.6;
    const ux = Math.cos(ang), uy = Math.sin(ang);
    const nx = -uy, ny = ux;
    const cx = W / 2, cy = t.cy;
    const half = t.gap + t.size;
    const R = Math.hypot(half, t.size);
    const gap = clamp(t.size / 40, 3.2, 5.6);
    const runs = [];
    let flip = false;
    for (let o = -R; o <= R; o += gap) {
      const row = [];
      let inside = false, s0 = 0;
      for (let s = -R; s <= R + 1; s += 1) {
        const px = Math.round(cx + nx * o + ux * s);
        const py = Math.round(cy + ny * o + uy * s);
        let v = false;
        if (px >= 0 && py >= 0 && px < c.width && py < c.height) v = data[(py * c.width + px) * 4 + 3] > 140;
        if (v && !inside) {
          inside = true;
          s0 = s;
        } else if (!v && inside) {
          inside = false;
          if (s - s0 > 3) row.push([cx + nx * o + ux * (s0 + 1), cy + ny * o + uy * (s0 + 1), cx + nx * o + ux * (s - 1), cy + ny * o + uy * (s - 1)]);
        }
      }
      if (flip) row.reverse().forEach((r) => runs.push([r[2], r[3], r[0], r[1]]));
      else row.forEach((r) => runs.push(r));
      if (row.length) flip = !flip;
    }
    hatchRuns = runs;
  }

  function replayAll() {
    hc.width = Math.round(W * HD);
    hc.height = Math.round(H * HD);
    hx.globalCompositeOperation = 'source-over';
    hx.fillStyle = '#fff';
    hx.fillRect(0, 0, hc.width, hc.height);
    for (const f of frameLines()) cutPoly(f.pts, f.w, depthFor(f.w));
    for (let i = 0; i < hatchIdx && i < hatchRuns.length; i++) {
      const r = hatchRuns[i];
      cut(r[0], r[1], r[2], r[3], 2.1, 0.62);
    }
    for (let i = 0; i < userCuts.length; i += 6) cut(userCuts[i], userCuts[i + 1], userCuts[i + 2], userCuts[i + 3], userCuts[i + 4], userCuts[i + 5]);
    dirty = true;
  }

  function freshPlate(animated) {
    hc.width = Math.round(W * HD);
    hc.height = Math.round(H * HD);
    hx.globalCompositeOperation = 'source-over';
    hx.fillStyle = '#fff';
    hx.fillRect(0, 0, hc.width, hc.height);
    dirty = true;
    jobs.length = 0;
    hatchJob = null;
    if (animated) {
      const dur = reduce ? 0.2 : 1.15;
      frameLines().forEach((f, i) => {
        let len = 0;
        for (let k = 0; k < f.pts.length - 2; k += 2) len += Math.hypot(f.pts[k + 2] - f.pts[k], f.pts[k + 3] - f.pts[k + 1]);
        jobs.push(makeJob(f.pts, f.w, depthFor(f.w), len / (dur * 1000), i * 90, i < 2 ? 22 : 0));
      });
    } else {
      for (const f of frameLines()) cutPoly(f.pts, f.w, depthFor(f.w));
    }
  }

  function makeJob(pts, w, d, speed, delay, chipEvery) {
    const cum = [0];
    for (let k = 0; k < pts.length - 2; k += 2) cum.push(cum[cum.length - 1] + Math.hypot(pts[k + 2] - pts[k], pts[k + 3] - pts[k + 1]));
    return { pts, w, d, speed, delay, chipEvery, cum, total: cum[cum.length - 1], s: 0, acc: 0, x: pts[0], y: pts[1], done: false, taper: 8 };
  }

  function posAt(j, s) {
    let k = 0;
    while (k < j.cum.length - 2 && j.cum[k + 1] < s) k++;
    const segLen = j.cum[k + 1] - j.cum[k] || 1;
    const f = clamp((s - j.cum[k]) / segLen, 0, 1);
    return [lerp(j.pts[k * 2], j.pts[k * 2 + 2], f), lerp(j.pts[k * 2 + 1], j.pts[k * 2 + 3], f), (j.pts[k * 2 + 2] - j.pts[k * 2]) / segLen, (j.pts[k * 2 + 3] - j.pts[k * 2 + 1]) / segLen];
  }

  function runJob(j, ms) {
    if (j.delay > 0) {
      j.delay -= ms;
      return;
    }
    let budget = j.speed * ms;
    while (budget > 0 && !j.done) {
      const step = Math.min(budget, 5);
      const s0 = j.s, s1 = Math.min(j.total, j.s + step);
      const a = posAt(j, s0), b = posAt(j, s1);
      const env = Math.min(1, (s1 + 1) / j.taper, (j.total - s0 + 1) / j.taper);
      cut(a[0], a[1], b[0], b[1], j.w * clamp(env, 0.25, 1), j.d);
      j.s = s1;
      j.x = b[0];
      j.y = b[1];
      j.acc += s1 - s0;
      if (j.chipEvery && j.acc > j.chipEvery) {
        j.acc = 0;
        emit(b[0], b[1], b[2], b[3], 1, 0.8, j.w);
      }
      budget -= step;
      if (j.s >= j.total - 1e-6) j.done = true;
    }
  }

  function nextHatch() {
    if (hatchIdx >= hatchRuns.length) return null;
    const r = hatchRuns[hatchIdx];
    const j = makeJob(r, 2.1, 0.62, 1.3, 40, 16);
    j.taper = 4;
    j.hatch = true;
    return j;
  }

  function emit(x, y, dx, dy, n, power, w) {
    for (let i = 0; i < n; i++) {
      if (chips.length >= MAXCHIPS) dropChip();
      const s = (0.6 + Math.random() * 1.3) * power;
      const side = (Math.random() - 0.5) * 2;
      chips.push({
        x, y,
        vx: dx * s * 1.4 - dy * side * 1.6 + (Math.random() - 0.5) * 0.8,
        vy: dy * s * 1.4 + dx * side * 1.6 - (1.4 + Math.random() * 2.6) * power,
        a: Math.random() * 6.283,
        va: (Math.random() - 0.5) * 0.8,
        r: (1.1 + Math.random() * 2.6) * (0.6 + w / 10),
        sw: 2.2 + Math.random() * 3.4,
        t: 0.8 + Math.random() * 0.9 * (0.5 + w / 10),
        rest: false, col: -1, add: 0, e: Math.random() * 6.283, ve: 0.05 + Math.random() * 0.12
      });
      chipsMade++;
    }
  }

  function dropChip() {
    const c = chips.shift();
    if (c && c.rest && c.col >= 0) {
      pile[c.col] = Math.max(0, pile[c.col] - c.add);
    }
  }

  function stepChips() {
    const cols = pile.length;
    for (const c of chips) {
      if (c.rest) continue;
      c.vy += 0.34;
      c.vx *= 0.986;
      c.vy *= 0.992;
      c.x += c.vx;
      c.y += c.vy;
      c.a += c.va;
      c.e += c.ve;
      if (c.x < 2) { c.x = 2; c.vx = -c.vx * 0.4; }
      if (c.x > W - 2) { c.x = W - 2; c.vx = -c.vx * 0.4; }
      const col = clamp((c.x / 4) | 0, 0, cols - 1);
      const fl = H - 2 - Math.min(pile[col], 46);
      if (c.y > fl) {
        c.y = fl;
        if (c.vy > 1.8) {
          c.vy = -c.vy * 0.3;
          c.vx *= 0.55;
          c.va *= 0.5;
        } else {
          c.rest = true;
          c.col = col;
          c.add = c.t * 0.75 + 0.35;
          pile[col] += c.add;
          if (col > 0) pile[col - 1] += 0.12;
          if (col < cols - 1) pile[col + 1] += 0.12;
        }
      }
    }
  }

  let drawing = null;

  function pt(e) {
    const r = stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function touchUser() {
    lastUser = clock;
    if (hatchJob && !hatchJob.done) {
      hatchJob = null;
    }
  }

  function haptic(ms) {
    if (fine || !navigator.vibrate) return;
    const ua = navigator.userActivation;
    if (ua && !ua.hasBeenActive) return;
    try { navigator.vibrate(ms); } catch (_) {}
  }

  let tiltAsked = false;
  function askTilt() {
    if (tiltAsked) return;
    tiltAsked = true;
    const D = window.DeviceOrientationEvent;
    if (D && typeof D.requestPermission === 'function') {
      D.requestPermission().then((s) => { if (s === 'granted') addEventListener('deviceorientation', onTilt); }).catch(() => {});
    }
  }
  function onTilt(e) {
    if (e.gamma == null || e.beta == null) return;
    tilt = { g: e.gamma, b: e.beta, t: clock };
  }
  if (!fine) addEventListener('deviceorientation', onTilt);

  stage.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    e.preventDefault();
    try { stage.setPointerCapture(e.pointerId); } catch (_) {}
    touchUser();
    askTilt();
    const p = pt(e);
    pointer.x = p.x;
    pointer.y = p.y;
    pointer.seen = clock;
    drawing = { id: e.pointerId, x: p.x, y: p.y, t: e.timeStamp, w: 3.2, sp: 0, len: 0, acc: 0, dx: 0, dy: -1, pts: [p.x, p.y], still: 0, hold: 0, moved: false };
    userCut(p.x - 0.3, p.y, p.x + 0.3, p.y, 3.4, 0.75);
    emit(p.x, p.y, 0, -1, 4, 0.75, 4);
    strokes++;
    hint.classList.add('gone');
    cur.classList.add('cut');
    haptic(6);
  });

  function carveTo(p, t) {
    const d = drawing;
    const dx = p.x - d.x, dy = p.y - d.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.7) return;
    const dt = Math.max(1, t - d.t);
    const sp = Math.min(dist / dt, 6);
    d.sp += (sp - d.sp) * 0.35;
    const target = clamp(10.5 - d.sp * 4.2, 1.6, 10.5);
    const steps = Math.ceil(dist / 4);
    let px = d.x, py = d.y;
    for (let i = 1; i <= steps; i++) {
      const nx = d.x + (dx * i) / steps, ny = d.y + (dy * i) / steps;
      d.len += dist / steps;
      d.w += (target - d.w) * 0.16;
      const env = Math.min(1, 0.3 + d.len / 16);
      const w = d.w * env;
      userCut(px, py, nx, ny, w, depthFor(w));
      px = nx;
      py = ny;
    }
    const ux = dx / dist, uy = dy / dist;
    d.dx = lerp(d.dx, ux, 0.5);
    d.dy = lerp(d.dy, uy, 0.5);
    d.acc += dist;
    const fast = d.sp > 1.5;
    const per = fast ? 6 : 10;
    while (d.acc > per) {
      d.acc -= per;
      emit(p.x, p.y, ux, uy, fast ? 2 : 1, 0.65 + Math.min(d.sp, 3.2) * 0.55, d.w);
    }
    if (sp > 2.2) shake = Math.min(3.2, shake + 0.35);
    d.x = p.x;
    d.y = p.y;
    d.t = t;
    d.still = 0;
    d.moved = d.moved || d.len > 3;
    if (d.pts.length < 4000) d.pts.push(p.x, p.y);
    if (Math.random() < 0.18) haptic(4);
  }

  addEventListener('pointermove', (e) => {
    const p = pt(e);
    pointer.x = p.x;
    pointer.y = p.y;
    pointer.seen = clock;
    if (e.pointerType === 'mouse') moveCursor(e.clientX, e.clientY, e.target);
    if (!drawing || e.pointerId !== drawing.id) return;
    lastUser = clock;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
    if (evs && evs.length) for (const ev of evs) carveTo(pt(ev), ev.timeStamp);
    else carveTo(p, e.timeStamp);
  }, { passive: true });

  function endStroke() {
    const d = drawing;
    if (!d) return;
    drawing = null;
    cur.classList.remove('cut');
    lastUser = clock;
    if (d.moved) {
      let x = d.x, y = d.y;
      const len = Math.hypot(d.dx, d.dy) || 1;
      const ux = d.dx / len, uy = d.dy / len;
      const L = Math.min(18, 5 + d.w * 1.3);
      for (let i = 1; i <= 6; i++) {
        const nx = d.x + (ux * L * i) / 6, ny = d.y + (uy * L * i) / 6;
        const nw = d.w * (1 - i / 6.5);
        userCut(x, y, nx, ny, nw, depthFor(nw));
        x = nx;
        y = ny;
      }
      d.pts.push(x, y);
      emit(x, y, ux, uy, 3, 1.1, d.w);
      if (d.pts.length >= 6) glints.push({ pts: d.pts, t: 0, dur: clamp(d.len / 900, 0.35, 0.9) });
    }
  }
  addEventListener('pointerup', endStroke);
  addEventListener('pointercancel', endStroke);

  function holdStep(ms) {
    const d = drawing;
    if (!d) return;
    d.still += ms;
    if (d.still > 140 && !d.moved) {
      d.hold = Math.min(1.4, d.hold + ms / 1000);
      const w = 3.4 + d.hold * 7.5;
      userCut(d.x - 0.3, d.y, d.x + 0.3, d.y, w, depthFor(w));
      if (Math.random() < 0.22) emit(d.x, d.y, Math.random() - 0.5, -1, 1, 0.7, w);
      if (Math.random() < 0.05) haptic(3);
    }
  }

  const magnets = [];
  function magnet(el) {
    const inner = el.querySelector('span');
    const m = { el, inner, x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };
    magnets.push(m);
  }
  magnet($('#open'));

  function stepMagnets() {
    for (const m of magnets) {
      const r = m.el.getBoundingClientRect();
      const cx = r.left + r.width / 2 - m.x, cy = r.top + r.height / 2 - m.y;
      const dx = pointer.x - cx, dy = pointer.y - cy;
      const rad = Math.max(r.width, r.height) / 2 + 56;
      const near = fine && clock - pointer.seen < 1.5 && Math.hypot(dx, dy) < rad;
      m.tx = near ? dx * 0.35 : 0;
      m.ty = near ? dy * 0.35 : 0;
      m.vx = (m.vx + (m.tx - m.x) * 0.16) * 0.74;
      m.vy = (m.vy + (m.ty - m.y) * 0.16) * 0.74;
      m.x += m.vx;
      m.y += m.vy;
      m.el.style.transform = 'translate(' + m.x.toFixed(2) + 'px,' + m.y.toFixed(2) + 'px)';
      if (m.inner) m.inner.style.transform = 'translate(' + (m.x * 0.4).toFixed(2) + 'px,' + (m.y * 0.4).toFixed(2) + 'px)';
    }
  }

  const cpos = { x: -100, y: -100, rx: -100, ry: -100, vx: 0, vy: 0 };
  function moveCursor(x, y, target) {
    cpos.x = x;
    cpos.y = y;
    const ui = target && target.closest && target.closest('button, #sheet, a');
    cur.classList.toggle('ui', !!ui);
  }
  function drawCursor(dt) {
    if (!fine) return;
    const k = 1 - Math.exp(-dt * 15);
    const px = cpos.rx, py = cpos.ry;
    cpos.rx += (cpos.x - cpos.rx) * k;
    cpos.ry += (cpos.y - cpos.ry) * k;
    const vx = cpos.rx - px, vy = cpos.ry - py;
    const sp = Math.min(Math.hypot(vx, vy) / Math.max(dt * 60, 0.5), 30);
    const ang = Math.atan2(vy, vx);
    curDot.style.transform = 'translate(' + cpos.x + 'px,' + cpos.y + 'px)';
    curRing.style.transform = 'translate(' + cpos.rx.toFixed(1) + 'px,' + cpos.ry.toFixed(1) + 'px) rotate(' + ang.toFixed(3) + 'rad) scale(' + (1 + sp * 0.02).toFixed(3) + ',' + (1 - sp * 0.01).toFixed(3) + ')';
    curLab.style.transform = 'translate(' + cpos.rx.toFixed(1) + 'px,' + cpos.ry.toFixed(1) + 'px)';
  }

  let gl = null, prog = null, tex = null, U = {};
  const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const FS = [
    'precision highp float;',
    'uniform sampler2D uH;uniform vec2 uRes;uniform vec3 uLamp;uniform vec3 uBase;uniform vec2 uTex;uniform float uK;uniform float uS;',
    'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
    'float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}',
    'void main(){',
    ' vec2 uv=vec2(gl_FragCoord.x/uRes.x,1.-gl_FragCoord.y/uRes.y);',
    ' vec2 px=uv*uRes/uS;',
    ' float h=texture2D(uH,uv).r;',
    ' float hl=texture2D(uH,uv-vec2(uTex.x*1.5,0.)).r,hr=texture2D(uH,uv+vec2(uTex.x*1.5,0.)).r;',
    ' float hu=texture2D(uH,uv-vec2(0.,uTex.y*1.5)).r,hd=texture2D(uH,uv+vec2(0.,uTex.y*1.5)).r;',
    ' float g=1.-smoothstep(.8,.99,min(h,min(min(hl,hr),min(hu,hd))));',
    ' float hair=vn(vec2(px.x*.004,px.y*1.3))*.6+vn(vec2(px.x*.025,px.y*3.7))*.4;',
    ' vec3 N=normalize(vec3((hl-hr)*uK,(hu-hd)*uK+(hair-.5)*.07*(1.-g),1.));',
    ' vec3 Lv=uLamp-vec3(px,0.);float dist=length(Lv);vec3 L=Lv/dist;',
    ' vec3 Hh=normalize(L+vec3(0.,0.,1.));',
    ' float diff=max(dot(N,L),0.);',
    ' float th=Hh.x-N.x*dot(N,Hh);',
    ' float an=exp(-th*th*75.);',
    ' float sp=pow(max(dot(N,Hh),0.),70.);',
    ' float fall=1./(1.+pow(dist/(uRes.y/uS*.85),2.));',
    ' float tone=.9+.1*vn(px*.0022+7.);',
    ' vec3 base=uBase*tone;',
    ' vec3 cut=mix(base,vec3(1.,.96,.86),.18);',
    ' vec3 b=mix(base,cut,g);',
    ' vec3 col=b*(.34+.5*diff*(.45+.55*fall));',
    ' float e=dot(N.xy,vec2(-.45,-.89))*2.2;',
    ' col+=cut*max(e,0.)*.75*g;',
    ' col*=1.-clamp(-e,0.,1.)*.55*g;',
    ' col+=mix(base,vec3(1.),.3)*an*(.42+.3*hair)*(1.-g)*(.3+.7*fall);',
    ' col+=mix(base,vec3(1.,.97,.9),.5)*sp*(.12+1.9*g)*(.5+.5*fall);',
    ' col*=mix(1.,.38,1.-smoothstep(.2,.85,h));',
    ' col*=.9+.12*(1.-uv.y);',
    ' gl_FragColor=vec4(col,1.);',
    '}'
  ].join('\n');

  function initGL() {
    try {
      gl = glc.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false });
    } catch (_) {
      gl = null;
    }
    if (!gl) return false;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    } catch (err) {
      gl = null;
      return false;
    }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    for (const n of ['uH', 'uRes', 'uLamp', 'uBase', 'uTex', 'uK', 'uS']) U[n] = gl.getUniformLocation(prog, n);
    gl.uniform1i(U.uH, 0);
    glc.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      gl = null;
      fallback();
    });
    return true;
  }

  function fallback() {
    document.body.classList.add('nogl');
    glc.style.display = 'none';
    hc.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%';
    if (!hc.parentNode) stage.insertBefore(hc, gc);
  }

  function resize(force) {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!force && w === W && Math.abs(h - H) < 2) return;
    W = w;
    H = h;
    lastW = w;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    HD = Math.min(window.devicePixelRatio || 1, 1.5);
    M = W < 760 ? 12 : 18;
    lamp.z = Math.min(W, H) * 0.55 + 140;
    glc.width = Math.round(W * DPR);
    glc.height = Math.round(H * DPR);
    fc.width = Math.round(W * DPR);
    fc.height = Math.round(H * DPR);
    pile = new Float32Array(Math.ceil(W / 4) + 1);
    for (const c of chips) if (c.rest) { c.rest = false; c.vy = 0; }
    layoutTitle();
    drawGuide();
    buildHatch();
    replayAll();
  }

  function render(now, dt) {
    const k = 1 - Math.exp(-dt * 9);
    lamp.x += (lamp.tx - lamp.x) * k;
    lamp.y += (lamp.ty - lamp.y) * k;
    const mk = 1 - Math.exp(-dt * 5);
    for (let i = 0; i < 3; i++) metal[i] += (metalTo[i] - metal[i]) * mk;

    let sx = 0, sy = 0;
    if (shake > 0.05) {
      sx = (Math.random() - 0.5) * shake;
      sy = (Math.random() - 0.5) * shake;
    }
    stage.style.transform = shake > 0.05 ? 'translate(' + sx.toFixed(2) + 'px,' + sy.toFixed(2) + 'px)' : '';

    if (gl) {
      if (dirty) {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, hc);
        dirty = false;
      }
      gl.viewport(0, 0, glc.width, glc.height);
      gl.uniform2f(U.uRes, glc.width, glc.height);
      gl.uniform3f(U.uLamp, lamp.x, lamp.y, lamp.z);
      gl.uniform3f(U.uBase, metal[0], metal[1], metal[2]);
      gl.uniform2f(U.uTex, 1 / hc.width, 1 / hc.height);
      gl.uniform1f(U.uK, 2.3 * HD);
      gl.uniform1f(U.uS, DPR);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    fx.setTransform(DPR, 0, 0, DPR, 0, 0);
    fx.clearRect(0, 0, W, H);
    const la = Math.atan2(lamp.y - H * 0.5, lamp.x - W * 0.5);
    const r = metal[0] * 255, g = metal[1] * 255, b = metal[2] * 255;
    fx.lineCap = 'round';
    const curl = (c, ox, oy) => {
      const ca = Math.cos(c.a), sa = Math.sin(c.a);
      const sq = 0.3 + 0.7 * Math.abs(Math.sin(c.e));
      for (let k = 0; k <= 6; k++) {
        const u = k / 6;
        const t = c.sw * u;
        const rr = c.r * (1 - 0.5 * u);
        const lx = Math.cos(t) * rr, ly = Math.sin(t) * rr * sq;
        const px = c.x + ox + lx * ca - ly * sa, py = c.y + oy + lx * sa + ly * ca;
        if (k) fx.lineTo(px, py);
        else fx.moveTo(px, py);
      }
    };
    fx.lineJoin = 'round';
    fx.strokeStyle = 'rgba(38,24,6,0.3)';
    fx.lineWidth = 1.3;
    fx.beginPath();
    for (const c of chips) curl(c, 1.4, 2.0);
    fx.stroke();
    for (const c of chips) {
      const lit = 0.5 + 0.5 * Math.cos(c.a * 2 - la * 2 + c.e);
      const kk = 0.4 + lit * 0.8;
      const add = lit * lit * lit * 80;
      fx.strokeStyle = 'rgb(' + (Math.min(255, r * kk + add) | 0) + ',' + (Math.min(255, g * kk + add) | 0) + ',' + (Math.min(255, b * kk + add * 0.8) | 0) + ')';
      fx.lineWidth = c.t;
      fx.beginPath();
      curl(c, 0, 0);
      fx.stroke();
    }
    for (let i = glints.length - 1; i >= 0; i--) {
      const gl2 = glints[i];
      gl2.t += dt;
      const f = gl2.t / gl2.dur;
      if (f >= 1) {
        glints.splice(i, 1);
        continue;
      }
      const n = gl2.pts.length / 2;
      const idx = Math.min(n - 1, Math.floor(f * (n - 1)));
      const x = gl2.pts[idx * 2], y = gl2.pts[idx * 2 + 1];
      const a = Math.sin(f * Math.PI) * 0.75;
      const grd = fx.createRadialGradient(x, y, 0, x, y, 10);
      grd.addColorStop(0, 'rgba(255,248,226,' + a.toFixed(3) + ')');
      grd.addColorStop(1, 'rgba(255,248,226,0)');
      fx.fillStyle = grd;
      fx.fillRect(x - 10, y - 10, 20, 20);
    }
    drawCursor(dt);
  }

  function step(ms) {
    clock += ms / 1000;
    const idle = clock - lastUser;
    for (let i = jobs.length - 1; i >= 0; i--) {
      runJob(jobs[i], ms);
      if (jobs[i].done) jobs.splice(i, 1);
    }
    if (!drawing && jobs.length === 0 && idle > 3.2 && clock > 1.6) {
      if (!hatchJob || hatchJob.done) {
        if (hatchJob && hatchJob.done) hatchIdx++;
        hatchJob = nextHatch();
      }
      if (hatchJob) runJob(hatchJob, ms);
    }
    holdStep(ms);
    stepChips();
    shake *= 0.86;

    const usePointer = drawing || (fine && clock - pointer.seen < 2.5 && pointer.x >= 0);
    if (usePointer) {
      lamp.tx = pointer.x + (drawing ? -60 : 0);
      lamp.ty = pointer.y - (drawing ? 80 : 0);
    } else if (tilt && clock - tilt.t < 3) {
      lamp.tx = W / 2 + clamp(tilt.g / 40, -1, 1) * W * 0.7;
      lamp.ty = H / 2 + clamp((tilt.b - 40) / 40, -1, 1) * H * 0.7;
    } else if (clock < 1.5) {
      const f = clamp(clock / 1.4, 0, 1);
      const e = 1 - Math.pow(1 - f, 3);
      lamp.tx = lerp(-W * 0.15, W * 0.62, e);
      lamp.ty = H * 0.3;
    } else if (hatchJob && !hatchJob.done && idle > 3.2) {
      lamp.tx = hatchJob.x + Math.sin(clock * 0.7) * W * 0.08;
      lamp.ty = hatchJob.y - H * 0.18;
    } else {
      lamp.tx = W * (0.5 + 0.3 * Math.sin(clock * 0.21));
      lamp.ty = H * (0.36 + 0.2 * Math.sin(clock * 0.29 + 1.1));
    }
    stepMagnets();
  }

  let last = performance.now();
  let acc = 0;
  let liveT = 0;
  function frame(now) {
    const dtMs = Math.min(100, now - last);
    last = now;
    acc += dtMs;
    let n = 0;
    while (acc >= 1000 / 60 && n < 3) {
      step(1000 / 60);
      acc -= 1000 / 60;
      n++;
    }
    if (n === 3) acc = 0;
    render(now, dtMs / 1000);
    liveT += dtMs;
    if (liveT > 400 && sheet.classList.contains('open')) {
      liveT = 0;
      live.textContent = '지금 이 판: 새긴 선 ' + strokes + '줄 · 홈 길이 ' + Math.round(carvedPx).toLocaleString('ko-KR') + 'px · 깎여 나온 부스러기 ' + chipsMade.toLocaleString('ko-KR') + '개 · 자동 빗금 ' + Math.min(hatchIdx, hatchRuns.length) + '/' + hatchRuns.length + '줄';
    }
    requestAnimationFrame(frame);
  }

  document.querySelectorAll('.metals button').forEach((bt) => {
    bt.addEventListener('click', () => {
      document.querySelectorAll('.metals button').forEach((o) => {
        o.classList.toggle('on', o === bt);
        o.setAttribute('aria-pressed', o === bt ? 'true' : 'false');
      });
      metalTo = METALS[bt.dataset.m];
      haptic(5);
    });
  });
  $('#fresh').addEventListener('click', () => {
    userCuts.length = 0;
    strokes = 0;
    carvedPx = 0;
    hatchIdx = 0;
    glints.length = 0;
    chips.length = 0;
    pile.fill(0);
    lastUser = clock;
    freshPlate(true);
    hint.classList.remove('gone');
  });
  const openBtn = $('#open');
  function setSheet(open) {
    sheet.classList.toggle('open', open);
    sheet.setAttribute('aria-hidden', open ? 'false' : 'true');
    openBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    liveT = 1000;
  }
  openBtn.addEventListener('click', () => setSheet(!sheet.classList.contains('open')));
  $('#close').addEventListener('click', () => setSheet(false));
  addEventListener('keydown', (e) => { if (e.key === 'Escape') setSheet(false); });

  let rt = 0;
  addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => resize(false), 200);
  });

  function start() {
    const ok = initGL();
    resize(true);
    if (!ok) fallback();
    freshPlate(true);
    lamp.x = -W * 0.15;
    lamp.y = H * 0.3;
    lastUser = -1e9;
    requestAnimationFrame((t) => {
      last = t;
      requestAnimationFrame(frame);
    });
  }

  const fontReady = document.fonts && document.fonts.load ? Promise.race([
    Promise.all([document.fonts.load(fontStr(800, 100), '감사패'), document.fonts.load(fontStr(600, 15), '귀하께서는')]),
    new Promise((r) => setTimeout(r, 1500))
  ]) : Promise.resolve();
  let started = false;
  const go = () => { if (started) return; started = true; start(); if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (hatchIdx === 0 && !hatchJob) { drawGuide(); buildHatch(); } }); };
  fontReady.then(go, go);
})();
