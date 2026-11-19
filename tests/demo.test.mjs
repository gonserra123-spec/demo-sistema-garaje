// Modo demo sin red (MockAdapter), arranque del panel con el almacenamiento vacío, «Siguiente paso»,
// correos de vista previa y el Worker de Cloudflare. Sin red real: el fetch se sustituye en cada prueba.
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// localStorage vacío, como en un navegador nuevo.
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k), clear: () => mem.clear(),
};
const { usePanel } = await import('../src/data/panelStore.js');
const { setAdapter, normalizeWorkshop, NetworkError } = await import('../src/data/adapter.js');
const { createMockAdapter } = await import('../src/data/mockAdapter.js');
const { createApiAdapter } = await import('../src/data/apiAdapter.js');
const { nextState, suggestPlace } = await import('../shared/domain.js');
const { renderEmail } = await import('../shared/emails.js');
const worker = (await import('../worker/index.js')).default;

const initial = usePanel.getState();
beforeEach(() => { mem.clear(); usePanel.setState({ ...initial, status: 'boot', workshop: null, vehicles: [], queue: [], toasts: [] }, true); });

test('panel: con el almacenamiento vacío arranca en el acceso, no en blanco', async () => {
  setAdapter(createMockAdapter());
  await usePanel.getState().boot();
  assert.equal(usePanel.getState().status, 'login');
  assert.equal(usePanel.getState().workshop, null);
});

test('panel: al entrar, la configuración del taller llega completa (staleDays por defecto)', async () => {
  const api = createMockAdapter();
  setAdapter(api);
  await usePanel.getState().boot();
  const r = await usePanel.getState().login({ code: 'DEMO01', pin: '2468', operator: 'mechanic1', website: '' });
  assert.equal(r.ok, true);
  const s = usePanel.getState();
  assert.equal(s.status, 'ready');
  assert.equal(s.workshop.staleDays, 5);
  assert.ok(s.vehicles.length >= 8);
  // Recargar la página (nuevo arranque) con la sesión guardada entra directo.
  usePanel.setState({ status: 'boot', workshop: null });
  await usePanel.getState().boot();
  assert.equal(usePanel.getState().status, 'ready');
});

test('panel: una sesión sin taller (respuesta incompleta) vuelve al acceso sin romper', async () => {
  setAdapter({ config: async () => ({ ok: true }), session: async () => ({ ok: true, status: 200 }), subscribe: () => () => {} });
  await usePanel.getState().boot();
  assert.equal(usePanel.getState().status, 'login');
  const w = normalizeWorkshop({ name: 'X', template: {} });
  assert.deepEqual([w.staleDays, w.retentionDays, w.template.lifts, w.template.pit, w.noteTags], [5, 30, 2, true, null]);
});

test('ApiAdapter: una página HTML con 200 (hosting estático) no se toma por una sesión', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response('<!doctype html><title>app</title>', { status: 200, headers: { 'Content-Type': 'text/html' } });
  try {
    const api = createApiAdapter();
    await assert.rejects(api.session(), NetworkError);
    setAdapter(api);
    await usePanel.getState().boot();
    assert.equal(usePanel.getState().status, 'login');
    assert.equal(usePanel.getState().online, false);
  } finally { globalThis.fetch = real; }
});

test('consulta en demo: resuelve sin red (taller, matrícula y coste)', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('no debe usar la red'); };
  try {
    const api = createMockAdapter();
    const w = await api.publicWorkshop('DEMO01');
    assert.equal(w.ok, true); assert.equal(w.workshop.name, 'Taller Demo');
    assert.equal((await api.publicWorkshop('NOPE00')).ok, false);
    const r = await api.publicLookup({ code: 'DEMO01', plate: '1234BCD', website: '' });
    assert.equal(r.ok, true); assert.equal(r.vehicle.plate, '1234BCD');
    assert.equal(r.vehicle.phone, undefined); assert.equal(r.vehicle.email, undefined);
    assert.ok(r.others.every((o) => Object.keys(o).join() === 'location,slot'));
    const bad = await api.publicLookup({ code: 'DEMO01', plate: '0000BBB', website: '' });
    assert.deepEqual(Object.keys(bad).sort(), ['ok', 'status']);
    assert.equal((await api.publicVerify({ token: r.token, last4: '9999' })).ok, false);
    assert.equal((await api.publicVerify({ token: r.token, last4: '0101' })).cost.estimate, 320);
  } finally { globalThis.fetch = real; }
});

test('siguiente paso: orden de estados y ubicación sugerida', () => {
  const tpl = { lifts: 2, pit: true };
  assert.equal(nextState({ state: 'received' }), 'diagnosis');
  assert.equal(nextState({ state: 'diagnosis' }), 'awaiting_approval');
  assert.equal(nextState({ state: 'awaiting_approval', parts: [{ state: 'ordered' }] }), 'awaiting_part');
  assert.equal(nextState({ state: 'awaiting_approval', parts: [{ state: 'arrived' }] }), 'in_repair');
  assert.equal(nextState({ state: 'in_repair' }), 'ready');
  assert.equal(nextState({ state: 'ready' }), 'delivered');
  assert.equal(nextState({ state: 'delivered' }), null);
  const self = { id: 'a', location: 'waiting', slot: 0 };
  const others = [{ id: 'b', location: 'lift1', slot: 0 }];
  assert.deepEqual(suggestPlace('in_repair', tpl, [self, ...others], self), { location: 'lift2', slot: 0 });
  assert.deepEqual(suggestPlace('ready', tpl, [self], self), { location: 'pickup', slot: 0 });
  const onLift = { id: 'c', location: 'lift1', slot: 0 };
  assert.deepEqual(suggestPlace('in_repair', tpl, [onLift], onLift), { location: 'lift1', slot: 0 });
});

