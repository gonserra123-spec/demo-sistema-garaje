// Ritmo de la escena. Un único parámetro: SIM_SPEED. Con 1.6 (valor actual):
//   - coches: velocidad máxima y aceleración ×1,6 (también la marcha atrás y el límite en curva);
//   - simulación: llegadas y esperas entre pasos ~35 % más cortas (×0,65);
//   - mecánico y elevadores: ×1,25.
// SIM_SPEED = 1 devuelve el ritmo original. No toca el mapeo del scroll de la cámara.
export const SIM_SPEED = 1.6;

export const CAR_SPEED = SIM_SPEED; // 1.6
export const CREW_SPEED = 1 + (SIM_SPEED - 1) * (5 / 12); // 1.25
export const SIM_GAP = 1 / (1 + (SIM_SPEED - 1) * (0.35 / 0.65) / 0.6); // 0.65: intervalos un 35 % más cortos
