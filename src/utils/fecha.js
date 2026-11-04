'use strict';

/**
 * fecha.js — Utilidad de fechas de Cardio Guard
 *
 * fechaLocal() entrega la fecha YYYY-MM-DD en la hora LOCAL de la
 * computadora. No usar Date.toISOString() para fechas que se muestran o
 * se guardan: siempre entrega UTC, y por la tarde/noche UTC ya cambió de
 * día (la fecha se guardaba adelantada un día).
 */
function fechaLocal(fecha = new Date()) {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

module.exports = { fechaLocal };
