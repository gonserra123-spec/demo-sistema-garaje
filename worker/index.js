// Worker de Cloudflare: sirve la app (assets con modo SPA) y atiende las dos rutas de servidor que
// necesita la demo pública:
//   POST /api/contact  formulario «¿Lo vemos en tu taller?» -> correo a CONTACT_TO_EMAIL (Resend)
//   POST /api/notify   aviso transaccional al cliente (alta / listo) -> Resend. Solo con token de sesión del panel.
// Cualquier otra /api/* responde 404 en JSON (nunca la página de la app).
// Secretos (wrangler secret put): RESEND_API_KEY, NOTIFY_TOKEN_SECRET. Nunca en el código ni en el frontend.
import { validateContact, isEmail, cleanText } from '../shared/validate.js';
import { classifyPlate, normalizePlate } from '../shared/plates.js';
import { EMAIL_KINDS, renderEmail } from '../shared/emails.js';

const API_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};
const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...API_HEADERS, ...extra } });

// Mismo origen (o uno de ALLOWED_ORIGINS) y cabecera propia: un formulario de otro sitio no puede ponerla.
function sameOrigin(req, env) {
  const origin = req.headers.get('Origin');
  if (!origin) return false;
  const allowed = new Set([new URL(req.url).origin, ...String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)]);
  return allowed.has(origin) && req.headers.get('X-Requested-With') === 'tridom-garage';
}

async function readJson(req, max = 16_384) {
  if (!/^application\/json\b/i.test(req.headers.get('Content-Type') || '')) return null;
  const len = Number(req.headers.get('Content-Length') || 0);
  if (len > max) return null;
  const text = await req.text();
  if (text.length > max) return null;
  try { const v = JSON.parse(text || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; }
}

// Límite de intentos: binding de Rate Limiting de Cloudflare si existe; si no, memoria del isolate (aproximado).
const mem = new Map();
async function allow(binding, key, max, windowMs) {
  if (binding && typeof binding.limit === 'function') {
    try { const { success } = await binding.limit({ key }); return success; } catch { /* sigue con la memoria */ }
  }
  const now = Date.now();
  const list = (mem.get(key) || []).filter((t) => now - t < windowMs);
  list.push(now); mem.set(key, list);
  if (mem.size > 5000) mem.delete(mem.keys().next().value);
  return list.length <= max;
}
const ipOf = (req) => req.headers.get('CF-Connecting-IP') || 'unknown';

async function sendResend(env, msg, idempotencyKey) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
    body: JSON.stringify(msg),
  });
  // Sin registrar el cuerpo: lleva datos personales.
  return res.ok;
}
const configured = (v) => typeof v === 'string' && v.includes('@') && !/FALTA|example\.(com|invalid|org)/i.test(v);

async function contact(req, env) {
  if (!(await allow(env.CONTACT_LIMITER, `contact:${ipOf(req)}`, 3, 60_000))) return json({ ok: false, error: 'rate_limited' }, 429, { 'Retry-After': '60' });
  const body = await readJson(req);
  if (!body) return json({ ok: false, error: 'invalid' }, 400);
  if (body.website) return json({ ok: true }); // honeypot: respuesta normal, sin enviar nada
  const v = validateContact(body);
  if (!v.ok) return json({ ok: false, error: 'validation', errors: v.errors }, 422);
  if (!env.RESEND_API_KEY || !configured(env.CONTACT_TO_EMAIL) || !configured(env.CONTACT_FROM_EMAIL)) return json({ ok: false, error: 'not_configured' }, 503);
  const name = cleanText(body.name); const shop = cleanText(body.workshop); const email = cleanText(body.email).toLowerCase();
  const phone = cleanText(body.phone); const message = cleanText(body.message);
  const text = [`Nombre: ${name}`, `Taller: ${shop}`, `Correo: ${email}`, `Teléfono: ${phone || '—'}`, '', message, '', '— Enviado desde el formulario de la web de Tridom Automotive. Consentimiento de privacidad: sí.'].join('\n');
  const ok = await sendResend(env, { from: env.CONTACT_FROM_EMAIL, to: [env.CONTACT_TO_EMAIL], reply_to: email, subject: `Contacto web: ${shop}`.slice(0, 120), text });
  return ok ? json({ ok: true, delivered: true }) : json({ ok: false, error: 'generic' }, 502);
}

