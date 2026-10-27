const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const dsc = require('./dsc.cjs');

const APP_PAGE = path.join(__dirname, '..', 'dist', 'index.html');
const APP_URL = pathToFileURL(APP_PAGE).href;
// exactly our bundled page; '#/...' after it are in-app routes (HashRouter). Any other file: URL,
// e.g. a downloaded .html dropped on the window, is untrusted content.
const isAppPage = (url) => typeof url === 'string' && url.split('#')[0].toLowerCase() === APP_URL.toLowerCase();

// only the app page's own top frame may call native signing
const trusted = (e) => !!e.senderFrame && e.senderFrame === e.sender.mainFrame && isAppPage(e.senderFrame.url);
ipcMain.handle('dsc:list', (e) => (trusted(e) ? dsc.list() : Promise.reject(new Error('Not allowed'))));
ipcMain.handle('dsc:sign', (e, thumb, data, pin) => (trusted(e) ? dsc.sign(thumb, data, pin) : Promise.reject(new Error('Not allowed'))));

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 380,
    title: 'ToolsJunction',
    icon: path.join(__dirname, '..', 'dist', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.cjs') },
  });
  win.loadFile(APP_PAGE);

  // external links open in the user's browser, never inside the app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // the window only ever shows the app page; this also stops a dropped file from replacing it
  win.webContents.on('will-navigate', (e, url) => {
    if (isAppPage(url)) return;
    e.preventDefault();
    if (/^https?:/.test(url)) shell.openExternal(url);
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});
app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());
