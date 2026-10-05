/* Webminds Radar - dashboard */
(function () {
  'use strict';
  var $app = document.getElementById('app');
  var TOKEN_KEY = 'wm_radar_token';
  var timer = null, player = null;

  // ---------- utilitaires ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function token() { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } }
  function setToken(t) { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) {} }
  function api(path, opt) {
    opt = opt || {};
    var headers = { Authorization: 'Bearer ' + token() };
    if (opt.body) headers['Content-Type'] = 'application/json';
    return fetch('/api/' + path, { method: opt.method || 'GET', headers: headers, body: opt.body ? JSON.stringify(opt.body) : undefined })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (r.status === 401) { setToken(null); render(); throw new Error(d.error || 'Non connecté'); }
          if (!r.ok) throw new Error(d.error || 'Erreur ' + r.status);
          return d;
        });
      });
  }
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  function copy(text, msg) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast(msg || 'Copié'); }, function () {
      var a = document.createElement('textarea'); a.value = text; document.body.appendChild(a); a.select();
      try { document.execCommand('copy'); toast(msg || 'Copié'); } catch (e) {} a.remove();
    });
  }
  function dur(ms) {
    var s = Math.round((+ms || 0) / 1000);
    if (s < 60) return s + ' s';
    var m = Math.floor(s / 60), r = s % 60;
    if (m < 60) return m + ' min' + (r ? ' ' + String(r).padStart(2, '0') : '');
    return Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0');
  }
  function ago(d) {
    if (!d) return 'Jamais';
    var s = (Date.now() - new Date(d).getTime()) / 1000;
    if (s < 60) return "à l'instant";
    if (s < 3600) return 'il y a ' + Math.floor(s / 60) + ' min';
    if (s < 86400) return 'il y a ' + Math.floor(s / 3600) + ' h';
    if (s < 172800) return 'hier ' + new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' ' + new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  function place(s) { return [s.city, s.country].filter(Boolean).join(', ') || '-'; }
  function pct(cur, prev) {
    if (!prev) return cur ? '<span class="delta up">nouveau</span>' : '';
    var d = Math.round((cur - prev) / prev * 100);
    if (!d) return '<span class="delta flat">= </span>';
    return '<span class="delta ' + (d > 0 ? 'up' : 'down') + '">' + (d > 0 ? '▲ ' : '▼ ') + Math.abs(d) + ' %</span>';
  }
  function heatInfo(v) {
    if (v >= 75) return ['Brûlant', 'h-burn'];
    if (v >= 50) return ['Chaud', 'h-hot'];
    if (v >= 25) return ['Tiède', 'h-warm'];
    return [v ? 'Froid' : 'Aucune visite', 'h-cold'];
  }
  function heat(v) {
    var i = heatInfo(v);
    return '<div class="heat" title="Score d\'intérêt ' + v + '/100"><div class="heat-bar"><i style="width:' + (100 - v) + '%"></i></div><span class="heat-lbl ' + i[1] + '">' + i[0] + '</span></div>';
  }
  function initials(name) {
    var p = String(name || '?').trim().split(/\s+/);
    return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase();
  }
  function avatarColor(seed) {
    var h = 0; for (var i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
    return 'hsl(' + h + ',42%,38%)';
  }
  function sparkline(arr, live) {
    var max = Math.max.apply(null, arr.concat([1]));
    return '<div class="mini-spark' + (live ? ' live' : '') + '">' + arr.map(function (v, i) {
      return '<span style="height:' + Math.max(8, v / max * 100) + '%" title="J-' + (13 - i) + ' : ' + v + '"></span>';
    }).join('') + '</div>';
  }
  function siteUrl(host, extra) { return 'https://' + host + '/?' + extra; }
  function stop() {
    clearInterval(timer); timer = null;
    if (player) { try { player.pause && player.pause(); } catch (e) {} player = null; }
  }
  function donut(items, colors) {
    var total = items.reduce(function (s, x) { return s + x.n; }, 0) || 1;
    var off = 0, segs = items.map(function (it, i) {
      var frac = it.n / total, c = colors[i % colors.length];
      var seg = c + ' ' + (off * 100).toFixed(2) + '% ' + ((off + frac) * 100).toFixed(2) + '%';
      off += frac; return seg;
    }).join(',');
    return '<div class="donut-wrap"><div class="donut" style="background:conic-gradient(' + segs + ')"><div class="donut-hole"><b>' + total + '</b><span>visites</span></div></div>' +
      '<ul class="legend">' + items.map(function (it, i) {
        return '<li><i style="background:' + colors[i % colors.length] + '"></i>' + esc(it.label) + '<b>' + it.n + '</b></li>';
      }).join('') + '</ul></div>';
  }
  var DCOL = ['#14213d', '#e8772e', '#2f8f63', '#7c9cc0', '#c7352f', '#b9781a'];

  // ---------- connexion ----------
  function login() {
    $app.innerHTML = '<div class="login"><form id="lf">' +
      '<div class="brand" style="color:var(--ink)"><span class="brand-dot"></span>Webminds Radar</div>' +
      '<p>Suivi des visites sur les maquettes prospects.</p>' +
      '<label class="f">Mot de passe<input type="password" id="pw" autocomplete="current-password" required autofocus></label>' +
      '<div class="err" id="le"></div><button class="btn pri" type="submit">Se connecter</button></form></div>';
    document.getElementById('lf').onsubmit = function (e) {
      e.preventDefault();
      var b = e.target.querySelector('button'); b.disabled = true;
      fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: document.getElementById('pw').value }) })
        .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error); return d; }); })
        .then(function (d) { setToken(d.token); render(); })
        .catch(function (err) { document.getElementById('le').textContent = err.message || 'Connexion impossible.'; b.disabled = false; });
    };
  }

  function shell(active, inner) {
    $app.innerHTML = '<div class="shell"><aside class="side">' +
      '<a class="brand" href="#/"><span class="brand-dot"></span>Webminds Radar</a>' +
      '<nav class="nav"><a href="#/" class="' + (active === 'home' ? 'on' : '') + '">Vue d\'ensemble</a>' +
      '<a href="#/maquettes" class="' + (active === 'sites' ? 'on' : '') + '">Maquettes</a>' +
      '<a href="#/install" class="' + (active === 'install' ? 'on' : '') + '">Installation</a></nav>' +
      '<div class="livebox"><span class="pulse off" id="lp"></span>En ce moment<strong id="lc">-</strong>' +
      '<button class="logout" id="lo" type="button">Se déconnecter</button></div></aside>' +
      '<main class="main" id="main">' + inner + '</main></div>';
    var lo = document.getElementById('lo');
    if (token() === 'open') lo.remove(); else lo.onclick = function () { setToken(null); render(); };
  }
  function setLive(n) {
    var lc = document.getElementById('lc'), lp = document.getElementById('lp');
    if (!lc) return;
    lc.textContent = n ? n + (n > 1 ? ' visiteurs' : ' visiteur') : 'Personne';
    lp.className = 'pulse' + (n ? '' : ' off');
  }
  function bindRows() {
    document.querySelectorAll('[data-go]').forEach(function (el) { el.onclick = function (e) { if (e.target.closest('button,a')) return; location.hash = el.getAttribute('data-go'); }; });
  }
  function avatar(name, seed) {
    return '<span class="avatar" style="background:' + avatarColor(seed || name) + '">' + esc(initials(name)) + '</span>';
  }

  // ---------- vue d'ensemble ----------
  function home() {
    shell('home', '<div class="loading">Chargement…</div>');
    function load() {
      api('overview').then(function (d) {
        var k = d.kpi; setLive(k.live);
        var max = Math.max.apply(null, d.days.map(function (x) { return x.visits; }).concat([1]));
        var bars = d.days.map(function (x, i) {
          var dd = new Date(x.day + 'T00:00');
          return '<div class="bar ' + (i === d.days.length - 1 ? 'today' : '') + '" style="height:' + Math.max(3, x.visits / max * 100) + '%">' +
            '<span class="bar-tip">' + x.visits + ' · ' + dd.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + '</span></div>';
        }).join('');
        document.getElementById('main').innerHTML =
          '<div class="head"><div><h1>Vue d\'ensemble</h1><p class="sub">' + k.total + ' maquette(s) suivie(s)' +
          (k.never ? ' · ' + k.never + ' pas encore visitée(s)' : '') + ' · mise à jour automatique</p></div>' +
          '<a class="btn" href="#/install">Code d\'installation</a></div>' +
          '<div class="cards">' +
          kpiCard('Visites aujourd\'hui', k.today, '') +
          kpiCard('Visites (7 j)', k.week, pct(k.week, k.prev_week)) +
          kpiCard('Maquettes visitées (7 j)', k.active_sites, pct(k.active_sites, k.prev_active_sites)) +
          kpiCard('Temps actif moyen', dur(k.avg_ms), pct(k.avg_ms, k.prev_avg_ms)) +
          kpiCard('En ce moment', k.live, '', k.live ? 'live' : '') + '</div>' +
          '<div class="grid-2">' +
          '<section class="panel"><div class="panel-h"><h2>Activité · 30 jours</h2></div><div class="chart">' + bars + '</div>' +
          '<div class="chart-x"><span>il y a 30 j</span><span>aujourd\'hui</span></div></section>' +
          '<section class="panel"><div class="panel-h"><h2>En direct</h2>' + (k.live ? '<span class="live-badge">' + k.live + '</span>' : '') + '</div>' +
          (d.live.length ? '<div class="live-list">' + d.live.map(function (s) {
            return '<a class="live-item" href="#/s/' + esc(s.id) + '">' + avatar(s.site_name, s.site_id) + '<div><b>' + esc(s.site_name) + '</b>' +
              '<small>' + esc(s.link_label || 'Lien générique') + ' · ' + esc(place(s)) + ' · ' + dur(s.active_ms) + '</small></div><span class="pulse"></span></a>';
          }).join('') + '</div>' : '<p class="empty">Personne sur les maquettes en ce moment. La page se met à jour toute seule.</p>') + '</section></div>' +
          '<div class="grid-2">' +
          '<section class="panel"><div class="panel-h"><h2>Prospects les plus chauds</h2><a class="link" href="#/maquettes">Tout voir</a></div>' +
          (d.hot.length ? '<div class="hot-list">' + d.hot.map(function (s, i) {
            return '<a class="hot-card" href="#/m/' + esc(s.id) + '"><span class="rank">' + (i + 1) + '</span>' + avatar(s.name, s.id) +
              '<div class="hot-main"><b>' + esc(s.name) + '</b>' + heat(s.heat) + '</div>' +
              '<div class="hot-nums"><span>' + s.visits + ' visite' + (s.visits > 1 ? 's' : '') + '</span><small>' + ago(s.last_visit) + '</small></div></a>';
          }).join('') + '</div>' : '<p class="empty">Le classement apparaît dès les premières visites.</p>') + '</section>' +
          '<div class="stack">' +
          '<section class="panel"><div class="panel-h"><h2>Appareils</h2></div>' + (d.devices.length ? donut(d.devices, DCOL) : '<p class="empty">—</p>') + '</section>' +
          '<section class="panel"><div class="panel-h"><h2>Villes</h2></div>' +
          (d.cities.length ? '<ul class="bar-list">' + barList(d.cities) + '</ul>' : '<p class="empty">—</p>') + '</section></div></div>' +
          '<section class="panel flush"><div class="panel-h pad"><h2>Dernières visites</h2></div>' + recentTable(d.recent) + '</section>';
        bindRows();
      }).catch(function (e) { if (token()) document.getElementById('main').innerHTML = '<p class="err">' + esc(e.message) + '</p>'; });
    }
    load(); timer = setInterval(load, 15000);
  }
  function kpiCard(label, val, delta, cls) {
    return '<div class="card ' + (cls || '') + '"><span class="card-label">' + label + '</span><b class="card-val">' + val + (cls === 'live' ? '<i class="dot"></i>' : '') + '</b>' + (delta ? '<span class="card-delta">' + delta + '</span>' : '') + '</div>';
  }
  function barList(items) {
    var max = Math.max.apply(null, items.map(function (x) { return x.n; }).concat([1]));
    return items.map(function (x) {
      return '<li><span class="bl-label">' + esc(x.label) + (x.country && x.label !== 'Inconnue' ? ' <small>' + esc(x.country) + '</small>' : '') + '</span>' +
        '<span class="bl-track"><i style="width:' + (x.n / max * 100) + '%"></i></span><b>' + x.n + '</b></li>';
    }).join('');
  }
  function recentTable(list) {
    if (!list.length) return '<p class="empty" style="padding:0 22px 20px">Aucune visite pour l\'instant. Dès qu\'un prospect ouvre sa maquette, elle apparaît ici et vous recevez un email.</p>';
    return '<div class="tw"><table><thead><tr><th>Quand</th><th>Maquette</th><th>Lien</th><th>Lieu</th><th>Appareil</th><th class="r">Temps</th><th class="r">Pages</th><th class="r">Scroll</th></tr></thead><tbody>' +
      list.map(function (s) {
        return '<tr class="click" data-go="#/s/' + esc(s.id) + '"><td>' + ago(s.started_at) + '</td>' +
          '<td><span class="cell-name">' + avatar(s.site_name, s.site_id) + esc(s.site_name) + '</span></td>' +
          '<td>' + (s.link_label ? '<span class="tag">' + esc(s.link_label) + '</span>' : '<span class="muted">Générique</span>') + '</td>' +
          '<td>' + esc(place(s)) + '</td><td>' + esc(s.device) + '</td>' +
          '<td class="r">' + dur(s.active_ms) + '</td><td class="r">' + s.pages + '</td><td class="r">' + (s.max_scroll || 0) + ' %</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  // ---------- maquettes (grille de cartes) ----------
  function sites() {
    shell('sites', '<div class="head"><div><h1>Maquettes</h1><p class="sub">Chaque maquette s\'ajoute toute seule dès sa première visite.</p></div>' +
      '<div class="toolbar"><input type="search" id="q" placeholder="Rechercher une maquette…"><select id="sort"><option value="heat">Trier : intérêt</option><option value="recent">Plus récentes</option><option value="visits">Plus de visites</option><option value="name">Nom</option></select></div></div>' +
      '<div id="grid" class="site-grid"><div class="loading">Chargement…</div></div>');
    api('overview').then(function (d) { setLive(d.kpi.live); }).catch(function () {});
    api('sites').then(function (list) {
      function draw() {
        var qv = (document.getElementById('q').value || '').toLowerCase().trim();
        var sort = document.getElementById('sort').value;
        var rows = list.filter(function (s) { return !qv || (s.name + ' ' + s.host).toLowerCase().indexOf(qv) > -1; });
        rows.sort(function (a, b) {
          if (sort === 'name') return a.name.localeCompare(b.name);
          if (sort === 'visits') return b.visits - a.visits;
          if (sort === 'recent') return new Date(b.last_seen || 0) - new Date(a.last_seen || 0);
          return b.heat - a.heat || b.visits - a.visits;
        });
        var g = document.getElementById('grid');
        if (!rows.length) { g.innerHTML = '<p class="empty">Aucune maquette ne correspond.</p>'; return; }
        g.className = 'site-grid';
        g.innerHTML = rows.map(function (s) {
          var hi = heatInfo(s.heat);
          return '<a class="site-card" href="#/m/' + esc(s.id) + '">' +
            '<div class="sc-top">' + avatar(s.name, s.id) +
            '<div class="sc-id"><b>' + esc(s.name) + '</b><small>' + esc(s.host) + '</small></div>' +
            (s.live ? '<span class="pulse" title="En ce moment"></span>' : '') + '</div>' +
            '<div class="sc-heat"><span class="score ' + hi[1] + '">' + s.heat + '</span>' + heat(s.heat) + '</div>' +
            '<div class="sc-stats"><div><b>' + s.visits + '</b><span>visites 30j</span></div>' +
            '<div><b>' + s.visitors + '</b><span>appareils</span></div>' +
            '<div><b>' + dur(s.active_ms) + '</b><span>temps actif</span></div></div>' +
            sparkline(s.spark, s.live) +
            '<div class="sc-foot"><span>' + (s.visits ? ago(s.last_visit) : 'Pas encore visitée') + '</span>' +
            (s.notify ? '' : '<span class="muted">🔕</span>') + '</div></a>';
        }).join('');
        bindRows();
      }
      document.getElementById('q').oninput = draw;
      document.getElementById('sort').onchange = draw;
      draw();
    }).catch(function (e) { document.getElementById('grid').innerHTML = '<p class="err">' + esc(e.message) + '</p>'; });
  }

  // ---------- installation ----------
  function install() {
    var snippet = '<script src="' + location.origin + '/t.js" defer></scr' + 'ipt>';
    shell('install', '<div class="head"><div><h1>Installation</h1><p class="sub">Un seul code, le même pour toutes les maquettes.</p></div></div>' +
      '<section class="panel"><div class="panel-h"><h2>Code de suivi</h2></div>' +
      '<p class="sub" style="margin:-4px 0 12px">À coller avant <code>&lt;/body&gt;</code> dans chaque page de chaque maquette, après le script de protection.</p>' +
      '<code class="snip">' + esc(snippet) + '</code>' +
      '<div class="actions" style="margin-top:14px"><button class="btn pri" id="cp">Copier le code</button></div></section>' +
      '<section class="panel"><div class="panel-h"><h2>Comment ça marche</h2></div><ul class="steps">' +
      '<li><b>Rien à créer ici.</b> La maquette apparaît toute seule dans Radar dès sa première visite — son nom vient du titre de la page.</li>' +
      '<li><b>Liens par interlocuteur.</b> Chaque maquette a déjà un lien « Prospect ». Ajoutez-en un par personne (DG, marketing…) dans sa fiche pour savoir qui ouvre.</li>' +
      '<li><b>Visite test.</b> Pour vérifier une maquette sans fausser les chiffres, ouvrez-la avec <code>?wm_ignore=1</code>.</li>' +
      '<li><b>Email automatique.</b> À chaque première ouverture, un email part vers l\'équipe.</li></ul></section>');
    document.getElementById('cp').onclick = function () { copy(snippet, 'Code copié'); };
  }

  // ---------- détail maquette ----------
  function site(id, tab) {
    shell('sites', '<div class="loading">Chargement…</div>');
    api('overview').then(function (d) { setLive(d.kpi.live); }).catch(function () {});
    api('site?id=' + encodeURIComponent(id)).then(function (d) {
      var s = d.site;
      tab = tab || 'apercu';
      var max = Math.max.apply(null, d.days.map(function (x) { return x.visits; }).concat([1]));
      var bars = d.days.map(function (x, i) {
        return '<div class="bar ' + (i === d.days.length - 1 ? 'today' : '') + '" style="height:' + Math.max(3, x.visits / max * 100) + '%"><span class="bar-tip">' + x.visits + '</span></div>';
      }).join('');
      document.getElementById('main').innerHTML =
        '<a class="crumb" href="#/maquettes">← Maquettes</a>' +
        '<div class="site-hero"><div class="sh-left">' + avatar(s.name, s.id) +
        '<div><h1>' + esc(s.name) + '</h1><p class="sub"><a href="https://' + esc(s.host) + '" target="_blank" rel="noopener">' + esc(s.host) + '</a>' +
        (s.live ? ' · <span class="live-badge sm"><span class="pulse"></span> en ce moment</span>' : '') + '</p></div></div>' +
        '<div class="sh-heat"><span class="score big ' + heatInfo(s.heat)[1] + '">' + s.heat + '</span><span class="score-sub">' + heatInfo(s.heat)[0] + '<small>score d\'intérêt</small></span></div></div>' +
        '<div class="cards">' +
        kpiCard('Visites (30 j)', s.visits, '') + kpiCard('Appareils différents', s.visitors, '') +
        kpiCard('Temps actif total', dur(s.active_ms), '') + kpiCard('Scroll max', (s.max_scroll || 0) + ' %', '') +
        kpiCard('Dernière visite', s.visits ? ago(s.last_visit) : '—', '') + '</div>' +
        '<div class="tabs" role="tablist">' + [['apercu', 'Aperçu'], ['visites', 'Visites'], ['liens', 'Liens'], ['heatmap', 'Heatmap'], ['pages', 'Pages & clics'], ['reglages', 'Réglages']].map(function (t) {
          return '<button role="tab" data-tab="' + t[0] + '" class="' + (tab === t[0] ? 'on' : '') + '">' + t[1] + '</button>';
        }).join('') + '</div><div id="tab"></div>';

      document.querySelectorAll('[data-tab]').forEach(function (b) {
        b.onclick = function () { history.replaceState(null, '', '#/m/' + id + '/' + b.getAttribute('data-tab')); site(id, b.getAttribute('data-tab')); };
      });
      var el = document.getElementById('tab');
      if (tab === 'apercu') apercuTab(el, d, bars);
      if (tab === 'visites') { el.innerHTML = '<section class="panel flush">' + sessTable(d.sessions) + '</section>'; bindRows(); }
      if (tab === 'liens') liensTab(el, s, d.links);
      if (tab === 'pages') pagesTab(el, d);
      if (tab === 'heatmap') heatmapTab(el, s, d.pages);
      if (tab === 'reglages') reglagesTab(el, s);
    }).catch(function (e) { document.getElementById('main').innerHTML = '<p class="err">' + esc(e.message) + '</p>'; });
  }

  function apercuTab(el, d, bars) {
    el.innerHTML = '<div class="grid-2">' +
      '<section class="panel"><div class="panel-h"><h2>Activité · 30 jours</h2></div><div class="chart">' + bars + '</div></section>' +
      '<div class="stack">' +
      '<section class="panel"><div class="panel-h"><h2>Appareils</h2></div>' + (d.devices.length ? donut(d.devices, DCOL) : '<p class="empty">—</p>') + '</section>' +
      '<section class="panel"><div class="panel-h"><h2>Villes</h2></div>' + (d.cities.length ? '<ul class="bar-list">' + barList(d.cities) + '</ul>' : '<p class="empty">—</p>') + '</section>' +
      '</div></div>' +
      '<section class="panel flush"><div class="panel-h pad"><h2>Dernières visites</h2></div>' + sessTable(d.sessions.slice(0, 8)) + '</section>';
    bindRows();
  }

  function sessTable(list) {
    if (!list.length) return '<p class="empty" style="padding:0 22px 20px">Aucune visite pour le moment. Envoyez le lien au prospect : vous serez prévenu dès qu\'il l\'ouvre.</p>';
    return '<div class="tw"><table><thead><tr><th>Quand</th><th>Visiteur</th><th>Lien</th><th>Lieu</th><th>Appareil</th><th class="r">Temps</th><th class="r">Pages</th><th class="r">Clics</th><th class="r">Scroll</th></tr></thead><tbody>' +
      list.map(function (s) {
        return '<tr class="click" data-go="#/s/' + esc(s.id) + '"><td>' + ago(s.started_at) + '</td>' +
          '<td><span class="cell-name">' + avatar('V' + s.visitor_no, s.visitor_id) + 'Visiteur ' + s.visitor_no + '</span></td>' +
          '<td>' + (s.link_label ? '<span class="tag">' + esc(s.link_label) + '</span>' : '<span class="muted">Générique</span>') + '</td>' +
          '<td>' + esc(place(s)) + '</td><td>' + esc(s.device) + '<span class="muted"> · ' + esc(s.os) + '</span></td>' +
          '<td class="r">' + dur(s.active_ms) + '</td><td class="r">' + s.pages + '</td>' +
          '<td class="r">' + s.clicks + (s.rage ? ' <span class="tag rage" title="Clics répétés">' + s.rage + '</span>' : '') + '</td>' +
          '<td class="r">' + (s.max_scroll || 0) + ' %</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function liensTab(el, s, links) {
    el.innerHTML = '<section class="panel"><div class="panel-h"><h2>Liens par interlocuteur</h2></div>' +
      '<p class="sub" style="margin:-4px 0 14px">Un lien par personne : vous voyez qui ouvre, et si le lien circule en interne. Chaque maquette a déjà un lien « Prospect ».</p>' +
      '<div class="links">' + links.map(function (l) {
        var u = siteUrl(s.host, 'r=' + l.id);
        return '<div class="link-card"><div class="lc-main">' + avatar(l.label, l.id) + '<div><b>' + esc(l.label) + '</b><span class="link-url">' + esc(u) + '</span></div></div>' +
          '<div class="lc-nums"><span>' + l.visits + ' visite' + (l.visits > 1 ? 's' : '') + '</span>' +
          (l.visitors > 1 ? '<span class="tag new" title="Ouvert sur plusieurs appareils">partagé ×' + l.visitors + '</span>' : '<small>' + (l.visits ? ago(l.last_visit) : 'jamais') + '</small>') + '</div>' +
          '<div class="lc-act"><button class="btn sm pri" data-copy="' + esc(u) + '">Copier</button>' +
          (l.label === 'Prospect' && links.length === 1 ? '' : '<button class="btn sm danger" data-dl="' + esc(l.id) + '">Supprimer</button>') + '</div></div>';
      }).join('') + '</div>' +
      '<form class="link-add" id="la"><input type="text" name="label" placeholder="Nouvel interlocuteur, ex. : Directeur, Service marketing" required maxlength="40"><button class="btn pri" type="submit">Créer le lien</button></form></section>';
    el.querySelectorAll('[data-copy]').forEach(function (b) { b.onclick = function () { copy(b.getAttribute('data-copy'), 'Lien copié'); }; });
    el.querySelectorAll('[data-dl]').forEach(function (b) {
      b.onclick = function () { if (confirm('Supprimer ce lien ? Les visites déjà enregistrées restent.')) api('links?id=' + b.getAttribute('data-dl'), { method: 'DELETE' }).then(function () { site(s.id, 'liens'); }); };
    });
    document.getElementById('la').onsubmit = function (e) {
      e.preventDefault();
      api('links', { method: 'POST', body: { site_id: s.id, label: e.target.label.value } }).then(function (l) {
        copy(siteUrl(s.host, 'r=' + l.id), 'Lien créé et copié'); site(s.id, 'liens');
      }).catch(function (err) { toast(err.message); });
    };
  }

  function pagesTab(el, d) {
    el.innerHTML = '<div class="grid-2"><section class="panel flush"><div class="panel-h pad"><h2>Pages consultées</h2></div>' +
      (d.pages.length ? '<div class="tw"><table><thead><tr><th>Page</th><th class="r">Vues</th><th class="r">Visites</th><th class="r">Scroll moyen</th></tr></thead><tbody>' +
        d.pages.map(function (p) { return '<tr><td>' + esc(p.path) + '</td><td class="r">' + p.views + '</td><td class="r">' + p.sessions + '</td><td class="r">' + (p.avg_scroll == null ? '—' : p.avg_scroll + ' %') + '</td></tr>'; }).join('') +
        '</tbody></table></div>' : '<p class="empty" style="padding:0 22px 20px">Pas encore de données.</p>') + '</section>' +
      '<section class="panel flush"><div class="panel-h pad"><h2>Éléments les plus cliqués</h2></div>' +
      (d.clicks.length ? '<div class="tw"><table><thead><tr><th>Élément</th><th>Page</th><th class="r">Clics</th></tr></thead><tbody>' +
        d.clicks.map(function (c) {
          return '<tr><td>' + esc((c.target || '(sans texte)').slice(0, 60)) + (c.href ? '<br><span class="muted" style="font-size:12px">' + esc(c.href.slice(0, 56)) + '</span>' : '') + '</td>' +
            '<td class="muted">' + esc(c.path) + '</td><td class="r">' + c.n + (c.rage ? ' <span class="tag rage">' + c.rage + '</span>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="empty" style="padding:0 22px 20px">Pas encore de clics.</p>') + '</section></div>';
  }

  function reglagesTab(el, s) {
    el.innerHTML = '<section class="panel"><div class="panel-h"><h2>Réglages</h2></div>' +
      '<form id="rf" class="rform">' +
      '<label class="f">Nom affiché<input type="text" name="name" value="' + esc(s.name) + '" maxlength="80"></label>' +
      '<label class="f">Emails prévenus en plus (séparés par des virgules)<input type="text" name="notify_emails" value="' + esc(s.notify_emails || '') + '" placeholder="nihal@webminds.dz, yasmine@webminds.dz"></label>' +
      '<label class="check"><input type="checkbox" name="notify" ' + (s.notify ? 'checked' : '') + '> Recevoir un email à chaque première ouverture</label>' +
      '<div class="actions"><button class="btn pri" type="submit">Enregistrer</button>' +
      '<a class="btn" href="' + esc(siteUrl(s.host, 'wm_ignore=1')) + '" target="_blank" rel="noopener">Ouvrir sans être compté</a>' +
      '<button class="btn danger" type="button" id="del">Supprimer la maquette</button></div></form></section>';
    document.getElementById('rf').onsubmit = function (e) {
      e.preventDefault();
      var f = e.target;
      api('sites', { method: 'PATCH', body: { id: s.id, name: f.name.value, notify_emails: f.notify_emails.value, notify: f.notify.checked } })
        .then(function () { toast('Enregistré'); }).catch(function (err) { toast(err.message); });
    };
    document.getElementById('del').onclick = function () {
      if (confirm('Supprimer « ' + s.name + ' » et toutes ses visites ? Action définitive.'))
        api('sites?id=' + s.id, { method: 'DELETE' }).then(function () { location.hash = '#/maquettes'; });
    };
  }

  // ---------- heatmap ----------
  function heatmapTab(el, s, pages) {
    var paths = pages.map(function (p) { return p.path; });
    if (!paths.length) paths = ['/'];
    var st = { path: paths[0], device: 'desktop', mode: 'clicks' };
    el.innerHTML = '<div class="hm-ctrl"><label class="f">Page<select id="hp">' + paths.map(function (p) { return '<option>' + esc(p) + '</option>'; }).join('') + '</select></label>' +
      '<div class="seg" id="hd"><button data-v="desktop" class="on">Ordinateur</button><button data-v="mobile">Mobile</button></div>' +
      '<div class="seg" id="hmode"><button data-v="clicks" class="on">Clics</button><button data-v="scroll">Profondeur de scroll</button></div>' +
      '<span class="muted" id="hinfo" style="padding-bottom:8px"></span></div>' +
      '<div class="stage-wrap" id="sw"><div class="stage" id="stage"></div></div>' +
      '<div class="hm-legend" id="hl"></div>';
    function seg(id, key) {
      document.querySelectorAll('#' + id + ' button').forEach(function (b) {
        b.onclick = function () {
          document.querySelectorAll('#' + id + ' button').forEach(function (x) { x.classList.toggle('on', x === b); });
          st[key] = b.getAttribute('data-v'); draw();
        };
      });
    }
    seg('hd', 'device'); seg('hmode', 'mode');
    document.getElementById('hp').onchange = function (e) { st.path = e.target.value; draw(); };

    function median(a, def) { if (!a.length) return def; a = a.slice().sort(function (x, y) { return x - y; }); return a[Math.floor(a.length / 2)]; }
    function draw() {
      var stage = document.getElementById('stage'), info = document.getElementById('hinfo');
      info.textContent = 'Chargement…';
      api('heatmap?site=' + s.id + '&path=' + encodeURIComponent(st.path) + '&device=' + st.device).then(function (d) {
        var mobile = st.device === 'mobile';
        var W = median(d.clicks.map(function (c) { return c.vw; }).filter(Boolean), mobile ? 390 : 1440);
        W = mobile ? Math.min(Math.max(W, 320), 480) : Math.min(Math.max(W, 1024), 1920);
        var H = Math.max(900, median(d.clicks.map(function (c) { return c.dh; }).concat(d.depths.map(function (x) { return x.dh; })).filter(Boolean), 3000));
        H = Math.min(H, 16000);
        var src = new URL(st.path, s.url + '/').toString();
        src += (src.indexOf('?') > -1 ? '&' : '?') + 'wm_hm=1';
        stage.style.width = W + 'px'; stage.style.height = H + 'px';
        stage.innerHTML = '<iframe src="' + esc(src) + '" width="' + W + '" height="' + H + '" scrolling="no" title="Aperçu de la page" sandbox="allow-scripts allow-same-origin"></iframe><canvas width="' + W + '" height="' + H + '"></canvas>';
        var avail = document.getElementById('sw').clientWidth - 36;
        var k = Math.min(1, avail / W);
        stage.style.transform = 'scale(' + k + ')';
        stage.style.marginBottom = (-(1 - k) * H) + 'px';
        stage.style.marginRight = (-(1 - k) * W) + 'px';
        if (k < 1) stage.style.marginLeft = '0';
        var ctx = stage.querySelector('canvas').getContext('2d');
        if (st.mode === 'clicks') {
          info.textContent = d.clicks.length + ' clic(s) sur cette page';
          clickMap(ctx, d.clicks, W, H);
          document.getElementById('hl').innerHTML = 'Moins <i></i> Plus · le cadre de la page peut décaler légèrement selon la taille d\'écran du visiteur.';
        } else {
          info.textContent = d.depths.length + ' affichage(s) de la page';
          scrollMap(ctx, d.depths, W, H);
          document.getElementById('hl').innerHTML = 'Part des visiteurs qui ont vu chaque niveau de la page.';
        }
      }).catch(function (e) { info.textContent = e.message; });
    }
    draw();
  }

  function clickMap(ctx, clicks, W, H) {
    if (!clicks.length) return;
    var R = 26;
    var off = document.createElement('canvas'); off.width = W; off.height = H;
    var o = off.getContext('2d');
    clicks.forEach(function (c) {
      var x = c.x * W, y = c.y;
      if (y > H) return;
      var g = o.createRadialGradient(x, y, 0, x, y, R);
      g.addColorStop(0, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      o.fillStyle = g; o.fillRect(x - R, y - R, R * 2, R * 2);
    });
    var grad = document.createElement('canvas'); grad.width = 256; grad.height = 1;
    var gc = grad.getContext('2d'), lg = gc.createLinearGradient(0, 0, 256, 0);
    lg.addColorStop(0, 'rgba(80,120,200,0)'); lg.addColorStop(.2, 'rgb(80,120,200)'); lg.addColorStop(.45, '#3fd17a');
    lg.addColorStop(.65, '#f5e04a'); lg.addColorStop(.82, '#f08c2b'); lg.addColorStop(1, '#d7262a');
    gc.fillStyle = lg; gc.fillRect(0, 0, 256, 1);
    var pal = gc.getImageData(0, 0, 256, 1).data;
    var img = o.getImageData(0, 0, W, H), px = img.data, maxA = 1;
    for (var i0 = 3; i0 < px.length; i0 += 4) if (px[i0] > maxA) maxA = px[i0];
    for (var i = 0; i < px.length; i += 4) {
      var a = px[i + 3];
      if (!a) continue;
      a = Math.round(a / maxA * 255);
      var j = Math.min(255, a) * 4;
      px[i] = pal[j]; px[i + 1] = pal[j + 1]; px[i + 2] = pal[j + 2]; px[i + 3] = Math.min(200, a * 0.9 + 50);
    }
    ctx.putImageData(img, 0, 0);
    clicks.forEach(function (c) {
      if (!c.rage) return;
      ctx.strokeStyle = '#c7352f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(c.x * W, c.y, 9, 0, 7); ctx.stroke();
    });
  }

  function scrollMap(ctx, depths, W, H) {
    if (!depths.length) return;
    var n = depths.length, step = 2;
    for (var p = 0; p < 100; p += step) {
      var reach = depths.filter(function (d) { return d.v >= p + step; }).length / n;
      var y = Math.floor(p / 100 * H), h = Math.floor((p + step) / 100 * H) - y;
      var hue = 210 - reach * 210;
      ctx.fillStyle = 'hsla(' + hue + ',80%,50%,' + (0.18 + (1 - reach) * 0.32) + ')';
      ctx.fillRect(0, y, W, h);
    }
    [25, 50, 75, 100].forEach(function (p) {
      var reach = Math.round(depths.filter(function (d) { return d.v >= p; }).length / n * 100);
      var y = p / 100 * H - (p === 100 ? 28 : 0);
      ctx.fillStyle = 'rgba(23,42,74,.85)'; ctx.fillRect(0, y - 1, W, 2);
      ctx.fillStyle = '#172a4a'; ctx.fillRect(12, y + 6, 180, 26);
      ctx.fillStyle = '#fff'; ctx.font = '600 14px "Schibsted Grotesk", sans-serif';
      ctx.fillText(reach + ' % arrivent à ' + p + ' %', 22, y + 24);
    });
  }

  // ---------- visite (replay) ----------
  function session(id) {
    shell('home', '<div class="loading">Chargement de la visite…</div>');
    api('overview').then(function (d) { setLive(d.kpi.live); }).catch(function () {});
    api('session?id=' + encodeURIComponent(id)).then(function (d) {
      var s = d.session, t0 = new Date(s.started_at).getTime();
      var live = Date.now() - new Date(s.last_at).getTime() < 90000;
      document.getElementById('main').innerHTML =
        '<a class="crumb" href="#/m/' + esc(s.site_id) + '">' + esc(s.prospect || s.site_name) + '</a>' +
        '<div class="head"><div><h1>Visite du ' + new Date(s.started_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) + ' à ' +
        new Date(s.started_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + '</h1>' +
        '<p class="sub">' + (live ? '<span class="pulse"></span>En cours · ' : '') + esc(s.site_name) + '</p></div>' +
        (live ? '<button class="btn" id="rl">Actualiser</button>' : '') + '</div>' +
        '<div class="meta">' + [['Lien', s.link_label || 'Générique'], ['Visite', s.visit_no == 1 ? 'Première' : s.visit_no + 'e'], ['Lieu', place(s)],
          ['Appareil', s.device + ', ' + s.os + ', ' + s.browser], ['Temps actif', dur(s.active_ms)], ['Scroll max', (s.max_scroll || 0) + ' %']]
          .map(function (m) { return '<div><span>' + m[0] + '</span><b>' + esc(m[1]) + '</b></div>'; }).join('') + '</div>' +
        '<div class="sess-grid"><div><div class="player-wrap" id="pw"></div></div>' +
        '<section class="panel"><h2>Parcours</h2><ul class="tl">' + d.events.map(function (e) {
          var t = Math.max(0, Math.round((e.ts - t0) / 1000)), tt = Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
          var x = e.data || {}, cls = 'k-' + e.type, txt;
          if (e.type === 'pv') txt = '<b>Ouvre ' + esc(e.path) + '</b><em>' + esc(x.title || '') + '</em>';
          else if (e.type === 'click') { if (x.rage) cls = 'k-rage'; txt = '<b>' + (x.rage ? 'Clics répétés' : 'Clic') + (x.txt ? ' sur « ' + esc(x.txt.slice(0, 40)) + ' »' : '') + '</b><em>' + esc(x.href || x.sel || '') + '</em>'; }
          else txt = '<b>Descend à ' + x.v + ' %</b><em>' + esc(e.path) + '</em>';
          return '<li class="' + cls + '"><time>' + tt + '</time><div>' + txt + '</div></li>';
        }).join('') + '</ul></section></div>';
      var rl = document.getElementById('rl'); if (rl) rl.onclick = function () { session(id); };
      var pw = document.getElementById('pw');
      var hasFull = d.replay.some(function (e) { return e.type === 2; });
      if (d.replay.length < 2 || !hasFull) { pw.innerHTML = '<p class="empty" style="color:#aab4c5;align-self:center">Enregistrement indisponible pour cette visite (trop courte ou en cours de chargement).</p>'; return; }
      var meta = d.replay.find(function (e) { return e.type === 4; }) || { data: { width: 1280, height: 800 } };
      var maxW = pw.clientWidth - 32, ratio = meta.data.height / meta.data.width;
      var w = Math.min(maxW, meta.data.width), h = Math.min(Math.round(w * ratio), Math.round(innerHeight * 0.68));
      w = Math.min(w, Math.round(h / ratio));
      var P = window.rrwebPlayer && (window.rrwebPlayer.default || window.rrwebPlayer);
      try {
        player = new P({ target: pw, props: { events: d.replay, width: w, height: h, autoPlay: false, skipInactive: true, showController: true, speedOption: [1, 2, 4, 8], mouseTail: { strokeStyle: '#e8772e', lineWidth: 2 } } });
      } catch (err) { pw.innerHTML = '<p class="empty" style="color:#aab4c5">Lecture impossible : ' + esc(err.message) + '</p>'; }
    }).catch(function (e) { document.getElementById('main').innerHTML = '<p class="err">' + esc(e.message) + '</p>'; });
  }

  // ---------- routeur ----------
  function render() {
    stop();
    if (!token()) {
      return fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
        .then(function (r) { return r.json(); })
        .then(function (d) { if (d.open) { setToken('open'); route(); } else login(); })
        .catch(login);
    }
    route();
  }
  function route() {
    var h = location.hash.replace(/^#\/?/, '').split('/');
    if (h[0] === 'maquettes') return sites();
    if (h[0] === 'install') return install();
    if (h[0] === 'm' && h[1]) return site(h[1], h[2]);
    if (h[0] === 's' && h[1]) return session(h[1]);
    return home();
  }
  addEventListener('hashchange', render);
  render();
})();
