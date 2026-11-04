'use strict';

/**
 * clasificacion.js — Clasificación clínica de Cardio Guard
 *
 * Implementa la sección 7 del documento de contexto: categorías de presión
 * arterial (AHA/ACC) y de frecuencia cardíaca, el criterio de cambio
 * positivo/negativo contra la última revisión, y la decisión de si una
 * lectura debe mostrarse como ALERTA (crisis), ADVERTENCIA (dato
 * sospechoso) o ambas a la vez.
 *
 * Este módulo no conoce al AFD ni a sus EVENTO; regresa resultados en
 * texto plano (NORMAL / ALERTA / ADVERTENCIA / ALERTA_Y_ADVERTENCIA) para
 * no acoplarse a afd.js. Es interpreter.js quien traduce ese resultado al
 * evento correspondiente de la tabla de transiciones.
 */

// --- 7.1 Categorías de presión arterial (de más a menos severa) ---
const CATEGORIAS_PRESION = [
  {
    nombre: 'Crisis hipertensiva',
    nivel: 4,
    coincide: (s, d) => s > 180 || d > 120,
  },
  {
    nombre: 'Hipertensión etapa 2',
    nivel: 3,
    coincide: (s, d) => s >= 140 || d >= 90,
  },
  {
    nombre: 'Hipertensión etapa 1',
    nivel: 2,
    coincide: (s, d) => (s >= 130 && s <= 139) || (d >= 80 && d <= 89),
  },
  {
    nombre: 'Elevada',
    nivel: 1,
    coincide: (s, d) => s >= 120 && s <= 129 && d < 80,
  },
  {
    nombre: 'Normal',
    nivel: 0,
    coincide: (s, d) => s < 120 && d < 80,
  },
];

/**
 * Clasifica una presión arterial. Se evalúa de la categoría más severa a
 * la menos severa y se toma la primera que coincida, lo que automáticamente
 * aplica la regla "si sistólica y diastólica caen en categorías distintas,
 * se usa la más alta de las dos".
 */
function clasificarPresion(sistolica, diastolica) {
  const categoria = CATEGORIAS_PRESION.find((c) => c.coincide(sistolica, diastolica));
  // CATEGORIAS_PRESION cubre todo el plano (Normal es la condición por
  // defecto), así que siempre debería encontrar una coincidencia.
  return { nombre: categoria.nombre, nivel: categoria.nivel };
}

// --- 7.2 Categorías de frecuencia cardíaca (pulso en reposo) ---
function clasificarFrecuencia(frecuencia) {
  if (frecuencia < 60) return { nombre: 'Bradicardia', nivel: 1 };
  if (frecuencia > 100) return { nombre: 'Taquicardia', nivel: 1 };
  return { nombre: 'Normal', nivel: 0 };
}

/**
 * 7.4 — ¿La lectura debe marcarse con ALERTA (crisis), ADVERTENCIA (dato
 * sospechoso), ambas, o ninguna?
 *
 * Nota: con los umbrales definidos (crisis: sistólica > 180 o diastólica >
 * 120; dato sospechoso: sistólica > 250 o diastólica > 150), todo dato
 * sospechoso cae también dentro del rango de crisis (250 > 180 y 150 >
 * 120), así que ALERTA_Y_ADVERTENCIA es, en la práctica, el único caso en
 * el que aparece la advertencia. Se deja la rama "solo advertencia" de
 * forma explícita de todas formas, por claridad y por si en el futuro se
 * ajustan los umbrales de alguna de las dos reglas.
 */
function determinarAvisoClasificacion(categoriaPresion, datoSospechoso) {
  const esCrisis = categoriaPresion.nombre === 'Crisis hipertensiva';

  if (esCrisis && datoSospechoso) return 'ALERTA_Y_ADVERTENCIA';
  if (esCrisis) return 'ALERTA';
  if (datoSospechoso) return 'ADVERTENCIA';
  return 'NORMAL';
}

/**
 * 7.3 — Compara la lectura actual contra la última revisión del paciente.
 * @param {{sistolica:number, diastolica:number, frecuencia:number}} actual
 * @param {{sistolica:number, diastolica:number, frecuencia:number}|null} anterior
 *        null si el paciente no tiene revisión previa.
 */
function compararConUltimaRevision(actual, anterior) {
  if (anterior === null) {
    return { resultado: 'PRIMERA_REVISION' };
  }

  const presionActual = clasificarPresion(actual.sistolica, actual.diastolica);
  const presionAnterior = clasificarPresion(anterior.sistolica, anterior.diastolica);
  const frecuenciaActual = clasificarFrecuencia(actual.frecuencia);
  const frecuenciaAnterior = clasificarFrecuencia(anterior.frecuencia);

  const compararNiveles = (actualNivel, anteriorNivel) => {
    if (actualNivel < anteriorNivel) return 'MEJORO';
    if (actualNivel > anteriorNivel) return 'EMPEORO';
    return 'SIN_CAMBIO';
  };

  const cambioPresion = compararNiveles(presionActual.nivel, presionAnterior.nivel);
  const cambioFrecuencia = compararNiveles(frecuenciaActual.nivel, frecuenciaAnterior.nivel);

  // Regla conservadora (sección 7.3): cualquier empeoramiento domina sobre
  // una mejora, para no dar una falsa sensación de tranquilidad.
  let resultado;
  if (cambioPresion === 'EMPEORO' || cambioFrecuencia === 'EMPEORO') {
    resultado = 'NEGATIVO';
  } else if (cambioPresion === 'MEJORO' || cambioFrecuencia === 'MEJORO') {
    resultado = 'POSITIVO';
  } else {
    resultado = 'SIN_CAMBIO';
  }

  return {
    resultado,
    presion: { actual: presionActual, anterior: presionAnterior, cambio: cambioPresion },
    frecuencia: { actual: frecuenciaActual, anterior: frecuenciaAnterior, cambio: cambioFrecuencia },
  };
}

module.exports = {
  CATEGORIAS_PRESION,
  clasificarPresion,
  clasificarFrecuencia,
  determinarAvisoClasificacion,
  compararConUltimaRevision,
};
