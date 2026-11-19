// Piezas de la landing añadidas en la ronda de noviembre (ver docs/skills-log.md, combinación de movimiento):
//   - DemoCard: tarjetas de entrada de las dos demos, con etiqueta fija (icono + texto) y efecto magnético.
//   - PixelSeam: transición por píxeles (disolución en mosaico) entre dos secciones, ligada al scroll.
//   - BlueprintGrid: capas de la rejilla de plano técnico a distinta velocidad (parallax).
//   - MapSection: vuelo de cámara sobre un mapa MapLibre ligado al scroll y máscara hacia la fachada.
// Todo lo mueve el ticker único con muelles; con prefers-reduced-motion se ve un fotograma estático.
import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n/index.jsx';
import { Btn, Reveal } from '../components/ui.jsx';
import { useTick, useViewport, reducedMotion, scrollToId } from '../lib/hooks.js';
import { createSpring, clamp, range } from '../lib/spring.js';
import { LOCATION, directionsUrl } from '../config/location.js';

/* ---------- Iconos de las etiquetas fijas ---------- */
export const TeamIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z" /></svg>;
export const CustomerIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2" /><path d="M11 18.5h2" /></svg>;

export function AudienceTag({ who }) {
  const { t } = useT();
  return <span className="aud-tag" data-who={who}>{who === 'team' ? <TeamIcon /> : <CustomerIcon />}{t(`landing.demos.${who}.tag`)}</span>;
}

/* ---------- Tarjeta de entrada con efecto magnético (solo puntero fino) ---------- */
const fine = typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
export function DemoCard({ who, n }) {
  const { t } = useT();
  const ref = useRef(null);
  const sp = useRef({ x: createSpring(0, { tension: 220, friction: 24 }), y: createSpring(0, { tension: 220, friction: 24 }) });
  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion || !fine) return undefined;
    const move = (e) => { const r = el.getBoundingClientRect(); sp.current.x.set(((e.clientX - r.left) / r.width - 0.5) * 10); sp.current.y.set(((e.clientY - r.top) / r.height - 0.5) * 8); };
    const leave = () => { sp.current.x.set(0); sp.current.y.set(0); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerleave', leave);
    return () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); };
  }, []);
  useTick((s) => {
    const { x, y } = sp.current;
    const a = x.step(s.dt); const b = y.step(s.dt);
    if ((a || b) && ref.current) ref.current.style.transform = `translate3d(${x.value.toFixed(2)}px, ${y.value.toFixed(2)}px, 0)`;
  }, 'write', !reducedMotion && fine);
  const id = who === 'team' ? 'demo-equipo' : 'demo-clientes';
  return (
    <article className="demo-card" data-who={who} ref={ref}>
      <p className="demo-card-top"><span className="demo-card-n">{t('landing.demos.label', { n: String(n) })}</span><AudienceTag who={who} /></p>
      <h2 className="demo-card-t">{t(`landing.demos.${who}.title`)}</h2>
      <p className="demo-card-l">{t(`landing.demos.${who}.line`)}</p>
      <div className="demo-card-a">
        <Btn variant={who === 'team' ? 'sm' : 'ghost sm'} to={who === 'team' ? '/panel' : '/consulta/DEMO01'}>{t(`landing.demos.${who}.open`)}</Btn>
        <a className="demo-card-more" href={`#${id}`} onClick={(e) => { e.preventDefault(); scrollToId(id); }}>{t('landing.demos.see')}</a>
      </div>
    </article>
  );
}

