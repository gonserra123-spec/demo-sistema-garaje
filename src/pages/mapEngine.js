// Chunk diferido del mapa: MapLibre GL + estilo de OpenFreeMap recoloreado a la paleta del proyecto.
// Solo se descarga cuando la sección del mapa está cerca del viewport.
import * as maplibregl from 'maplibre-gl';
// MapLibre 6 carga su worker desde un fichero aparte: Vite lo empaqueta y aquí se le da su URL (mismo origen, CSP 'self').
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

maplibregl.setWorkerUrl(workerUrl);
import 'maplibre-gl/dist/maplibre-gl.css';

const MOBILE = typeof window !== 'undefined' && (window.innerWidth < 768 || window.matchMedia('(pointer: coarse)').matches);
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const C = { paper: '#F4F7FC', grid: '#D9E2F2', blue100: '#E6EEFC', water: '#CFDDF8', blue500: '#2F6FED', blue900: '#0B2A5B', mute: '#44567A', white: '#FFFFFF', green: '#E8EEF6' };

// Recolorea el estilo Positron: fondo papel, agua azul 100, vías blancas con borde de rejilla, textos en gris
// azulado y edificios en 3D (fill-extrusion) con la altura de OpenMapTiles.
function recolor(style, lang) {
  const layers = [];
  for (const l of style.layers) {
    const L = { ...l, paint: { ...(l.paint || {}) }, layout: { ...(l.layout || {}) } };
    const id = l.id;
    if (l.type === 'background') L.paint['background-color'] = C.paper;
    else if (id === 'water') L.paint['fill-color'] = C.water;
    else if (id === 'waterway') L.paint['line-color'] = C.water;
    else if (['park', 'landcover_wood', 'landuse_residential'].includes(id)) { L.paint['fill-color'] = C.green; if ('fill-opacity' in L.paint) delete L.paint['fill-opacity']; }
    else if (id === 'building') continue; // se sustituye por la extrusión de abajo
    // Nombres de calles pequeñas y caminos: recolocarlos en cada fotograma del zoom es lo más caro y no aporta al vuelo.
    else if (id === 'highway-name-path' || id === 'highway-name-minor') continue;
    else if (l.type === 'line' && /casing/.test(id)) L.paint['line-color'] = C.grid;
    else if (l.type === 'line' && /^(highway|road|tunnel|aeroway)/.test(id)) L.paint['line-color'] = C.white;
    else if (l.type === 'line' && /^railway/.test(id)) L.paint['line-color'] = '#B7C6E2';
    else if (l.type === 'line' && /^boundary/.test(id)) L.paint['line-color'] = '#9AAACB';
    else if (l.type === 'fill' && /aeroway|pier/.test(id)) L.paint['fill-color'] = C.blue100;
    else if (l.type === 'symbol') {
      if ('text-color' in L.paint || L.layout['text-field']) { L.paint['text-color'] = C.mute; L.paint['text-halo-color'] = C.paper; L.paint['text-halo-width'] = 1.4; }
      // Nombres en el idioma de la página (si OpenMapTiles lo tiene), si no el local.
      if (L['source-layer'] === 'place' || L['source-layer'] === 'water_name') L.layout['text-field'] = ['coalesce', ['get', `name:${lang}`], ['get', 'name']];
    }
    layers.push(L);
    if (id === 'landuse_residential') {
      // (la extrusión se añade después de las vías para que los edificios tapen las calles que pasan por detrás)
    }
  }
  const firstSymbol = layers.findIndex((l) => l.type === 'symbol');
  layers.splice(firstSymbol < 0 ? layers.length : firstSymbol, 0, {
    id: 'building-3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: MOBILE ? 15 : 14, // en móvil, edificios 3D solo cerca de la calle
    paint: {
      'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6], 0, '#FFFFFF', 40, '#DCE6F7'],
      'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6],
      'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
      'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14.5, 0.92],
      'fill-extrusion-vertical-gradient': false,
    },
  });
  // Luz suave desde la vista: edificios casi blancos con caras laterales en azul claro (estilo plano técnico).
  return { ...style, layers, light: { anchor: 'viewport', color: '#FFFFFF', intensity: 0.22, position: [1.2, 200, 35] } };
}

export async function createMap(container, { center, zoom, pitch, bearing, marker, markerLabel, lang = 'es' }) {
  const res = await fetch(STYLE_URL, { cache: 'force-cache' });
  if (!res.ok) throw new Error('style');
  const style = recolor(await res.json(), lang);
  const map = new maplibregl.Map({
    container, style, center, zoom, pitch, bearing,
    interactive: false, attributionControl: false, fadeDuration: 0, maxPitch: 70,
    // El scroll de la página mueve la cámara: el mapa no captura gestos. En móvil, menos píxeles y menos tiles.
    pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5), maxTileCacheSize: MOBILE ? 60 : 200,
    canvasContextAttributes: { antialias: true },
  });
  // Atribución que declara la fuente (OpenFreeMap · © OpenMapTiles · Data from OpenStreetMap), siempre visible.
  map.addControl(new maplibregl.AttributionControl({ compact: false }), 'bottom-right');
  const el = document.createElement('div');
  el.className = 'map-pin';
  el.innerHTML = '<span class="map-pin-dot"></span><span class="map-pin-label"></span>';
  el.querySelector('.map-pin-label').textContent = markerLabel;
  const pin = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(marker).addTo(map);
  // Un tile que falla no es fatal; solo se espera a que el estilo cargue (con tiempo máximo).
  await new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('map_timeout')), 15000);
    map.once('load', () => { clearTimeout(id); resolve(); });
  });
  return { map, pin, setLabel: (t) => { el.querySelector('.map-pin-label').textContent = t; } };
}
