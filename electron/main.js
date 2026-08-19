const { app, BrowserWindow, session, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const https = require('https');

let referrerRules = {
  'megacine.media': 'https://megacine.media/',
  'phncdn.com': 'https://pt.pornhub.com/',
  'xvideos-cdn.com': 'https://www.xvideos.com/'
};

const USERS_DIR = path.join(app.getPath('userData'), 'users');
const USERS_FILE = path.join(USERS_DIR, 'index.json');

function ensureUsersDir() {
  if (!fs.existsSync(USERS_DIR)) fs.mkdirSync(USERS_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) {
    const defaultAdmin = {
      id: 'admin001',
      username: 'admin',
      password: hashPassword('admin'),
      role: 'admin',
      createdAt: Date.now()
    };
    fs.writeFileSync(USERS_FILE, JSON.stringify([defaultAdmin], null, 2));
  }
}

function hashPassword(pw) {
  return crypto.createHash('sha256').update(pw + 'vibetv_salt_2026').digest('hex');
}

function calcExpiry(duration) {
  if (!duration || duration === 'lifetime') return 0;
  var now = Date.now();
  var map = {
    '2h': 2 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '15d': 15 * 24 * 60 * 60 * 1000,
    '1m': 30 * 24 * 60 * 60 * 1000,
    '3m': 90 * 24 * 60 * 60 * 1000,
    '6m': 180 * 24 * 60 * 60 * 1000,
    '1y': 365 * 24 * 60 * 60 * 1000
  };
  return now + (map[duration] || map['1m']);
}

function formatExpiry(ts) {
  if (!ts) return 'Vitalício';
  var diff = ts - Date.now();
  if (diff <= 0) return 'Expirado';
  var hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 24) return hours + 'h restantes';
  var days = Math.floor(hours / 24);
  if (days < 30) return days + ' dias restantes';
  var months = Math.floor(days / 30);
  if (months < 12) return months + ' meses restantes';
  return Math.floor(months / 12) + ' ano(s) restante(s)';
}

function readUsers() {
  ensureUsersDir();
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); }
  catch (e) { return []; }
}

function writeUsers(users) {
  ensureUsersDir();
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function getUserDataPath(userId) {
  return path.join(USERS_DIR, userId + '.json');
}

function readUserData(userId) {
  const p = getUserDataPath(userId);
  if (!fs.existsSync(p)) return { playlists: [], favorites: [], activeId: null };
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { return { playlists: [], favorites: [], activeId: null }; }
}

function writeUserData(userId, data) {
  ensureUsersDir();
  fs.writeFileSync(getUserDataPath(userId), JSON.stringify(data, null, 2));
}

function getIconPath() {
  const p = path.join(__dirname, '..', 'build', 'icon.png');
  try { fs.accessSync(p); return p; } catch (e) { return undefined; }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 720,
    minHeight: 520,
    backgroundColor: '#060608',
    title: 'VIBETV PREMIUM',
    icon: getIconPath(),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  });

  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, '..', 'index.html'));

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL() && !url.startsWith('file://')) {
      e.preventDefault();
    }
  });

  if (process.argv.includes('--smoke')) {
    win.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const result = await win.webContents.executeJavaScript(
            `(async () => {
              const sleep = (ms) => new Promise(r => setTimeout(r, ms));
              await sleep(1500);
              const out = {
                title: document.title,
                appVisible: !document.getElementById('app-screen').classList.contains('hidden'),
                channelCards: document.querySelectorAll('.channel-card').length,
                playlistNames: JSON.parse(localStorage.getItem('vibetv_playlists_v1') || '[]').map(p => p.name),
                hlsLoaded: !!window.Hls
              };
              try {
                const r = await fetch('https://megacine.media/json?id=13919&version=0&season=1&series=1&a=false&android=0');
                const j = await r.json();
                out.megacineResolve = !!(j.video_url && j.video_url.length);
              } catch (e) {
                out.megacineResolve = 'ERRO: ' + e.message;
              }
              return out;
            })()`
          );
          console.log('SMOKE_RESULT=' + JSON.stringify(result));
          const ok = result.appVisible === true && result.channelCards > 0 && result.megacineResolve === true;
          app.exit(ok ? 0 : 1);
        } catch (e) {
          console.error('SMOKE_FAILED', e);
          app.exit(1);
        }
      }, 800);
    });
  }

  return win;
}

