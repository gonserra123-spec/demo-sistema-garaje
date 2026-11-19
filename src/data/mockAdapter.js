// MockAdapter: el «Taller Demo» entero dentro del navegador. Sin red y sin servidor: funciona igual en
// `vite dev` que en un hosting estático (Cloudflare Workers con assets).
//   - Datos: fixtures ficticios guardados en localStorage (se regeneran a las 12 h o si cambia la versión).
//   - Tiempo real: BroadcastChannel entre pestañas del mismo navegador (y el evento `storage` de reserva).
//   - Correos: MockEmailAdapter, que deja el correo exacto en una bandeja de vista previa del panel.
// Las reglas (plazas, estados, validación) son las mismas que usa el servidor: shared/.
import catalog from '../../shared/models.json' with { type: 'json' };
import template from '../../shared/template.json' with { type: 'json' };
import { OPERATORS, locationsFor, pickSlot, preferredLocations } from '../../shared/domain.js';
import { classifyPlate, normalizePlate } from '../../shared/plates.js';
import {
  NOTE_TAGS_MAX, TAGS_PER_VEHICLE, VEHICLE_CODE_ALPHABET, cleanTags, cleanText, isPin, isUuid, isVehicleCode, normalizePhone, parseCost,
  validateNewVehicle, validatePart, validatePatch, validateWorkshopSettings,
} from '../../shared/validate.js';
import { MAX_IMPORT_ROWS, validateBooking, validateImportRow } from '../../shared/customers.js';
import { maskEmail } from '../../shared/emails.js';
import { postContact } from './adapter.js';
import { createMockEmailAdapter } from './emailAdapter.js';

export const DEMO_PIN = '2468';
export const DEMO_CODE = 'DEMO01';
const DB_KEY = 'tg_demo_db_v2';
const SES_KEY = 'tg_demo_session_v1';
const DB_VERSION = 3;
const DB_TTL = 12 * 3_600_000;
const DAY = 86_400_000;
const MAX_VEHICLES = 300;
const MAX_OUTBOX = 30;
const SID = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Math.random());

// ---------- Almacenamiento (con reserva en memoria si localStorage está bloqueado) ----------
const memory = new Map();
const store = {
  get(k) { try { return globalThis.localStorage.getItem(k); } catch { return memory.get(k) ?? null; } },
  set(k, v) { try { globalThis.localStorage.setItem(k, v); } catch { memory.set(k, v); } },
  del(k) { try { globalThis.localStorage.removeItem(k); } catch { memory.delete(k); } },
};
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('tg-demo-v1') : null;
channel?.unref?.(); // en Node (pruebas) no retiene el proceso
const broadcast = (msg) => { try { channel?.postMessage({ ...msg, sid: msg.sid ?? SID }); } catch { /* canal cerrado */ } };

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const uuid = () => crypto.randomUUID();
function newCode(vehicles) {
  for (;;) {
    let c = '';
    const r = crypto.getRandomValues(new Uint32Array(6));
    for (let i = 0; i < 6; i += 1) c += VEHICLE_CODE_ALPHABET[r[i] % VEHICLE_CODE_ALPHABET.length];
    if (!vehicles.some((v) => v.publicCode === c)) return c;
  }
}

