var Cloud = (function () {
  var _online = false;
  var db = null;

  var firebaseConfig = {
    apiKey: 'AIzaSyAOCFTvw9sQr4AJlNqQprf4wVKSN8OUNy4',
    authDomain: 'vibetv-premium.firebaseapp.com',
    projectId: 'vibetv-premium',
    storageBucket: 'vibetv-premium.firebasestorage.app',
    messagingSenderId: '524316994551',
    appId: '1:524316994551:web:29cd2cfd29edec26fedcf2'
  };

  function init() {
    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
      }
      db = firebase.firestore();
      db.enablePersistence({ synchronizeTabs: true }).catch(function () {});
      _online = true;
      seedAdmin();
    } catch (e) {
      _online = false;
    }
  }

  function hashPw(pw) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw + 'vibetv_salt_2026'))
      .then(function (buf) {
        return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
      });
  }

  function calcExpiry(dur) {
    if (!dur || dur === 'lifetime') return 0;
    var map = { '2h': 7200000, '24h': 86400000, '7d': 604800000, '15d': 1296000000, '1m': 2592000000, '3m': 7776000000, '6m': 15552000000, '1y': 31536000000 };
    return Date.now() + (map[dur] || map['1m']);
  }

  function formatExpiry(ts) {
    if (!ts) return 'Vitalicio';
    var diff = ts - Date.now();
    if (diff <= 0) return 'Expirado';
    var h = Math.floor(diff / 3600000);
    if (h < 24) return h + 'h restantes';
    var d = Math.floor(h / 24);
    if (d < 30) return d + ' dias restantes';
    var m = Math.floor(d / 30);
    if (m < 12) return m + ' meses restante(s)';
    return Math.floor(m / 12) + ' ano(s) restante(s)';
  }

  function check() {
    if (!db) { _online = false; return Promise.resolve(false); }
    return db.collection('users').limit(1).get()
      .then(function () { _online = true; return true; })
      .catch(function () { _online = false; return false; });
  }

  function isOnline() { return _online; }

  function listUsers() {
    if (!db) return Promise.resolve([]);
    return db.collection('users').get()
      .then(function (snap) {
        var users = [];
        snap.forEach(function (doc) {
          var d = doc.data();
          d.id = doc.id;
          users.push(d);
        });
        return users;
      })
      .catch(function () { return []; });
  }

  function login(username, password) {
    return hashPw(password).then(function (h) {
      return listUsers().then(function (users) {
        var u = users.find(function (x) { return x.username === username && x.password === h; });
        if (!u) return null;
        if (u.expiry && u.expiry !== 0 && Date.now() > u.expiry) return { expired: true, username: u.username };
        return { id: u.id, username: u.username, role: u.role || 'user', expiry: u.expiry || 0, adult: !!u.adult };
      });
    });
  }

  function createUser(username, password, role, duration, adult) {
    return hashPw(password).then(function (h) {
      return listUsers().then(function (existing) {
        if (existing.some(function (u) { return u.username === username; })) throw new Error('Usuario ja existe');
        var id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        var data = { username: username, password: h, role: role || 'user', duration: duration || '1m', expiry: calcExpiry(duration), adult: !!adult, createdAt: Date.now() };
        return db.collection('users').doc(id).set(data).then(function () { data.id = id; return data; });
      });
    });
  }

  function deleteUser(userId) {
    if (!db) return Promise.reject(new Error('Offline'));
    return db.collection('users').doc(userId).delete()
      .then(function () { return true; });
  }

  function loadUserData(userId) {
    if (!db) return Promise.resolve({ playlists: [], favorites: [], activeId: null });
    return db.collection('userdata').doc(userId).get()
      .then(function (doc) {
        if (!doc.exists) return { playlists: [], favorites: [], activeId: null };
        var d = doc.data();
        try { return JSON.parse(d.data); } catch (e) { return { playlists: [], favorites: [], activeId: null }; }
      })
      .catch(function () { return { playlists: [], favorites: [], activeId: null }; });
  }

  function saveUserData(userId, data) {
    if (!db) return Promise.resolve(false);
    return db.collection('userdata').doc(userId).set({ data: JSON.stringify(data) })
      .then(function () { return true; })
      .catch(function () { return false; });
  }

  function toggleAdult(userId, adult) {
    if (!db) return Promise.resolve(false);
    return db.collection('users').doc(userId).update({ adult: adult })
      .then(function () { return true; })
      .catch(function () { return false; });
  }

  function setAdultPin(userId, pinHash) {
    if (!db) return Promise.resolve(false);
    return db.collection('userdata').doc(userId).get()
      .then(function (doc) {
        var data = { playlists: [], favorites: [], activeId: null };
        if (doc.exists) {
          try { data = JSON.parse(doc.data().data); } catch (e) {}
        }
        data.adultPin = pinHash;
        return db.collection('userdata').doc(userId).set({ data: JSON.stringify(data) });
      })
      .then(function () { return true; })
      .catch(function () { return false; });
  }

  function seedAdmin() {
    if (!db) return Promise.resolve();
    return db.collection('users').limit(1).get()
      .then(function (snap) {
        if (!snap.empty) return;
        return hashPw('admin').then(function (h) {
          return db.collection('users').doc('admin001').set({
            username: 'admin',
            password: h,
            role: 'admin',
            duration: 'lifetime',
            expiry: 0,
            adult: true,
            createdAt: Date.now()
          });
        });
      })
      .catch(function () {});
  }

  init();

  return {
    check: check,
    isOnline: isOnline,
    login: login,
    listUsers: listUsers,
    createUser: createUser,
    deleteUser: deleteUser,
    toggleAdult: toggleAdult,
    setAdultPin: setAdultPin,
    loadUserData: loadUserData,
    saveUserData: saveUserData,
    calcExpiry: calcExpiry,
    formatExpiry: formatExpiry
  };
})();
