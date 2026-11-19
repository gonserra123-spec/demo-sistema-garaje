// EmailAdapter: avisos transaccionales al cliente («Tu coche ya está en el taller» y «Tu coche está listo»).
//   send({ kind, to, workshop: { name, code }, plate, lang, vehicleId }) -> { ok, status, id?, error? }
// Dos implementaciones:
//   - MockEmailAdapter (demo): no envía nada. Guarda el correo exacto que recibiría el cliente en una bandeja
//     de vista previa que se ve desde el panel.
//   - ResendEmailAdapter: pide el envío al Worker (/api/notify), que guarda la clave de Resend como secreto de
//     Wrangler y solo atiende a peticiones con un token de sesión del panel. El navegador nunca ve la clave.
// Solo correos transaccionales: nunca marketing.
import { EMAIL_KINDS, renderEmail } from '../../shared/emails.js';
import { NetworkError, readJsonResponse } from './adapter.js';

const consultaUrl = (code) => `${typeof window !== 'undefined' ? window.location.origin : 'https://example.invalid'}/consulta/${encodeURIComponent(code)}`;

export function createMockEmailAdapter({ store }) {
  return {
    kind: 'mock',
    async send({ kind, to, workshop, plate, lang = 'es', vehicleId = null }) {
      if (!EMAIL_KINDS.includes(kind) || !to) return { ok: false, status: 400, error: 'invalid' };
      const mail = renderEmail({ kind, shop: workshop.name, plate, consultaUrl: consultaUrl(workshop.code), lang });
      const id = crypto.randomUUID();
      store({ id, kind, to, vehicleId, at: new Date().toISOString(), ...mail, delivered: false });
      return { ok: true, status: 200, id, preview: true };
    },
  };
}

export function createResendEmailAdapter({ token }) {
  return {
    kind: 'resend',
    async send({ kind, to, workshop, plate, lang = 'es' }) {
      let res;
      try {
        res = await fetch('/api/notify', {
          method: 'POST', credentials: 'same-origin', cache: 'no-store',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'tridom-garage', Authorization: `Bearer ${await token()}` },
          body: JSON.stringify({ kind, to, workshopCode: workshop.code, plate, lang }),
        });
      } catch { throw new NetworkError('offline'); }
      return readJsonResponse(res);
    },
  };
}
