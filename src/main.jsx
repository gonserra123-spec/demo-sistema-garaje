import { createRoot } from 'react-dom/client';
import '@fontsource-variable/figtree';
import '@fontsource/saira-condensed/600.css';
import '@fontsource/saira-condensed/700.css';
import './styles/app.css';
import './styles/live.css';
import './styles/landing2.css';
import App from './App.jsx';
import { LangProvider } from './i18n/index.jsx';
import { startTicker } from './lib/ticker.js';

// Tras un despliegue, una página abierta puede pedir un trozo de código que ya no existe: se recarga una vez.
window.addEventListener('vite:preloadError', (e) => {
  try { if (sessionStorage.getItem('tg_reloaded')) return; sessionStorage.setItem('tg_reloaded', '1'); } catch { return; }
  e.preventDefault(); window.location.reload();
});
startTicker();
createRoot(document.getElementById('root')).render(<LangProvider><App /></LangProvider>);

// PWA: el service worker solo se registra con el build (en dev estorbaría al HMR).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