// ---------- Fixtures ----------
function seedDb(now = Date.now()) {
  const workshop = {
    id: 'w-demo', name: 'Taller Demo', code: DEMO_CODE, logo: null, brandColor: '#2F6FED',
    template: { id: template.id, lifts: template.lifts, pit: template.pit }, timezone: 'Europe/Madrid', retentionDays: 30, noteTags: null, staleDays: 5,
  };
  const vehicles = [];
  const F = [
    { plate: '1234BCD', model: 'seat-leon', state: 'in_repair', location: 'lift1', slot: 0, phone: '+34600000101', email: 'cliente01@example.com', est: 320, eta: 1, daysAgo: 2, notes: 'Cambio de embrague. Cliente avisado del plazo.', tags: ['Cliente avisado'] },
    { plate: '5678FGH', model: 'renault-clio', state: 'awaiting_part', location: 'waiting', slot: 0, phone: '+34600000102', est: 540, eta: 4, daysAgo: 3, parts: [{ d: 'Bomba de agua y kit de distribución', s: 'ordered', eta: 3 }] },
    { plate: '9012JKL', model: 'toyota-rav4', state: 'diagnosis', location: 'diagnosis_bay', slot: 0, daysAgo: 0, email: 'cliente03@example.com' },
    { plate: '3456MNP', model: 'volkswagen-golf', state: 'ready', location: 'pickup', slot: 0, phone: '+34600000103', est: 180, final: 185.5, daysAgo: 4 },
    { plate: '7890RST', model: 'ford-transit-custom', state: 'received', location: 'reception', slot: 0, daysAgo: 0 },
    { plate: '6802WXY', model: 'seat-leon', state: 'awaiting_part', location: 'parking', slot: 0, daysAgo: 9, eta: -2, phone: '+34600000106', parts: [{ d: 'Amortiguador trasero izquierdo', s: 'ordered', eta: -1 }], tags: ['Pendiente de pieza'] },
    { plate: '2468VWX', model: 'peugeot-3008', state: 'awaiting_approval', location: 'waiting', slot: 1, phone: '+34600000104', est: 890, daysAgo: 1 },
    { plate: '1357YZB', model: 'fiat-500', state: 'in_repair', location: 'pit', slot: 0, daysAgo: 1, eta: 0 },
    { plate: '8024CDF', model: 'opel-corsa', state: 'delivered', daysAgo: 52, deliveredDaysAgo: 45, phone: '+34600000105', final: 240 },
    { plate: '4680GHJ', model: 'kia-sportage', state: 'delivered', daysAgo: 6, deliveredDaysAgo: 2, final: 410 },
  ];
  for (const s of F) {
    const m = catalog.find((c) => c.id === s.model);
    const entered = now - s.daysAgo * DAY;
    const v = {
      id: uuid(), plate: s.plate, plateKind: 'es_current', modelId: m.id, make: m.make, model: m.model, bodyType: m.body, dims: { l: m.l, w: m.w, h: m.h },
      publicCode: newCode(vehicles), tags: s.tags || [], phone: s.phone || null, email: s.email || null, notifyConsent: !!s.email,
      state: s.state, location: s.location ?? null, slot: s.slot ?? null, notes: s.notes || '', costEstimate: s.est ?? null, costFinal: s.final ?? null,
      enteredAt: new Date(entered).toISOString(), etaAt: s.eta !== undefined ? isoDay(now + s.eta * DAY) : null,
      deliveredAt: s.deliveredDaysAgo !== undefined ? new Date(now - s.deliveredDaysAgo * DAY).toISOString() : null,
      parts: (s.parts || []).map((p) => ({ id: uuid(), description: p.d, state: p.s, etaAt: p.eta !== undefined ? isoDay(now + p.eta * DAY) : null })),
      history: [{ at: new Date(entered).toISOString(), by: 'office', type: 'created', to: 'received' }],
      rev: 1, updatedAt: new Date(entered).toISOString(), lastSession: null, lastBy: 'office',
    };
    if (s.state !== 'received') v.history.push({ at: new Date(entered + 3_600_000).toISOString(), by: 'mechanic1', type: 'state', from: 'received', to: s.state });
    vehicles.push(v);
  }
  const customers = [];
  const C = [
    ['8024CDF', 'opel-corsa', '+34600000105', 'cliente05@example.com'], ['4680GHJ', 'kia-sportage', null, 'cliente06@example.com'],
    ['0147LMN', 'seat-ibiza', '+34600000201', 'cliente07@example.com'], ['5821PRS', 'renault-captur', '+34600000202', 'cliente08@example.com'],
    ['9930TVW', 'toyota-yaris', null, 'cliente09@example.com'], ['2275BZD', 'volkswagen-polo', '+34600000204', null],
    ['6618FKH', 'dacia-sandero', '+34600000205', 'cliente11@example.com'], ['3094JNP', 'ford-focus', '+34600000206', 'cliente12@example.com'],
  ];
  for (const [plate, id, phone, email] of C) {
    const m = catalog.find((c) => c.id === id);
    customers.push({ plate, plateKind: 'es_current', modelId: m.id, make: m.make, model: m.model, bodyType: m.body, phone, email, source: 'import', createdAt: new Date(now).toISOString(), lastVisit: null });
  }
  const appointments = [['0147LMN', 1, 'morning', 'Cambio de aceite y filtros'], ['5821PRS', 2, 'afternoon', 'Ruido al frenar en las curvas']].map(([plate, plus, slot, reason]) => {
    const c = customers.find((x) => x.plate === plate);
    return { id: uuid(), plate, plateKind: 'es_current', modelId: c.modelId, make: c.make, model: c.model, bodyType: c.bodyType, phone: c.phone, email: c.email, date: isoDay(now + plus * DAY), slot, reason, status: 'booked', createdAt: new Date(now).toISOString(), vehicleId: null };
  });
  return { version: DB_VERSION, seededAt: now, workshop, vehicles, customers, appointments, outbox: [] };
}