// Token de un solo mensaje: base64url(JSON {w: código del taller, m: sha256 hex de "kind|to|plate", exp}) + '.' +
// HMAC-SHA256. Lo emite el backend del panel (Edge Function `panel` en Supabase) con el mismo NOTIFY_TOKEN_SECRET,
// después de comprobar en su base de datos el coche, el correo y el consentimiento. Así quien tenga un token no
// puede elegir otro destinatario ni otra matrícula: el Worker solo envía exactamente el mensaje firmado.
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function readPanelToken(req, env) {
  const m = /^Bearer ([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(req.headers.get('Authorization') || '');
  if (!m || !env.NOTIFY_TOKEN_SECRET || env.NOTIFY_TOKEN_SECRET.length < 32) return null;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.NOTIFY_TOKEN_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = b64u(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(m[1])));
  if (sig.length !== m[2].length) return null;
  let diff = 0; for (let i = 0; i < sig.length; i += 1) diff |= sig.charCodeAt(i) ^ m[2].charCodeAt(i);
  if (diff) return null;
  try {
    const p = JSON.parse(atob(m[1].replace(/-/g, '+').replace(/_/g, '/')));
    return p && typeof p.w === 'string' && /^[0-9a-f]{64}$/.test(p.m || '') && Number(p.exp) > Date.now() ? { ...p, sig: m[2] } : null;
  } catch { return null; }
}

async function notify(req, env) {
  const tok = await readPanelToken(req, env);
  if (!tok) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!(await allow(env.NOTIFY_LIMITER, `notify:${tok.w}`, 20, 60_000))) return json({ ok: false, error: 'rate_limited' }, 429, { 'Retry-After': '60' });
  const body = await readJson(req, 4096);
  if (!body) return json({ ok: false, error: 'invalid' }, 400);
  const plate = normalizePlate(body.plate);
  const to = cleanText(body.to).toLowerCase();
  if (!EMAIL_KINDS.includes(body.kind) || !isEmail(to) || !classifyPlate(plate) || body.workshopCode !== tok.w) return json({ ok: false, error: 'invalid' }, 422);
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${body.kind}|${to}|${plate}`)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (digest !== tok.m) return json({ ok: false, error: 'unauthorized' }, 401); // el token no es para este mensaje
  // Remitente y reply-to por taller: WORKSHOP_EMAIL_CONFIG = {"CODIGO":{"name":"…","from":"…","replyTo":"…","consultaUrl":"https://…/consulta/CODIGO"}}
  let cfg = null;
  try { cfg = JSON.parse(env.WORKSHOP_EMAIL_CONFIG || '{}')[tok.w] || null; } catch { cfg = null; }
  if (!env.RESEND_API_KEY || !cfg || !configured(cfg.from)) return json({ ok: false, error: 'not_configured' }, 503);
  const mail = renderEmail({ kind: body.kind, shop: cfg.name, plate, consultaUrl: cfg.consultaUrl, lang: body.lang === 'en' ? 'en' : 'es' });
  const ok = await sendResend(env, { from: cfg.from, to: [to], ...(configured(cfg.replyTo) ? { reply_to: cfg.replyTo } : {}), subject: mail.subject, text: mail.text, html: mail.html }, `notify-${tok.sig.slice(0, 64)}`); // reenviar el mismo token no duplica el correo
  return ok ? json({ ok: true }) : json({ ok: false, error: 'generic' }, 502);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/assets/')) {
      // Un fichero con hash que ya no existe (página antigua tras un despliegue) es 404, nunca la página de la app:
      // si no, el navegador recibe HTML donde espera JavaScript y la web se queda en blanco.
      const res = await env.ASSETS.fetch(req);
      if (res.status === 200 && /text\/html/i.test(res.headers.get('Content-Type') || '')) return new Response('No encontrado', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
      return res;
    }
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      if (req.method !== 'POST') return json({ ok: false, error: 'not_found' }, 404);
      if (url.pathname === '/api/contact' || url.pathname === '/api/notify') {
        if (!sameOrigin(req, env)) return json({ ok: false, error: 'forbidden' }, 403);
        return url.pathname === '/api/contact' ? await contact(req, env) : await notify(req, env);
      }
      return json({ ok: false, error: 'not_found' }, 404);
    } catch {
      return json({ ok: false, error: 'server' }, 500);
    }
  },
};