/* ---------- Transición por píxeles entre dos secciones ---------- */
// Un lienzo de celdas: cada celda pasa del color de arriba al de abajo cuando el progreso supera su umbral
// (umbral = posición vertical + ruido). Resultado: el color de arriba se deshace en mosaico.
// Móvil o pantalla táctil: mosaico ligero (cuadrados grandes, menos redibujados) y sin parallax.
const LIGHT = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px), (pointer: coarse)').matches;
const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
export function PixelSeam({ from, to, cell: cellProp = 22 }) {
  const cell = LIGHT ? 36 : cellProp; // en móvil, versión ligera: cuadrados más grandes
  const wrap = useRef(null); const cv = useRef(null);
  const st = useRef({ p: -1, w: 0, h: 0, dpr: 1 });
  const draw = (p) => {
    const c = cv.current; const s = st.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (rect.width !== s.w || rect.height !== s.h || dpr !== s.dpr) { s.w = rect.width; s.h = rect.height; s.dpr = dpr; c.width = Math.round(rect.width * dpr); c.height = Math.round(rect.height * dpr); }
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cols = Math.ceil(s.w / cell); const rows = Math.ceil(s.h / cell);
    ctx.fillStyle = to; ctx.fillRect(0, 0, s.w, s.h);
    ctx.fillStyle = from;
    for (let r = 0; r < rows; r += 1) {
      for (let k = 0; k < cols; k += 1) {
        const th = (1 - (r + 1) / rows) * 0.55 + hash(r * 997 + k) * 0.45; // el color de abajo sube desde abajo; arriba aguanta más
        if (p < th) ctx.fillRect(k * cell, r * cell, cell + 0.5, cell + 0.5);
      }
    }
  };
  useViewport(wrap, ({ rect, vh, inView }) => {
    if (!inView) return;
    // 0 cuando la franja entra por abajo, 1 cuando llega al tercio superior.
    const p = reducedMotion ? 0.5 : 0.85 * clamp((vh - rect.top) / (vh * 0.75 + rect.height)); // nunca del todo: el borde de arriba queda en mosaico
    if (Math.abs(p - st.current.p) < (LIGHT ? 0.02 : 0.004)) return; // en móvil, menos redibujados
    st.current.p = p; draw(p);
  });
  useEffect(() => { const on = () => draw(Math.max(0, st.current.p)); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on); }, []);
  return <div className="pixel-seam" ref={wrap} aria-hidden="true"><canvas ref={cv} /></div>;
}

/* ---------- Rejilla de plano técnico con capas a distinta velocidad ---------- */
export function BlueprintGrid({ tone = 'light' }) {
  const wrap = useRef(null); const a = useRef(null); const b = useRef(null);
  useViewport(wrap, ({ rect, vh, inView }) => {
    if (!inView || !a.current) return;
    const p = (vh - rect.top) / (vh + rect.height); // 0..1 mientras atraviesa la pantalla
    a.current.style.transform = `translate3d(0, ${((0.5 - p) * 60).toFixed(1)}px, 0)`;
    b.current.style.transform = `translate3d(0, ${((0.5 - p) * 180).toFixed(1)}px, 0)`;
  }, !reducedMotion && !LIGHT);
  return (
    <div className="bp-grid" data-grid={tone} ref={wrap} aria-hidden="true">
      <i className="bp-fine" ref={a} />
      <i className="bp-major" ref={b} />
    </div>
  );
}