test('correos: alta con consentimiento y paso a «listo» dejan el correo exacto en la vista previa', async () => {
  const api = createMockAdapter();
  await api.login({ code: 'DEMO01', pin: '2468', operator: 'office', website: '' });
  const id = crypto.randomUUID();
  const c = await api.createVehicle({ id, plate: '4321 BCF', modelId: 'seat-leon', email: 'Cliente@Example.com', notifyConsent: true });
  assert.equal(c.ok, true);
  assert.equal(c.vehicle.email, undefined); assert.equal(c.vehicle.emailMasked, 'c***@example.com');
  let box = (await api.outbox()).messages;
  assert.equal(box.length, 1); assert.equal(box[0].kind, 'arrived'); assert.equal(box[0].subject, 'Tu coche ya está en el taller');
  assert.equal(box[0].to, 'c***@example.com');
  // Sin consentimiento no hay correo.
  await api.createVehicle({ id: crypto.randomUUID(), plate: '4322 BCF', modelId: 'seat-leon', email: 'otro@example.com', notifyConsent: false });
  assert.equal((await api.outbox()).messages.length, 1);
  const p = await api.patchVehicle(id, { state: 'ready', location: 'pickup' });
  assert.equal(p.ok, true); assert.equal(p.vehicle.location, 'pickup');
  box = (await api.outbox()).messages;
  assert.equal(box[0].kind, 'ready'); assert.equal(box[0].subject, 'Tu coche está listo, puedes pasar a recogerlo');
  // La matrícula aparece en el texto pero nunca en un enlace; sin coste ni más datos.
  for (const m of box) {
    for (const url of m.text.match(/https?:\/\/\S+/g) || []) assert.doesNotMatch(url, /4321|BCF/i);
    assert.doesNotMatch(m.text, /€|coste|precio/i);
  }
  // Borrar el coche borra sus correos.
  await api.deleteVehicle(id);
  assert.equal((await api.outbox()).messages.length, 0);
});

test('correos: la plantilla rechaza enlaces con parámetros', () => {
  assert.throws(() => renderEmail({ kind: 'ready', shop: 'T', plate: '1234BCD', consultaUrl: 'https://x.test/consulta/DEMO01?p=1234BCD' }));
  const m = renderEmail({ kind: 'arrived', shop: 'T', plate: '1234BCD', consultaUrl: 'https://x.test/consulta/DEMO01', lang: 'en' });
  assert.equal(m.subject, 'Your car is now at the workshop');
});

// ---------- Worker ----------
const env = (extra = {}) => ({ ASSETS: { fetch: async () => new Response('asset', { status: 200 }) }, CONTACT_TO_EMAIL: 'FALTA@example.invalid', CONTACT_FROM_EMAIL: 'x <web@FALTA.example.invalid>', ...extra });
const req = (path, { method = 'POST', body, headers = {} } = {}) => new Request(`https://demo.test${path}`, {
  method, body: body === undefined ? undefined : JSON.stringify(body),
  headers: { 'Content-Type': 'application/json', Origin: 'https://demo.test', 'X-Requested-With': 'tridom-garage', 'CF-Connecting-IP': `ip-${Math.random()}`, ...headers },
});
const okContact = { name: 'Ana', workshop: 'Taller Ana', email: 'ana@example.com', message: 'Somos un taller de cinco personas.', consent: true };

test('worker: las rutas de la app van a los assets y /api/* desconocida es 404 en JSON', async () => {
  assert.equal(await (await worker.fetch(new Request('https://demo.test/panel'), env())).text(), 'asset');
  const r = await worker.fetch(req('/api/panel/events', { method: 'GET' }), env());
  assert.equal(r.status, 404); assert.match(r.headers.get('content-type'), /application\/json/);
  assert.equal((await worker.fetch(req('/api/config', { method: 'GET' }), env())).status, 404);
});

test('worker /api/contact: origen, validación en servidor, honeypot y sin configurar', async () => {
  assert.equal((await worker.fetch(req('/api/contact', { body: okContact, headers: { Origin: 'https://otro.test' } }), env())).status, 403);
  const bad = await worker.fetch(req('/api/contact', { body: { ...okContact, message: 'corto', email: 'x' } }), env());
  assert.equal(bad.status, 422);
  const e = (await bad.json()).errors; assert.equal(e.message, 'too_short'); assert.equal(e.email, 'email_format');
  assert.equal((await worker.fetch(req('/api/contact', { body: { ...okContact, consent: false } }), env())).status, 422);
  assert.equal((await worker.fetch(req('/api/contact', { body: { ...okContact, website: 'bot' } }), env())).status, 200);
  assert.equal((await worker.fetch(req('/api/contact', { body: okContact }), env())).status, 503); // sin clave ni buzón
});

test('worker /api/contact: límite por IP', async () => {
  const h = { 'CF-Connecting-IP': '203.0.113.9' };
  const codes = [];
  for (let i = 0; i < 4; i += 1) codes.push((await worker.fetch(req('/api/contact', { body: { ...okContact, message: 'x' }, headers: h }), env())).status);
  assert.deepEqual(codes, [422, 422, 422, 429]);
});

test('worker /api/notify: sin token de sesión del panel no envía nada', async () => {
  const body = { kind: 'ready', to: 'a@example.com', workshopCode: 'DEMO01', plate: '1234BCD' };
  assert.equal((await worker.fetch(req('/api/notify', { body }), env({ NOTIFY_TOKEN_SECRET: 's'.repeat(32) }))).status, 401);
  assert.equal((await worker.fetch(req('/api/notify', { body, headers: { Authorization: 'Bearer abc.def' } }), env({ NOTIFY_TOKEN_SECRET: 's'.repeat(32) }))).status, 401);
});
