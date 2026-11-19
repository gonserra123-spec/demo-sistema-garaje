// Superficies de la app, una entrada (chunk) por cada una. Están separadas para poder repartirlas más
// adelante en tres productos sin reescribir nada:
//   - office   (oficina): panel simple de altas, citas, clientes y avisos.        Hoy: /panel como «Oficina».
//   - workshop (taller):  tablero con la escena 3D y el «Siguiente paso».        Hoy: /panel como «Mecánico».
//   - customer (cliente): consulta por matrícula, cita y pantalla de espera.      Hoy: /consulta, /cita, /tv.
// Todas comparten src/components (interfaz), src/data (DataAdapter y EmailAdapter) y shared/ (reglas).
// Las pantallas separadas de oficina y taller NO existen todavía: el panel actual sirve a las dos.
import { lazy } from 'react';

export const SURFACES = {
  panel: { products: ['office', 'workshop'], Component: lazy(() => import('../pages/Panel.jsx')) },
  consulta: { products: ['customer'], Component: lazy(() => import('../pages/Consulta.jsx')) },
  cita: { products: ['customer'], Component: lazy(() => import('../pages/Cita.jsx')) },
  tv: { products: ['customer'], Component: lazy(() => import('../pages/Tv.jsx')) },
  privacy: { products: [], Component: lazy(() => import('../pages/Privacy.jsx')) },
};

export function matchRoute(path) {
  if (path === '/' || path === '') return { page: 'landing' };
  if (path === '/panel' || path === '/panel/') return { page: 'panel' };
  if (path === '/tv' || path === '/tv/') return { page: 'tv' };
  const c = /^\/cita\/([A-Za-z0-9]{4,12})\/?$/.exec(path);
  if (c) return { page: 'cita', code: c[1].toUpperCase() };
  if (path === '/privacidad' || path === '/privacidad/') return { page: 'privacy' };
  const m = /^\/consulta\/([A-Za-z0-9]{4,12})\/?$/.exec(path);
  if (m) return { page: 'consulta', code: m[1].toUpperCase() };
  return { page: 'landing', unknown: true };
}