function loadDb() {
  let db = null;
  try { db = JSON.parse(store.get(DB_KEY)); } catch { db = null; }
  if (!db || db.version !== DB_VERSION || !db.workshop || !Array.isArray(db.vehicles) || Date.now() - db.seededAt > DB_TTL) {
    db = seedDb();
    saveDb(db);
  }
  return db;
}
function saveDb(db) { store.set(DB_KEY, JSON.stringify(db)); }
// Lee, cambia y guarda en un paso: cada operación parte de lo último que escribió cualquier pestaña.
function tx(fn) { const db = loadDb(); const out = fn(db); saveDb(db); return out; }

// ---------- DTO ----------
const workshopPublic = (w) => ({ name: w.name, code: w.code, logo: w.logo, brandColor: w.brandColor, template: w.template });
const workshopPanel = (w) => ({ ...workshopPublic(w), id: w.id, timezone: w.timezone, retentionDays: w.retentionDays, staleDays: w.staleDays ?? 5, noteTags: w.noteTags ?? null });
export function panelDto(v) {
  const { phone, email, lastSession, ...rest } = v;
  return { ...rest, hasPhone: !!phone, phoneLast4: phone ? phone.slice(-4) : null, hasEmail: !!email, emailMasked: maskEmail(email), notify: !!email && !!v.notifyConsent };
}
function publicDto(db, v) {
  return {
    vehicle: {
      plate: v.plate, make: v.make, model: v.model, bodyType: v.bodyType, dims: v.dims, state: v.state, location: v.location, slot: v.slot, etaAt: v.etaAt,
      parts: v.parts.filter((p) => p.state !== 'arrived').map((p) => ({ description: p.description, state: p.state, etaAt: p.etaAt })),
      canVerify: !!v.phone,
    },
    others: db.vehicles.filter((o) => o.id !== v.id && o.location).map((o) => ({ location: o.location, slot: o.slot })),
  };
}

// ---------- Utilidades ----------
const reply = (body, status = 200) => Promise.resolve({ status, ...body });
const fail = (error, status) => reply({ ok: false, error }, status);
const wait = (ms) => new Promise((r) => { setTimeout(r, ms); });
// Mismo suelo de tiempo para «no existe» y «dato incorrecto», como en el servidor.
const floor = async (t0, body, status = 200) => { const left = t0 + 280 + Math.random() * 60 - Date.now(); if (left > 0) await wait(left); return { status, ...body }; };
function limiter(max, windowMs) {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
    list.push(now); hits.set(key, list);
    return list.length <= max;
  };
}
const limits = { lookup: limiter(6, 10 * 60_000), verify: limiter(5, 15 * 60_000), login: limiter(5, 5 * 60_000) };
const signToken = (v) => btoa(JSON.stringify({ v, exp: Date.now() + 15 * 60_000 }));
function readToken(t) {
  try { const d = JSON.parse(atob(String(t))); return d && typeof d.v === 'string' && d.exp > Date.now() ? d : null; } catch { return null; }
}

function session() {
  try {
    const s = JSON.parse(store.get(SES_KEY));
    return s && OPERATORS.includes(s.operator) ? { ...s, sid: SID } : null;
  } catch { return null; }
}
function freeSlot(db, location, exceptId) {
  const taken = new Set(db.vehicles.filter((v) => v.id !== exceptId && v.location).map((v) => `${v.location}:${v.slot}`));
  return pickSlot(taken, db.workshop.template, [location]);
}
function touch(v, s) { v.rev += 1; v.updatedAt = new Date().toISOString(); v.lastSession = s.sid; v.lastBy = s.operator; }
const lang = () => { try { return store.get('tg_lang') === 'en' ? 'en' : 'es'; } catch { return 'es'; } };