/* ---------- Fachada ilustrada (estado final del vuelo y vista estática) ---------- */
export function Facade() {
  const { lang } = useT();
  if (LOCATION.photo) return <img className="facade-photo" src={LOCATION.photo} alt="" />;
  const hours = LOCATION.hours[lang] || LOCATION.hours.es;
  return (
    <svg className="facade" viewBox="0 0 640 400" role="img" aria-label={`${LOCATION.shopName}. ${hours.join(', ')}`}>
      <g className="fc-ground"><path d="M0 352h640" /><path d="M24 372h592" className="fc-thin" /></g>
      <g className="fc-dim"><path d="M60 26v8M580 26v8M60 30h520" /><text x="320" y="22">18,00 m</text></g>
      <rect className="fc-wall" x="60" y="56" width="520" height="296" />
      <path className="fc-thin" d="M60 96h520" />
      <rect className="fc-sign" x="170" y="66" width="300" height="56" rx="4" />
      <text className="fc-sign-t" x="320" y="105">{LOCATION.shopName}</text>
      <rect className="fc-door" x="96" y="160" width="300" height="192" />
      {Array.from({ length: 11 }, (_, i) => <path key={i} className="fc-thin" d={`M96 ${176 + i * 16}h300`} />)}
      <path className="fc-accent" d="M96 160h300" />
      <rect className="fc-wall" x="428" y="200" width="64" height="152" />
      <circle className="fc-knob" cx="482" cy="282" r="3" />
      <rect className="fc-glass" x="508" y="176" width="48" height="72" />
      <rect className="fc-plate" x="500" y="266" width="76" height="46" rx="3" />
      <text className="fc-plate-t" x="538" y="285">{hours[0]}</text>
      <text className="fc-plate-t" x="538" y="302">{hours[1]}</text>
      <g className="fc-arrow"><path d="M150 380h180M310 372l20 8-20 8" /></g>
    </svg>
  );
}

/* ---------- Ubicación con vuelo de cámara ---------- */
// Fotogramas de la cámara (progreso 0-0,74): vista alta de España, Valencia, el centro y la calle.
const KEYS = [
  { p: 0, c: [-3.7, 40.1], z: 4.7, pitch: 0, bearing: 0 },
  { p: 0.24, c: [-0.42, 39.47], z: 10.2, pitch: 18, bearing: -6 },
  { p: 0.5, c: [LOCATION.lng, LOCATION.lat], z: 14.6, pitch: 46, bearing: -24 },
  { p: 0.74, c: [LOCATION.lng - 0.0004, LOCATION.lat + 0.0001], z: 17.3, pitch: 62, bearing: 28 },
];
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
function camAt(p) {
  let i = 0;
  while (i < KEYS.length - 2 && p > KEYS[i + 1].p) i += 1;
  const a = KEYS[i]; const b = KEYS[i + 1];
  const k = ease(clamp((p - a.p) / (b.p - a.p)));
  const z = a.z + (b.z - a.z) * k;
  // El centro se mueve en proporción a la escala (2^zoom): el destino queda quieto en pantalla al acercarse.
  const sa = 2 ** a.z; const sb = 2 ** b.z; const u = clamp((2 ** z - sa) / (sb - sa));
  return { center: [a.c[0] + (b.c[0] - a.c[0]) * u, a.c[1] + (b.c[1] - a.c[1]) * u], zoom: z, pitch: a.pitch + (b.pitch - a.pitch) * k, bearing: a.bearing + (b.bearing - a.bearing) * k };
}

function webgl() { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } }

