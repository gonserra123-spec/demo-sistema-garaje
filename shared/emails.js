// Correos transaccionales al cliente. Solo dos avisos y solo con el dato mínimo: nombre del taller y matrícula.
// Nunca coste, notas ni teléfono. La matrícula no va en ningún enlace: el enlace lleva a la consulta del
// taller y es el cliente quien la escribe. Lo usan el MockEmailAdapter (vista previa en la demo) y el Worker.
import { formatPlate } from './plates.js';

export const EMAIL_KINDS = ['arrived', 'ready'];

const T = {
  es: {
    arrived: {
      subject: 'Tu coche ya está en el taller',
      line: (shop, plate) => `${shop} te avisa de que tu coche con matrícula ${plate} ya está en el taller.`,
    },
    ready: {
      subject: 'Tu coche está listo, puedes pasar a recogerlo',
      line: (shop, plate) => `${shop} te avisa de que tu coche con matrícula ${plate} ya está listo. Puedes pasar a recogerlo.`,
    },
    hello: 'Hola:',
    how: 'Para ver cómo va, entra en la consulta del taller e introduce tu matrícula:',
    why: (shop) => `Recibes este aviso porque aceptaste recibir avisos sobre tu coche en ${shop}. Es un mensaje automático: no es publicidad.`,
    stop: 'Si no quieres recibir más avisos, responde a este correo o díselo al taller.',
  },
  en: {
    arrived: {
      subject: 'Your car is now at the workshop',
      line: (shop, plate) => `${shop} is letting you know that your car with plate ${plate} is now at the workshop.`,
    },
    ready: {
      subject: 'Your car is ready to be collected',
      line: (shop, plate) => `${shop} is letting you know that your car with plate ${plate} is ready. You can come and collect it.`,
    },
    hello: 'Hello,',
    how: 'To see how it is going, open the workshop’s status page and type your plate:',
    why: (shop) => `You are receiving this because you agreed to receive updates about your car from ${shop}. This is an automatic message, not advertising.`,
    stop: 'If you do not want any more updates, reply to this email or tell the workshop.',
  },
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// consultaUrl: dirección de la consulta del taller SIN matrícula (p. ej. https://…/consulta/DEMO01).
export function renderEmail({ kind, shop, plate, consultaUrl, lang = 'es' }) {
  if (!EMAIL_KINDS.includes(kind)) throw new Error('kind');
  if (/[?&#]/.test(consultaUrl)) throw new Error('url'); // nada de parámetros: la matrícula no viaja en enlaces
  const L = T[lang] || T.es;
  const p = formatPlate(plate);
  const lines = [L.hello, '', L[kind].line(shop, p), '', L.how, consultaUrl, '', '—', L.why(shop), L.stop];
  const text = lines.join('\n');
  const html = `<!doctype html><html lang="${lang}"><body style="margin:0;padding:24px;background:#F4F7FC;font-family:Arial,sans-serif;color:#0E1B2E">`
    + '<div style="max-width:520px;margin:0 auto;background:#fff;border:1.5px solid #0B2A5B;border-radius:10px;padding:24px">'
    + `<p style="margin:0 0 16px;font-weight:bold;color:#0B2A5B">${esc(shop)}</p>`
    + `<p style="margin:0 0 12px">${esc(L.hello)}</p>`
    + `<p style="margin:0 0 16px;font-size:17px">${esc(L[kind].line(shop, p))}</p>`
    + `<p style="margin:0 0 8px">${esc(L.how)}</p>`
    + `<p style="margin:0 0 24px"><a href="${esc(consultaUrl)}" style="color:#1F4FB8">${esc(consultaUrl)}</a></p>`
    + `<p style="margin:0;font-size:13px;color:#44567A">${esc(L.why(shop))} ${esc(L.stop)}</p>`
    + '</div></body></html>';
  return { subject: L[kind].subject, text, html };
}

export const maskEmail = (e) => (e ? `${e[0]}***@${e.split('@')[1]}` : null);