function upsertCustomer(db, d, source, { fill = false, visit = null } = {}) {
  const cur = db.customers.find((c) => c.plate === d.plate);
  if (!cur) {
    if (db.customers.length >= 5000) return 'skipped';
    db.customers.push({ plate: d.plate, plateKind: d.plateKind, modelId: d.modelId ?? null, make: d.make, model: d.model, bodyType: d.bodyType, phone: d.phone || null, email: d.email || null, source, createdAt: new Date().toISOString(), lastVisit: visit });
    return 'created';
  }
  for (const k of ['phone', 'email']) if (d[k] && (!fill || !cur[k])) cur[k] = d[k];
  if (!fill) Object.assign(cur, { modelId: d.modelId ?? cur.modelId, make: d.make || cur.make, model: d.model || cur.model, bodyType: d.bodyType || cur.bodyType });
  if (visit) cur.lastVisit = visit;
  return 'updated';
}
const apptDto = (a) => ({ id: a.id, plate: a.plate, make: a.make, model: a.model, date: a.date, slot: a.slot, reason: a.reason, status: a.status, hasEmail: !!a.email, emailMasked: maskEmail(a.email), hasPhone: !!a.phone, phoneLast4: a.phone ? a.phone.slice(-4) : null, vehicleId: a.vehicleId });

// Correo al cliente: solo si dejó correo y aceptó los avisos. En la demo va a la bandeja de vista previa.
const mailer = createMockEmailAdapter({
  // Solo se guarda el destinatario enmascarado: la vista previa no necesita más.
  store: ({ to, ...m }) => tx((db) => { db.outbox = [{ ...m, to: maskEmail(to) }, ...(db.outbox || [])].slice(0, MAX_OUTBOX); }),
});
async function notify(v, kind, workshop) {
  if (!v.email || !v.notifyConsent) return;
  await mailer.send({ kind, to: v.email, workshop, plate: v.plate, lang: lang(), vehicleId: v.id });
  broadcast({ kind: 'outbox' });
  emitLocal({ kind: 'outbox' });
}
// Los avisos de la propia pestaña (la bandeja) no pasan por el canal, que solo llega a las demás.
const localSubs = new Set();
const emitLocal = (e) => { for (const fn of localSubs) fn(e); };

function runRetentionDb(db, now = Date.now()) {
  let deleted = 0;
  const gone = new Set();
  db.vehicles = db.vehicles.filter((v) => {
    const old = v.state === 'delivered' && v.deliveredAt && Date.parse(v.deliveredAt) + db.workshop.retentionDays * DAY < now;
    if (old) { deleted += 1; gone.add(v.id); }
    return !old;
  });
  // Los correos de vista previa siguen al coche: se borran con él.
  db.outbox = (db.outbox || []).filter((m) => !gone.has(m.vehicleId));
  db.appointments = db.appointments.filter((a) => a.status === 'booked' || Date.parse(`${a.date}T00:00:00Z`) + 30 * DAY >= now);
  return { deleted, gone: [...gone] };
}