app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['<all_urls>'] },
    (details, callback) => {
      const headers = Object.assign({}, details.requestHeaders);
      try {
        const u = new URL(details.url);
        const hostname = u.hostname;
        let ref = referrerRules[hostname];
        if (!ref) {
          for (const [domain, val] of Object.entries(referrerRules)) {
            if (hostname.endsWith('.' + domain) || hostname === domain) { ref = val; break; }
          }
        }
        if (ref) {
          headers['Referer'] = ref;
          headers['Origin'] = ref.replace(/\/+$/, '');
        }
      } catch (e) {}
      callback({ requestHeaders: headers });
    }
  );

  ipcMain.on('set-referrers', (event, rules) => {
    if (Array.isArray(rules)) {
      rules.forEach((r) => {
        if (r && r.host && r.referrer) referrerRules[r.host] = r.referrer;
      });
    }
  });

  ensureUsersDir();

  function fetchPage(url, referer) {
    return new Promise((resolve) => {
      const opts = new URL(url);
      opts.headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Referer': referer || '',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
      };
      https.get(opts, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchPage(res.headers.location, referer).then(resolve);
        }
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => resolve(body));
      }).on('error', () => resolve(''));
    });
  }

  ipcMain.handle('adult-resolve', async (event, key, site) => {
    try {
      if (site === 'xv') {
        const body = await fetchPage('https://www.xvideos.com/' + key, 'https://www.xvideos.com/');
        if (!body) return { url: null };
        const hls = body.match(/html5player\.setVideoHLS\('(https:[^']+)'\)/) || body.match(/setVideoHLS\("(https:[^"]+)"\)/);
        return { url: hls ? hls[1] : null };
      }
      const body = await fetchPage('https://pt.pornhub.com/view_video.php?viewkey=' + encodeURIComponent(key), 'https://pt.pornhub.com/');
      if (!body) return { url: null };
      const idx = body.indexOf('"mediaDefinitions"');
      if (idx === -1) return { url: null };
      const chunk = body.slice(idx, idx + 8000);
      const urls = [...chunk.matchAll(/"format"\s*:\s*"hls"\s*,\s*"videoUrl"\s*:\s*"((?:[^"\\]|\\.)*)"/g)].map(m => m[1].replace(/\\\//g, '/'));
      const quant = [...chunk.matchAll(/"quality"\s*:\s*"(\d+)"/g)].map(m => m[1]);
      if (!urls.length) return { url: null };
      const best = urls.map((u, i) => ({ u, q: quant[i] ? parseInt(quant[i]) : 0 }))
        .reduce((a, b) => (b.q > a.q ? b : a), { u: urls[0], q: 0 });
      return { url: best.u };
    } catch (e) {
      return { url: null };
    }
  });

  ipcMain.handle('auth-login', (event, username, password) => {
    const users = readUsers();
    const h = hashPassword(password);
    const user = users.find(u => u.username === username && u.password === h);
    if (!user) return null;
    if (user.expiry && user.expiry !== 0 && Date.now() > user.expiry) {
      return { expired: true };
    }
    return { id: user.id, username: user.username, role: user.role, createdAt: user.createdAt, expiry: user.expiry || 0, adult: !!user.adult };
  });

  ipcMain.handle('auth-users-list', () => {
    return readUsers().map(u => ({ id: u.id, username: u.username, role: u.role, createdAt: u.createdAt, adult: !!u.adult }));
  });

  ipcMain.handle('auth-user-create', (event, username, password, role, duration, adult) => {
    const users = readUsers();
    if (users.some(u => u.username === username)) throw new Error('Usuário já existe');
    const user = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      username,
      password: hashPassword(password),
      role: role || 'user',
      duration: duration || '1m',
      expiry: calcExpiry(duration || '1m'),
      adult: !!adult,
      createdAt: Date.now()
    };
    users.push(user);
    writeUsers(users);
    return { id: user.id, username: user.username, role: user.role, expiry: user.expiry, adult: user.adult };
  });

  ipcMain.handle('auth-user-toggle-adult', (event, userId, adult) => {
    let users = readUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx >= 0) {
      users[idx].adult = adult;
      writeUsers(users);
    }
    return true;
  });

  ipcMain.handle('auth-user-delete', (event, userId) => {
    if (userId === 'admin001') throw new Error('Não é possível excluir o admin principal');
    let users = readUsers();
    users = users.filter(u => u.id !== userId);
    writeUsers(users);
    const dp = getUserDataPath(userId);
    if (fs.existsSync(dp)) fs.unlinkSync(dp);
    return true;
  });

  ipcMain.handle('auth-user-data-load', (event, userId) => {
    return readUserData(userId);
  });

  ipcMain.handle('auth-user-data-save', (event, userId, data) => {
    writeUserData(userId, data);
    return true;
  });

  ipcMain.handle('auth-export-db', async (event) => {
    const users = readUsers();
    const db = { users: users, userData: {} };
    users.forEach(u => { db.userData[u.id] = readUserData(u.id); });
    const { filePath } = await dialog.showSaveDialog({
      defaultPath: 'vibetv_users_backup.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (!filePath) return null;
    fs.writeFileSync(filePath, JSON.stringify(db, null, 2));
    return filePath;
  });

  ipcMain.handle('auth-import-db', async (event) => {
    const { filePaths } = await dialog.showOpenDialog({
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (!filePaths || !filePaths.length) return null;
    const raw = fs.readFileSync(filePaths[0], 'utf8');
    const db = JSON.parse(raw);
    if (db.users) {
      const existing = readUsers();
      const merged = [...existing];
      db.users.forEach(u => {
        if (!merged.some(m => m.id === u.id)) merged.push(u);
      });
      writeUsers(merged);
    }
    if (db.userData) {
      Object.entries(db.userData).forEach(([uid, data]) => {
        writeUserData(uid, data);
      });
    }
    return true;
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
