const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vibetv', {
  ipc: {
    sendReferrers: (rules) => ipcRenderer.send('set-referrers', rules),
    adultResolve: (key, site) => ipcRenderer.invoke('adult-resolve', key, site)
  },
  auth: {
    login: (username, password) => ipcRenderer.invoke('auth-login', username, password),
    listUsers: () => ipcRenderer.invoke('auth-users-list'),
    createUser: (username, password, role, duration, adult) => ipcRenderer.invoke('auth-user-create', username, password, role, duration, adult),
    deleteUser: (userId) => ipcRenderer.invoke('auth-user-delete', userId),
    toggleAdult: (userId, adult) => ipcRenderer.invoke('auth-user-toggle-adult', userId, adult),
    loadUserData: (userId) => ipcRenderer.invoke('auth-user-data-load', userId),
    saveUserData: (userId, data) => ipcRenderer.invoke('auth-user-data-save', userId, data),
    exportDb: () => ipcRenderer.invoke('auth-export-db'),
    importDb: () => ipcRenderer.invoke('auth-import-db')
  }
});
