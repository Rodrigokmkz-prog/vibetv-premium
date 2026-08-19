(function () {
  'use strict';

  var BASE = 'https://megacine.media';
  var REFERRER = BASE + '/';

  var CATS = {
    filmes: { url: '/filmes/', title: 'Filmes' },
    series: { url: '/series/', title: 'Séries' },
    animacao: { url: '/genero/animacao/', title: 'Animação' }
  };

  var state = {
    active: false,
    view: 'browse',
    cat: null,
    query: '',
    page: 1,
    maxPage: 1,
    loading: false,
    grid: null,
    detail: null,
    detailSeason: 1,
    currentEpisodeList: null
  };

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  function decodeHtml(str) {
    var div = document.createElement('div');
    div.innerHTML = str;
    return div.textContent || '';
  }

  function abs(u) {
    if (!u) return '';
    if (u.indexOf('http') === 0) return u;
    if (u.indexOf('//') === 0) return 'https:' + u;
    return BASE + (u.charAt(0) === '/' ? u : '/' + u);
  }

  var isWeb = !window.vibetv || !window.vibetv.ipc;

  function proxyUrl(url) {
    if (!isWeb) return url;
    return '/.netlify/functions/proxy?url=' + encodeURIComponent(url);
  }

  function get(url) {
    return fetch(proxyUrl(url)).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    });
  }

  function itemIdFromUrl(url) {
    var m = url.replace(/\/$/, '').match(/\/(\d+)-[^\/]+$/);
    return m ? m[1] : null;
  }

  function parseGridBlocks(html) {
    var blocks = String(html).split('<div class="default poster grid-item');
    var items = [];
    var maxPage = 1;
    var pm = String(html).match(/page\/(\d+)\//g);
    if (pm) {
      for (var p = 0; p < pm.length; p++) {
        var v = parseInt(pm[p].replace(/\D/g, ''), 10);
        if (v > maxPage) maxPage = v;
      }
    }
    for (var i = 1; i < blocks.length; i++) {
      var b = blocks[i];
      var titleM = b.match(/<h3 class="poster__title"><a\s+href="([^"]+)"[^>]*><span>([^<]+)<\/span><\/a><\/h3>/);
      if (!titleM) continue;
      var imgM = b.match(/<img[^>]*src="([^"]+)"/);
      var metaM = b.match(/<div class="bslide__meta">([\s\S]*?)<\/div>/);
      var year = '';
      var rating = '';
      if (metaM) {
        var spans = metaM[1].match(/<span[^>]*>([^<]+)<\/span>/g) || [];
        if (spans[0]) year = spans[0].replace(/<[^>]+>/g, '').trim();
        for (var s2 = spans.length - 1; s2 >= 0; s2--) {
          if (/rating/.test(spans[s2])) {
            rating = spans[s2].replace(/<[^>]+>/g, '').trim();
            break;
          }
        }
      }
      items.push({
        title: decodeHtml(titleM[2]),
        url: abs(titleM[1]),
        poster: imgM ? abs(imgM[1]) : '',
        year: year,
        rating: rating
      });
    }
    return { items: items, maxPage: maxPage };
  }

  function parseEpisodes(html) {
    var eps = [];
    var parts = String(html).split('class="epi-link');
    for (var i = 1; i < parts.length; i++) {
      var b = parts[i];
      var hrefM = b.match(/href="([^"]+)"/);
      if (!hrefM) continue;
      var seM = hrefM[1].match(/--s(\d+)e(\d+)\/?$/);
      if (!seM) continue;
      var nameM = b.match(/<p class="epiname">([^<]+)<\/p>/);
      var subM = b.match(/<p class="epinicename">([^<]+)<\/p>/);
      var imgM = b.match(/style="background-image:\s*url\(([^)]+)\)/);
      eps.push({
        s: parseInt(seM[1], 10),
        n: parseInt(seM[2], 10),
        name: nameM ? decodeHtml(nameM[1]) : 'Episódio ' + seM[2],
        sub: subM ? decodeHtml(subM[1]) : '',
        img: imgM ? abs(imgM[1]) : '',
        url: abs(hrefM[1])
      });
    }
    eps.sort(function (a, b) { return (a.s - b.s) || (a.n - b.n); });
    return eps;
  }

  function parseSeasons(html) {
    var seasons = [];
    var parts = String(html).split('class="season-link');
    for (var i = 1; i < parts.length; i++) {
      var b = parts[i];
      var hrefM = b.match(/href="([^"]+)"/);
      if (!hrefM) continue;
      var n = parseInt(hrefM[1].replace(/\/$/, '').match(/--s(\d+)\/?$/)[1], 10);
      var titleM = b.match(/<p class="pstitle">([^<]+)<\/p>/);
      var imgM = b.match(/url\(([^)]+)\)/);
      seasons.push({
        n: n,
        title: titleM ? decodeHtml(titleM[1]) : 'Temporada ' + n,
        img: imgM ? abs(imgM[1]) : '',
        url: abs(hrefM[1])
      });
    }
    seasons.sort(function (a, b) { return a.n - b.n; });
    return seasons;
  }

  function parseDetail(html, url) {
    var titleM = html.match(/<h1>Assistir\s+([^<]+?)\s+Online Grátis<\/h1>/);
    var yearM = html.match(/<p class="yearof">Ano:\s*(\d{4})<\/p>/);
    var descM = html.match(/<div class="movie-description"><p>([\s\S]*?)<\/p>/);
    var posterM = html.match(/<div class="movieposter">\s*<img[^>]*src="([^"]+)"/);
    var ratingM = html.match(/<span\s+class="rating roundnum">([\d.]+)<\/span>/);
    var isSeries = html.indexOf('season-link') >= 0;
    return {
      url: url,
      id: itemIdFromUrl(url),
      title: titleM ? decodeHtml(titleM[1]) : '',
      year: yearM ? yearM[1] : '',
      synopsis: descM ? decodeHtml(descM[1].replace(/\s+/g, ' ').trim()) : '',
      poster: posterM ? abs(posterM[1]) : '',
      rating: ratingM ? ratingM[1] : '',
      isSeries: isSeries,
      seasons: isSeries ? parseSeasons(html) : [],
      episodes: isSeries ? parseEpisodes(html) : []
    };
  }

  function resolveVideo(id, season, series) {
    var u = BASE + '/json?id=' + encodeURIComponent(id) +
      '&version=0&season=' + (season || 1) +
      '&series=' + (series || 1) +
      '&a=false&android=0';
    return fetch(proxyUrl(u)).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (d) {
      if (!d || !d.video_url) throw new Error('Sem vídeo');
      return {
        url: abs(d.video_url),
        subs: d.video_subs ? abs(d.video_subs) : '',
        background: d.background_url ? abs(d.background_url) : '',
        type: d.video_type || 'movie'
      };
    });
  }

  /* =============== UI =============== */

  function rootEl() {
    return $('#mega-root');
  }

  function showLoading() {
    var r = rootEl();
    if (!r.querySelector('.mega-loading')) {
      var l = document.createElement('div');
      l.className = 'mega-loading';
      l.innerHTML = '<div class="loading-spinner"></div><p>Carregando catálogo...</p>';
      r.appendChild(l);
    }
  }

  function hideLoading() {
    var l = rootEl().querySelector('.mega-loading');
    if (l) l.remove();
  }

  function makeCard(item) {
    var card = document.createElement('div');
    card.className = 'mega-card';
    card.tabIndex = 0;

    var poster = document.createElement('div');
    poster.className = 'mega-poster';
    if (item.poster) {
      var img = document.createElement('img');
      img.src = item.poster;
      img.alt = '';
      img.loading = 'lazy';
      img.onerror = function () { this.remove(); };
      poster.appendChild(img);
    } else {
      var letter = document.createElement('div');
      letter.className = 'mega-letter';
      letter.textContent = (item.title || '?').trim().charAt(0).toUpperCase();
      poster.appendChild(letter);
    }
    if (item.year) {
      var year = document.createElement('span');
      year.className = 'mega-year';
      year.textContent = item.year;
      poster.appendChild(year);
    }
    if (item.rating) {
      var rating = document.createElement('span');
      rating.className = 'mega-rating';
      rating.textContent = '★ ' + item.rating;
      poster.appendChild(rating);
    }
    var play = document.createElement('span');
    play.className = 'mega-play';
    poster.appendChild(play);
    card.appendChild(poster);

    var title = document.createElement('div');
    title.className = 'mega-title';
    title.textContent = item.title;
    card.appendChild(title);

    if (item.cat) {
      var sub = document.createElement('div');
      sub.className = 'mega-sub';
      sub.textContent = item.cat;
      card.appendChild(sub);
    }

    card.addEventListener('click', function () { openDetail(item); });
    return card;
  }

  function renderGrid() {
    var r = rootEl();
    var grid = r.querySelector('.mega-grid');
    if (!grid) {
      r.innerHTML = '<div class="mega-grid"></div>';
      grid = r.querySelector('.mega-grid');
    }
    grid.innerHTML = '';
    var frag = document.createDocumentFragment();
    for (var i = 0; i < state.items.length; i++) {
      frag.appendChild(makeCard(state.items[i]));
    }
    grid.appendChild(frag);

    var lm = grid.querySelector('.mega-loadmore');
    if (lm) lm.remove();
    if (state.page < state.maxPage) {
      lm = document.createElement('div');
      lm.className = 'mega-loadmore';
      lm.textContent = 'Carregar mais';
      lm.tabIndex = 0;
      lm.addEventListener('click', loadMore);
      grid.appendChild(lm);
    }
  }

  function loadMore() {
    if (state.loading || state.page >= state.maxPage) return;
    loadPage(state.page + 1);
  }

  function loadPage(page) {
    state.loading = true;
    showLoading();
    var base = CATS[state.cat].url;
    var url = BASE + base + (page > 1 ? 'page/' + page + '/' : '');
    get(url).then(function (html) {
      var parsed = parseGridBlocks(html);
      state.page = page;
      state.maxPage = Math.max(state.maxPage, parsed.maxPage);
      state.items = state.items.concat(parsed.items);
      hideLoading();
      renderGrid();
      if (page === 1) {
        var first = rootEl().querySelector('.mega-card');
        if (first) first.focus();
      }
    }).catch(function () {
      hideLoading();
      VibeTV.toast('Falha ao carregar o catálogo. Verifique sua internet.', true);
    }).then(function () {
      state.loading = false;
    });
  }

  function enterBrowse(cat) {
    state.active = true;
    state.view = 'browse';
    state.cat = cat;
    state.query = '';
    state.page = 1;
    state.maxPage = 1;
    state.items = [];
    state.detail = null;
    VibeTV.setMegaMode(true, CATS[cat].title);
    rootEl().classList.remove('hidden');
    renderGrid();
    loadPage(1);
  }

  function enterSearch(query) {
    if (!query) {
      renderGrid();
      return;
    }
    state.query = query;
    state.page = 1;
    state.maxPage = 1;
    state.items = [];
    state.loading = true;
    showLoading();
    var url = BASE + '/index.php?do=search&subaction=search&story=' + encodeURIComponent(query) + '&search_start=0';
    get(url).then(function (html) {
      var parsed = parseGridBlocks(html);
      state.items = parsed.items;
      state.maxPage = 1;
      hideLoading();
      renderGrid();
    }).catch(function () {
      hideLoading();
      VibeTV.toast('Falha na busca. Tente novamente.', true);
    }).then(function () {
      state.loading = false;
    });
  }

  function openDetail(item) {
    state.view = 'detail';
    VibeTV.setMegaMode(true, item.title);
    showLoading();
    get(item.url).then(function (html) {
      var d = parseDetail(html, item.url);
      if (!d.title && item.title) d.title = item.title;
      if (!d.poster) d.poster = item.poster;
      state.detail = d;
      hideLoading();
      renderDetail();
    }).catch(function () {
      hideLoading();
      VibeTV.toast('Falha ao abrir os detalhes. Tente novamente.', true);
    });
  }

  function renderDetail() {
    var r = rootEl();
    var d = state.detail;
    r.innerHTML = '';
    var posterImg = d.poster
      ? '<img src="' + d.poster + '" alt="" onerror="this.remove()">'
      : '<div class="mega-letter big">' + (d.title || '?').trim().charAt(0).toUpperCase() + '</div>';

    var html = '<div class="mega-detail">' +
      '<div class="mega-detail-poster">' + posterImg + '</div>' +
      '<div class="mega-detail-info">' +
      '<h2 class="mega-detail-title"></h2>' +
      '<div class="mega-detail-meta"></div>' +
      '<p class="mega-synopsis"></p>';

    if (d.isSeries) {
      html += '<div class="season-chips"></div><div class="epi-grid"></div>';
    } else {
      html += '<button class="btn btn-gold mega-playbtn" id="btn-mega-play"><span class="btn-icon">▶</span><span class="btn-text"><strong>Assistir agora</strong><small>Reproduzir com o player VIBETV</small></span></button>';
    }
    html += '</div></div>';
    r.innerHTML = html;

    r.querySelector('.mega-detail-title').textContent = d.title;
    var meta = [];
    if (d.year) meta.push(d.year);
    if (d.rating) meta.push('★ ' + d.rating);
    if (d.isSeries && d.seasons.length) meta.push(d.seasons.length + (d.seasons.length > 1 ? ' temporadas' : ' temporada'));
    else if (!d.isSeries) meta.push('Filme');
    r.querySelector('.mega-detail-meta').textContent = meta.join(' • ');
    r.querySelector('.mega-synopsis').textContent = d.synopsis || 'Sinopse indisponível.';

    if (d.isSeries) {
      renderSeasons();
    } else {
      var btn = r.querySelector('#btn-mega-play');
      btn.addEventListener('click', function () { playMovie(); });
    }

    var p = r.querySelector('.mega-detail-poster');
    if (p) {
      var img = p.querySelector('img');
      if (!img && !p.querySelector('.mega-letter')) {
        var letter = document.createElement('div');
        letter.className = 'mega-letter big';
        letter.textContent = (d.title || '?').trim().charAt(0).toUpperCase();
        p.appendChild(letter);
      }
    }
    setTimeout(function () {
      var play = r.querySelector('#btn-mega-play');
      if (play) play.focus();
    }, 80);
  }

  function renderSeasons() {
    var d = state.detail;
    var wrapper = rootEl();
    var chips = wrapper.querySelector('.season-chips');
    chips.innerHTML = '';
    d.seasons.forEach(function (s) {
      var chip = document.createElement('button');
      chip.className = 'chip' + (s.n === state.detailSeason ? ' active' : '');
      chip.textContent = s.title;
      chip.tabIndex = 0;
      chip.addEventListener('click', function () {
        if (s.n === state.detailSeason) return;
        state.detailSeason = s.n;
        state.currentEpisodeList = null;
        var grid = wrapper.querySelector('.epi-grid');
        grid.innerHTML = '';
        var load = document.createElement('div');
        load.className = 'mega-loading';
        load.innerHTML = '<div class="loading-spinner"></div><p>Carregando episódios...</p>';
        grid.appendChild(load);
        get(s.url).then(function (html) {
          var eps = parseEpisodes(html);
          d.episodes = d.episodes.concat(eps);
          renderSeasons();
        }).catch(function () {
          grid.innerHTML = '<div class="mega-empty">Não foi possível carregar os episódios.</div>';
        });
      });
      chips.appendChild(chip);
    });

    var grid = wrapper.querySelector('.epi-grid');
    grid.innerHTML = '';
    var frag = document.createDocumentFragment();
    var eps = [];
    for (var i = 0; i < d.episodes.length; i++) {
      if (d.episodes[i].s === state.detailSeason) eps.push(d.episodes[i]);
    }
    eps.forEach(function (ep, idx) {
      var card = document.createElement('div');
      card.className = 'epi-card';
      card.tabIndex = 0;
      var img = ep.img ? '<img src="' + ep.img + '" alt="" loading="lazy" onerror="this.remove()">' : '';
      card.innerHTML =
        '<div class="epi-thumb">' + img + '<span class="epi-num">E' + ep.n + '</span></div>' +
        '<div class="epi-name"></div>' +
        '<div class="epi-sub"></div>';
      card.querySelector('.epi-name').textContent = ep.name;
      card.querySelector('.epi-sub').textContent = ep.sub || ('Temporada ' + ep.s);
      (function (e) {
        card.addEventListener('click', function () { playEpisode(e); });
      })(ep);
      frag.appendChild(card);
    });
    grid.appendChild(frag);
  }

  function buildQueue(items) {
    return items.map(function (x) {
      return {
        name: x.name,
        url: x.url,
        referrer: REFERRER,
        logo: x.poster || ''
      };
    });
  }

  function playMovie() {
    var d = state.detail;
    if (!d || !d.id) { VibeTV.toast('Conteúdo indisponível.', true); return; }
    showLoading();
    resolveVideo(d.id, 1, 1).then(function (v) {
      hideLoading();
      VibeTV.openPlayerList(buildQueue([{ name: d.title + (d.year ? ' (' + d.year + ')' : ''), url: v.url, poster: d.poster }]), 0, { allowFav: false, title: 'VIBETV • Filme' });
    }).catch(function () {
      hideLoading();
      VibeTV.toast('Não foi possível obter o vídeo deste título.', true);
    });
  }

  function playEpisode(ep) {
    var d = state.detail;
    if (!d || !d.id) { VibeTV.toast('Conteúdo indisponível.', true); return; }
    var eps = [];
    for (var i = 0; i < d.episodes.length; i++) {
      if (d.episodes[i].s === state.detailSeason) eps.push(d.episodes[i]);
    }
    showLoading();
    var jobs = eps.map(function (e) {
      return resolveVideo(d.id, e.s, e.n).then(function (v) {
        return { name: 'E' + e.n + ' • ' + e.name, url: v.url, poster: e.img };
      }).catch(function () {
        return null;
      });
    });
    Promise.all(jobs).then(function (list) {
      hideLoading();
      var q = list.filter(Boolean);
      if (!q.length) {
        VibeTV.toast('Não foi possível obter os episódios desta temporada.', true);
        return;
      }
      var idx = 0;
      for (var j = 0; j < q.length; j++) {
        if (q[j].name.indexOf('E' + ep.n + ' •') === 0) { idx = j; break; }
      }
      VibeTV.openPlayerList(buildQueue(q), idx, { allowFav: false, title: 'VIBETV • ' + d.title });
    });
  }

  function back() {
    var r = rootEl();
    if (state.view === 'detail') {
      state.view = 'browse';
      r.innerHTML = '<div class="mega-grid"></div>';
      if (state.query) {
        VibeTV.setMegaMode(true, 'Busca: "' + state.query + '"');
        enterSearch(state.query);
      } else {
        VibeTV.setMegaMode(true, CATS[state.cat].title);
        state.items = [];
        renderGrid();
        loadPage(1);
      }
      return;
    }
    deactivate();
  }

  function deactivate() {
    state.active = false;
    state.view = 'browse';
    var r = rootEl();
    r.classList.add('hidden');
    r.innerHTML = '';
    state.items = [];
    state.detail = null;
    VibeTV.setMegaMode(false, '');
  }

  function isActive() {
    return state.active;
  }

  function currentCategory() {
    return state.cat || '';
  }

  window.Mega = {
    browse: enterBrowse,
    search: enterSearch,
    back: back,
    deactivate: deactivate,
    isActive: isActive,
    currentCategory: currentCategory
  };
})();