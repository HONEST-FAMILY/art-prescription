(() => {
  const NAVY = '#00277e';
  const CREAM = '#fffdf6';
  const COLORS = ['#0084ff', '#ee0093', '#06bf00', '#ffb000', '#6d00cb'];
  const INK = { '#0084ff': '#ffffff', '#ee0093': '#ffffff', '#06bf00': NAVY, '#ffb000': NAVY, '#6d00cb': '#ffffff' };
  const EXTRA = ['교육', '체험', '상담', '이벤트', '커뮤니티', '건강', '문화', '여가', '취미'];
  const FONT = '"Pretendard Variable", Pretendard, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const STEP = 1 / 60;
  const G = 1500;
  const HOLD = 650;
  const TAU = Math.PI * 2;
  const DROOP = 0.07;

  const stage = document.getElementById('stage');
  const ctx = stage.getContext('2d');
  const sh = document.createElement('canvas');
  const sctx = sh.getContext('2d');
  const header = document.querySelector('header');
  const footer = document.querySelector('footer');
  const levelEl = document.getElementById('level');
  const levelBar = document.getElementById('levelBar');
  const countEl = document.getElementById('count');
  const toastEl = document.getElementById('toast');
  const btn = document.getElementById('rxBtn');
  const btnIn = btn.querySelector('span');
  const wrap = document.getElementById('wrap');
  const back = document.getElementById('back');
  const closeBtn = document.getElementById('close');
  const cur = document.getElementById('cur');
  const ring = document.getElementById('ring');
  const ringO = ring.querySelector('.o');
  const ringB = ring.querySelector('b');
  if (fine) document.documentElement.classList.add('fine');

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  const easeOutBack = t => { const c1 = 1.6, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ch = s => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  }

  let uid = 0;
  const discs = [];
  const bars = [];
  const nodes = [];
  function base(kind) {
    return { id: uid++, kind, th: 0, thV: 0, ps: 0, psV: 0, M: 0, Mp: 0, parent: null, side: 0, ax: 0, pax: null, pvx: 0, nph: Math.random() * TAU, A: { x: 0, y: 0, z: 0 } };
  }
  function mkDisc(label, color, r, wire) {
    const n = base('disc');
    Object.assign(n, { label, color, back: mix(color, NAVY, 0.32), edge: mix(color, NAVY, 0.55), ink: INK[color], r, wire0: wire, wire, grow: reduce ? 1 : 0, mgrow: 1, added: false, born: 0, flash: 0, T: { x: 0, y: 0, z: 0 }, C: { x: 0, y: 0, z: 0 }, sx: -9999, sy: -9999, sr: 0, order: discs.length });
    discs.push(n); nodes.push(n);
    return n;
  }
  function mkBar(L, wire, left, right, added) {
    const n = base('bar');
    Object.assign(n, { L0: L, L, wire0: wire, wire, left, right, added: !!added, s: 0.5, tau: 0, tauV: 0, P: { x: 0, y: 0, z: 0 }, E0: { x: 0, y: 0, z: 0 }, E1: { x: 0, y: 0, z: 0 } });
    left.parent = n; left.side = -1; right.parent = n; right.side = 1;
    bars.push(n); nodes.push(n);
    return n;
  }

  const dEun = mkDisc('은평', COLORS[0], 50, 70);
  const dYdp = mkDisc('영등포', COLORS[1], 40, 120);
  const dGd = mkDisc('강동', COLORS[2], 44, 95);
  const dDb = mkDisc('도봉', COLORS[3], 34, 60);
  const dDdm = mkDisc('동대문', COLORS[4], 38, 100);
  const bA = mkBar(170, 60, dEun, dYdp);
  const bC = mkBar(150, 90, dDb, dDdm);
  const bB = mkBar(200, 150, dGd, bC);
  const root = mkBar(300, 50, bA, bB);
  const HOOK = { x: 0, y: 0, z: 0 };

  const grab = { node: null, pull: 0, sx: 1 };
  const ptr = { x: -9999, y: -9999, vx: 0, vy: 0, lx: 0, ly: 0, lt: 0, down: false, t0: 0, x0: 0, y0: 0, moved: false, holdDone: false, lastMove: -1e9, over: true, type: 'mouse', seen: false };
  const ripples = [];
  const trail = [];
  let sheetOpen = false;
  let W = 0, H = 0, DPR = 1, variant = '', kx = 1, ky = 1;
  let scale = 1, ox = 0, oy = 0, tScale = 1, tox = 0, toy = 0;
  let dropPx = 0, introStart = null, arrived = reduce, addedCount = 0, simT = 0;

  function mass(n) {
    if (n.kind === 'disc') { n.M = n.r * n.r * n.mgrow; n.Mp = n.M + (grab.node === n ? grab.pull : 0); return; }
    mass(n.left); mass(n.right);
    const mb = n.L * 2;
    n.M = n.left.M + n.right.M + mb;
    n.Mp = n.left.Mp + n.right.Mp + mb;
  }
  function sStar(n) { const mb = n.L * 2; return (n.right.M + 0.5 * mb) / (n.left.M + n.right.M + mb); }
  function fullMass(n) { return n.kind === 'disc' ? n.r * n.r : fullMass(n.left) + fullMass(n.right) + n.L * 2; }
  function fullS(n) { const mb = n.L * 2, l = fullMass(n.left), r = fullMass(n.right); return (r + 0.5 * mb) / (l + r + mb); }

  function applyVariant() {
    for (const b of bars) { b.L = b.L0 * (b.added ? Math.max(1, kx) : kx); b.wire = b.wire0 * ky; }
    for (const d of discs) d.wire = d.wire0 * ky;
  }

  function restBox() {
    const box = { x0: 1e9, x1: -1e9, y0: 0, y1: -1e9 };
    (function walk(n, ax, ay) {
      if (n.kind === 'disc') {
        const cy = ay + n.wire + n.r;
        box.x0 = Math.min(box.x0, ax - n.r); box.x1 = Math.max(box.x1, ax + n.r); box.y1 = Math.max(box.y1, cy + n.r);
        return;
      }
      const py = ay + n.wire, s = fullS(n);
      box.x0 = Math.min(box.x0, ax - s * n.L); box.x1 = Math.max(box.x1, ax + (1 - s) * n.L);
      walk(n.left, ax - s * n.L, py + DROOP * s * n.L); walk(n.right, ax + (1 - s) * n.L, py + DROOP * (1 - s) * n.L);
    })(root, 0, 0);
    return box;
  }

  function fit(instant) {
    const hb = header.getBoundingClientRect().bottom;
    const ft = footer.getBoundingClientRect().top;
    const top = hb + 16, bottom = ft - 12;
    const avH = Math.max(160, bottom - top);
    const avW = W - (W < 640 ? 24 : 140);
    const b = restBox();
    const bw = b.x1 - b.x0, bh = b.y1 - b.y0;
    tScale = Math.min(avW / bw, avH / bh);
    tox = W / 2 - ((b.x0 + b.x1) / 2) * tScale;
    toy = top + Math.max(0, (avH - bh * tScale) * 0.42);
    if (instant) { scale = tScale; ox = tox; oy = toy; }
  }

  let resizeT = 0;
  function resize(first) {
    W = innerWidth; H = innerHeight; DPR = Math.min(2, devicePixelRatio || 1);
    stage.width = Math.round(W * DPR); stage.height = Math.round(H * DPR);
    stage.style.width = W + 'px'; stage.style.height = H + 'px';
    sh.width = Math.max(1, Math.ceil(W / 4)); sh.height = Math.max(1, Math.ceil(H / 4));
    const v = W / H < 0.9 ? 'p' : 'l';
    if (v !== variant) {
      variant = v; kx = v === 'p' ? 0.6 : 1.3; ky = v === 'p' ? 1.35 : 1.0;
      applyVariant(); mass(root);
      for (const b of bars) b.s = sStar(b);
      for (const n of nodes) n.pax = null;
    }
    fit(first);
  }
  addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => resize(false), 200); });

  function toV(x, y) { return { x: (x - ox) / scale, y: (y - oy - dropPx) / scale }; }
  function P(p, shadow) {
    const k = 1 + p.z / 1800;
    let x = ox + p.x * k * scale, y = oy + dropPx + p.y * k * scale;
    if (shadow) { const d = (p.z + 170) * scale; x += d * 0.075; y += d * 0.12; }
    return [x, y, k];
  }

  function fk(n, A) {
    n.A.x = A.x; n.A.y = A.y; n.A.z = A.z;
    const sx = Math.sin(n.th), cy = Math.cos(n.th);
    if (n.kind === 'disc') {
      n.T.x = A.x + n.wire * sx; n.T.y = A.y + n.wire * cy; n.T.z = A.z;
      const rr = n.r * Math.max(0.001, n.grow);
      n.C.x = n.T.x + rr * sx; n.C.y = n.T.y + rr * cy; n.C.z = n.T.z;
      return;
    }
    const p = n.P;
    p.x = A.x + n.wire * sx; p.y = A.y + n.wire * cy; p.z = A.z;
    const ct = Math.cos(n.tau), st = Math.sin(n.tau), cp = Math.cos(n.ps), sp = Math.sin(n.ps);
    const dx = ct * cp, dy = st, dz = ct * sp;
    const l0 = n.s * n.L, l1 = (1 - n.s) * n.L;
    n.E0.x = p.x - l0 * dx; n.E0.y = p.y - l0 * dy + DROOP * l0; n.E0.z = p.z - l0 * dz;
    n.E1.x = p.x + l1 * dx; n.E1.y = p.y + l1 * dy + DROOP * l1; n.E1.z = p.z + l1 * dz;
    fk(n.left, n.E0); fk(n.right, n.E1);
  }

  function poke(n, sx) {
    n.psV += sx * 7.5; n.thV += sx * 0.7; n.flash = 1;
    let p = n.parent, side = n.side, f = 1;
    while (p) { p.tauV += side * 1.5 * f; p.psV += sx * 1.0 * f; p.thV += sx * 0.25 * f; side = p.side; p = p.parent; f *= 0.5; }
  }
  function puff(v) {
    const R = (fine ? 280 : 240) / scale, sig = R * 0.5;
    for (const d of discs) {
      const dx = d.C.x - v.x, dy = d.C.y - v.y, dist = Math.hypot(dx, dy) || 1;
      const w = Math.exp(-(dist * dist) / (2 * sig * sig));
      if (w < 0.02) continue;
      d.thV += (dx / dist) * w * 1.4; d.psV += (dx >= 0 ? 1 : -1) * w * 3.2;
      if (d.parent) { d.parent.tauV += d.side * w * 0.5; d.parent.psV += (dx >= 0 ? 1 : -1) * w * 0.6; }
    }
  }

  function addDisc(px, py) {
    if (addedCount >= EXTRA.length) { toast('더 매달 자리가 없어요 — 톡 건드려 보세요'); return; }
    const v = toV(px, py);
    let best = null, bd = Infinity;
    for (const d of discs) { const dd = (d.C.x - v.x) ** 2 + (d.C.y - v.y) ** 2; if (dd < bd) { bd = dd; best = d; } }
    if (!best) return;
    const parent = best.parent, side = best.side;
    const r = 30 + (addedCount % 3) * 3;
    let color = COLORS[0], far = -1;
    for (const c of COLORS) {
      let m = Infinity;
      for (const d of discs) if (d.color === c) m = Math.min(m, Math.hypot(d.C.x - best.C.x, d.C.y - best.C.y));
      if (c !== best.color && m > far) { far = m; color = c; }
    }
    const label = EXTRA[addedCount];
    const L0 = (best.r + r) * 1.2 + 18;
    const Lx = L0 * Math.max(1, kx);
    let room = [0, 0];
    [-1, 1].forEach((s, i) => {
      const cx = best.C.x + s * Lx * 0.6, cy = best.C.y;
      let m = Infinity;
      for (const d of discs) if (d !== best) m = Math.min(m, Math.hypot(d.C.x - cx, d.C.y - cy) - d.r);
      const b = restBox();
      m = Math.min(m, (s < 0 ? cx - b.x0 : b.x1 - cx) + 60);
      room[i] = m;
    });
    const dir = room[1] >= room[0] ? 1 : -1;
    const oldW = best.wire0;
    best.wire0 = 24 + best.r * 0.25;
    const nd = mkDisc(label, color, r, best.wire0 + (best.r - r) + 14);
    nd.added = true; nd.mgrow = 0; nd.grow = 0; nd.born = performance.now();
    const nb = dir > 0 ? mkBar(L0, Math.max(18, oldW - best.wire0), best, nd, true) : mkBar(L0, Math.max(18, oldW - best.wire0), nd, best, true);
    if (side < 0) parent.left = nb; else parent.right = nb;
    nb.parent = parent; nb.side = side;
    nb.th = best.th; nb.thV = best.thV; best.th = 0; best.thV = 0;
    nb.L = nb.L0 * Math.max(1, kx); nb.wire = nb.wire0 * ky; best.wire = best.wire0 * ky; nd.wire = nd.wire0 * ky;
    mass(root); nb.s = sStar(nb);
    nb.pax = null; best.pax = null; nd.pax = null;
    addedCount++;
    toast(`‘${label}’ 원판이 매달렸어요 — 수평을 다시 찾는 중`);
    ripples.push({ x: px, y: py, t: performance.now(), big: true });
    fit(false);
  }

  let toastT = 0;
  function toast(msg) {
    toastEl.textContent = msg; toastEl.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), 2300);
  }

  function hitDisc(x, y) {
    let best = null, bs = Infinity;
    const pad = ptr.type === 'mouse' ? 12 : 26;
    for (const d of discs) {
      if (d.grow < 0.3) continue;
      const lim = d.sr + pad, dist = Math.hypot(x - d.sx, y - d.sy);
      if (dist < lim) { const sc = dist / lim - d.C.z * 0.0004; if (sc < bs) { bs = sc; best = d; } }
    }
    return best;
  }

  const mag = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };

  function step(dt, now) {
    simT += dt;
    for (const d of discs) {
      d.flash *= Math.exp(-dt * 3.5);
      if (d.added) { const e = (now - d.born) / 650; d.grow = easeOutBack(clamp(e, 0, 1)); d.mgrow = clamp(e * 1.15, 0, 1); }
    }
    mass(root);
    for (const b of bars) {
      const ss = sStar(b);
      b.s += (ss - b.s) * (1 - Math.exp(-dt * 2.0));
      const mb = b.L * 2;
      const net = (b.right.Mp * (1 - b.s) - b.left.Mp * b.s + mb * (0.5 - b.s)) * b.L;
      const eq = Math.asin(clamp(net / (b.Mp * 70), -0.55, 0.55));
      b.tauV += (-22 * (b.tau - eq) - 1.1 * b.tauV) * dt;
      b.tau = clamp(b.tau + b.tauV * dt, -0.9, 0.9);
    }
    if (!reduce && arrived) {
      for (const n of nodes) {
        n.psV += (Math.sin(simT * 0.37 + n.nph) * 0.6 + Math.sin(simT * 0.83 + n.nph * 2.3) * 0.4) * (n.kind === 'bar' ? 0.5 : 0.26) * dt;
        n.thV += Math.sin(simT * 0.29 + n.nph * 1.7) * 0.12 * dt;
      }
    }
    const windOn = !grab.node && !sheetOpen && ptr.over && now - ptr.lastMove < 70 && (ptr.down || ptr.type === 'mouse');
    if (windOn) {
      const sp = Math.hypot(ptr.vx, ptr.vy);
      const strong = 1 + smooth(1400, 3600, sp) * 1.6;
      const sig = (ptr.type === 'mouse' ? 95 : 115) / scale;
      const v = toV(ptr.x, ptr.y);
      const vxv = ptr.vx / scale, vyv = ptr.vy / scale;
      for (const d of discs) {
        const dx = v.x - d.C.x, dy = v.y - d.C.y;
        const w = Math.exp(-(dx * dx + dy * dy) / (2 * sig * sig));
        if (w < 0.01) continue;
        const len = d.wire + d.r;
        d.thV += w * (vxv / len) * 1.2 * strong * dt;
        const cross = (dx * vyv - dy * vxv) / Math.max(20, d.r);
        d.psV += clamp(w * cross * 0.012 * strong, -30, 30) * dt;
        if (d.parent) { d.parent.tauV += w * d.side * vyv * 0.003 * strong * dt; d.parent.psV += w * vxv * 0.0025 * strong * dt; }
      }
    }
    if (grab.node) {
      const n = grab.node, v = toV(ptr.x, ptr.y);
      const dx = v.x - n.A.x, dy = v.y - n.A.y;
      const thd = clamp(Math.atan2(dx, Math.max(8, dy)), -1.05, 1.05);
      n.thV += (110 * (thd - n.th) - 14 * n.thV) * dt;
      const len = Math.hypot(dx, dy), rest = n.wire + n.r;
      grab.pull = ptr.moved ? clamp((len - rest) / rest, 0, 1.6) * n.r * n.r * 2.2 : 0;
      n.psV += clamp(ptr.vx / scale, -3000, 3000) * 0.01 * dt;
    }
    for (const n of nodes) {
      const len = n.kind === 'disc' ? n.wire + n.r : n.wire + 70;
      let a = -(G / len) * Math.sin(n.th) - 0.55 * n.thV - 0.6 * (n.ax / len) * Math.cos(n.th);
      if (n !== grab.node && Math.abs(n.th) > 0.8) a -= 60 * (Math.abs(n.th) - 0.8) * Math.sign(n.th);
      n.thV += a * dt; n.th += n.thV * dt;
      const rest = n.parent ? n.parent.ps * 0.35 : 0;
      const ya = -1.6 * Math.sin(n.ps - rest) - 0.32 * n.psV - 0.05 * n.psV * Math.abs(n.psV);
      n.psV += ya * dt; n.ps += n.psV * dt;
    }
    fk(root, HOOK);
    for (const d of discs) {
      if (d === grab.node) continue;
      const k = 1 + d.C.z / 1800, X = ox + d.C.x * k * scale, R = d.r * d.grow * scale * k, len = d.wire + d.r;
      const o = X - R < 8 ? (8 - (X - R)) / scale : X + R > W - 8 ? -((X + R) - (W - 8)) / scale : 0;
      if (o !== 0) { d.thV += (o / len) * 90 * dt; d.thV *= 0.97; d.psV *= 0.99; }
    }
    for (const n of nodes) {
      if (n.pax === null) { n.pax = n.A.x; n.pvx = 0; n.ax = 0; continue; }
      const vx = (n.A.x - n.pax) / dt;
      n.ax = clamp((vx - n.pvx) / dt, -8000, 8000); n.pvx = vx; n.pax = n.A.x;
    }
    mag.vx = (mag.vx + (mag.tx - mag.x) * 0.16) * 0.74; mag.x += mag.vx;
    mag.vy = (mag.vy + (mag.ty - mag.y) * 0.16) * 0.74; mag.y += mag.vy;
  }

  function line(c, a, b) { c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); }
  function dot(c, a, r) { c.beginPath(); c.arc(a[0], a[1], r, 0, TAU); c.fill(); }

  function barDraw(c, b, shadow) {
    const a = P(b.A, shadow), p = P(b.P, shadow), e0 = P(b.E0, shadow), e1 = P(b.E1, shadow);
    c.strokeStyle = NAVY; c.lineCap = 'round';
    c.lineWidth = shadow ? 2.4 : 1.4; line(c, a, p);
    c.lineWidth = shadow ? 5 : Math.max(2.4, 3.2 * scale * 0.7);
    c.beginPath(); c.moveTo(e0[0], e0[1]); c.quadraticCurveTo(2 * p[0] - 0.5 * (e0[0] + e1[0]), 2 * p[1] - 0.5 * (e0[1] + e1[1]), e1[0], e1[1]); c.stroke();
    if (!shadow) {
      c.lineWidth = 1.4; c.strokeStyle = NAVY; c.fillStyle = CREAM;
      for (const e of [e0, e1]) { c.beginPath(); c.arc(e[0], e[1], Math.max(2.6, 3.2 * scale * 0.6), 0, TAU); c.fill(); c.stroke(); }
      c.fillStyle = NAVY; dot(c, p, Math.max(3.2, 4 * scale * 0.6)); c.fillStyle = CREAM; dot(c, p, 1.5);
    }
  }
  function discDraw(c, d, shadow) {
    const a = P(d.A, shadow), t = P(d.T, shadow), p = P(d.C, shadow);
    c.strokeStyle = NAVY; c.lineCap = 'round'; c.lineWidth = shadow ? 2.4 : 1.4; line(c, a, t);
    const R = d.r * d.grow * scale * p[2];
    if (!shadow) { d.sx = p[0]; d.sy = p[1]; d.sr = d.r * scale * p[2]; }
    if (R < 0.5) return;
    const cp = Math.cos(d.ps), sp = Math.sin(d.ps);
    const rx = Math.max(1.4, Math.abs(cp) * R);
    c.save(); c.translate(p[0], p[1]); c.rotate(-d.th);
    if (shadow) { c.fillStyle = NAVY; c.beginPath(); c.ellipse(0, 0, Math.max(2, rx), R, 0, 0, TAU); c.fill(); c.restore(); return; }
    const th = Math.max(1.2, R * 0.075) * sp;
    c.fillStyle = d.edge; c.beginPath(); c.ellipse(th, 0, rx, R, 0, 0, TAU); c.fill();
    c.fillStyle = cp >= 0 ? d.color : d.back; c.beginPath(); c.ellipse(0, 0, rx, R, 0, 0, TAU); c.fill();
    if (d.flash > 0.02) { c.strokeStyle = `rgba(255,255,255,${(d.flash * 0.85).toFixed(3)})`; c.lineWidth = 3; c.beginPath(); c.ellipse(0, 0, rx * 0.8, R * 0.8, 0, 0, TAU); c.stroke(); }
    if (cp > 0.3) {
      const n = [...d.label].length;
      const fs = R * (n <= 2 ? 0.6 : n === 3 ? 0.48 : 0.37);
      c.globalAlpha = smooth(0.3, 0.72, cp);
      c.scale(cp, 1); c.fillStyle = d.ink; c.font = `700 ${fs.toFixed(1)}px ${FONT}`;
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(d.label, 0, fs * 0.05);
      c.globalAlpha = 1;
    }
    c.restore();
  }

  function render(now) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = CREAM; ctx.fillRect(0, 0, W, H);
    const items = [];
    for (const b of bars) items.push([b.P.z, 0, b]);
    for (const d of discs) items.push([d.C.z, 1, d]);
    items.sort((a, b) => a[0] - b[0]);
    const hk = P(HOOK, false), hs = P(HOOK, true);
    sctx.setTransform(1, 0, 0, 1, 0, 0); sctx.clearRect(0, 0, sh.width, sh.height);
    sctx.setTransform(0.25, 0, 0, 0.25, 0, 0);
    sctx.strokeStyle = NAVY; sctx.lineWidth = 2.4; line(sctx, [hs[0], 0], hs);
    for (const [, t, n] of items) t ? discDraw(sctx, n, true) : barDraw(sctx, n, true);
    ctx.save(); ctx.globalAlpha = 0.11; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(sh, 0, 0, W, H); ctx.restore();
    ctx.strokeStyle = NAVY; ctx.lineWidth = 1.4; ctx.lineCap = 'round'; line(ctx, [hk[0], 0], hk);
    ctx.fillStyle = NAVY; dot(ctx, hk, 3.6);
    for (const [, t, n] of items) t ? discDraw(ctx, n, false) : barDraw(ctx, n, false);
    if (grab.node && ptr.moved) {
      const d = grab.node;
      ctx.save(); ctx.setLineDash([5, 7]); ctx.strokeStyle = 'rgba(0,39,126,.45)'; ctx.lineWidth = 1.6;
      line(ctx, [d.sx, d.sy], [ptr.x, ptr.y]); ctx.restore();
      ctx.fillStyle = NAVY; dot(ctx, [ptr.x, ptr.y], 4);
    }
    for (let i = trail.length - 1; i >= 0; i--) if (now - trail[i].t > 450) trail.splice(i, 1);
    if (trail.length > 1) {
      ctx.lineCap = 'round';
      for (let i = 1; i < trail.length; i++) {
        const a = trail[i - 1], b = trail[i], age = (now - b.t) / 450;
        if (b.t - a.t > 80) continue;
        ctx.strokeStyle = `rgba(0,39,126,${((1 - age) * 0.2 * clamp(b.s / 2200, 0.35, 1)).toFixed(3)})`;
        ctx.lineWidth = 1.5 + clamp(b.s / 1200, 0, 3.5);
        line(ctx, [a.x, a.y], [b.x, b.y]);
      }
    }
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i], e = (now - r.t) / (r.big ? 900 : 620);
      if (e >= 1) { ripples.splice(i, 1); continue; }
      const k = easeOutCubic(e);
      ctx.strokeStyle = `rgba(0,39,126,${((1 - e) * 0.38).toFixed(3)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(r.x, r.y, 12 + k * (r.big ? 110 : 64), 0, TAU); ctx.stroke();
    }
    if (ptr.down && !ptr.moved && !ptr.holdDone && !sheetOpen) {
      const e = (now - ptr.t0) / HOLD;
      if (e > 0.18) {
        const rr = ptr.type === 'mouse' ? 30 : 44;
        ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(0,39,126,.14)'; ctx.beginPath(); ctx.arc(ptr.x, ptr.y, rr, 0, TAU); ctx.stroke();
        ctx.strokeStyle = NAVY; ctx.beginPath(); ctx.arc(ptr.x, ptr.y, rr, -Math.PI / 2, -Math.PI / 2 + TAU * smooth(0.18, 1, e)); ctx.stroke();
      }
    }
  }

  let readT = 0, lastLevel = -1, lastCount = -1;
  function readout(now) {
    if (now - readT < 180) return;
    readT = now;
    let m = 0;
    for (const b of bars) m = Math.max(m, Math.abs(b.tau));
    const lvl = Math.round(clamp(100 - (m * 180 / Math.PI) * 3.2, 0, 100));
    if (lvl !== lastLevel) { lastLevel = lvl; levelEl.textContent = `수평 ${lvl}%`; levelBar.style.transform = `scaleX(${(lvl / 100).toFixed(3)})`; }
    if (discs.length !== lastCount) { lastCount = discs.length; countEl.textContent = `원판 ${discs.length}개`; }
  }

  const ringPos = { x: -100, y: -100 };
  function cursor(dt) {
    if (!fine) return;
    const show = ptr.seen && ptr.over && !sheetOpen;
    cur.classList.toggle('on', show); ring.classList.toggle('on', show);
    const k = 1 - Math.exp(-dt * 15);
    ringPos.x += (ptr.x - ringPos.x) * k; ringPos.y += (ptr.y - ringPos.y) * k;
    cur.style.transform = `translate(${ptr.x}px,${ptr.y}px)`;
    ring.style.transform = `translate(${ringPos.x}px,${ringPos.y}px)`;
    const sp = Math.hypot(ptr.vx, ptr.vy), ang = Math.atan2(ptr.vy, ptr.vx), st = 1 + Math.min(0.55, sp / 3200);
    ringO.style.transform = `rotate(${ang}rad) scale(${st},${1 / st})`;
    let label = '입김';
    if (grab.node && ptr.moved) label = '당기는 중';
    else if (ptr.down && !ptr.moved && !ptr.holdDone && performance.now() - ptr.t0 > HOLD * 0.18) label = '길게 — 원판 추가';
    else if (hitDisc(ptr.x, ptr.y)) label = '톡 · 끌기';
    if (ringB.textContent !== label) ringB.textContent = label;
  }

  function onDown(e) {
    if (sheetOpen) return;
    ptr.type = e.pointerType || 'mouse';
    ptr.down = true; ptr.t0 = performance.now(); ptr.x0 = ptr.x = ptr.lx = e.clientX; ptr.y0 = ptr.y = ptr.ly = e.clientY;
    ptr.lt = ptr.t0; ptr.moved = false; ptr.holdDone = false; ptr.vx = 0; ptr.vy = 0; ptr.over = true; ptr.seen = true;
    try { stage.setPointerCapture(e.pointerId); } catch (_) { }
    const d = hitDisc(e.clientX, e.clientY);
    grab.node = d; grab.pull = 0; grab.sx = d ? (e.clientX >= d.sx ? 1 : -1) : 1;
    if (d) e.preventDefault();
  }
  function onMove(e) {
    const now = performance.now();
    if (!ptr.down) ptr.type = e.pointerType || 'mouse';
    const dtm = Math.max(4, now - ptr.lt) / 1000;
    const nvx = clamp((e.clientX - ptr.lx) / dtm, -9000, 9000), nvy = clamp((e.clientY - ptr.ly) / dtm, -9000, 9000);
    ptr.vx += (nvx - ptr.vx) * 0.5; ptr.vy += (nvy - ptr.vy) * 0.5;
    ptr.x = ptr.lx = e.clientX; ptr.y = ptr.ly = e.clientY; ptr.lt = now; ptr.lastMove = now; ptr.seen = true;
    const t = e.target;
    ptr.over = ptr.down || !(t && t.closest && t.closest('button, .sheet, .tag'));
    if (ptr.down && !ptr.moved && Math.hypot(ptr.x - ptr.x0, ptr.y - ptr.y0) > 12) ptr.moved = true;
    const sp = Math.hypot(ptr.vx, ptr.vy);
    if (!grab.node && !sheetOpen && ptr.over && (ptr.down || ptr.type === 'mouse') && sp > (ptr.type === 'mouse' ? 650 : 380)) { trail.push({ x: ptr.x, y: ptr.y, t: now, s: sp }); if (trail.length > 60) trail.shift(); }
    if (fine && ptr.type === 'mouse') {
      const r = btn.getBoundingClientRect();
      const cx = r.left + r.width / 2 - mag.x, cy = r.top + r.height / 2 - mag.y;
      const dx = e.clientX - cx, dy = e.clientY - cy;
      const rad = Math.max(r.width, r.height) / 2 + 56;
      if (Math.hypot(dx, dy) < rad && !sheetOpen) { mag.tx = dx * 0.32; mag.ty = dy * 0.32; } else { mag.tx = 0; mag.ty = 0; }
    }
  }
  function onUp(e, cancel) {
    if (!ptr.down) return;
    ptr.down = false;
    const now = performance.now();
    const quick = !cancel && now - ptr.t0 < 340 && !ptr.moved && !ptr.holdDone;
    if (quick) {
      if (grab.node) poke(grab.node, grab.sx); else puff(toV(ptr.x, ptr.y));
      ripples.push({ x: ptr.x, y: ptr.y, t: now });
    }
    grab.node = null; grab.pull = 0;
    try { stage.releasePointerCapture(e.pointerId); } catch (_) { }
  }
  stage.addEventListener('pointerdown', onDown);
  addEventListener('pointermove', onMove, { passive: true });
  addEventListener('pointerup', e => onUp(e, false));
  addEventListener('pointercancel', e => onUp(e, true));
  document.addEventListener('pointerleave', () => { ptr.seen = false; });
  stage.addEventListener('contextmenu', e => e.preventDefault());

  function openSheet() {
    sheetOpen = true; wrap.classList.add('open'); btn.setAttribute('aria-expanded', 'true');
    grab.node = null; ptr.down = false;
    setTimeout(() => closeBtn.focus({ preventScroll: true }), 80);
  }
  function closeSheet() {
    sheetOpen = false; wrap.classList.remove('open'); btn.setAttribute('aria-expanded', 'false');
    btn.focus({ preventScroll: true });
  }
  btn.addEventListener('click', openSheet);
  closeBtn.addEventListener('click', closeSheet);
  back.addEventListener('click', closeSheet);
  addEventListener('keydown', e => { if (e.key === 'Escape' && sheetOpen) closeSheet(); });

  function split(el, base, gap) {
    const text = el.textContent.trim();
    el.setAttribute('aria-label', text);
    el.textContent = '';
    let i = 0;
    text.split(' ').forEach((w, wi, arr) => {
      const ws = document.createElement('span'); ws.className = 'w'; ws.setAttribute('aria-hidden', 'true');
      for (const ch of w) { const c = document.createElement('span'); c.className = 'c'; c.textContent = ch; c.style.transitionDelay = (base + i++ * gap) + 'ms'; ws.appendChild(c); }
      el.appendChild(ws);
      if (wi < arr.length - 1) el.appendChild(document.createTextNode(' '));
    });
  }
  const rxLine = document.getElementById('rxLine'), rxSub = document.getElementById('rxSub');
  split(rxLine, 250, 26); split(rxSub, 700, 12);
  let revealed = false;
  function reveal() { if (revealed) return; revealed = true; requestAnimationFrame(() => { rxLine.classList.add('in'); rxSub.classList.add('in'); }); }
  if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load(`700 20px ${FONT}`), document.fonts.load(`800 24px ${FONT}`)]).then(() => { reveal(); fit(false); }, reveal);
  }
  setTimeout(reveal, 700);

  let introGo = reduce;
  const go = () => { introGo = true; };
  addEventListener('load', go);
  if (document.readyState === 'complete') go();
  setTimeout(go, 1200);
  function intro(now) {
    if (!introGo) { dropPx = -H * 0.75; return; }
    if (introStart === null) introStart = now;
    const t = (now - introStart) / 1000;
    if (reduce) { dropPx = 0; return; }
    dropPx = -(1 - easeOutCubic(clamp(t / 1.25, 0, 1))) * (H * 0.75);
    for (const d of discs) if (!d.added) d.grow = easeOutBack(clamp((t - 0.25 - d.order * 0.09) / 0.55, 0, 1));
    if (!arrived && t >= 1.25) {
      arrived = true;
      for (const b of bars) b.tauV += (b.side || 1) * 0.35;
      for (const d of discs) { d.thV += (d.side || 1) * 0.25; d.psV += (d.order % 2 ? 1 : -1) * 0.8; }
    }
  }

  resize(true);
  mass(root);
  for (const b of bars) b.s = sStar(b);
  fk(root, HOOK);
  let last = performance.now(), acc = 0;
  function frame(now) {
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.25) dt = 0.25;
    if (dt < 0) dt = 0;
    intro(now);
    if (ptr.down && !ptr.moved && !ptr.holdDone && !sheetOpen && now - ptr.t0 >= HOLD) {
      ptr.holdDone = true; grab.node = null; grab.pull = 0; addDisc(ptr.x, ptr.y);
    }
    if (now - ptr.lastMove > 90) { ptr.vx *= 0.8; ptr.vy *= 0.8; }
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 3) { step(STEP, now); acc -= STEP; n++; }
    if (n === 3) acc = 0;
    const k = 1 - Math.exp(-dt * 2.4);
    scale += (tScale - scale) * k; ox += (tox - ox) * k; oy += (toy - oy) * k;
    render(now);
    readout(now);
    cursor(dt);
    btn.style.transform = `translate(${mag.x.toFixed(2)}px,${mag.y.toFixed(2)}px)`;
    btnIn.style.transform = `translate(${(mag.x * 0.4).toFixed(2)}px,${(mag.y * 0.4).toFixed(2)}px)`;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
