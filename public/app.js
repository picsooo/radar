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
    clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('show'); }, 2400);
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
    if (m < 60) return m + ' min ' + (r ? String(r).padStart(2, '0') : '');
    return Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0');
  }
  function ago(d) {
    if (!d) return '-';
    var s = (Date.now() - new Date(d).getTime()) / 1000;
    if (s < 60) return "à l'instant";
    if (s < 3600) return 'il y a ' + Math.floor(s / 60) + ' min';
    if (s < 86400) return 'il y a ' + Math.floor(s / 3600) + ' h';
    if (s < 172800) return 'hier ' + new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' ' + new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  function place(s) { return [s.city, s.country].filter(Boolean).join(', ') || '-'; }
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
  function siteUrl(site, extra) {
    var u = site.url;
    return u + (u.indexOf('?') > -1 ? '&' : '?') + extra;
  }
  function stop() {
    clearInterval(timer); timer = null;
    if (player) { try { player.pause && player.pause(); } catch (e) {} player = null; }
  }

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
      '<a href="#/maquettes" class="' + (active === 'sites' ? 'on' : '') + '">Maquettes</a></nav>' +
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
  function sessRow(s, withSite) {
    return '<tr class="click" data-go="#/s/' + esc(s.id) + '">' +
      '<td>' + ago(s.started_at) + '</td>' +
      (withSite ? '<td><span class="nm">' + esc(s.prospect || s.site_name) + '</span></td>' : '') +
      '<td>' + (s.link_label ? '<span class="tag">' + esc(s.link_label) + '</span>' : '<span class="muted">Générique</span>') +
      (s.visit_no == 1 ? ' <span class="tag new">1re visite</span>' : ' <span class="muted">' + s.visit_no + 'e</span>') + '</td>' +
      '<td>' + esc(place(s)) + '</td>' +
      '<td>' + esc(s.device) + '<span class="muted"> · ' + esc(s.os) + '</span></td>' +
      '<td class="r">' + dur(s.active_ms) + '</td>' +
      '<td class="r">' + s.pages + '</td>' +
      '<td class="r">' + s.clicks + (s.rage ? ' <span class="tag rage" title="Clics répétés (frustration)">' + s.rage + '</span>' : '') + '</td>' +
      '<td class="r">' + (s.max_scroll || 0) + ' %</td></tr>';
  }
  function sessTable(list, withSite) {
    if (!list.length) return '<p class="empty" style="padding:0 20px 18px">Aucune visite pour le moment. Envoyez le lien au prospect : vous serez prévenu par email dès qu\'il l\'ouvre.</p>';
    return '<div class="tw"><table><thead><tr><th>Quand</th>' + (withSite ? '<th>Prospect</th>' : '') +
      '<th>Lien</th><th>Lieu</th><th>Appareil</th><th class="r">Temps actif</th><th class="r">Pages</th><th class="r">Clics</th><th class="r">Scroll</th></tr></thead><tbody>' +
      list.map(function (s) { return sessRow(s, withSite); }).join('') + '</tbody></table></div>';
  }
  function bindRows() {
    document.querySelectorAll('[data-go]').forEach(function (el) { el.onclick = function () { location.hash = el.getAttribute('data-go'); }; });
  }

  // ---------- vue d'ensemble ----------
  function home() {
    shell('home', '<div class="loading">Chargement…</div>');
    function load() {
      api('overview').then(function (d) {
        var k = d.kpi; setLive(k.live);
        var max = Math.max.apply(null, d.days.map(function (x) { return x.visits; }).concat([1]));
        var spark = d.days.map(function (x, i) {
          return '<div class="' + (i === d.days.length - 1 ? 'today' : '') + '" style="height:' + Math.max(4, x.visits / max * 100) + '%" title="' + x.day + ' : ' + x.visits + ' visite(s)"></div>';
        }).join('');
        document.getElementById('main').innerHTML =
          '<div class="head"><div><h1>Vue d\'ensemble</h1><p class="sub">' + d.sites + ' maquette(s) suivie(s). Actualisé automatiquement.</p></div>' +
          '<a class="btn pri" href="#/maquettes">Ajouter une maquette</a></div>' +
          '<div class="kpis">' +
          '<div class="kpi"><b>' + k.today + '</b><span>Visites aujourd\'hui</span></div>' +
          '<div class="kpi"><b>' + k.week + '</b><span>Visites sur 7 jours</span></div>' +
          '<div class="kpi"><b>' + k.visitors + '</b><span>Appareils différents (7 j)</span></div>' +
          '<div class="kpi"><b>' + dur(k.avg_ms) + '</b><span>Temps actif moyen</span></div>' +
          '<div class="kpi"><b>' + k.live + '</b><span>En ce moment</span></div></div>' +
          '<div class="grid"><section class="panel"><h2>Prospects les plus intéressés</h2>' +
          (d.hot.length ? d.hot.map(function (s) {
            return '<a class="hot-row" href="#/m/' + esc(s.id) + '"><span class="nm">' + esc(s.prospect || s.name) + '<small>' + esc(s.name) + '</small></span>' +
              heat(s.heat) + '<span class="num">' + s.visits + ' visite' + (s.visits > 1 ? 's' : '') + '</span><span class="num">' + ago(s.last_visit) + '</span></a>';
          }).join('') : '<p class="empty">Le classement apparaît dès les premières visites.</p>') +
          '</section><div style="display:flex;flex-direction:column;gap:18px">' +
          '<section class="panel"><h2>En direct</h2>' +
          (d.live.length ? d.live.map(function (s) {
            return '<a class="live-row" href="#/s/' + esc(s.id) + '"><span class="pulse"></span><div><b>' + esc(s.prospect || s.site_name) + '</b>' +
              '<small>' + esc(s.link_label || 'Lien générique') + ' · ' + esc(place(s)) + ' · ' + dur(s.active_ms) + '</small></div></a>';
          }).join('') : '<p class="empty">Personne sur les maquettes en ce moment.</p>') + '</section>' +
          '<section class="panel"><h2>Visites sur 14 jours</h2><div class="spark">' + spark + '</div>' +
          '<div class="spark-lbl"><span>il y a 14 j</span><span>aujourd\'hui</span></div></section></div></div>' +
          '<section class="panel flush"><h2>Dernières visites</h2>' + sessTable(d.recent, true) + '</section>';
        bindRows();
      }).catch(function (e) { if (token()) document.getElementById('main').innerHTML = '<p class="err">' + esc(e.message) + '</p>'; });
    }
    load(); timer = setInterval(load, 15000);
  }

  // ---------- maquettes ----------
  function sites() {
    shell('sites', '<div class="head"><div><h1>Maquettes</h1><p class="sub">Ajoutez une maquette, puis collez le code de suivi dans ses pages.</p></div></div>' +
      '<section class="panel" style="margin-bottom:18px"><h2>Nouvelle maquette</h2><form class="form" id="nf">' +
      '<label class="f">Prospect<input type="text" name="prospect" placeholder="Ex. : Cophyd" required></label>' +
      '<label class="f">Nom de la maquette<input type="text" name="name" placeholder="Ex. : Site corporate V2" required></label>' +
      '<label class="f">Adresse de la maquette<input type="text" name="url" placeholder="https://cophydd.vercel.app" required></label>' +
      '<label class="f">Emails à prévenir (en plus)<input type="text" name="notify_emails" placeholder="nihal@…, yasmine@…"></label>' +
      '<button class="btn pri" type="submit">Ajouter</button></form></section>' +
      '<section class="panel flush" id="list"><div class="loading" style="padding:20px">Chargement…</div></section>');
    document.getElementById('nf').onsubmit = function (e) {
      e.preventDefault();
      var f = new FormData(e.target), b = {};
      f.forEach(function (v, k) { b[k] = v; });
      api('sites', { method: 'POST', body: b }).then(function (s) { toast('Maquette ajoutée'); location.hash = '#/m/' + s.id; })
        .catch(function (err) { toast(err.message); });
    };
    api('overview').then(function (d) { setLive(d.kpi.live); }).catch(function () {});
    api('sites').then(function (list) {
      var el = document.getElementById('list');
      if (!list.length) { el.innerHTML = '<p class="empty" style="padding:18px 20px">Aucune maquette. Ajoutez la première avec le formulaire ci-dessus.</p>'; return; }
      el.innerHTML = '<div class="tw"><table><thead><tr><th>Prospect</th><th>Intérêt</th><th class="r">Visites (30 j)</th><th class="r">Appareils</th><th class="r">Temps total</th><th>Dernière visite</th><th>Notifications</th></tr></thead><tbody>' +
        list.map(function (s) {
          return '<tr class="click" data-go="#/m/' + esc(s.id) + '"><td><span class="nm">' + esc(s.prospect || s.name) + '<small>' + esc(s.name) + '</small></span></td>' +
            '<td>' + heat(s.heat) + '</td><td class="r">' + s.visits + '</td><td class="r">' + s.visitors + '</td>' +
            '<td class="r">' + dur(s.active_ms) + '</td><td>' + ago(s.last_visit) + '</td><td>' + (s.notify ? 'Actives' : '<span class="muted">Coupées</span>') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
      bindRows();
    }).catch(function (e) { toast(e.message); });
  }

  // ---------- détail maquette ----------
  function site(id, tab) {
    shell('sites', '<div class="loading">Chargement…</div>');
    api('overview').then(function (d) { setLive(d.kpi.live); }).catch(function () {});
    api('site?id=' + encodeURIComponent(id)).then(function (d) {
      var s = d.site, origin = location.origin;
      var snippet = '<script src="' + origin + '/t.js" data-site="' + s.id + '" defer></script>';
      tab = tab || 'visites';
      document.getElementById('main').innerHTML =
        '<a class="crumb" href="#/maquettes">Maquettes</a>' +
        '<div class="head"><div><h1>' + esc(s.prospect || s.name) + '</h1><p class="sub">' + esc(s.name) + ' · <a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.url.replace(/^https?:\/\//, '')) + '</a></p></div>' +
        '<div class="big-heat"><span class="score">' + s.heat + '</span>' + heat(s.heat) + '</div></div>' +
        '<div class="kpis"><div class="kpi"><b>' + s.visits + '</b><span>Visites (30 j)</span></div>' +
        '<div class="kpi"><b>' + s.visitors + '</b><span>Appareils différents</span></div>' +
        '<div class="kpi"><b>' + dur(s.active_ms) + '</b><span>Temps actif total</span></div>' +
        '<div class="kpi"><b>' + s.clicks + '</b><span>Clics</span></div>' +
        '<div class="kpi"><b>' + ago(s.last_visit) + '</b><span>Dernière visite</span></div></div>' +
        '<div class="grid"><section class="panel"><h2>Liens prospects</h2>' +
        '<p class="sub" style="margin:-6px 0 10px;font-size:13px">Un lien par interlocuteur : vous saurez qui ouvre, et si le lien circule en interne.</p>' +
        '<div class="links">' + (d.links.length ? d.links.map(function (l) {
          var u = siteUrl(s, 'r=' + l.id);
          return '<div class="link-row"><b>' + esc(l.label) + '</b><span class="link-url">' + esc(u) + '</span>' +
            '<span class="num">' + l.visits + ' visite' + (l.visits > 1 ? 's' : '') + '</span>' +
            '<span class="num">' + (l.visitors > 1 ? '<span class="tag new" title="Le lien a été ouvert sur plusieurs appareils">partagé ×' + l.visitors + '</span>' : ago(l.last_visit)) + '</span>' +
            '<span class="actions"><button class="btn sm" data-copy="' + esc(u) + '">Copier</button><button class="btn sm danger" data-dl="' + esc(l.id) + '" aria-label="Supprimer le lien">×</button></span></div>';
        }).join('') : '<p class="empty">Aucun lien personnalisé. Le lien générique fonctionne aussi, mais sans savoir qui l\'ouvre.</p>') + '</div>' +
        '<form class="link-add" id="la"><input type="text" name="label" placeholder="Interlocuteur, ex. : DG, Service marketing" required><button class="btn" type="submit">Créer le lien</button></form></section>' +
        '<section class="panel"><h2>Installation</h2><p class="sub" style="margin:-6px 0 10px;font-size:13px">À coller avant &lt;/body&gt; dans chaque page de la maquette.</p>' +
        '<code class="snip">' + esc(snippet) + '</code>' +
        '<div class="actions" style="margin-top:12px"><button class="btn sm" data-copy="' + esc(snippet) + '">Copier le code</button>' +
        '<a class="btn sm" href="' + esc(siteUrl(s, 'wm_ignore=1')) + '" target="_blank" rel="noopener" title="Ce navigateur ne sera plus compté sur cette maquette">Ouvrir sans être compté</a>' +
        '<button class="btn sm" id="nt">' + (s.notify ? 'Couper les emails' : 'Activer les emails') + '</button>' +
        '<button class="btn sm danger" id="del">Supprimer</button></div>' +
        (s.notify_emails ? '<p class="sub" style="font-size:12.5px">Emails prévenus en plus : ' + esc(s.notify_emails) + '</p>' : '') +
        '</section></div>' +
        '<div class="tabs" role="tablist">' + [['visites', 'Visites'], ['heatmap', 'Heatmap'], ['pages', 'Pages et clics']].map(function (t) {
          return '<button role="tab" data-tab="' + t[0] + '" class="' + (tab === t[0] ? 'on' : '') + '">' + t[1] + '</button>';
        }).join('') + '</div><div id="tab"></div>';

      document.querySelectorAll('[data-copy]').forEach(function (b) { b.onclick = function () { copy(b.getAttribute('data-copy'), 'Copié dans le presse-papiers'); }; });
      document.querySelectorAll('[data-dl]').forEach(function (b) {
        b.onclick = function () { if (confirm('Supprimer ce lien ? Les visites déjà enregistrées restent.')) api('links?id=' + b.getAttribute('data-dl'), { method: 'DELETE' }).then(function () { site(id, tab); }); };
      });
      document.getElementById('la').onsubmit = function (e) {
        e.preventDefault();
        api('links', { method: 'POST', body: { site_id: id, label: e.target.label.value } }).then(function (l) {
          copy(siteUrl(s, 'r=' + l.id), 'Lien créé et copié'); site(id, tab);
        }).catch(function (err) { toast(err.message); });
      };
      document.getElementById('nt').onclick = function () {
        api('sites', { method: 'PATCH', body: { id: id, notify: !s.notify } }).then(function () { toast(s.notify ? 'Emails coupés' : 'Emails activés'); site(id, tab); });
      };
      document.getElementById('del').onclick = function () {
        if (confirm('Supprimer la maquette « ' + (s.prospect || s.name) + ' » et toutes ses visites ? Action définitive.'))
          api('sites?id=' + id, { method: 'DELETE' }).then(function () { location.hash = '#/maquettes'; });
      };
      document.querySelectorAll('[data-tab]').forEach(function (b) {
        b.onclick = function () { history.replaceState(null, '', '#/m/' + id + '/' + b.getAttribute('data-tab')); site(id, b.getAttribute('data-tab')); };
      });

      var el = document.getElementById('tab');
      if (tab === 'visites') { el.innerHTML = '<section class="panel flush">' + sessTable(d.sessions, false) + '</section>'; bindRows(); }
      if (tab === 'pages') pagesTab(el, d);
      if (tab === 'heatmap') heatmapTab(el, s, d.pages);
    }).catch(function (e) { document.getElementById('main').innerHTML = '<p class="err">' + esc(e.message) + '</p>'; });
  }

  function pagesTab(el, d) {
    el.innerHTML = '<div class="grid"><section class="panel flush"><h2>Pages consultées</h2>' +
      (d.pages.length ? '<div class="tw"><table><thead><tr><th>Page</th><th class="r">Vues</th><th class="r">Visites</th><th class="r">Scroll moyen</th></tr></thead><tbody>' +
        d.pages.map(function (p) { return '<tr><td>' + esc(p.path) + '</td><td class="r">' + p.views + '</td><td class="r">' + p.sessions + '</td><td class="r">' + (p.avg_scroll == null ? '-' : p.avg_scroll + ' %') + '</td></tr>'; }).join('') +
        '</tbody></table></div>' : '<p class="empty" style="padding:0 20px 18px">Pas encore de données.</p>') + '</section>' +
      '<section class="panel flush"><h2>Éléments les plus cliqués</h2>' +
      (d.clicks.length ? '<div class="tw"><table><thead><tr><th>Élément</th><th>Page</th><th class="r">Clics</th></tr></thead><tbody>' +
        d.clicks.map(function (c) {
          return '<tr><td>' + esc((c.target || '(sans texte)').slice(0, 60)) + (c.href ? '<br><span class="muted" style="font-size:12px">' + esc(c.href.slice(0, 60)) + '</span>' : '') + '</td>' +
            '<td class="muted">' + esc(c.path) + '</td><td class="r">' + c.n + (c.rage ? ' <span class="tag rage" title="Clics répétés">' + c.rage + '</span>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="empty" style="padding:0 20px 18px">Pas encore de clics.</p>') + '</section></div>';
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
        .then(function (d) { if (d.open) { setToken('open'); render(); } else login(); })
        .catch(login);
    }
    var h = location.hash.replace(/^#\/?/, '').split('/');
    if (h[0] === 'maquettes') return sites();
    if (h[0] === 'm' && h[1]) return site(h[1], h[2]);
    if (h[0] === 's' && h[1]) return session(h[1]);
    return home();
  }
  addEventListener('hashchange', render);
  render();
})();