export function MapSection() {
  const { t, lang } = useT();
  const wrap = useRef(null); const holder = useRef(null); const mask = useRef(null); const card = useRef(null);
  const [mode] = useState(() => (reducedMotion || !webgl() ? 'static' : 'fly'));
  const [status, setStatus] = useState('idle'); // idle | loading | ready | failed
  const api = useRef(null);
  const started = useRef(false);
  const target = useRef(0);
  const spring = useRef(createSpring(0, { tension: 80, friction: 22, precision: 0.0002 }));

  useViewport(wrap, ({ rect, vh }) => {
    target.current = clamp(-rect.top / Math.max(1, rect.height - vh));
    // Carga diferida: el chunk de MapLibre se pide cuando la sección está a menos de dos pantallas.
    const near = rect.top < vh * 2.2 && rect.bottom > -vh * 1.5;
    if (mode === 'fly' && !started.current && near) {
      started.current = true; // una sola carga aunque el ticker vuelva a medir antes del siguiente render
      setStatus('loading');
      import('./mapEngine.js')
        .then(({ createMap }) => createMap(holder.current, { ...camAt(Math.min(target.current, 0.74)), marker: [LOCATION.lng, LOCATION.lat], markerLabel: t('landing.map.demoTag'), lang }))
        .then((m) => { if (!started.current) { m.map.remove(); return; } api.current = m; setStatus('ready'); })
        .catch(() => { started.current = false; setStatus('failed'); });
    } else if (started.current && !near && !api.current) {
      started.current = false; // carga en curso que ya no hace falta: al resolverse se elimina (ver .then)
      setStatus('idle');
    } else if (started.current && !near && api.current) {
      // Lejos de la sección: se destruye la instancia (libera GPU y memoria); al volver se crea otra.
      try { api.current.map.remove(); } catch { /* ya eliminado */ }
      api.current = null; started.current = false; setStatus('idle');
    }
  }, mode === 'fly');

  useEffect(() => { api.current?.setLabel(t('landing.map.demoTag')); }, [lang]);
  useEffect(() => () => { started.current = false; try { api.current?.map.remove(); } catch { /* ya eliminado */ } api.current = null; }, []);

  useTick((s) => {
    const sp = spring.current; sp.set(target.current);
    const moved = sp.step(s.dt);
    if (!moved && !s.resized && s.frame % 60 !== 0) return;
    const p = sp.value;
    if (api.current) api.current.map.jumpTo(camAt(Math.min(p, 0.74)));
    // Máscara circular desde el pin hacia la fachada (0,76-0,92).
    if (mask.current) {
      const m = range(p, 0.76, 0.92);
      mask.current.style.clipPath = `circle(${(m * 150).toFixed(2)}% at 50% 58%)`;
      mask.current.style.visibility = m <= 0.001 ? 'hidden' : 'visible';
    }
    if (card.current) card.current.dataset.stage = p < 0.2 ? '0' : p < 0.45 ? '1' : p < 0.76 ? '2' : '3';
  }, 'write', mode === 'fly');

  const street = LOCATION.street[lang] || LOCATION.street.es;
  const info = (
    <div className="map-card" ref={card} data-stage="0">
      <span className="demo-tag">{t('landing.map.demoTag')}</span>
      <Reveal className="h-section" id="map-title" lines={t('landing.map.title')} />
      <p className="lead">{t('landing.map.lead')}</p>
      <address className="map-addr"><strong>{street}</strong><br />{LOCATION.city}</address>
      <p className="map-hours"><strong>{t('landing.map.hours')}:</strong> {(LOCATION.hours[lang] || LOCATION.hours.es).join(' · ')}</p>
      <ol className="map-steps" aria-hidden="true">{t('landing.map.steps').map((s) => <li key={s}>{s}</li>)}</ol>
      <div className="part-actions">
        <a className="btn btn--ghost" href={directionsUrl(LOCATION)} target="_blank" rel="noopener noreferrer">{t('landing.map.directions')}<span className="sr-only"> ({t('landing.map.external')})</span></a>
      </div>
      <p className="hint">{t('landing.map.note')}</p>
    </div>
  );

  if (mode === 'static') {
    return (
      <section className="section section--paper map-static" id="ubicacion" data-tone="paper" aria-labelledby="map-title">
        <div className="wrap split">
          {info}
          <div className="facade-frame"><Facade /></div>
        </div>
      </section>
    );
  }
  return (
    <section className="map-sec" id="ubicacion" ref={wrap} data-tone="paper" aria-labelledby="map-title">
      <div className="map-stage">
        <div className="map-holder" ref={holder} aria-hidden="true" />
        {status !== 'ready' && <div className="map-wait" aria-hidden="true">{status === 'failed' ? <div className="facade-frame"><Facade /></div> : <span>{t('landing.map.loading')}</span>}</div>}
        <div className="map-mask" ref={mask} aria-hidden="true"><div className="facade-frame"><Facade /></div></div>
        <div className="wrap map-overlay">{info}</div>
      </div>
    </section>
  );
}
