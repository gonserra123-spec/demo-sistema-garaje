// Oficina: bandeja de vista previa de los avisos al cliente. En la demo no se envía nada: aquí se ve el
// correo exacto (asunto y texto) que recibiría el cliente. Con Resend conectado, esta bandeja queda vacía.
import { useCallback, useEffect, useState } from 'react';
import { useT } from '../../i18n/index.jsx';
import { Btn } from '../../components/ui.jsx';
import { usePanel } from '../../data/panelStore.js';
import { getAdapter } from '../../data/adapter.js';

export function useOutbox() {
  const tick = usePanel((s) => s.outboxTick);
  const status = usePanel((s) => s.status);
  const [list, setList] = useState([]);
  const load = useCallback(async () => {
    try { const r = await (await getAdapter()).outbox?.(); if (r?.ok) setList(r.messages); } catch { /* sin conexión */ }
  }, []);
  useEffect(() => { if (status === 'ready') load(); }, [load, tick, status]);
  return [list, load];
}

export function Outbox({ onBack }) {
  const { t, date } = useT();
  const [list, load] = useOutbox();
  const [open, setOpen] = useState(null);
  const clear = async () => { try { await (await getAdapter()).clearOutbox?.(); } catch { /* sin conexión */ } load(); };
  return (
    <section className="panel-card" aria-labelledby="h-out">
      <div className="detail-head"><Btn variant="ghost sm" onClick={onBack} aria-label={t('common.back')}>←</Btn><h2 className="grow" id="h-out">{t('panel.outbox.title')}</h2></div>
      <p className="notice">{t('panel.outbox.note')}</p>
      {!list.length ? <p className="empty">{t('panel.outbox.empty')}</p> : (
        <ul className="mail-list">
          {list.map((m) => (
            <li key={m.id} className="mail">
              <button type="button" className="mail-head" aria-expanded={open === m.id} onClick={() => setOpen(open === m.id ? null : m.id)}>
                <span className="mail-subj">{m.subject}</span>
                <span className="hint">{t('panel.outbox.to', { to: m.to })} · {date(m.at, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
              </button>
              {open === m.id && <pre className="mail-body">{m.text}</pre>}
            </li>
          ))}
        </ul>
      )}
      {list.length > 0 && <div className="part-actions"><Btn variant="ghost sm" onClick={clear}>{t('panel.outbox.clear')}</Btn></div>}
      <p className="hint">{t('panel.outbox.retention')}</p>
    </section>
  );
}
