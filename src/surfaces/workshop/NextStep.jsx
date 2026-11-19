// Mecánico: un toque y listo. El botón grande avanza el coche al siguiente estado y, en el mismo toque,
// le asigna la ubicación lógica (elevador o foso libre para reparar, zona de recogida cuando está listo).
// La ubicación sugerida se puede cambiar antes de tocar. Los demás estados quedan como acciones secundarias.
// Tras cada cambio hay 5 s para «Deshacer» (contra toques por error) y una vibración corta donde exista.
import { useEffect, useMemo, useState } from 'react';
import { STATES, capacities, locationsFor, nextState, preferredLocations, suggestPlace } from '../../../shared/domain.js';
import { useT } from '../../i18n/index.jsx';
import { usePanel } from '../../data/panelStore.js';
import { formatPlate } from '../../../shared/plates.js';

const haptic = () => { try { navigator.vibrate?.(12); } catch { /* sin vibración */ } };

export function NextStep({ v, run }) {
  const { t } = useT();
  const { vehicles, workshop, toast } = usePanel();
  const next = nextState(v);
  const [override, setOverride] = useState(null); // ubicación elegida a mano para el siguiente paso
  const [picking, setPicking] = useState(false);
  useEffect(() => { setOverride(null); setPicking(false); }, [v.id, v.state]);

  const tpl = workshop.template;
  const place = useMemo(() => (next ? suggestPlace(next, tpl, vehicles, v) : null), [next, tpl, vehicles, v]);
  const target = override || place?.location || null;

  // Plazas libres por ubicación (sin contar este coche), para el selector de «Cambiar».
  const cap = capacities(tpl);
  const used = {};
  for (const o of vehicles) if (o.id !== v.id && o.location) used[o.location] = (used[o.location] || 0) + 1;
  const free = (l) => (used[l] || 0) < cap[l];
  const pickList = next ? [...new Set([...preferredLocations(next, tpl, v.location), ...locationsFor(tpl)])] : [];

  const go = async (state, location) => {
    const prev = { state: v.state, location: v.location };
    haptic();
    const patch = { state, ...(state !== 'delivered' && location ? { location } : {}) };
    const r = await run({ type: 'patch', id: v.id, patch });
    if (r.ok) {
      toast('ok', 'panel.step.done', { plate: formatPlate(v.plate), state: t(`states.${state}`) }, {
        ms: 5000,
        action: { label: 'panel.step.undo', run: () => { haptic(); run({ type: 'patch', id: v.id, patch: { state: prev.state, ...(prev.location ? { location: prev.location } : {}) } }); } },
      });
    }
  };
  // Estado elegido a mano: también se lleva su ubicación lógica en el mismo toque.
  const setTo = (s) => { if (s === v.state) return; const p = suggestPlace(s, tpl, vehicles, v); go(s, p?.location); };

  return (
    <section className="block step" aria-labelledby="h-state">
      <h3 id="h-state">{t('panel.detail.state')}</h3>
      {next ? (
        <>
          <button type="button" className="next-btn" onClick={() => go(next, target)}>
            <span className="next-k">{t('panel.step.next')}</span>
            <span className="next-v">{t(`states.${next}`)}</span>
            {next !== 'delivered' && target && <span className="next-loc"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>{t(`locations.${target}`)}</span>}
          </button>
          {next !== 'delivered' && (
            <p className="hint step-where">
              {target ? t('panel.step.goesTo', { where: t(`locations.${target}`) }) : t('panel.step.noPlace')}
              {' '}<button type="button" className="linklike" aria-expanded={picking} onClick={() => setPicking((x) => !x)}>{picking ? t('panel.step.keep') : t('panel.step.change')}</button>
            </p>
          )}
          {picking && (
            <div className="choices" role="group" aria-label={t('panel.step.pick')}>
              {pickList.map((l) => {
                const busy = !free(l) && v.location !== l;
                return <button key={l} type="button" className="choice" aria-pressed={target === l} disabled={busy} onClick={() => { setOverride(l); setPicking(false); }}>{t(`locations.${l}`)}{busy && <small>{t('panel.detail.occupied')}</small>}</button>;
              })}
            </div>
          )}
        </>
      ) : <p className="hint">{t('panel.step.end')}</p>}
      <p className="step-sub" id="h-other">{t('panel.step.others')}</p>
      <div className="choices choices--sec" role="group" aria-labelledby="h-other">
        {STATES.map((s) => <button key={s} type="button" className="choice" aria-pressed={v.state === s} onClick={() => setTo(s)}>{t(`states.${s}`)}</button>)}
      </div>
    </section>
  );
}

// Indicador de guardado: guardando / guardado / sin conexión con cambios en cola.
export function SaveStatus() {
  const { t } = useT();
  const { online, queue, saving, savedAt } = usePanel();
  const [, force] = useState(0);
  useEffect(() => { if (!savedAt) return undefined; const id = setTimeout(() => force((n) => n + 1), 2200); return () => clearTimeout(id); }, [savedAt]);
  let kind = 'ok'; let text = t('panel.online');
  if (!online || queue.length) { kind = 'off'; text = `${t('panel.offline')}${queue.length ? ` · ${t('panel.offlineQueue', { n: String(queue.length) })}` : ''}`; }
  else if (saving > 0) { kind = 'busy'; text = t('panel.saving'); }
  else if (Date.now() - savedAt < 2000) { kind = 'ok'; text = t('panel.savedNow'); }
  return <span className="net" data-off={kind === 'off'} data-busy={kind === 'busy'} role="status" aria-live="polite">{text}</span>;
}