// ---------- Adaptador ----------
export function createMockAdapter() {
  tx((db) => runRetentionDb(db)); // al abrir, como hace el servidor al arrancar

  const authed = (fn) => (...args) => {
    const s = session();
    if (!s) return fail('unauthorized', 401);
    return fn(s, ...args);
  };

  const api = {
    kind: 'mock',
    config: () => reply({ ok: true, demo: true, demoPin: DEMO_PIN, workshopCode: DEMO_CODE }),

    async login(input = {}) {
      const t0 = Date.now();
      if (!limits.login('login')) return { status: 429, ok: false, error: 'locked', retryAfter: 300 };
      const code = String(input.code || '').toUpperCase();
      const valid = !input.website && code === DEMO_CODE && isPin(input.pin) && input.pin === DEMO_PIN && OPERATORS.includes(input.operator);
      if (!valid) return floor(t0, { ok: false, error: 'bad_credentials' }, 401);
      store.set(SES_KEY, JSON.stringify({ operator: input.operator, at: Date.now() }));
      return { status: 200, ok: true, workshop: workshopPanel(loadDb().workshop), operator: input.operator, sid: SID };
    },
    logout: () => { store.del(SES_KEY); return reply({ ok: true }); },
    session: () => {
      const s = session();
      return s ? reply({ ok: true, workshop: workshopPanel(loadDb().workshop), operator: s.operator, sid: SID }) : reply({ ok: false });
    },

    listVehicles: authed(() => reply({ ok: true, vehicles: loadDb().vehicles.slice().sort((a, b) => a.enteredAt.localeCompare(b.enteredAt)).map(panelDto) })),

    createVehicle: authed(async (s, input) => {
      const val = validateNewVehicle(input, catalog);
      if (!val.ok) return fail('validation', 422).then((r) => ({ ...r, errors: val.errors }));
      const r = tx((db) => {
        if (input.id && db.vehicles.some((v) => v.id === input.id)) return { vehicle: panelDto(db.vehicles.find((v) => v.id === input.id)), dup: true };
        if (db.vehicles.some((v) => v.plate === val.plate && v.state !== 'delivered')) return { error: 'plate_exists', status: 409 };
        if (db.vehicles.length >= MAX_VEHICLES) return { error: 'workshop_full', status: 409 };
        const taken = new Set(db.vehicles.filter((v) => v.location).map((v) => `${v.location}:${v.slot}`));
        const place = pickSlot(taken, db.workshop.template, preferredLocations('received', db.workshop.template, null));
        if (!place) return { error: 'workshop_full', status: 409 };
        const now = new Date().toISOString();
        const m = val.model;
        const v = {
          id: input.id || uuid(), plate: val.plate, plateKind: classifyPlate(val.plate), modelId: m ? m.id : null,
          make: m ? m.make : cleanText(input.make), model: m ? m.model : cleanText(input.model), bodyType: m ? m.body : input.bodyType, dims: m ? { l: m.l, w: m.w, h: m.h } : null,
          publicCode: newCode(db.vehicles), tags: [], phone: val.phone, email: val.email, notifyConsent: val.notifyConsent,
          state: 'received', ...place, notes: '', costEstimate: null, costFinal: null, enteredAt: now, etaAt: null, deliveredAt: null, parts: [],
          history: [{ at: now, by: s.operator, type: 'created', to: 'received' }], rev: 1, updatedAt: now, lastSession: s.sid, lastBy: s.operator,
        };
        db.vehicles.push(v);
        upsertCustomer(db, { plate: v.plate, plateKind: v.plateKind, modelId: v.modelId, make: v.make, model: v.model, bodyType: v.bodyType, phone: v.phone, email: v.notifyConsent ? v.email : null }, 'panel', { fill: true, visit: now });
        return { vehicle: panelDto(v), raw: v, workshop: db.workshop };
      });
      if (r.error) return fail(r.error, r.status);
      if (!r.dup) {
        broadcast({ kind: 'vehicle', vehicle: r.vehicle });
        await notify(r.raw, 'arrived', r.workshop);
      }
      return reply({ ok: true, vehicle: r.vehicle }, 201);
    }),

    patchVehicle: authed(async (s, id, patch) => {
      const val = validatePatch(patch || {});
      if (!val.ok) return { status: 422, ok: false, error: 'validation', errors: val.errors };
      const r = tx((db) => {
        const v = db.vehicles.find((x) => x.id === id);
        if (!v) return { error: 'not_found', status: 404 };
        const tpl = db.workshop.template; const now = new Date().toISOString();
        const conflict = Number.isInteger(patch.baseRev) && patch.baseRev < v.rev && v.lastSession && v.lastSession !== s.sid ? { by: v.lastBy || 'office', at: v.updatedAt } : null;
        let { location, slot, state } = v;
        if (patch.state !== undefined && patch.state !== v.state) state = patch.state;
        if (state === 'delivered') { location = null; slot = null; }
        else if (patch.location !== undefined && patch.location !== v.location) {
          if (!locationsFor(tpl).includes(patch.location)) return { error: 'invalid', status: 400 };
          const place = freeSlot(db, patch.location, v.id);
          if (!place) return { error: 'location_full', status: 409 };
          ({ location, slot } = place);
        } else if (state !== v.state) {
          const prefs = preferredLocations(state, tpl, v.location);
          if (!prefs.includes(v.location) || v.location === null) {
            const taken = new Set(db.vehicles.filter((o) => o.id !== v.id && o.location).map((o) => `${o.location}:${o.slot}`));
            const place = pickSlot(taken, tpl, [...prefs, 'parking', 'waiting', 'reception']);
            if (!place) return { error: 'workshop_full', status: 409 };
            ({ location, slot } = place);
          }
        }
        const before = v.state;
        if (state !== v.state) {
          v.history.push({ at: now, by: s.operator, type: 'state', from: v.state, to: state });
          v.deliveredAt = state === 'delivered' ? now : null;
          v.state = state;
        }
        if (location !== v.location) { if (location) v.history.push({ at: now, by: s.operator, type: 'location', from: v.location, to: location }); v.location = location; }
        v.slot = slot;
        if (patch.notes !== undefined) v.notes = cleanText(patch.notes);
        if (patch.costEstimate !== undefined) v.costEstimate = parseCost(patch.costEstimate);
        if (patch.costFinal !== undefined) v.costFinal = parseCost(patch.costFinal);
        if (patch.etaAt !== undefined) v.etaAt = patch.etaAt || null;
        if (patch.tags !== undefined) v.tags = cleanTags(patch.tags, TAGS_PER_VEHICLE);
        if (patch.phone !== undefined) v.phone = normalizePhone(patch.phone) || null;
        if (v.history.length > 200) v.history.splice(0, v.history.length - 200);
        touch(v, s);
        return { vehicle: panelDto(v), conflict, raw: v, workshop: db.workshop, readyNow: before !== 'ready' && v.state === 'ready' };
      });
      if (r.error) return fail(r.error, r.status);
      broadcast({ kind: 'vehicle', vehicle: r.vehicle, conflict: r.conflict });
      if (r.readyNow) await notify(r.raw, 'ready', r.workshop);
      return reply({ ok: true, vehicle: r.vehicle, conflict: r.conflict });
    }),

    deleteVehicle: authed((s, id) => {
      const found = tx((db) => {
        const n = db.vehicles.length;
        db.vehicles = db.vehicles.filter((v) => v.id !== id);
        db.outbox = (db.outbox || []).filter((m) => m.vehicleId !== id);
        return db.vehicles.length !== n;
      });
      if (!found) return fail('not_found', 404);
      broadcast({ kind: 'delete', id });
      return reply({ ok: true });
    }),

    addPart: authed((s, id, part) => {
      const val = validatePart(part || {});
      if (!val.ok) return reply({ ok: false, error: 'validation', errors: val.errors }, 422);
      const r = tx((db) => {
        const v = db.vehicles.find((x) => x.id === id);
        if (!v) return { error: 'not_found', status: 404 };
        if (part.id && v.parts.some((p) => p.id === part.id)) return { vehicle: panelDto(v) };
        if (v.parts.length >= 30) return { error: 'invalid', status: 400 };
        v.parts.push({ id: part.id || uuid(), description: cleanText(part.description), state: 'needed', etaAt: part.etaAt || null });
        v.history.push({ at: new Date().toISOString(), by: s.operator, type: 'part', to: 'needed' });
        touch(v, s);
        return { vehicle: panelDto(v) };
      });
      if (r.error) return fail(r.error, r.status);
      broadcast({ kind: 'vehicle', vehicle: r.vehicle });
      return reply({ ok: true, vehicle: r.vehicle }, 201);
    }),
    patchPart: authed((s, id, pid, patch) => {
      const val = validatePart(patch || {}, { partial: true });
      if (!val.ok) return reply({ ok: false, error: 'validation', errors: val.errors }, 422);
      const r = tx((db) => {
        const v = db.vehicles.find((x) => x.id === id);
        const p = v?.parts.find((x) => x.id === pid);
        if (!p) return { error: 'not_found', status: 404 };
        if (patch.state !== undefined && patch.state !== p.state) { v.history.push({ at: new Date().toISOString(), by: s.operator, type: 'part', from: p.state, to: patch.state }); p.state = patch.state; }
        if (patch.etaAt !== undefined) p.etaAt = patch.etaAt || null;
        touch(v, s);
        return { vehicle: panelDto(v) };
      });
      if (r.error) return fail(r.error, r.status);
      broadcast({ kind: 'vehicle', vehicle: r.vehicle });
      return reply({ ok: true, vehicle: r.vehicle });
    }),
    removePart: authed((s, id, pid) => {
      const r = tx((db) => {
        const v = db.vehicles.find((x) => x.id === id);
        if (!v || !v.parts.some((x) => x.id === pid)) return { error: 'not_found', status: 404 };
        v.parts = v.parts.filter((x) => x.id !== pid); touch(v, s);
        return { vehicle: panelDto(v) };
      });
      if (r.error) return fail(r.error, r.status);
      broadcast({ kind: 'vehicle', vehicle: r.vehicle });
      return reply({ ok: true, vehicle: r.vehicle });
    }),

    exportVehicle: authed((s, id) => {
      const db = loadDb();
      const v = db.vehicles.find((x) => x.id === id);
      if (!v) return fail('not_found', 404);
      const { lastSession, lastBy, rev, slot, ...data } = v;
      return reply({ exportedAt: new Date().toISOString(), workshop: db.workshop.name, vehicle: data });
    }),
    runRetention: authed(() => {
      const r = tx((db) => runRetentionDb(db));
      for (const id of r.gone) broadcast({ kind: 'delete', id });
      return reply({ ok: true, deleted: r.deleted });
    }),
    setRetention: authed((s, retentionDays) => reply({ ok: true, workshop: tx((db) => { db.workshop.retentionDays = retentionDays; return workshopPanel(db.workshop); }) })),
    setWorkshopSettings: authed((s, patch) => {
      const val = validateWorkshopSettings(patch || {});
      if (!val.ok) return reply({ ok: false, error: 'validation', errors: val.errors }, 422);
      const w = tx((db) => {
        if (patch.retentionDays !== undefined) db.workshop.retentionDays = patch.retentionDays;
        if (patch.staleDays !== undefined) db.workshop.staleDays = patch.staleDays;
        if (patch.noteTags !== undefined) db.workshop.noteTags = patch.noteTags === null ? null : cleanTags(patch.noteTags, NOTE_TAGS_MAX);
        return workshopPanel(db.workshop);
      });
      return reply({ ok: true, workshop: w });
    }),
    // Bandeja de vista previa: el correo exacto que recibiría el cliente. El destinatario va enmascarado.
    outbox: authed(() => reply({ ok: true, messages: loadDb().outbox || [] })),
    clearOutbox: authed(() => { tx((db) => { db.outbox = []; }); emitLocal({ kind: 'outbox' }); broadcast({ kind: 'outbox' }); return reply({ ok: true }); }),
    resetDemo: () => { const db = seedDb(); saveDb(db); broadcast({ kind: 'reset' }); emitLocal({ kind: 'reset' }); return reply({ ok: true }); },

    subscribe(onEvent) {
      const onMsg = (e) => { const d = e.data; if (d && d.sid !== SID) onEvent(d); };
      const onStorage = (e) => { if (e.key === DB_KEY && !channel) onEvent({ kind: 'reset' }); };
      channel?.addEventListener('message', onMsg);
      if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
      localSubs.add(onEvent);
      queueMicrotask(() => { onEvent({ kind: 'hello', sid: SID }); onEvent({ kind: 'up' }); });
      return () => {
        channel?.removeEventListener('message', onMsg);
        if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
        localSubs.delete(onEvent);
      };
    },

    // ---------- Consulta pública ----------
    publicWorkshop: (code) => {
      const w = loadDb().workshop;
      return String(code).toUpperCase() === w.code ? reply({ ok: true, workshop: workshopPublic(w) }) : reply({ ok: false }, 404);
    },
    async publicLookup(input = {}) {
      const t0 = Date.now();
      const db = loadDb();
      if (input.website || String(input.code || '').toUpperCase() !== db.workshop.code) return floor(t0, { ok: false });
      let v = null;
      if (input.vehicleCode !== undefined) {
        if (!limits.lookup('qr')) return { status: 429, ok: false, error: 'rate_limited' }; // mismo límite que la matrícula
        if (!isVehicleCode(input.vehicleCode)) return floor(t0, { ok: false });
        v = db.vehicles.find((x) => x.publicCode === String(input.vehicleCode).toUpperCase()) || null;
      } else {
        const plate = normalizePlate(input.plate);
        if (!classifyPlate(plate)) return floor(t0, { ok: false });
        if (!limits.lookup(plate)) return { status: 429, ok: false, error: 'rate_limited' };
        const all = db.vehicles.filter((x) => x.plate === plate);
        v = all.find((x) => x.state !== 'delivered') || all.sort((a, b) => b.enteredAt.localeCompare(a.enteredAt))[0] || null;
      }
      if (!v) return floor(t0, { ok: false });
      return floor(t0, { ok: true, token: signToken(v.id), ...publicDto(db, v) });
    },
    publicRefresh: (token) => {
      const t = readToken(token); const db = loadDb();
      const v = t && db.vehicles.find((x) => x.id === t.v);
      return v ? reply({ ok: true, ...publicDto(db, v) }) : reply({ ok: false });
    },
    async publicVerify({ token, last4 } = {}) {
      const t0 = Date.now();
      const t = readToken(token);
      if (t && !limits.verify(t.v)) return { status: 429, ok: false, error: 'rate_limited' };
      const v = t && loadDb().vehicles.find((x) => x.id === t.v);
      if (!v || !v.phone || !/^\d{4}$/.test(String(last4)) || v.phone.slice(-4) !== last4) return floor(t0, { ok: false });
      return floor(t0, { ok: true, cost: { estimate: v.costEstimate, final: v.costFinal } });
    },

    contact: (input) => postContact(input),

    // ---------- Clientes habituales y citas ----------
    customersSummary: authed(() => { const c = loadDb().customers; return reply({ ok: true, count: c.length, withEmail: c.filter((x) => x.email).length, withPhone: c.filter((x) => x.phone).length }); }),
    importCustomers: authed((s, rows) => {
      if (!Array.isArray(rows) || !rows.length || rows.length > MAX_IMPORT_ROWS) return reply({ ok: false, error: 'validation', errors: { rows: 'invalid' } }, 422);
      const r = tx((db) => {
        const out = { created: 0, updated: 0, skipped: 0 }; const bad = [];
        rows.forEach((raw, i) => {
          const val = validateImportRow(raw && typeof raw === 'object' ? raw : {}, catalog);
          if (val.ok) out[upsertCustomer(db, val.row, 'import')] += 1; else bad.push({ line: Number.isInteger(raw?.line) ? raw.line : i + 2, errors: val.errors });
        });
        const c = db.customers;
        return { ...out, rejected: bad.length, rejectedRows: bad.slice(0, 30), count: c.length, withEmail: c.filter((x) => x.email).length, withPhone: c.filter((x) => x.phone).length };
      });
      return reply({ ok: true, ...r });
    }),
    listAppointments: authed(() => reply({ ok: true, appointments: loadDb().appointments.filter((a) => a.status === 'booked').sort((x, y) => `${x.date}${x.slot}`.localeCompare(`${y.date}${y.slot}`)).map(apptDto) })),
    arriveAppointment: authed(async (s, id) => {
      const db = loadDb();
      const a = db.appointments.find((x) => x.id === id && x.status === 'booked');
      if (!a) return fail('not_found', 404);
      const r = await api.createVehicle({ id: uuid(), plate: a.plate, foreign: a.plateKind === 'generic', ...(a.modelId ? { modelId: a.modelId } : { modelId: 'other', make: a.make, model: a.model, bodyType: a.bodyType }), phone: a.phone || undefined });
      if (!r.ok) return r;
      tx((d) => { const x = d.appointments.find((y) => y.id === id); if (x) { x.status = 'arrived'; x.vehicleId = r.vehicle.id; } });
      broadcast({ kind: 'appointments' });
      return reply({ ok: true, vehicle: r.vehicle });
    }),
    cancelAppointment: authed((s, id) => {
      const ok = tx((db) => { const a = db.appointments.find((x) => x.id === id && x.status === 'booked'); if (a) a.status = 'cancelled'; return !!a; });
      if (!ok) return fail('not_found', 404);
      broadcast({ kind: 'appointments' });
      return reply({ ok: true });
    }),
    async publicCustomerCheck(input = {}) {
      const t0 = Date.now(); const db = loadDb();
      const plate = normalizePlate(input.plate);
      if (input.website || String(input.code || '').toUpperCase() !== db.workshop.code || !classifyPlate(plate)) return floor(t0, { ok: true, known: false });
      const c = db.customers.find((x) => x.plate === plate);
      return floor(t0, c ? { ok: true, known: true, make: c.make, model: c.model } : { ok: true, known: false });
    },
    async publicBook(input = {}) {
      const t0 = Date.now(); const db0 = loadDb();
      if (input.website) return floor(t0, { ok: true });
      if (String(input.code || '').toUpperCase() !== db0.workshop.code) return floor(t0, { ok: false, error: 'not_found' }, 404);
      const known = db0.customers.some((c) => c.plate === normalizePlate(input.plate));
      const val = validateBooking(input, catalog, { known });
      if (!val.ok) return { status: 422, ok: false, error: 'validation', errors: val.errors };
      const r = tx((db) => {
        const cust = db.customers.find((c) => c.plate === val.plate);
        const veh = cust ? { modelId: cust.modelId, make: cust.make, model: cust.model, bodyType: cust.bodyType } : val.vehicle;
        const dup = db.appointments.find((a) => a.status === 'booked' && a.plate === val.plate && a.date === input.date);
        if (dup) return { appointment: dup, known: !!cust };
        if (db.appointments.length >= 500) return { error: 'workshop_full' };
        upsertCustomer(db, { plate: val.plate, plateKind: classifyPlate(val.plate), ...veh, phone: val.phone, email: val.email }, 'cita', { fill: true });
        const a = { id: uuid(), plate: val.plate, plateKind: classifyPlate(val.plate), ...veh, phone: val.phone, email: val.email, date: input.date, slot: input.slot, reason: val.reason, status: 'booked', createdAt: new Date().toISOString(), vehicleId: null };
        db.appointments.push(a);
        return { appointment: a, known: !!cust };
      });
      if (r.error) return { status: 409, ok: false, error: r.error };
      broadcast({ kind: 'appointments' });
      return floor(t0, { ok: true, date: r.appointment.date, slot: r.appointment.slot, known: r.known }, 201);
    },
  };
  return api;
}
