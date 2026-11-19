// Prueba C1 (Anexo C): continuidad de la escena con SIM_SPEED. Se pega en la consola (o en Playwright
// `page.evaluate`) en la landing, con la escena cargada. Usa window.__garage (engine + sim) y avanza a
// pasos fijos de 1/60 s, así que no depende del reloj del navegador.
// Umbrales ajustados a SIM_SPEED = 1,6 (antes: 0,059 m y 0,022 rad por fotograma en coches).
(async () => {
  const LIMITS = { car: 0.1, carTurn: 0.06, mech: 0.035, mechTurn: 0.125, lift: 0.02, gap: 2.5 };
  const { engine, sim } = window.__garage;
  const STATES = ['received', 'diagnosis', 'awaiting_approval', 'awaiting_part', 'in_repair', 'ready', 'delivered'];
  const settle = (max = 90) => { for (let t = 0; t < max; t += 0.5) { engine.advance(0.5); if (engine.isSettled()) return true; } return false; };
  const out = { pairs: 0, pairFrames: 0, burst: 0, burstFrames: 0, unsettled: 0 };
  const merge = (acc, r) => {
    for (const k of ['maxCarStep', 'maxCarTurn', 'maxMechStep', 'maxMechTurn', 'maxLiftStep']) acc[k] = Math.max(acc[k] || 0, r[k]);
    acc.minCarGap = Math.min(acc.minCarGap ?? Infinity, r.minCarGap);
    acc.violations = [...new Set([...(acc.violations || []), ...r.violations])];
  };
  const agg = {};
  // 42 parejas de estados: un coche va de A a B con el resto de la jornada sembrada alrededor.
  for (const a of STATES) for (const b of STATES) {
    if (a === b) continue;
    sim.seed(); settle();
    const car = sim.add(a === 'delivered' ? 'ready' : a);
    if (!car) continue;
    settle();
    engine.startRecording();
    sim.setState(car.id, b);
    if (!settle()) out.unsettled += 1;
    const r = engine.stopRecording(); merge(agg, r); out.pairs += 1; out.pairFrames += r.frames;
  }
  // Ráfaga: 660 cambios aleatorios con poco tiempo entre ellos.
  sim.seed(); settle();
  engine.startRecording();
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 660; i += 1) {
    const list = sim.vehicles.filter((v) => v.state !== 'delivered');
    if (list.length < 5) sim.add();
    const v = list[Math.floor(rnd() * list.length)];
    if (v) sim.setState(v.id, STATES[Math.floor(rnd() * 6)]);
    engine.advance(0.1 + rnd() * 0.6);
    out.burst += 1;
  }
  if (!settle(180)) out.unsettled += 1;
  const r = engine.stopRecording(); merge(agg, r); out.burstFrames = r.frames;
  const pass = agg.maxCarStep <= LIMITS.car && agg.maxCarTurn <= LIMITS.carTurn && agg.maxMechStep <= LIMITS.mech && agg.maxMechTurn <= LIMITS.mechTurn
    && agg.maxLiftStep <= LIMITS.lift && agg.minCarGap >= LIMITS.gap && !agg.violations.length && !out.unsettled;
  return { pass, limits: LIMITS, ...out, ...agg };
})();
