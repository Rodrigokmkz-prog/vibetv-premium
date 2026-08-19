var Adult = (function () {
  'use strict';

  var CATALOG_URL = 'js/adult_catalog.json';
  var PER_PAGE = 30;
  var ADULT_KW = ['adult', 'adulto', 'p\u00f3s', 'pos', 'xxx', 'er\u00f3tico', 'erotico', 'hentai', 'porn\u00f4', 'porno', 'er\u00f3tica'];

  var CAT_LABELS = {
    'todas': 'Todas',
    'anal': 'Anal',
    'amador': 'Amador',
    'gozada': 'Gozada',
    'masturbacao': 'Masturba\u00e7\u00e3o',
    'lesbicas': 'L\u00e9sbicas',
    'milf': 'MILF',
    'peitudas': 'Peitudas',
    'bucetinha': 'Bucetinha',
    'espanholas': 'Espanholas',
    'morenas': 'Morenas',
    'loiras': 'Loiras',
    'ruivas': 'Ruivas',
    'gordinhas': 'Gordinhas',
    'chupando': 'Chupando',
    'massagem': 'Massagem',
    'cosplay': 'Cosplay',
    '3d': '3D',
    'hentai': 'Hentai',
    'virgem': 'Virgem',
    'hibridas': 'H\u00edbridas',
    'negras': 'Negras',
    'grandes': 'Grandes',
    'brasileiras': 'Brasileiras',
    'coroa': 'Coroa',
    'caseira': 'Caseira'
  };

  var state = {
    active: false,
    unlocked: false,
    catalog: [],
    page: 1,
    cat: 'todas',
    search: '',
    loading: false
  };

  var $ = function (s) { return document.querySelector(s); };

  function rootEl() { return document.getElementById('adult-root'); }

  function hashPin(pin) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin + 'vibetv_salt_2026'))
      .then(function (buf) {
        return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
      });
  }

  function getAdultChannels() {
    if (typeof VibeTV !== 'undefined' && VibeTV.getAdultChannels) return VibeTV.getAdultChannels();
    return [];
  }

  function currentUser() { return (typeof VibeTV !== 'undefined' && VibeTV.getCurrentUser) ? VibeTV.getCurrentUser() : null; }
  function adultPin() { return (typeof VibeTV !== 'undefined' && VibeTV.getAdultPin) ? VibeTV.getAdultPin() : null; }
  function setAdultPin(h) { if (typeof VibeTV !== 'undefined' && VibeTV.setAdultPin) VibeTV.setAdultPin(h); }

  function activate() {
    if (state.active) return;
    var user = currentUser();
    if (!user || !user.adult) {
      if (typeof VibeTV !== 'undefined') VibeTV.toast('Acesso adulto n\u00e3o autorizado.', true);
      return;
    }
    var pin = adultPin();
    if (!pin) {
      showPinModal('setup');
    } else {
      showPinModal('verify');
    }
  }

  function unlock() {
    state.active = true;
    state.unlocked = true;
    state.page = 1;
    state.cat = 'todas';
    state.search = '';
    if (!state.catalog.length) {
      loadCatalog().then(function () { showContent(); });
    } else {
      showContent();
    }
  }

  function loadCatalog() {
    state.loading = true;
    return fetch(CATALOG_URL)
      .then(function (r) { return r.json(); })
      .then(function (d) { state.catalog = d; state.loading = false; })
      .catch(function () { state.catalog = []; state.loading = false; });
  }

  function showContent() {
    var root = rootEl();
    if (!root) return;
    root.classList.remove('hidden');
    root.innerHTML = '';

    var chips = document.createElement('div');
    chips.className = 'adult-chips';
    root.appendChild(chips);

    var grid = document.createElement('div');
    grid.className = 'mega-grid';
    root.appendChild(grid);

    $('#channel-grid').classList.add('hidden');
    var mr = document.getElementById('mega-root');
    if (mr) mr.classList.add('hidden');
    $('#empty-state').classList.add('hidden');
    $('#content-title').textContent = 'Adulto';
    $('#btn-back').classList.remove('hidden');

    renderChips();
    renderGrid();
  }

  function renderChips() {
    var root = rootEl();
    var chipsEl = root.querySelector('.adult-chips');
    if (!chipsEl) return;
    chipsEl.innerHTML = '';
    Object.keys(CAT_LABELS).forEach(function (cat) {
      var btn = document.createElement('button');
      btn.className = 'chip' + (state.cat === cat ? ' active' : '');
      btn.textContent = CAT_LABELS[cat];
      btn.tabIndex = 0;
      btn.addEventListener('click', function () {
        state.cat = cat;
        state.page = 1;
        renderChips();
        renderGrid();
      });
      chipsEl.appendChild(btn);
    });
  }

  function filterItems() {
    var items = [];
    var adultChs = getAdultChannels();
    adultChs.forEach(function (ch) {
      items.push({
        type: 'channel', title: ch.name, poster: ch.logo || '',
        url: ch.url, referrer: ch.referrer || '', group: ch.group || 'Adulto',
        site: '', key: '', dur: ''
      });
    });
    state.catalog.forEach(function (it) {
      if (state.cat !== 'todas' && it.cat !== state.cat) return;
      if (state.search) {
        var q = state.search.toLowerCase();
        if (it.title.toLowerCase().indexOf(q) < 0) return;
      }
      items.push({
        type: 'video', title: it.title, poster: it.thumb || '',
        url: '', referrer: '', group: it.cat || '',
        site: it.site || 'ph', key: it.key || '', dur: it.dur || ''
      });
    });
    return items;
  }

  function renderGrid() {
    var root = rootEl();
    var grid = root.querySelector('.mega-grid');
    if (!grid) return;
    grid.innerHTML = '';

    var items = filterItems();
    var end = Math.min(state.page * PER_PAGE, items.length);
    var pageItems = items.slice(0, end);
    var frag = document.createDocumentFragment();

    pageItems.forEach(function (item) {
      var card = document.createElement('div');
      card.className = 'mega-card';
      card.tabIndex = 0;

      var posterHtml = item.poster
        ? '<img src="' + item.poster + '" alt="" loading="lazy" onerror="this.remove()">'
        : '<div class="mega-letter">' + (item.title || '?').charAt(0).toUpperCase() + '</div>';

      var badgeClass = item.type === 'channel' ? 'adult-badge-ch' : ('adult-badge-' + item.site);
      var badgeText = item.type === 'channel' ? 'CANAL' : (item.site === 'xv' ? 'XV' : 'PH');
      var badge = '<div class="adult-badge ' + badgeClass + '">' + badgeText + '</div>';
      var durHtml = item.dur ? '<div class="mega-year">' + item.dur + '</div>' : '';

      card.innerHTML =
        '<div class="mega-poster">' + posterHtml + badge + durHtml + '<div class="mega-play"></div></div>' +
        '<div class="mega-title"></div>' +
        '<div class="mega-sub"></div>';

      card.querySelector('.mega-title').textContent = item.title.length > 40 ? item.title.slice(0, 40) + '...' : item.title;
      card.querySelector('.mega-sub').textContent = item.type === 'channel' ? item.group : (item.site === 'xv' ? 'XVideos' : 'Pornhub');

      card.addEventListener('click', function () { playItem(item); });
      frag.appendChild(card);
    });

    grid.appendChild(frag);

    if (end < items.length) {
      var loadMore = document.createElement('div');
      loadMore.className = 'mega-loadmore';
      loadMore.textContent = 'Carregar mais (' + end + ' / ' + items.length + ')';
      loadMore.tabIndex = 0;
      loadMore.addEventListener('click', function () { state.page++; renderGrid(); });
      grid.appendChild(loadMore);
    }

    if (!items.length) {
      var empty = document.createElement('div');
      empty.className = 'mega-empty';
      empty.textContent = 'Nenhum conte\u00fado encontrado.';
      grid.appendChild(empty);
    }
  }

  function playItem(item) {
    if (item.type === 'channel') {
      var chs = getAdultChannels();
      var queue = chs.map(function (ch) {
        return { name: ch.name, url: ch.url, referrer: ch.referrer || '', logo: ch.logo || '' };
      });
      var idx = 0;
      for (var i = 0; i < queue.length; i++) {
        if (queue[i].url === item.url) { idx = i; break; }
      }
      VibeTV.openPlayerList(queue, idx, { allowFav: false });
    } else {
      VibeTV.toast('Resolvendo v\u00eddeo...');
      window.vibetv.ipc.adultResolve(item.key, item.site).then(function (result) {
        if (!result || !result.url) {
          VibeTV.toast('N\u00e3o foi poss\u00edvel obter o v\u00eddeo.', true);
          return;
        }
        var ref = item.site === 'xv' ? 'https://www.xvideos.com/' : 'https://pt.pornhub.com/';
        var queue = [{ name: item.title, url: result.url, referrer: ref, logo: item.poster }];
        VibeTV.openPlayerList(queue, 0, { allowFav: false });
      }).catch(function () {
        VibeTV.toast('Erro ao resolver v\u00eddeo.', true);
      });
    }
  }

  function deactivate() {
    state.active = false;
    state.unlocked = false;
    state.page = 1;
    state.cat = 'todas';
    state.search = '';
    var root = rootEl();
    if (root) { root.classList.add('hidden'); root.innerHTML = ''; }
    var mr = document.getElementById('mega-root');
    if (mr) mr.classList.add('hidden');
    var cg = $('#channel-grid');
    var es = $('#empty-state');
    var bb = $('#btn-back');
    var ct = $('#content-title');
    if (cg) cg.classList.remove('hidden');
    if (es) es.classList.add('hidden');
    if (bb) bb.classList.add('hidden');
    if (ct) ct.textContent = 'Todos os Canais';
  }

  function back() {
    if (state.active) { deactivate(); return; }
  }

  function search(q) {
    state.search = q;
    state.page = 1;
    if (state.active) renderGrid();
  }

  function isActive() { return state.active; }
  function isUnlocked() { return state.unlocked; }

  function showPinModal(mode) {
    var modal = document.getElementById('pin-modal');
    if (!modal) return;
    var title = document.getElementById('pin-modal-title');
    var desc = document.getElementById('pin-modal-desc');
    var confirmRow = document.getElementById('pin-confirm-group');

    title.textContent = mode === 'setup' ? 'Criar PIN' : 'Digite seu PIN';
    desc.textContent = mode === 'setup'
      ? 'Crie um PIN de 4 d\u00edgitos para acessar o conte\u00fado adulto.'
      : 'Digite seu PIN para acessar o conte\u00fado adulto.';
    if (confirmRow) confirmRow.style.display = mode === 'setup' ? 'flex' : 'none';

    var digits = modal.querySelectorAll('.pin-digit');
    digits.forEach(function (d) { d.value = ''; });
    var pe = document.getElementById('pin-error');
    if (pe) pe.classList.add('hidden');

    modal.classList.remove('hidden');
    modal._mode = mode;
    setTimeout(function () { if (digits[0]) digits[0].focus(); }, 100);
  }

  function handlePinSubmit() {
    var modal = document.getElementById('pin-modal');
    if (!modal) return;
    var mode = modal._mode;
    var digits = modal.querySelectorAll('#pin-input-group .pin-digit');
    var pin = '';
    digits.forEach(function (d) { pin += d.value; });

    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      showPinError('Digite 4 d\u00edgitos.');
      return;
    }

    if (mode === 'setup') {
      var confirmDigits = document.querySelectorAll('#pin-confirm-group .pin-digit');
      var confirmPin = '';
      confirmDigits.forEach(function (d) { confirmPin += d.value; });
      if (pin !== confirmPin) {
        showPinError('Os PINs n\u00e3o coincidem.');
        return;
      }
      hashPin(pin).then(function (hash) {
        setAdultPin(hash);
        savePinToCloud(hash);
        modal.classList.add('hidden');
        unlock();
        VibeTV.toast('PIN criado com sucesso!');
      });
    } else {
      hashPin(pin).then(function (hash) {
        if (hash === adultPin()) {
          modal.classList.add('hidden');
          unlock();
        } else {
          showPinError('PIN incorreto.');
        }
      });
    }
  }

  function savePinToCloud(hash) {
    var user = currentUser();
    if (!user || !window.Cloud) return;
    Cloud.loadUserData(user.id).then(function (data) {
      data.adultPin = hash;
      return Cloud.saveUserData(user.id, data);
    }).catch(function () {});
  }

  function showPinError(msg) {
    var el = document.getElementById('pin-error');
    if (el) { el.textContent = msg; el.classList.remove('hidden'); }
  }

  function handlePinKeydown(e) {
    if (e.key === 'Enter') { handlePinSubmit(); return; }
    var target = e.target;
    if (!target.classList.contains('pin-digit')) return;
    if (e.key === 'Backspace' && !target.value) {
      var prev = target.previousElementSibling;
      if (prev && prev.classList.contains('pin-digit')) prev.focus();
      return;
    }
    if (/^\d$/.test(e.key)) {
      target.value = e.key;
      var next = target.nextElementSibling;
      if (next && next.classList.contains('pin-digit')) next.focus();
      else target.blur();
    } else {
      e.preventDefault();
    }
  }

  return {
    activate: activate,
    deactivate: deactivate,
    back: back,
    search: search,
    isActive: isActive,
    isUnlocked: isUnlocked,
    handlePinSubmit: handlePinSubmit,
    handlePinKeydown: handlePinKeydown,
    getAdultChannels: function () {
      var kw = ADULT_KW;
      if (typeof VibeTV !== 'undefined' && VibeTV.getActivePlaylist) {
        var pl = VibeTV.getActivePlaylist();
        if (!pl) return [];
        return pl.channels.filter(function (ch) {
          var g = (ch.group || '').toLowerCase();
          return kw.some(function (k) { return g.indexOf(k) >= 0; });
        });
      }
      return [];
    }
  };
})();
