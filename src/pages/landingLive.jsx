import { useEffect, useRef, useState } from 'react';
import { STATES } from '../../shared/domain.js';
import { useT } from '../i18n/index.jsx';
import { Btn, Plate, Reveal, StateChip } from '../components/ui.jsx';
import { useTick, useViewport, reducedMotion } from '../lib/hooks.js';
import { createSpring, SPRINGS } from '../lib/spring.js';
import { useLiveCars, locationOf } from '../lib/liveDemo.js';
import { AudienceTag, BlueprintGrid } from './landingExtras.jsx';

// Tablero del taller y móvil del cliente, sincronizados: lo que se toca a la izquierda lo lee el cliente a la derecha.
export function LiveShop() {
  const { t } = useT();
  const live = useLiveCars();
  const { cars, log, selectedId, select, setState, playing, setPlaying } = live;
  const idx = Math.max(0, cars.findIndex((c) => c.id === selectedId));
  const sel = cars[idx];
  const step = STATES.indexOf(sel.state);
  return (
    <section className="section--dark on-dark live demo-sec" id="demo-equipo" data-tone="dark" aria-labelledby="demo1-title">
      <div className="wrap">
        <div className="sec-head demo-head">
          <p className="demo-eyebrow"><span>{t('landing.demos.label', { n: '1' })} · {t('landing.demos.team.for')}</span><AudienceTag who="team" /></p>
          <Reveal className="h-section" id="demo1-title" lines={t('landing.demos.team.headline')} />
          <p className="lead">{t('landing.demos.team.explain')}</p>
          <div className="demo-cta"><Btn to="/panel" variant="light">{t('landing.demos.team.open')}</Btn><span className="hint">{t('landing.demos.team.pin')}</span></div>
        </div>
        <p className="live-intro">{t('landing.live.lead')}</p>
        <div className="live-grid">
          <div className="tablet" role="group" aria-label={t('landing.live.tablet')}>
            <p className="screen-label"><span>{t('landing.live.tablet')}</span><AudienceTag who="team" /></p>
            <div className="mock-head">
              <strong className="tablet-name">{t('landing.live.board')}</strong>
              <span className="net">{t('panel.live')}</span>
              <span className="demo-tag">{t('common.demo')}</span>
            </div>
            <ul className="live-cars">
              {cars.map((c, i) => (
                <li key={c.id}>
                  <button type="button" className="live-car" aria-pressed={c.id === sel.id} onClick={() => select(c.id)}>
                    <Plate value={c.plate} />
                    <span className="live-model">{c.model}</span>
                    <span key={c.state} className="live-chip"><StateChip state={c.state} /></span>
                    <small className="live-where">{t(`locations.${locationOf(c, i)}`)}</small>
                  </button>
                </li>
              ))}
            </ul>
            <div className="live-pick">
              <p className="hint">{t('landing.live.pick', { plate: sel.plate.replace(/^(\d{4})/, '$1 ') })}</p>
              <div className="choices live-states" role="group" aria-label={t('panel.detail.state')}>
                {STATES.map((s) => <button key={s} type="button" className="choice" aria-pressed={sel.state === s} onClick={() => setState(sel.id, s)}>{t(`states.${s}`)}</button>)}
              </div>
            </div>
            <div className="live-foot">
              <ol className="live-log" aria-label={t('landing.live.log')} aria-live="off">
                {log.length === 0 && <li className="hint">{t('landing.live.logEmpty')}</li>}
                {log.map((l) => <li key={l.key}><time>{l.time}</time><span><b>{l.plate.replace(/^(\d{4})/, '$1 ')}</b> → {t(`states.${l.state}`)}</span></li>)}
              </ol>
              {!reducedMotion && <Btn variant="outline-light sm" aria-pressed={playing} onClick={() => setPlaying((v) => !v)}>{playing ? t('landing.live.pause') : t('landing.live.play')}</Btn>}
            </div>
          </div>

          <div className="live-phone-col">
            <p className="screen-label"><span>{t('landing.live.phone')}</span><AudienceTag who="customer" /></p>
            <div className="phone phone--live" role="group" aria-label={t('landing.live.phone')}>
              <div className="phone-top"><span className="phone-notch" aria-hidden="true" /></div>
              <div className="mock-head"><div><span className="hint">{t('landing.customer.cardPlate')}</span><br /><Plate value={sel.plate} /></div><span className="demo-tag">{t('common.demo')}</span></div>
              <p className="phone-model">{sel.model}</p>
              <div className="stepper" aria-hidden="true">{STATES.map((s, i) => <i key={s} data-on={i <= step} />)}</div>
              <span key={`${sel.id}${sel.state}c`} className="live-swap"><StateChip state={sel.state} /></span>
              <p className="says" aria-live="polite"><span key={`${sel.plate}${sel.state}`} className="live-swap">{t(`consulta.status.${sel.state}`)}</span></p>
              <p className="phone-sync"><i aria-hidden="true" />{t('consulta.updated')}</p>
            </div>
          </div>
        </div>
        <div className="live-cta">
          <p className="hint">{t('landing.live.note')}</p>
          <Btn to="/tv" variant="outline-light">{t('landing.live.tv')}</Btn>
        </div>
      </div>
    </section>
  );
}

