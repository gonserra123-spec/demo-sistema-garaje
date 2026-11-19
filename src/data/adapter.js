// Capa de datos. Toda la app habla con esta interfaz; hay tres implementaciones:
//   - MockAdapter (por defecto, modo demo): todo en el navegador, sin red. Fixtures ficticios en
//     localStorage y sincronización entre pestañas con BroadcastChannel. Funciona en un hosting estático.
//   - ApiAdapter (VITE_DATA_ADAPTER=api): la API propia de server/ (npm start), con SSE.
//   - SupabaseAdapter (VITE_DATA_ADAPTER=supabase): Postgres + RLS + Edge Functions + Realtime.
//
// DataAdapter:
//   config()                               -> { demo, demoPin, workshopCode }
//   login({ code, pin, operator, website }) / logout() / session()
//   listVehicles() / createVehicle(input) / patchVehicle(id, patch) / deleteVehicle(id)
//   addPart(id, part) / patchPart(id, partId, patch) / removePart(id, partId)
//   exportVehicle(id) / runRetention() / setRetention(days) / setWorkshopSettings(patch)
//   subscribe(onEvent)                     -> función para cancelar (tiempo real)
//   outbox()                               -> correos enviados (en la demo, la bandeja de vista previa)
//   publicWorkshop(code) / publicLookup({ code, plate, website }) / publicRefresh(token) / publicVerify({ token, last4 })
//   contact(input)                         -> siempre por el Worker (/api/contact)
// Todas devuelven { ok, status, ...datos } y lanzan NetworkError si no hay conexión.
export class NetworkError extends Error {}

// Lo que el panel necesita del taller para pintarse. Cualquier campo que falte toma su valor por defecto,
// así una respuesta incompleta nunca deja el panel en blanco.
export const WORKSHOP_DEFAULTS = Object.freeze({
  name: 'Taller', code: '', logo: null, brandColor: '#2F6FED', template: { lifts: 2, pit: true },
  timezone: 'Europe/Madrid', retentionDays: 30, staleDays: 5, noteTags: null,
});
export function normalizeWorkshop(w) {
  if (!w || typeof w !== 'object') return null;
  const tpl = w.template && typeof w.template === 'object' ? w.template : {};
  return {
    ...WORKSHOP_DEFAULTS, ...w,
    template: { ...tpl, lifts: Number.isInteger(tpl.lifts) ? tpl.lifts : 2, pit: typeof tpl.pit === 'boolean' ? tpl.pit : true },
    retentionDays: Number.isInteger(w.retentionDays) ? w.retentionDays : 30,
    staleDays: Number.isInteger(w.staleDays) ? w.staleDays : 5,
    noteTags: Array.isArray(w.noteTags) ? w.noteTags : null,
  };
}

// Tiempo máximo de cualquier llamada: pasado el plazo se trata como falta de conexión (estado de error legible).
export function withTimeout(promise, ms = 8000) {
  let id;
  return Promise.race([promise, new Promise((_, rej) => { id = setTimeout(() => rej(new NetworkError('timeout')), ms); })]).finally(() => clearTimeout(id));
}

// Respuesta HTTP -> objeto. Si no es JSON (p. ej. un hosting estático devolviendo la página), no es una respuesta válida.
export async function readJsonResponse(res) {
  const type = res.headers.get('content-type') || '';
  if (!/^application\/json\b/i.test(type)) throw new NetworkError('bad_response');
  const data = await res.json().catch(() => null);
  if (!data || typeof data !== 'object') throw new NetworkError('bad_response');
  return { status: res.status, ...data };
}

// Formulario de contacto: lo atiende siempre el Worker (o server/ en local), sea cual sea el adaptador de datos.
export async function postContact(input) {
  let res;
  try {
    res = await fetch('/api/contact', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'tridom-garage' },
      body: JSON.stringify(input),
    });
  } catch { throw new NetworkError('offline'); }
  return readJsonResponse(res);
}

const KIND = (import.meta.env && import.meta.env.VITE_DATA_ADAPTER) || 'mock';
let adapter = null;
export async function getAdapter() {
  if (adapter) return adapter;
  if (KIND === 'supabase') {
    const { createSupabaseAdapter } = await import('./supabaseAdapter.js');
    adapter = createSupabaseAdapter();
  } else if (KIND === 'api') {
    const { createApiAdapter } = await import('./apiAdapter.js');
    adapter = createApiAdapter();
  } else {
    const { createMockAdapter } = await import('./mockAdapter.js');
    adapter = createMockAdapter();
  }
  return adapter;
}
// Solo para pruebas: inyecta un adaptador.
export function setAdapter(a) { adapter = a; }
