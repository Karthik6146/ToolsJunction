import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);

// A file dropped outside a drop zone would otherwise make the browser open it in place of the app.
// Drop zones still get the event (it bubbles here after their own handlers).
for (const type of ['dragover', 'drop']) window.addEventListener(type, (e) => e.preventDefault());

// https only: skips the dev server and Electron (file://)
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
