(function () {
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function host(url) {
    try { return new URL(url).host.replace(/^www\./, ''); } catch (e) { return url; }
  }

  function getJSON(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    });
  }, { rootMargin: '0px 0px -10% 0px' });

  var hero = document.querySelector('.hero');
  requestAnimationFrame(function () { hero.classList.add('is-in'); });
  if (reduced) hero.classList.add('is-in');

  var GESTURES = [
    ['돌리기', /돌리|돌릴|회전/],
    ['누르기', /누르|누른|눌러/],
    ['문지르기', /문지르|문지른/],
    ['끌기·당기기', /끌면|당기|잡아|빗으/],
    ['스치기·불기', /입김|지나가|손끝|따라|손 위치/],
    ['두드리기', /두드리|쓸면/],
    ['붓기·기울이기', /떨어뜨|기울이|쏟아/]
  ];

  function gestureOf(text) {
    var out = [];
    GESTURES.forEach(function (g) { if (g[1].test(text)) out.push(g[0]); });
    return out;
  }

  function caseHTML(c, rx, i) {
    var ch = rx.chosen || {};
    var shot = c.url
      ? '<a class="shot" href="' + esc(c.url) + '"' + (/^https?:/.test(c.url) ? ' target="_blank" rel="noopener"' : '') + '><img src="' + esc(c.thumb) + '" alt="' + esc(rx.company) + ' 시제품 화면" loading="lazy"><span class="go">시제품 열기 →</span></a>'
      : '<div class="shot rx-only"><span>처방만 — 시제품은 아직 만들지 않음</span><b>' + esc(ch.art || '') + '</b><span>' + esc(ch.gesture || '') + '</span></div>';
    var mats = (rx.materials || []).map(function (m) {
      return '<li><em>' + esc(m.kind) + '</em><div>' + esc(m.text) + (m.source ? '<q>' + esc(m.source) + '</q>' : '') + '</div></li>';
    }).join('');
    var cands = (rx.candidates || []).map(function (k) {
      var pick = ch.art && (k.art === ch.art || ch.art.indexOf(k.art) === 0 || k.art.indexOf(ch.art) === 0);
      return '<li class="' + (pick ? 'is-pick' : '') + '"><i></i><div><b>' + esc(k.art) + '</b>' + (k.artist_year ? ' · ' + esc(k.artist_year) : '') + '<small>' + esc(k.gesture ? k.gesture + ' — ' : '') + esc(k.why) + '</small></div></li>';
    }).join('');
    return '<article class="case">' + shot +
      '<div><p class="no">처방 ' + String(i + 1).padStart(2, '0') + ' · ' + esc(rx.industry || '') + '</p>' +
      '<h3>' + esc(rx.company) + '</h3>' +
      '<p class="meta"><a href="' + esc(rx.homepage) + '" target="_blank" rel="noopener">' + esc(host(rx.homepage)) + ' 홈페이지</a></p>' +
      '<p class="one">' + esc(ch.one_line || '') + '</p>' +
      '<div class="blk"><h4>재료 3개 — 홈페이지에서 뽑은 근거</h4><ul class="mats">' + mats + '</ul></div>' +
      '<div class="blk"><h4>예술 후보 3개 — 빨간 점이 고른 것</h4><ul class="cands">' + cands + '</ul></div>' +
      '</div></article>';
  }

  var casesEl = document.querySelector('[data-cases]');
  var used = [];

  getJSON('cases.json').then(function (list) {
    list = list || [];
    return Promise.all(list.map(function (c) { return getJSON(c.slug + '/rx.json').then(function (rx) { return { c: c, rx: rx }; }); }));
  }).then(function (rows) {
    var html = '';
    var n = 0;
    rows.forEach(function (row) {
      if (!row.rx) return;
      html += caseHTML(row.c, row.rx, n++);
      if (row.rx.chosen && row.rx.chosen.art) used.push(row.rx.chosen.art);
    });
    casesEl.innerHTML = html;
    casesEl.querySelectorAll('.case').forEach(function (el) { if (reduced) el.classList.add('is-in'); else io.observe(el); });
    return getJSON('catalog.json');
  }).then(function (cat) {
    if (!cat) return;
    var countEl = document.querySelector('[data-count]');
    if (countEl) countEl.textContent = cat.length;
    var grid = document.querySelector('[data-catalog]');
    grid.innerHTML = cat.map(function (a) {
      var names = a.art.split('(')[0].split(/[·]/).map(function (s) { return s.trim(); }).filter(Boolean);
      var isUsed = used.some(function (u) { return names.some(function (nm) { return nm.length > 1 && u.indexOf(nm) >= 0; }); });
      return '<div class="art' + (isUsed ? ' is-used' : '') + '" data-g="' + esc(gestureOf(a.gesture).join('|')) + '"><b>' + esc(a.art) + '</b><span>' + esc(a.gesture) + '</span><small>어울리는 곳: ' + esc(a.fit) + '</small></div>';
    }).join('');
    var chips = document.querySelector('[data-chips]');
    var names = ['전체'].concat(GESTURES.map(function (g) { return g[0]; }));
    chips.innerHTML = names.map(function (nm, i) { return '<button type="button" class="chip" aria-pressed="' + (i === 0) + '">' + esc(nm) + '</button>'; }).join('');
    chips.addEventListener('click', function (e) {
      var b = e.target.closest('.chip');
      if (!b) return;
      chips.querySelectorAll('.chip').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      var key = b.textContent;
      grid.querySelectorAll('.art').forEach(function (el) {
        var on = key === '전체' || el.getAttribute('data-g').split('|').indexOf(key) >= 0;
        el.classList.toggle('is-off', !on);
      });
    });
  });
})();
