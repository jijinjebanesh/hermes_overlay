// Preload script for Electron
// Exposes certain APIs to the renderer process via contextBridge
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('hermes', {
  // Store methods
  getStoreValue: (key) => ipcRenderer.invoke('get-store-value', key),
  setStoreValue: (key, value) => ipcRenderer.invoke('set-store-value', key, value),
  
  // Permission methods
  requestPermission: (request) => {
    // In a real app, we would validate the request with Zod
    // For now, we just send it
    ipcRenderer.send('permission-request', request);
    return new Promise((resolve) => {
      ipcRenderer.once('permission-response', (event, response) => {
        resolve(response);
      });
    });
  }
});