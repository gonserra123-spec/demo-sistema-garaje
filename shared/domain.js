// Vocabulario común a servidor, panel, consulta y escena.
export const STATES = ['received', 'diagnosis', 'awaiting_approval', 'awaiting_part', 'in_repair', 'ready', 'delivered'];
export const PART_STATES = ['needed', 'ordered', 'arrived'];
export const BODY_TYPES = ['city', 'compact', 'sedan', 'wagon', 'suv_small', 'suv_large', 'coupe', 'mpv', 'van', 'pickup'];
export const OPERATORS = ['office', 'mechanic1', 'mechanic2'];

// Plazas por ubicación para una plantilla de taller.
export function capacities(template) {
  const cap = { reception: 2, waiting: 2, parking: 4, pickup: 2, diagnosis_bay: 1 };
  for (let i = 1; i <= template.lifts; i += 1) cap[`lift${i}`] = 1;
  if (template.pit) cap.pit = 1;
  return cap;
}

export function locationsFor(template) {
  const lifts = Array.from({ length: template.lifts }, (_, i) => `lift${i + 1}`);
  return ['reception', ...lifts, ...(template.pit ? ['pit'] : []), 'diagnosis_bay', 'waiting', 'parking', 'pickup'];
}

// Ubicaciones candidatas, en orden, cuando un estado cambia sin ubicación explícita.
export function preferredLocations(state, template, current) {
  const lifts = Array.from({ length: template.lifts }, (_, i) => `lift${i + 1}`);
  const work = [...lifts, ...(template.pit ? ['pit'] : [])];
  switch (state) {
    case 'received': return ['reception', 'waiting', 'parking'];
    case 'diagnosis': return ['diagnosis_bay'];
    case 'awaiting_approval':
    case 'awaiting_part': return ['waiting', 'parking'];
    case 'in_repair': return work.includes(current) ? [current] : work;
    case 'ready': return ['pickup', 'parking'];
    default: return [];
  }
}

export const isLift = (loc) => /^lift\d+$/.test(loc || '');
export const isElevated = (v) => v.state === 'in_repair' && isLift(v.location);

// Primera plaza libre entre las ubicaciones candidatas. `taken` es un Set de claves `ubicación:índice`.
export function pickSlot(taken, template, candidates) {
  const cap = capacities(template);
  for (const loc of candidates) {
    for (let i = 0; i < (cap[loc] || 0); i += 1) if (!taken.has(`${loc}:${i}`)) return { location: loc, slot: i };
  }
  return null;
}

// «Siguiente paso» del mecánico: recibido → diagnóstico → aprobación/pieza → reparación → listo → entregado.
// Si hay alguna pieza sin llegar, tras la aprobación toca esperar la pieza; si no, a reparar.
export function nextState(v) {
  const missing = (v.parts || []).some((p) => p.state !== 'arrived');
  switch (v.state) {
    case 'received': return 'diagnosis';
    case 'diagnosis': return 'awaiting_approval';
    case 'awaiting_approval': return missing ? 'awaiting_part' : 'in_repair';
    case 'awaiting_part': return 'in_repair';
    case 'in_repair': return 'ready';
    case 'ready': return 'delivered';
    default: return null;
  }
}

// Ubicación lógica que se sugiere (y se asigna en el mismo toque) al pasar a `state`.
// En reparación: el elevador o foso libre (se queda donde está si ya es uno). Listo: zona de recogida.
// `vehicles` son los coches del taller; se ignora el propio. Devuelve { location, slot } o null.
export function suggestPlace(state, template, vehicles, self) {
  if (state === 'delivered') return null;
  const taken = new Set(vehicles.filter((o) => o.id !== self.id && o.location).map((o) => `${o.location}:${o.slot}`));
  const prefs = preferredLocations(state, template, self.location);
  if (prefs.includes(self.location) && !taken.has(`${self.location}:${self.slot}`)) return { location: self.location, slot: self.slot };
  return pickSlot(taken, template, [...prefs, 'parking', 'waiting', 'reception']);
}
