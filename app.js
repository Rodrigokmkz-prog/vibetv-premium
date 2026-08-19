(function () {
  'use strict';

  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  var isWeb = !window.vibetv || !window.vibetv.ipc;

  function streamProxyUrl(url) {
    if (!isWeb) return url;
    return '/.netlify/functions/stream?url=' + encodeURIComponent(url);
  }

  var STORAGE_PLAYLISTS = 'vibetv_playlists_v1';
  var STORAGE_FAVORITES = 'vibetv_favorites_v1';
  var STORAGE_ACTIVE = 'vibetv_active_v1';

  var CAT_ICONS = {
    esporte: '⚽',
    filme: '🎬',
    s\u00e9rie: '🎬',
    seri: '🎬',
    not\u00edcia: '📰',
    notic: '📰',
    news: '📰',
    infantil: '🧸',
    kids: '🧸',
    relig: '⛪',
    gospel: '⛪',
    variedad: '✨',
    aberto: '📺',
    aberta: '📺',
    document: '🎞️',
    music: '🎵',
    m\u00fasica: '🎵',
    p\u00f3s: '🔞',
    pos: '🔞',
    adult: '🔞'
  };

  var DEMO_PLAYLIST = '#EXTM3U\n' +
    '#EXTINF:-1 tvg-logo="https://test-streams.mux.dev/test.png" group-title="Demonstra\u00e7\u00e3o",Big Buck Bunny (Teste)\n' +
    'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8\n' +
    '#EXTINF:-1 tvg-logo="https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd" group-title="Demonstra\u00e7\u00e3o",Tears of Steel (Teste)\n' +
    'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8\n' +
    '#EXTINF:-1 group-title="Demonstra\u00e7\u00e3o",Sintel (Teste)\n' +
    'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8\n';

  var state = {
    playlists: [],
    activeId: null,
    category: 'all',
    search: '',
    favorites: [],
    currentChannels: [],
    player: null,
    playerList: [],
    playerIndex: -1,
    referrer: null,
    controlTimer: null,
    currentUser: null,
    adultPin: null
  };

  var els = {};

  function loadDB() {
    if (state.currentUser && window.Cloud) {
      return Cloud.loadUserData(state.currentUser.id).then(function (data) {
        state.playlists = data.playlists || [];
        state.favorites = data.favorites || [];
        state.activeId = data.activeId || null;
        state.adultPin = data.adultPin || null;
      }).catch(function () {
        state.playlists = [];
        state.favorites = [];
        state.activeId = null;
        state.adultPin = null;
      });
    }
    try {
      state.playlists = JSON.parse(localStorage.getItem(STORAGE_PLAYLISTS)) || [];
      state.favorites = JSON.parse(localStorage.getItem(STORAGE_FAVORITES)) || [];
      state.activeId = localStorage.getItem(STORAGE_ACTIVE) || null;
    } catch (e) {
      state.playlists = [];
      state.favorites = [];
    }
    return Promise.resolve();
  }

  function saveDB() {
    if (state.currentUser && window.Cloud) {
      var data = { playlists: state.playlists, favorites: state.favorites, activeId: state.activeId, adultPin: state.adultPin || null };
      Cloud.saveUserData(state.currentUser.id, data).catch(function () {});
      return;
    }
    try {
      localStorage.setItem(STORAGE_PLAYLISTS, JSON.stringify(state.playlists));
      localStorage.setItem(STORAGE_FAVORITES, JSON.stringify(state.favorites));
      if (state.activeId) localStorage.setItem(STORAGE_ACTIVE, state.activeId);
      else localStorage.removeItem(STORAGE_ACTIVE);
    } catch (e) { }
  }

  function cleanPlaylistName(raw) {
    return raw.split('.')[0].replace(/[_\-]+/g, ' ').trim();
  }

  function parseM3U(text, baseUrl) {
    text = String(text || '').replace(/^\uFEFF/, '');
    var lines = text.split(/\r?\n/);
    var channels = [];
    var current = null;
    var referrer = null;
    var groups = {};

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;

      if (line.indexOf('#EXTVLCOPT:') === 0) {
        var opt = line.substring('#EXTVLCOPT:'.length);
        if (opt.indexOf('http-referrer=') === 0) {
          referrer = opt.substring('http-referrer='.length);
        }
        continue;
      }

      if (line.indexOf('#EXTINF') === 0) {
        var attr = {};
        var aMatch = line.match(/\s([a-zA-Z0-9\-]+)="([^"]*)"/g) || [];
        for (var a = 0; a < aMatch.length; a++) {
          var kv = aMatch[a].match(/^\s([a-zA-Z0-9\-]+)="([^"]*)"/);
          if (kv) attr[kv[1].toLowerCase()] = kv[2];
        }
        var name = attr['tvg-name'] || '';
        var commaIdx = line.lastIndexOf(',');
        if (commaIdx >= 0) {
          var afterComma = line.substring(commaIdx + 1).trim();
          if (afterComma && !name) name = afterComma;
          if (afterComma && name === attr['tvg-name']) {
            name = afterComma;
          }
        }
        if (!name && attr['tvg-name']) name = attr['tvg-name'];
        if (!name || name.indexOf('#') === 0) name = 'Canal ' + (channels.length + 1);

        var group = attr['group-title'] || 'Sem Categoria';
        var ch = {
          name: name,
          id: attr['tvg-id'] || '',
          logo: attr['tvg-logo'] || '',
          group: group,
          url: '',
          referrer: referrer || ''
        };
        current = ch;
        continue;
      }

      if (current && line.indexOf('#') !== 0) {
        var url = line;
        if (baseUrl && url.indexOf('http') !== 0) {
          url = baseUrl.replace(/\/?$/, '/') + url.replace(/^\/+/, '');
        }
        current.url = url;
        if (current.url) {
          channels.push(current);
          groups[current.group] = (groups[current.group] || 0) + 1;
        }
        current = null;
        referrer = null;
      }
    }
    return { channels: channels, groups: groups };
  }

  function buildReferrerRules(playlists) {
    var rules = [{ host: 'megacine.media', referrer: 'https://megacine.media/' }];
    for (var p = 0; p < playlists.length; p++) {
      var pl = playlists[p];
      for (var c = 0; c < pl.channels.length; c++) {
        var ch = pl.channels[c];
        if (ch.referrer) {
          var host = '';
          try { host = new URL(ch.url).hostname; } catch (e) { }
          if (host && !rules.some(function (r) { return r.host === host; })) {
            rules.push({ host: host, referrer: ch.referrer });
          }
        }
      }
    }
    if (window.vibetv && window.vibetv.ipc) {
      window.vibetv.ipc.sendReferrers(rules);
    }
  }

  function toast(msg, isError) {
    var t = els.toast;
    t.textContent = msg;
    t.className = 'toast show' + (isError ? ' error' : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.className = 'toast'; }, 3200);
  }

  function catIcon(name) {
    var n = String(name || '').toLowerCase();
    for (var key in CAT_ICONS) {
      if (n.indexOf(key) >= 0) return CAT_ICONS[key];
    }
    return '📺';
  }

  function fmtCount(n) {
    return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
  }

  function currentPlaylist() {
    for (var i = 0; i < state.playlists.length; i++) {
      if (state.playlists[i].id === state.activeId) return state.playlists[i];
    }
    return null;
  }

  function addPlaylist(playlist, activate) {
    state.playlists.push(playlist);
    if (activate || state.playlists.length === 1) {
      state.activeId = playlist.id;
      state.category = 'all';
    }
    saveDB();
    buildReferrerRules(state.playlists);
  }

  function removePlaylist(id) {
    state.playlists = state.playlists.filter(function (p) { return p.id !== id; });
    if (state.activeId === id) {
      state.activeId = state.playlists.length ? state.playlists[0].id : null;
      state.category = 'all';
    }
    saveDB();
    buildReferrerRules(state.playlists);
  }

  function uniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function importText(text, name, source, url, activate) {
    var parsed = parseM3U(text, url);
    if (!parsed.channels.length) {
      toast('Nenhum canal encontrado nesta lista. Verifique o link/arquivo.', true);
      return null;
    }
    var pl = {
      id: uniqueId(),
      name: name,
      source: source,
      url: url || '',
      date: Date.now(),
      channels: parsed.channels,
      groups: Object.keys(parsed.groups)
    };
    addPlaylist(pl, activate);
    return pl;
  }

  function firstRunImport() {
    if (state.playlists.length) return Promise.resolve();
    var bundled = window.BUNDLED_PLAYLIST;
    var fetcher = fetch('playlists/playlist_embedcanais.m3u')
      .then(function (r) { if (!r.ok) throw new Error('nf'); return r.text(); })
      .catch(function () { return bundled; });
    return fetcher.then(function (text) {
      if (text && text.indexOf('#EXTM3U') >= 0) {
        importText(text, 'Embed Canais', 'bundled', '', true);
        buildReferrerRules(state.playlists);
      }
      return null;
    });
  }

  function fetchPlaylistUrl(url) {
    return fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      });
  }

  function addFromUrl(url) {
    els.setupError.classList.add('hidden');
    toast('Baixando lista...');
    fetchPlaylistUrl(url).then(function (text) {
      var name = cleanPlaylistName(url.split('/').pop() || 'Lista IPTV');
      var pl = importText(text, name, 'url', url, true);
      if (pl) {
        toast('Lista "' + pl.name + '" adicionada com ' + pl.channels.length + ' canais!');
        enterApp();
      }
    }).catch(function () {
      toast('Não foi possível baixar a lista. Verifique o link ou a conexão.', true);
    });
  }

  function handleFileUpload(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var name = cleanPlaylistName(file.name || 'Lista IPTV');
      var pl = importText(reader.result, name, 'file', '', true);
      if (pl) {
        toast('Lista "' + pl.name + '" adicionada com ' + pl.channels.length + ' canais!');
        enterApp();
      }
    };
    reader.onerror = function () {
      toast('Falha ao ler o arquivo.', true);
    };
    reader.readAsText(file);
  }

  function isFav(url) {
    return state.favorites.some(function (f) { return f.url === url; });
  }

  function toggleFav(channel) {
    var idx = state.favorites.findIndex(function (f) { return f.url === channel.url; });
    if (idx >= 0) {
      state.favorites.splice(idx, 1);
      toast('Removido dos favoritos');
    } else {
      state.favorites.push({ url: channel.url, name: channel.name, logo: channel.logo, group: channel.group });
      toast('Adicionado aos favoritos');
    }
    saveDB();
    renderChannels();
    updateFavUI();
  }

  function updateFavUI() {
    var badge = els.favCount;
    if (state.favorites.length > 0) {
      badge.textContent = state.favorites.length;
      badge.removeAttribute('hidden');
    } else {
      badge.setAttribute('hidden', '');
    }
    if (state.player && els.favToggle) {
      if (state.player.channel) {
        els.favToggle.className = 'player-btn' + (isFav(state.player.channel.url) ? ' fav-active' : '');
      }
    }
  }

  function showScreen(name) {
    var setup = name === 'setup';
    var login = name === 'login';
    els.setupScreen.classList.toggle('hidden', !setup);
    els.appScreen.classList.toggle('hidden', setup || login);
    els.loginScreen.classList.toggle('hidden', !login);
  }

  function enterApp() {
    if (!state.playlists.length && !state.currentUser) {
      showScreen('setup');
      return;
    }
    if (state.megaActive) window.Mega.deactivate();
    showScreen('app');
    buildReferrerRules(state.playlists);
    if (!state.playlists.length) {
      firstRunImport().then(function () {
        renderSidebar();
        renderChannels();
        updateFavUI();
      });
    } else {
      renderSidebar();
      renderChannels();
      updateFavUI();
    }
    if (state.category !== 'all' && state.currentChannels.length) {
      var first = state.currentChannels[0];
      setTimeout(function () { focusChannel(first); }, 120);
    }
  }

  function screenshotChannel(channel) {
    return '🎬';
  }

  var ADULT_GROUP_KW = ['adult', 'adulto', 'p\u00f3s', 'pos', 'xxx', 'er\u00f3tico', 'erotico', 'hentai', 'porn\u00f4', 'porno', 'er\u00f3tica'];

  function channelListFor(category) {
    var pl = currentPlaylist();
    if (!pl) return [];
    var list = pl.channels.slice();
    if (category === 'fav') {
      var favSet = {};
      state.favorites.forEach(function (f) { favSet[f.url] = f; });
      list = list.filter(function (c) { return favSet[c.url]; });
    } else if (category !== 'all') {
      list = list.filter(function (c) { return c.group === category; });
    }
    var hasAdult = state.currentUser && state.currentUser.adult;
    if (!hasAdult) {
      list = list.filter(function (c) {
        var g = (c.group || '').toLowerCase();
        return !ADULT_GROUP_KW.some(function (k) { return g.indexOf(k) >= 0; });
      });
    }
    if (state.search) {
      var q = state.search.toLowerCase();
      list = list.filter(function (c) { return c.name.toLowerCase().indexOf(q) >= 0; });
    }
    return list;
  }

  function focusChannel(channel) {
    var cards = $$('.channel-card');
    var current = null;
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].dataset.url === channel.url) { current = cards[i]; break; }
    }
    if (current) {
      current.classList.add('focused');
      current.focus();
    }
  }

  function renderSidebar() {
    var pl = currentPlaylist();
    var catList = els.catList;
    catList.innerHTML = '';
    if (!pl) return;

    var items = [];
    items.push({ key: 'all', name: 'Todos os Canais', icon: '📺', count: pl.channels.length });
    pl.groups.forEach(function (g) {
      items.push({ key: g, name: g, icon: catIcon(g), count: pl.channels.filter(function (c) { return c.group === g; }).length });
    });

    items.forEach(function (item) {
      var btn = document.createElement('button');
      btn.className = 'cat-item' + (state.category === item.key && !state.megaActive ? ' active' : '');
      btn.tabIndex = 0;
      btn.innerHTML = '<span class="cat-icon">' + item.icon + '</span><span class="cat-name"></span><span class="cat-count"></span>';
      btn.querySelector('.cat-name').textContent = item.name;
      btn.querySelector('.cat-count').textContent = fmtCount(item.count);
      btn.addEventListener('click', function () {
        if (state.megaActive) window.Mega.deactivate();
        if (window.Adult && Adult.isActive()) Adult.deactivate();
        state.category = item.key;
        renderSidebar();
        renderChannels();
        closeSidebarMobile();
      });
      catList.appendChild(btn);
    });

    var favBtn = els.btnCatFavorites;
    favBtn.classList.toggle('active', state.category === 'fav');
    var allBtn = els.btnCatAll;
    allBtn.classList.toggle('active', state.category === 'all');
  }

  function renderChannels() {
    var list = channelListFor(state.category);
    state.currentChannels = list;
    var grid = els.channelGrid;
    grid.innerHTML = '';

    var pl = currentPlaylist();
    var title = 'Todos os Canais';
    if (state.category === 'fav') title = 'Meus Favoritos';
    else if (pl && state.category !== 'all') title = state.category;
    els.contentTitle.textContent = title;

    var frag = document.createDocumentFragment();
    list.forEach(function (ch, idx) {
      var card = document.createElement('div');
      card.className = 'channel-card' + (ch.logo ? '' : ' no-logo') + (isFav(ch.url) ? ' fav' : '');
      card.tabIndex = 0;
      card.dataset.url = ch.url;
      card.dataset.idx = idx;

      var logoHtml = '';
      if (ch.logo) {
        logoHtml = '<img src="' + ch.logo + '" alt="" loading="lazy" onerror="this.parentNode.classList.add(\'no-logo\'); this.remove();">';
      } else {
        logoHtml = '<div class="logo-fallback"></div>';
      }

      card.innerHTML =
        '<div class="channel-logo">' + logoHtml + '</div>' +
        '<div class="channel-info">' +
        '<div class="channel-name"></div>' +
        '<div class="channel-cat"></div>' +
        '</div>' +
        '<div class="channel-fav">★</div>';

      if (!card.querySelector('.logo-fallback')) {
        var fallback = document.createElement('div');
        fallback.className = 'logo-fallback';
        fallback.textContent = (ch.name || '?').trim().charAt(0).toUpperCase();
        card.querySelector('.channel-logo').appendChild(fallback);
      }

      card.querySelector('.channel-name').textContent = ch.name;
      card.querySelector('.channel-cat').textContent = ch.group;

      card.addEventListener('click', function () { openPlayer(ch, list, idx); });
      card.addEventListener('dblclick', function () { toggleFullscreen(); });
      frag.appendChild(card);
    });

    grid.appendChild(frag);
    els.emptyState.classList.toggle('hidden', list.length > 0);
  }

  function closeSidebarMobile() {
    els.sidebar.classList.remove('open');
  }

  function setMegaMode(on, title) {
    state.megaActive = on;
    els.megaRoot.classList.toggle('hidden', !on);
    els.channelGrid.classList.toggle('hidden', on);
    els.emptyState.classList.add('hidden');
    var ar = document.getElementById('adult-root');
    if (on && ar) { ar.classList.add('hidden'); ar.innerHTML = ''; }
    if (on) {
      els.contentTitle.textContent = title || '';
      els.btnBack.classList.remove('hidden');
      setSearchPlaceholder('Buscar filmes, séries...');
      updateMegaNav();
    } else {
      els.btnBack.classList.add('hidden');
      setSearchPlaceholder('Buscar canal...');
    }
    renderSidebar();
  }

  function setSearchPlaceholder(txt) {
    els.searchInput.placeholder = txt;
  }

  function updateMegaNav() {
    var activeCat = window.Mega.isActive() ? window.Mega.currentCategory() : '';
    [els.btnMegaFilmes, els.btnMegaSeries, els.btnMegaAnimacao].forEach(function (b) {
      b.classList.remove('active');
    });
    if (!activeCat) return;
    var map = { filmes: els.btnMegaFilmes, series: els.btnMegaSeries, animacao: els.btnMegaAnimacao };
    if (map[activeCat]) map[activeCat].classList.add('active');
  }

  function openPlayerList(list, idx, opts) {
    opts = opts || {};
    if (!list.length) return;
    openPlayer(list[idx], list, idx, opts);
  }

  window.VibeTV = {
    openPlayerList: openPlayerList,
    toast: toast,
    setMegaMode: setMegaMode,
    addReferrerRule: function (host, referrer) {
      buildReferrerRules(state.playlists);
    },
    getCurrentUser: function () { return state.currentUser; },
    getAdultPin: function () { return state.adultPin; },
    setAdultPin: function (pin) { state.adultPin = pin; saveDB(); },
    getActivePlaylist: function () { return currentPlaylist(); },
    getAdultChannels: function () {
      var pl = currentPlaylist();
      if (!pl) return [];
      var ADULT_KW = ['adult', 'adulto', 'p\u00f3s', 'pos', 'xxx', 'er\u00f3tico', 'erotico', 'hentai', 'porn\u00f4', 'porno', 'er\u00f3tica'];
      return pl.channels.filter(function (ch) {
        var g = (ch.group || '').toLowerCase();
        return ADULT_KW.some(function (k) { return g.indexOf(k) >= 0; });
      });
    }
  };

  /* ================== PLAYER ================== */

  function buildPlayerList(list, idx) {
    var size = Math.min(list.length, 21);
    var start = Math.max(0, Math.min(idx - 10, list.length - size));
    return list.slice(start, start + size);
  }

  function openPlayer(channel, list, idx, opts) {
    opts = opts || {};
    if (state.player) stopPlayer();
    state.player = {
      channel: channel,
      list: list,
      index: idx,
      hls: null,
      mode: null,
      failed: { hls: false, native: false },
      allowFav: opts.allowFav !== false
    };
    els.playerOverlay.classList.remove('hidden');
    els.playerLoading.classList.remove('hidden');
    els.playerError.classList.add('hidden');
    els.playerTitle.textContent = channel.name;
    els.favToggle.classList.toggle('hidden', !state.player.allowFav);
    renderThumbs();
    updateFavUI();
    playChannel(channel);
    hideControlsSoon(4000);
  }

  function stopPlayer() {
    if (!state.player) return;
    var p = state.player;
    if (p.hls) {
      try { p.hls.destroy(); } catch (e) { }
      p.hls = null;
    }
    els.videoPlayer.removeAttribute('src');
    els.videoPlayer.load();
    state.player = null;
    els.playerOverlay.classList.add('hidden');
    restoreFocus();
  }

  function setReferrerHeader(xhr) {
    try {
      if (state.player && state.player.channel.referrer) {
        xhr.setRequestHeader('Referer', state.player.channel.referrer);
      }
    } catch (e) { }
  }

  function playChannel(channel) {
    if (!state.player) return;
    state.player.channel = channel;
    state.player.failed = { hls: false, native: false };
    els.playerTitle.textContent = channel.name;
    els.playerLoading.classList.remove('hidden');
    els.playerError.classList.add('hidden');
    renderThumbs();
    updateFavUI();

    var video = els.videoPlayer;
    var url = channel.url;

    if (state.player.hls) {
      try { state.player.hls.destroy(); } catch (e) { }
      state.player.hls = null;
    }

    var useHls = window.Hls && Hls.isSupported() && url.indexOf('.m3u8') >= 0;
    if (!useHls && url.indexOf('.m3u8') >= 0 && video.canPlayType('application/vnd.apple.mpegurl')) {
      useHls = false;
    }

    if (useHls) {
      var hlsConfig = {
        enableWorker: true,
        lowLatencyMode: true,
        capLevelToPlayerSize: false
      };

      if (isWeb) {
        hlsConfig.loader = function (config) {
          var realLoader = new Hls.DefaultConfig.loader(config);
          var origLoad = realLoader.load.bind(realLoader);
          realLoader.load = function (context, config, callbacks) {
            if (context.url) {
              context.url = streamProxyUrl(context.url);
            }
            return origLoad(context, config, callbacks);
          };
          return realLoader;
        };
      }

      var hls = new Hls(hlsConfig);
      state.player.hls = hls;
      state.player.mode = 'hls';
      hls.on(Hls.Events.ERROR, function (e, data) {
        if (!state.player) return;
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            showPlayerError();
          }
        }
      });
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, function () {
        video.play().catch(function () { showPlayerError(); });
      });
      hls.on(Hls.Events.FRAG_LOADED, function () {
        hideLoading();
      });
    } else {
      state.player.mode = 'native';
      video.src = url;
      video.play().catch(function () {
        setTimeout(function () {
          if (!state.player) return;
          showPlayerError();
        }, 6000);
      });
    }
  }

  function onVideoLoaded() {
    hideLoading();
  }

  function hideLoading() {
    if (state.player) els.playerLoading.classList.add('hidden');
  }

  function showPlayerError() {
    if (!state.player) return;
    els.playerLoading.classList.add('hidden');
    els.playerError.classList.remove('hidden');
    state.player.failed = { hls: true, native: true };
  }

  function retryChannel() {
    if (!state.player) return;
    els.playerError.classList.add('hidden');
    els.playerLoading.classList.remove('hidden');
    if (state.player.hls) {
      try { state.player.hls.destroy(); } catch (e) { }
      state.player.hls = null;
    }
    els.videoPlayer.removeAttribute('src');
    els.videoPlayer.load();
    playChannel(state.player.channel);
  }

  function zap(dir) {
    if (!state.player) return;
    var list = state.player.list;
    if (!list.length) return;
    var idx = (state.player.index + dir + list.length) % list.length;
    state.player.index = idx;
    playChannel(list[idx]);
    renderThumbs();
    scrollThumbIntoView(idx);
    hideControlsSoon(4000);
  }

  function renderThumbs() {
    var p = state.player;
    if (!p) return;
    var list = p.list;
    var thumbs = els.playerThumbs;
    thumbs.innerHTML = '';
    for (var i = 0; i < list.length; i++) {
      var ch = list[i];
      var btn = document.createElement('button');
      btn.className = 'thumb-card' + (i === p.index ? ' thumb-active' : '');
      btn.tabIndex = 0;
      btn.innerHTML = '<span class="thumb-name"></span>';
      btn.querySelector('.thumb-name').textContent = ch.name;
      if (i === p.index) {
        btn.classList.add('thumb-active');
        btn.style.borderColor = 'var(--gold)';
      }
      (function (idx) {
        btn.addEventListener('click', function () {
          if (!state.player) return;
          state.player.index = idx;
          playChannel(list[idx]);
        });
      })(i);
      thumbs.appendChild(btn);
    }
    scrollThumbIntoView(p.index);
  }

  function scrollThumbIntoView(idx) {
    var thumbs = els.playerThumbs;
    var card = thumbs.querySelectorAll('.thumb-card')[idx];
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  function hideControlsSoon(ms) {
    clearTimeout(state.controlTimer);
    state.controlTimer = setTimeout(function () {
      els.playerFrame.classList.remove('show-controls');
    }, ms);
  }

  function showControls() {
    els.playerFrame.classList.add('show-controls');
    hideControlsSoon(4000);
  }

  /* ================== FOCUS / REMOTE ================== */

  function playerFocusables() {
    return [els.closePlayer, els.favToggle, els.btnFullscreen].concat($$('.thumb-card'));
  }

  function appFocusables() {
    var list = [
      els.btnFavorites, els.btnHome, els.btnAddMore, els.btnSettings,
      els.btnMegaFilmes, els.btnMegaSeries, els.btnMegaAnimacao,
      els.btnCatAll, els.btnCatFavorites
    ].concat($$('#cat-list .cat-item'));
    if (state.megaActive) {
      list = list.concat($$('.mega-card, .epi-card, .chip, .mega-loadmore'));
    } else if (state.currentChannels.length) {
      list = list.concat($$('.channel-card'));
    }
    return list;
  }

  function visible(el) {
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function moveFocus(axis, dir) {
    var els2 = state.player ? playerFocusables() : appFocusables();
    els2 = els2.filter(visible);
    var active = document.activeElement;
    var aRect = active && active.tagName ? active.getBoundingClientRect() : null;
    var aC = aRect ? { x: (aRect.left + aRect.right) / 2, y: (aRect.top + aRect.bottom) / 2 } : null;
    var best = null;
    var bestScore = Infinity;

    for (var i = 0; i < els2.length; i++) {
      var el = els2[i];
      if (el === active) continue;
      var r = el.getBoundingClientRect();
      var c = { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
      var dx = aC ? c.x - aC.x : 0;
      var dy = aC ? c.y - aC.y : 0;

      if (axis === 'x' && (dx * dir <= 0)) continue;
      if (axis === 'y' && (dy * dir <= 0)) continue;
      if (axis === 'x' && Math.abs(dy) > 120) continue;
      if (axis === 'y') {
        var overlap = Math.min(aRect.right, r.right) - Math.max(aRect.left, r.left);
        if (overlap < Math.min(aRect.width, r.width) * 0.2) continue;
      }
      var score = Math.abs(dx) + Math.abs(dy);
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    if (best) {
      if (best.classList) best.classList.add('focused');
      best.focus();
    }
  }

  function handleKey(e) {
    var key = e.key;
    var tag = document.activeElement ? document.activeElement.tagName : '';
    var isInput = tag === 'INPUT' || tag === 'TEXTAREA';

    if (isInput && key !== 'Escape') {
      if (key === 'Enter' && document.activeElement === els.urlInput) {
        addFromUrl(els.urlInput.value.trim());
        return;
      }
      return;
    }

    if (state.player) {
      if (key === 'Escape' || key === 'Backspace' || key === 'MediaStop') {
        e.preventDefault();
        stopPlayer();
        return;
      }
      if (key === 'ArrowUp') { e.preventDefault(); zap(-1); return; }
      if (key === 'ArrowDown') { e.preventDefault(); zap(1); return; }
      if (key === 'ArrowLeft') { e.preventDefault(); moveFocus('x', -1); return; }
      if (key === 'ArrowRight') { e.preventDefault(); moveFocus('x', 1); return; }
      if (key === 'ArrowUp' || key === 'ArrowDown') {}
      if (key === 'Enter') {
        e.preventDefault();
        var cur = document.activeElement;
        if (cur && cur.classList && cur.classList.contains('thumb-card')) {
          cur.click();
        }
        return;
      }
      return;
    }

    if (els.playlistModal.classList.contains('hidden') === false) {
      if (key === 'Escape' || key === 'Backspace') { e.preventDefault(); closePlaylistModal(); return; }
      if (key === 'Enter') {
        var cur2 = document.activeElement;
        if (cur2 && cur2.classList && cur2.classList.contains('playlist-row')) cur2.click();
      }
      return;
    }

    if (state.megaActive) {
      if (key === 'Escape' || key === 'Backspace') {
        if (els.sidebar.classList.contains('open')) { closeSidebarMobile(); return; }
        e.preventDefault();
        window.Mega.back();
        return;
      }
      if (key === 'Enter') {
        var curM = document.activeElement;
        if (curM && curM.classList) {
          if (curM.classList.contains('mega-card') ||
              curM.classList.contains('epi-card') ||
              curM.classList.contains('chip') ||
              curM.classList.contains('mega-loadmore') ||
              curM.classList.contains('icon-btn')) {
            e.preventDefault();
            curM.click();
            return;
          }
        }
      }
    }

    if (window.Adult && Adult.isActive()) {
      if (key === 'Escape' || key === 'Backspace') {
        if (els.sidebar.classList.contains('open')) { closeSidebarMobile(); return; }
        e.preventDefault();
        Adult.deactivate();
        return;
      }
    }

    if (key === 'Escape' || key === 'Backspace') {
      if (els.sidebar.classList.contains('open')) { closeSidebarMobile(); return; }
      if (!els.searchInput.value) {
        showScreen(state.playlists.length ? 'app' : 'setup');
      } else {
        e.preventDefault();
        els.searchInput.value = '';
        state.search = '';
        renderChannels();
      }
      return;
    }

    if (key === 'ArrowUp') { e.preventDefault(); moveFocus('y', -1); return; }
    if (key === 'ArrowDown') { e.preventDefault(); moveFocus('y', 1); return; }
    if (key === 'ArrowLeft') { e.preventDefault(); moveFocus('x', -1); return; }
    if (key === 'ArrowRight') { e.preventDefault(); moveFocus('x', 1); return; }

    if (key === 'Enter') {
      var cur3 = document.activeElement;
      if (cur3 && cur3.classList) {
        if (cur3.classList.contains('channel-card')) cur3.click();
        else if (cur3.classList.contains('cat-item')) cur3.click();
        else if (cur3.classList.contains('icon-btn')) cur3.click();
      }
      return;
    }

    if (key === 'f' || key === 'F') toggleFullscreen();
  }

  function restoreFocus() {
    if (state.currentChannels.length) {
      var idx = Math.min(state.playerIndex, state.currentChannels.length - 1);
      focusChannel(state.currentChannels[idx < 0 ? 0 : idx]);
    }
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(function () { });
    } else {
      document.documentElement.requestFullscreen().catch(function () { });
    }
  }

  /* ================== MODAL PLAYLISTS ================== */

  function renderPlaylistModal() {
    var list = els.playlistList;
    list.innerHTML = '';
    if (!state.playlists.length) {
      list.innerHTML = '<div class="playlist-empty">Nenhuma lista adicionada ainda.</div>';
    }
    state.playlists.forEach(function (pl) {
      var row = document.createElement('div');
      row.className = 'playlist-row';
      row.tabIndex = 0;

      var info = document.createElement('div');
      info.className = 'playlist-info';
      var name = document.createElement('div');
      name.className = 'playlist-name';
      name.textContent = pl.name + (pl.id === state.activeId ? ' (ativo)' : '');
      var meta = document.createElement('div');
      meta.className = 'playlist-meta';
      var src = pl.source === 'url' ? 'Link' : pl.source === 'file' ? 'Arquivo' : 'Incluída';
      meta.textContent = src + ' • ' + pl.channels.length + ' canais';
      info.appendChild(name);
      info.appendChild(meta);

      var useBtn = document.createElement('button');
      useBtn.className = 'mini-btn';
      useBtn.title = 'Usar esta lista';
      useBtn.textContent = '▶';
      useBtn.addEventListener('click', function () {
        state.activeId = pl.id;
        state.category = 'all';
        state.search = '';
        els.searchInput.value = '';
        saveDB();
        renderPlaylistModal();
        renderSidebar();
        renderChannels();
        toast('Lista ativa: ' + pl.name);
      });

      var refreshBtn = document.createElement('button');
      refreshBtn.className = 'mini-btn';
      refreshBtn.title = 'Atualizar (somente links)';
      refreshBtn.textContent = '↻';
      refreshBtn.addEventListener('click', function () {
        if (pl.source !== 'url' || !pl.url) { toast('Esta lista não possui link para atualizar.', true); return; }
        toast('Atualizando lista...');
        fetchPlaylistUrl(pl.url).then(function (text) {
          var parsed = parseM3U(text, pl.url);
          if (!parsed.channels.length) throw new Error('vazia');
          pl.channels = parsed.channels;
          pl.groups = Object.keys(parsed.groups);
          pl.date = Date.now();
          saveDB();
          buildReferrerRules(state.playlists);
          renderPlaylistModal();
          renderSidebar();
          renderChannels();
          toast('Lista atualizada: ' + pl.channels.length + ' canais');
        }).catch(function () {
          toast('Falha ao atualizar a lista.', true);
        });
      });

      var delBtn = document.createElement('button');
      delBtn.className = 'mini-btn danger';
      delBtn.title = 'Remover';
      delBtn.textContent = '🗑';
      delBtn.addEventListener('click', function () {
        removePlaylist(pl.id);
        renderPlaylistModal();
        renderSidebar();
        renderChannels();
        toast('Lista removida');
        if (!state.playlists.length) showScreen('setup');
      });

      row.appendChild(info);
      row.appendChild(useBtn);
      row.appendChild(refreshBtn);
      row.appendChild(delBtn);
      list.appendChild(row);
    });
  }

  function openPlaylistModal() {
    renderPlaylistModal();
    els.playlistModal.classList.remove('hidden');
    setTimeout(function () {
      var first = els.playlistList.querySelector('.playlist-row');
      if (first) first.focus();
    }, 60);
  }

  function closePlaylistModal() {
    els.playlistModal.classList.add('hidden');
  }

  /* ================== INIT ================== */

  function bindUI() {
    els.setupScreen = $('#setup-screen');
    els.appScreen = $('#app-screen');
    els.loadingScreen = $('#loading-screen');
    els.setupError = $('#setup-error');
    els.urlField = $('#url-field');
    els.urlInput = $('#url-input');
    els.btnUrl = $('#btn-url');
    els.btnUrlAdd = $('#btn-url-add');
    els.btnFile = $('#btn-file');
    els.fileInput = $('#file-input');
    els.btnSample = $('#btn-sample');
    els.sampleRow = $('#sample-row');
    els.sidebar = $('#sidebar');
    els.catList = $('#cat-list');
    els.btnCatAll = $('#btn-cat-all');
    els.btnCatFavorites = $('#btn-cat-favorites');
    els.btnCatAdult = $('#btn-cat-adult');
    els.btnMegaFilmes = $('#btn-mega-filmes');
    els.btnMegaSeries = $('#btn-mega-series');
    els.btnMegaAnimacao = $('#btn-mega-animacao');
    els.channelGrid = $('#channel-grid');
    els.megaRoot = $('#mega-root');
    els.emptyState = $('#empty-state');
    els.contentTitle = $('#content-title');
    els.btnBack = $('#btn-back');
    els.searchInput = $('#search-input');
    els.toast = $('#toast');
    els.btnFavorites = $('#btn-favorites');
    els.btnHome = $('#btn-home');
    els.btnAddMore = $('#btn-add-more');
    els.btnSettings = $('#btn-settings');
    els.favCount = $('#fav-count');
    els.playerOverlay = $('#player-overlay');
    els.playerFrame = $('#player-frame');
    els.videoPlayer = $('#video-player');
    els.playerTitle = $('#player-title');
    els.closePlayer = $('#btn-close-player');
    els.favToggle = $('#btn-fav-toggle');
    els.btnFullscreen = $('#btn-fullscreen');
    els.playerLoading = $('#player-loading');
    els.playerError = $('#player-error');
    els.btnRetry = $('#btn-retry');
    els.playerThumbs = $('#player-thumbs');
    els.playlistModal = $('#playlist-modal');
    els.playlistList = $('#playlist-list');
    els.closeModal = $('#btn-close-modal');
    els.btnModalUrl = $('#btn-modal-url');
    els.btnModalFile = $('#btn-modal-file');

    els.loginScreen = $('#login-screen');
    els.loginUser = $('#login-user');
    els.loginPass = $('#login-pass');
    els.loginError = $('#login-error');
    els.btnDoLogin = $('#btn-do-login');
    els.btnAdmin = $('#btn-admin');
    els.btnLogout = $('#btn-logout');
    els.adminModal = $('#admin-modal');
    els.adminList = $('#admin-list');
    els.adminNewUser = $('#admin-new-user');
    els.adminNewPass = $('#admin-new-pass');
    els.adminNewRole = $('#admin-new-role');
    els.btnAdminAddUser = $('#btn-admin-add-user');
    els.btnAdminExport = $('#btn-admin-export');
    els.btnAdminImport = $('#btn-admin-import');
    els.btnCloseAdmin = $('#btn-close-admin');
    els.adminNewDuration = $('#admin-new-duration');
    els.adminNewAdult = $('#admin-new-adult');
    els.pinModal = $('#pin-modal');
    els.btnClosePin = $('#btn-close-pin');
    els.btnPinSubmit = $('#btn-pin-submit');

    els.btnUrl.addEventListener('click', function () {
      els.urlField.classList.toggle('hidden');
      if (!els.urlField.classList.contains('hidden')) els.urlInput.focus();
    });
    els.btnUrlAdd.addEventListener('click', function () {
      var v = els.urlInput.value.trim();
      if (!v) { toast('Cole o link da sua lista primeiro.', true); return; }
      addFromUrl(v);
    });
    els.btnFile.addEventListener('click', function () { els.fileInput.click(); });
    els.fileInput.addEventListener('change', function () {
      var f = els.fileInput.files[0];
      if (f) handleFileUpload(f);
      els.fileInput.value = '';
    });
    els.btnSample.addEventListener('click', function () {
      var pl = importText(DEMO_PLAYLIST, 'Lista de Demonstração', 'demo', '', true);
      if (pl) { toast('Lista de demonstração carregada!'); enterApp(); }
    });

    els.btnSettings.addEventListener('click', openPlaylistModal);
    els.closeModal.addEventListener('click', closePlaylistModal);
    els.btnModalUrl.addEventListener('click', function () {
      closePlaylistModal();
      showScreen('setup');
      els.urlField.classList.remove('hidden');
      setTimeout(function () { els.urlInput.focus(); }, 100);
    });
    els.btnModalFile.addEventListener('click', function () { els.fileInput.click(); });

    els.btnFavorites.addEventListener('click', function () {
      if (state.megaActive) window.Mega.deactivate();
      state.category = 'fav';
      renderSidebar();
      renderChannels();
      closeSidebarMobile();
    });
    els.btnHome.addEventListener('click', function () { enterApp(); });
    els.btnAddMore.addEventListener('click', function () {
      showScreen('setup');
      els.urlField.classList.remove('hidden');
      setTimeout(function () { els.urlInput.focus(); }, 100);
    });

    els.btnCatAll.addEventListener('click', function () {
      if (state.megaActive) window.Mega.deactivate();
      if (window.Adult && Adult.isActive()) Adult.deactivate();
      state.category = 'all';
      renderSidebar();
      renderChannels();
      closeSidebarMobile();
    });
    els.btnCatFavorites.addEventListener('click', function () {
      if (state.megaActive) window.Mega.deactivate();
      if (window.Adult && Adult.isActive()) Adult.deactivate();
      state.category = 'fav';
      renderSidebar();
      renderChannels();
      closeSidebarMobile();
    });

    els.btnMegaFilmes.addEventListener('click', function () {
      if (window.Adult && Adult.isActive()) Adult.deactivate();
      window.Mega.browse('filmes');
      closeSidebarMobile();
    });
    els.btnMegaSeries.addEventListener('click', function () {
      if (window.Adult && Adult.isActive()) Adult.deactivate();
      window.Mega.browse('series');
      closeSidebarMobile();
    });
    els.btnMegaAnimacao.addEventListener('click', function () {
      if (window.Adult && Adult.isActive()) Adult.deactivate();
      window.Mega.browse('animacao');
      closeSidebarMobile();
    });

    els.btnBack.addEventListener('click', function () {
      if (window.Adult && Adult.isActive()) { Adult.deactivate(); return; }
      window.Mega.back();
    });

    els.searchInput.addEventListener('input', function () {
      state.search = els.searchInput.value.trim();
      clearTimeout(bindUI._searchT);
      if (state.megaActive) {
        bindUI._searchT = setTimeout(function () {
          window.Mega.search(state.search);
        }, 350);
      } else if (window.Adult && Adult.isActive()) {
        Adult.search(state.search);
      } else {
        renderChannels();
      }
    });

    els.closePlayer.addEventListener('click', stopPlayer);
    els.favToggle.addEventListener('click', function () {
      if (state.player) toggleFav(state.player.channel);
    });
    els.btnFullscreen.addEventListener('click', toggleFullscreen);
    els.btnRetry.addEventListener('click', retryChannel);

    els.videoPlayer.addEventListener('playing', onVideoLoaded);
    els.videoPlayer.addEventListener('loadeddata', onVideoLoaded);
    els.videoPlayer.addEventListener('click', function () {
      if (els.videoPlayer.paused) els.videoPlayer.play().catch(function () { });
      else els.videoPlayer.pause();
    });
    els.videoPlayer.addEventListener('dblclick', toggleFullscreen);

    els.playerFrame.addEventListener('mousemove', showControls);
    els.playerFrame.addEventListener('touchstart', showControls);

    document.addEventListener('keydown', handleKey);

    window.addEventListener('resize', function () {
      var focused = document.activeElement;
      if (focused && focused.classList && focused.classList.contains('channel-card')) {
        var r = focused.getBoundingClientRect();
        if (r.bottom > window.innerHeight) {
          focused.scrollIntoView({ block: 'nearest' });
        }
      }
    });

    els.btnDoLogin.addEventListener('click', doLogin);
    els.loginPass.addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
    els.loginUser.addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });

    els.btnLogout.addEventListener('click', function () {
      state.currentUser = null;
      state.adultPin = null;
      if (window.Adult) Adult.deactivate();
      els.btnCatAdult.classList.add('hidden');
      showScreen('login');
      els.loginUser.value = '';
      els.loginPass.value = '';
      els.loginError.classList.add('hidden');
    });

    els.btnAdmin.addEventListener('click', openAdminModal);
    els.btnCloseAdmin.addEventListener('click', function () { els.adminModal.classList.add('hidden'); });
    els.btnAdminAddUser.addEventListener('click', adminCreateUser);
    els.btnAdminExport.addEventListener('click', adminExport);
    els.btnAdminImport.addEventListener('click', adminImport);

    els.btnCatAdult.addEventListener('click', function () {
      if (window.Adult) Adult.activate();
      closeSidebarMobile();
    });

    els.btnClosePin.addEventListener('click', function () { els.pinModal.classList.add('hidden'); });
    els.btnPinSubmit.addEventListener('click', function () { if (window.Adult) Adult.handlePinSubmit(); });
    els.pinModal.addEventListener('keydown', function (e) { if (window.Adult) Adult.handlePinKeydown(e); });
  }

  function doLogin() {
    var username = els.loginUser.value.trim();
    var password = els.loginPass.value;
    if (!username || !password) {
      els.loginError.textContent = 'Preencha usuário e senha.';
      els.loginError.classList.remove('hidden');
      return;
    }
    if (window.Cloud) {
      Cloud.login(username, password).then(function (user) {
        if (!user) {
          els.loginError.textContent = 'Usuário ou senha incorretos.';
          els.loginError.classList.remove('hidden');
          return;
        }
        if (user.expired) {
          els.loginError.textContent = 'Conta expirada.';
          els.loginError.classList.remove('hidden');
          return;
        }
        state.currentUser = user;
        els.loginError.classList.add('hidden');
        loadDB().then(function () {
          enterApp();
          if (user.role === 'admin') els.btnAdmin.classList.remove('hidden');
          else els.btnAdmin.classList.add('hidden');
          if (user.adult) els.btnCatAdult.classList.remove('hidden');
          else els.btnCatAdult.classList.add('hidden');
        });
      }).catch(function () {
        els.loginError.textContent = 'Erro ao conectar.';
        els.loginError.classList.remove('hidden');
      });
    } else {
      state.currentUser = { id: 'local', username: username, role: 'admin', adult: true };
      els.loginError.classList.add('hidden');
      loadDB().then(function () { enterApp(); els.btnAdmin.classList.remove('hidden'); els.btnCatAdult.classList.remove('hidden'); });
    }
  }

  function openAdminModal() {
    if (!state.currentUser || state.currentUser.role !== 'admin') return;
    els.adminModal.classList.remove('hidden');
    renderAdminList();
  }

  function renderAdminList() {
    var list = els.adminList;
    list.innerHTML = '';
    if (window.Cloud) {
      Cloud.listUsers().then(function (users) {
        users.forEach(function (u) {
          var row = document.createElement('div');
          row.className = 'playlist-row';
          row.tabIndex = 0;
          var info = document.createElement('div');
          info.className = 'playlist-info';
          var name = document.createElement('div');
          name.className = 'playlist-name';
          var expiryStr = Cloud.formatExpiry(u.expiry);
          var adultBadge = u.adult ? ' 🔞' : '';
          name.textContent = u.username + (u.role === 'admin' ? ' 👑' : '') + adultBadge + ' — ' + expiryStr;
          var meta = document.createElement('div');
          meta.className = 'playlist-meta';
          meta.textContent = 'ID: ' + u.id;
          info.appendChild(name);
          info.appendChild(meta);
          row.appendChild(info);

          var adultBtn = document.createElement('button');
          adultBtn.className = 'mini-btn' + (u.adult ? ' adult-active' : '');
          adultBtn.title = u.adult ? 'Remover adulto' : 'Ativar adulto';
          adultBtn.textContent = u.adult ? '🔞' : '🔓';
          adultBtn.style.fontSize = '14px';
          adultBtn.addEventListener('click', function () {
            Cloud.toggleAdult(u.id, !u.adult).then(function () {
              toast(u.adult ? 'Acesso adulto removido' : 'Acesso adulto ativado');
              renderAdminList();
            });
          });
          row.appendChild(adultBtn);

          var delBtn = document.createElement('button');
          delBtn.className = 'mini-btn danger';
          delBtn.title = 'Excluir';
          delBtn.textContent = '🗑';
          delBtn.addEventListener('click', function () {
            if (confirm('Excluir usuário "' + u.username + '"?')) {
              Cloud.deleteUser(u.id).then(function () {
                toast('Usuário excluído');
                renderAdminList();
              }).catch(function (e) { toast(e.message, true); });
            }
          });
          row.appendChild(delBtn);
          list.appendChild(row);
        });
        if (!users.length) {
          list.innerHTML = '<div class="playlist-empty">Nenhum usuário encontrado.</div>';
        }
      });
    }
  }

  function adminCreateUser() {
    var username = els.adminNewUser.value.trim();
    var password = els.adminNewPass.value;
    var role = els.adminNewRole.value;
    var duration = els.adminNewDuration ? els.adminNewDuration.value : '1m';
    var adult = els.adminNewAdult ? els.adminNewAdult.checked : false;
    if (!username || !password) {
      toast('Preencha usuário e senha.', true);
      return;
    }
    if (window.Cloud) {
      Cloud.createUser(username, password, role, duration, adult).then(function () {
        toast('Usuário "' + username + '" criado!');
        els.adminNewUser.value = '';
        els.adminNewPass.value = '';
        if (els.adminNewAdult) els.adminNewAdult.checked = false;
        renderAdminList();
      }).catch(function (e) { toast(e.message, true); });
    }
  }

  function adminExport() {
    if (window.Cloud) {
      Cloud.listUsers().then(function (users) {
        var blob = new Blob([JSON.stringify(users, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'vibetv_users_' + new Date().toISOString().slice(0, 10) + '.json';
        a.click();
        URL.revokeObjectURL(url);
        toast('Banco exportado com sucesso!');
      }).catch(function (e) { toast('Erro ao exportar: ' + e.message, true); });
    }
  }

  function adminImport() {
    if (window.Cloud) {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = function (e) {
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          try {
            var users = JSON.parse(reader.result);
            var promises = users.map(function (u) {
              return db.collection('users').doc(u.id).set(u);
            });
            toast('Importando ' + users.length + ' usuários...');
            Promise.all(promises).then(function () {
              toast('Banco importado com sucesso!');
              renderAdminList();
            }).catch(function (e) { toast('Erro ao importar: ' + e.message, true); });
          } catch (e) {
            toast('Arquivo inválido.', true);
          }
        };
        reader.readAsText(file);
      };
      input.click();
    }
  }

  function init() {
    els = {};
    bindUI();

    setTimeout(function () {
      els.loadingScreen.classList.add('hidden');
      showScreen('login');
      els.loginUser.focus();
    }, 900);
  }

  document.addEventListener('DOMContentLoaded', init);
})();