// Número que se mueve con un muelle hasta su valor (sin keyframes: lo conduce el ticker).
function Num({ value, format }) {
  const ref = useRef(null);
  const sp = useRef(createSpring(value, { tension: 120, friction: 22, precision: 0.01 }));
  sp.current.set(value);
  useEffect(() => { if (ref.current) ref.current.textContent = format(sp.current.value); });
  useTick((s) => { if (sp.current.step(s.dt) !== false && ref.current) ref.current.textContent = format(sp.current.value); }, 'write', !reducedMotion);
  return <span ref={ref}>{format(reducedMotion ? value : sp.current.value)}</span>;
}

function Slider({ label, value, onChange, min, max, step = 1, unit = '' }) {
  const id = label.replace(/\W+/g, '-').toLowerCase();
  return (
    <div className="field slider">
      <label htmlFor={id}>{label}<output htmlFor={id}>{value}{unit}</output></label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

// Cuenta sencilla con las cifras del propio taller. Los valores de partida son un ejemplo, no una medida.
export function Calc() {
  const { t, lang } = useT();
  const [calls, setCalls] = useState(10);
  const [mins, setMins] = useState(4);
  const [rate, setRate] = useState(40);
  const [avoid, setAvoid] = useState(50); // estimación del propio taller, no una promesa
  const DAYS = 22;
  const hours = (calls * mins * DAYS) / 60;
  const euros = hours * rate;
  const avoidHours = (hours * avoid) / 100;
  const avoidEuros = (euros * avoid) / 100;
  const nf = (o) => new Intl.NumberFormat(lang === 'es' ? 'es-ES' : 'en-GB', o);
  return (
    <section className="section calc" id="calc" data-tone="light">
      <BlueprintGrid />
      <div className="wrap split">
        <div>
          <div className="sec-head">
            <Reveal className="h-section" lines={t('landing.calc.title')} />
            <p className="lead">{t('landing.calc.lead')}</p>
          </div>
          <div className="sliders">
            <Slider label={t('landing.calc.calls')} value={calls} onChange={setCalls} min={0} max={40} />
            <Slider label={t('landing.calc.mins')} value={mins} onChange={setMins} min={1} max={10} unit=" min" />
            <Slider label={t('landing.calc.rate')} value={rate} onChange={setRate} min={20} max={90} step={5} unit=" €" />
            <Slider label={t('landing.calc.avoid')} value={avoid} onChange={setAvoid} min={0} max={100} step={5} unit=" %" />
            <p className="hint calc-est">{t('landing.calc.avoidNote')}</p>
          </div>
        </div>
        <div className="calc-out" aria-live="polite">
          <p className="sign calc-kicker">{t('landing.calc.result')}</p>
          <p className="calc-big"><Num value={hours} format={(v) => nf({ maximumFractionDigits: 0 }).format(v)} /><small>{t('landing.calc.hours')}</small></p>
          <p className="calc-big calc-big--blue"><Num value={euros} format={(v) => nf({ maximumFractionDigits: 0 }).format(v)} /><small>{t('landing.calc.money')}</small></p>
          <p className="calc-eq">{t('landing.calc.eq', { n: nf({ maximumFractionDigits: 1 }).format(hours / 8) })}</p>
          <div className="calc-avoid">
            <p className="sign calc-kicker">{t('landing.calc.avoidResult', { p: String(avoid) })}</p>
            <p className="calc-mid"><Num value={avoidHours} format={(v) => nf({ maximumFractionDigits: 0 }).format(v)} /><small>{t('landing.calc.hours')}</small><Num value={avoidEuros} format={(v) => nf({ maximumFractionDigits: 0 }).format(v)} /><small>{t('landing.calc.money')}</small></p>
          </div>
          <div className="calc-formula">
            <p className="sign calc-kicker">{t('landing.calc.formulaTitle')}</p>
            <p><code>{t('landing.calc.f1', { c: String(calls), m: String(mins), d: String(DAYS), h: nf({ maximumFractionDigits: 1 }).format(hours) })}</code></p>
            <p><code>{t('landing.calc.f2', { h: nf({ maximumFractionDigits: 1 }).format(hours), r: String(rate), e: nf({ maximumFractionDigits: 0 }).format(euros) })}</code></p>
            <p><code>{t('landing.calc.f3', { e: nf({ maximumFractionDigits: 0 }).format(euros), p: String(avoid), a: nf({ maximumFractionDigits: 0 }).format(avoidEuros) })}</code></p>
          </div>
          <p className="hint">{t('landing.calc.note', { d: String(DAYS) })}</p>
        </div>
      </div>
    </section>
  );
}

// Palabra grande del pie: cada letra sube con su muelle al entrar en pantalla y, con ratón, se levanta al pasar cerca (efecto ola).
export function LetterWord({ text }) {
  const ref = useRef(null);
  const st = useRef({ springs: null, started: false, t0: 0, px: -1, centers: [] });
  const chars = [...text];
  if (!st.current.springs || st.current.springs.length !== chars.length) {
    st.current.springs = chars.map(() => ({ rise: createSpring(reducedMotion ? 0 : 1, SPRINGS.reveal), lift: createSpring(0, SPRINGS.snappy) }));
  }
  useViewport(ref, ({ inView }) => { if (inView && !st.current.started) { st.current.started = true; st.current.t0 = performance.now(); } }, !reducedMotion);
  useEffect(() => {
    const el = ref.current;
    if (reducedMotion || !el || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return undefined;
    const move = (e) => {
      st.current.centers = [...el.querySelectorAll('.lw-ch')].map((n) => { const r = n.getBoundingClientRect(); return r.left + r.width / 2; });
      st.current.px = e.clientX;
    };
    const leave = () => { st.current.px = -1; };
    el.addEventListener('pointermove', move); el.addEventListener('pointerleave', leave);
    return () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); };
  }, []);
  useTick((s) => {
    const el = ref.current; const c = st.current;
    if (!el || !c.started) return;
    const spans = el.querySelectorAll('.lw-ch');
    c.springs.forEach((sp, i) => {
      if (s.time - c.t0 >= i * 50) sp.rise.set(0);
      sp.lift.set(c.px >= 0 && c.centers[i] !== undefined ? -Math.max(0, 1 - Math.abs(c.px - c.centers[i]) / 170) * 0.3 : 0);
      const a = sp.rise.step(s.dt); const b = sp.lift.step(s.dt);
      if ((a || b) && spans[i]) spans[i].style.transform = `translateY(${(sp.rise.value * 110 + sp.lift.value * 100).toFixed(2)}%)`;
    });
  }, 'write', !reducedMotion);
  return (
    <span className="lw" ref={ref}>
      {chars.map((ch, i) => (ch === ' '
        ? <span className="lw-sp" key={i} />
        : <span className="lw-ch" key={i} style={reducedMotion ? undefined : { transform: 'translateY(110%)' }}>{ch}</span>))}
    </span>
  );
}
