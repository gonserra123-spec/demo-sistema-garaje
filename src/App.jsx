import { Suspense, useEffect, useState } from 'react';
import Landing from './pages/Landing.jsx';
import { useT } from './i18n/index.jsx';
import { SurfaceBoundary } from './components/ui.jsx';
import { SURFACES, matchRoute } from './surfaces/index.js';

export default function App() {
  const [path, setPath] = useState(window.location.pathname);
  const { t } = useT();
  useEffect(() => {
    const on = () => setPath(window.location.pathname);
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  const route = matchRoute(path);
  useEffect(() => {
    // Panel y consulta no se indexan: son herramientas con datos de un taller.
    let meta = document.querySelector('meta[name="robots"]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'robots'; document.head.appendChild(meta); }
    meta.content = route.page === 'landing' || route.page === 'privacy' ? 'index, follow' : 'noindex, nofollow';
    const titles = { landing: 'Tridom Automotive · Seguimiento de vehículos para talleres', panel: `${t('panel.title')} · Tridom Automotive`, consulta: `${t('consulta.title')} · Tridom Automotive`, privacy: `${t('privacy.title')} · Tridom Automotive`, tv: `${t('tv.title')} · Tridom Automotive`, cita: `${t('cita.title')} · Tridom Automotive` };
    document.title = titles[route.page];
  }, [route.page, t]);
  const Surface = SURFACES[route.page]?.Component;
  return (
    <SurfaceBoundary name={route.page} key={route.page}>
      <Suspense fallback={<p className="scene-loading" role="status">{t('common.loading')}</p>}>
        {route.page === 'landing' ? <Landing /> : <Surface code={route.code} />}
      </Suspense>
    </SurfaceBoundary>
  );
}
